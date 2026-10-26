<script>
  import { untrack } from 'svelte';
  import {
    getAll, groupTransactionsByCategory,
    getTransactionsForMonth, getMonthSummary, getDayTotalsForMonth,
    getTransactionsForDay, getDaySummary,
    getTransactionsForWeek, getWeekSummary, getDayTotalsForWeek,
    getTransactionsForYear, getYearToDate, getYearlyTrend
  } from '../lib/data/db.js';
  import { resolveTransactionLabels, searchTransactions } from '../lib/data/transactions.js';
  import {
    fmtMoney, fmtMoneySigned, fmtMonthLabel, fmtDayLabel, fmtWeekLabel,
    shiftDate, shiftAnchorByMonth, shiftAnchorByYear, weekStartISO,
    todayISO, MONTH_SHORT
  } from '../lib/data/format.js';
  import TransactionRow from '../lib/components/TransactionRow.svelte';
  import CategoryPicker from '../lib/components/CategoryPicker.svelte';

  // Scoped to the app-wide selected account (specs/transactions.md
  // requirement 22 — the same account Home is showing).
  // initialCategoryFilter/initialSubcategoryFilter (specs/budgets.md
  // requirement 19) let a caller (a budget tap) open Activity already
  // filtered, not just Category view's own drill-in — read once via
  // untrack, same one-shot-prop pattern as AddTransaction's initialType.
  let { accountId, onOpenTransaction, initialCategoryFilter = null, initialSubcategoryFilter = null } = $props();

  // specs/activity-period-summary.md — a single reference date drives
  // every granularity's current period: yearMonth/year/weekStart below
  // are all derived from it, so switching granularity never loses "where
  // you were", and month/year nav (shiftAnchorByMonth/Year) clamps the
  // day-of-month instead of overflowing into the next period.
  let granularity = $state('month'); // 'day' | 'week' | 'month' | 'year'
  let anchorDate = $state(todayISO());

  const yearMonth = $derived(anchorDate.slice(0, 7));
  const year = $derived(Number(anchorDate.slice(0, 4)));
  const weekStart = $derived(weekStartISO(anchorDate));
  const weekEnd = $derived(shiftDate(weekStart, 6));
  const periodLabel = $derived(
    granularity === 'day' ? fmtDayLabel(anchorDate)
    : granularity === 'week' ? fmtWeekLabel(weekStart)
    : granularity === 'year' ? String(year)
    : fmtMonthLabel(yearMonth)
  );
  const periodNoun = $derived({ day: 'day', week: 'week', month: 'month', year: 'year' }[granularity]);

  let view = $state('date'); // 'date' | 'category'
  let search = $state('');

  // Defaults to oldest-first, matching the user's own habit — applies to
  // both the flat transaction list (Daily granularity, or the month
  // category-filter chip below) and resultsMode's flat list. The bucketed
  // Date views (Weekly/Monthly/Yearly) are always chronological ascending
  // instead, same as the original app's screenshots — no toggle for them.
  let sortDir = $state('asc'); // 'asc' = oldest first, 'desc' = newest first
  function toggleSort() {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  }

  function setGranularity(next) {
    if (next === granularity) return;
    granularity = next;
    // The category drill-in chip is a month-only mechanism (unchanged —
    // specs/activity-search-filter.md requirement 9), so leaving Monthly
    // always clears it rather than carrying it into a period it can't
    // apply to.
    categoryFilterActive = false;
    categoryFilter = null;
  }

  function stepAnchor(delta) {
    if (granularity === 'day') return shiftDate(anchorDate, delta);
    if (granularity === 'week') return shiftDate(anchorDate, delta * 7);
    if (granularity === 'year') return shiftAnchorByYear(anchorDate, delta);
    return shiftAnchorByMonth(anchorDate, delta);
  }
  function prevPeriod() { anchorDate = stepAnchor(-1); }
  function nextPeriod() { anchorDate = stepAnchor(1); }

  // Tapping the period label opens a jump picker shaped for whatever
  // granularity is active (requirement 6): a month/year grid for Monthly
  // (unchanged from before), a plain year stepper for Yearly, and a
  // native date input for Daily/Weekly (not worth a custom calendar).
  let periodPickerOpen = $state(false);
  let pickerYear = $state(0);
  let pickerDate = $state('');

  function openPeriodPicker() {
    if (granularity === 'day' || granularity === 'week') pickerDate = anchorDate;
    else pickerYear = year;
    periodPickerOpen = true;
  }
  function pickMonth(monthIndex1) {
    anchorDate = `${pickerYear}-${String(monthIndex1).padStart(2, '0')}-01`;
    periodPickerOpen = false;
  }
  function pickYear() {
    anchorDate = `${pickerYear}-01-01`;
    periodPickerOpen = false;
  }
  function pickDate() {
    if (pickerDate) anchorDate = pickerDate;
    periodPickerOpen = false;
  }

  // Set either by drilling in from a Category view row (requirement 29)
  // or by an initial prop from a budget tap (requirement 19 above) —
  // switching the view toggle directly, or leaving Monthly granularity,
  // always clears this.
  let categoryFilterActive = $state(untrack(() => initialCategoryFilter != null));
  /** @type {string|null} */
  let categoryFilter = $state(untrack(() => initialCategoryFilter));
  /** @type {string|null} */
  let subcategoryFilter = $state(untrack(() => initialSubcategoryFilter));
  let categoryFilterLabel = $state('');

  // periodSummary/categoryTotals apply at every granularity; transactions
  // (flat list) only for Daily, or Monthly with the category chip active;
  // bucketRows (one row per sub-period, each carrying its own total) only
  // for Weekly/Monthly/Yearly otherwise — see loadPeriod below.
  let periodSummary = $state({ expense: 0, income: 0 });
  let transactions = $state([]);
  let bucketRows = $state([]);
  let categoryTotals = $state([]);

  const periodNet = $derived(periodSummary.income - periodSummary.expense);
  const periodNetText = $derived(fmtMoneySigned(Math.abs(periodNet), periodNet >= 0 ? 'income' : 'expense'));

  function netText(income, expense) {
    const net = income - expense;
    return { net, text: fmtMoneySigned(Math.abs(net), net >= 0 ? 'income' : 'expense') };
  }

  function openDayBucket(dateISO) {
    anchorDate = dateISO;
    granularity = 'day';
  }
  function openMonthBucket(ym) {
    anchorDate = `${ym}-01`;
    granularity = 'month';
  }

  // specs/activity-search-filter.md — a *separate* all-time filter set
  // from categoryFilterActive/categoryFilter above (requirement 9): that
  // one stays a month-scoped drill-in (Category view, budget taps); this
  // one is the Filters sheet, combined with search text to decide whether
  // Activity is in resultsMode (all-time, flat) or the normal period view.
  let filtersOpen = $state(false);
  // Separate active flag (not just checking filterCategoryId != null) —
  // the picker's "Uncategorised" option is itself a real, filterable
  // choice whose id is null, same reasoning as categoryFilterActive.
  let filterCategoryActive = $state(false);
  /** @type {string|null} */
  let filterCategoryId = $state(null);
  /** @type {string|null} */
  let filterSubcategoryId = $state(null);
  let filterCategoryLabel = $state('');
  let filterType = $state('all'); // 'all' | 'income' | 'expense'
  let filterDateFrom = $state('');
  let filterDateTo = $state('');
  let categoryFilterPickerOpen = $state(false);

  const filtersActive = $derived(
    filterCategoryActive || filterType !== 'all' || !!filterDateFrom || !!filterDateTo
  );
  const resultsMode = $derived(!!search.trim() || filtersActive);

  let searchResults = $state([]);
  let searchTotal = $state(0);

  const orderedTransactions = $derived(sortDir === 'asc' ? transactions.slice().reverse() : transactions);
  const orderedSearchResults = $derived(sortDir === 'asc' ? searchResults.slice().reverse() : searchResults);

  function clearFilters() {
    filterCategoryActive = false;
    filterCategoryId = null;
    filterSubcategoryId = null;
    filterCategoryLabel = '';
    filterType = 'all';
    filterDateFrom = '';
    filterDateTo = '';
  }

  function selectFilterCategory(newCategoryId, newSubcategoryId, label) {
    filterCategoryActive = true;
    filterCategoryId = newCategoryId;
    filterSubcategoryId = newSubcategoryId;
    filterCategoryLabel = label;
    categoryFilterPickerOpen = false;
  }

  function clearFilterCategory() {
    filterCategoryActive = false;
    filterCategoryId = null;
    filterSubcategoryId = null;
    filterCategoryLabel = '';
  }

  // Every reactive input this reads is captured as a plain argument
  // *before* the first await below, inside the effect body — reading
  // them after an await wouldn't be tracked as a dependency. The guard
  // object lets a newer run cancel an older, still-in-flight one — two
  // quick changes (e.g. paging the period right before switching
  // granularity) could otherwise let the slower load() finish last and
  // overwrite fresher results with stale ones.
  $effect(() => {
    const guard = { cancelled: false };
    if (resultsMode) {
      loadSearchResults(
        accountId, search, filterCategoryActive, filterCategoryId, filterSubcategoryId,
        filterType, filterDateFrom, filterDateTo, guard
      );
    } else {
      loadPeriod(
        granularity, yearMonth, year, weekStart, weekEnd, anchorDate, accountId,
        categoryFilterActive, categoryFilter, subcategoryFilter, guard
      );
    }
    return () => { guard.cancelled = true; };
  });

  async function loadSearchResults(accId, query, catActive, catId, subId, type, dateFrom, dateTo, guard) {
    const result = await searchTransactions({
      accountId: accId, query, categoryActive: catActive, categoryId: catId, subcategoryId: subId,
      type: type === 'all' ? null : type, dateFrom: dateFrom || null, dateTo: dateTo || null
    });
    if (guard.cancelled) return;
    searchResults = result.rows;
    searchTotal = result.total;
  }

  async function loadPeriod(gran, ym, yr, wkStart, wkEnd, dateISO, accId, catActive, catId, subId, guard) {
    const categories = await getAll('categories');
    if (guard.cancelled) return;

    // Month-only category-filtered flat list — unchanged mechanism
    // (specs/activity-search-filter.md requirement 9), regardless of
    // which granularity tab is selected elsewhere (setGranularity always
    // clears this, so gran is always 'month' whenever catActive is true).
    if (catActive) {
      if (!categoryFilterLabel) {
        const cat = categories.find(c => c.id === catId);
        const sub = subId ? cat?.subcategories.find(s => s.id === subId) : null;
        categoryFilterLabel = cat ? (sub ? `${cat.name} / ${sub.name}` : cat.name) : '';
      }
      const monthTxns = await getTransactionsForMonth(ym, accId);
      if (guard.cancelled) return;
      const filtered = monthTxns.filter(t => (t.categoryId ?? null) === catId && (!subId || t.subcategoryId === subId));
      const sorted = filtered.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const resolved = await resolveTransactionLabels(sorted);
      if (guard.cancelled) return;
      let expense = 0, income = 0;
      for (const t of filtered) { if (t.type === 'income') income += t.amount; else expense += t.amount; }
      periodSummary = { expense, income };
      transactions = resolved;
      bucketRows = [];
      categoryTotals = [];
      return;
    }

    if (gran === 'day') {
      const [summary, dayTxns] = await Promise.all([getDaySummary(dateISO, accId), getTransactionsForDay(dateISO, accId)]);
      if (guard.cancelled) return;
      const sorted = dayTxns.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const resolved = await resolveTransactionLabels(sorted);
      if (guard.cancelled) return;
      periodSummary = { expense: summary.expense, income: summary.income };
      transactions = resolved;
      bucketRows = [];
      categoryTotals = groupTransactionsByCategory(dayTxns, categories);
    } else if (gran === 'week') {
      const [summary, rows, weekTxns] = await Promise.all([
        getWeekSummary(wkStart, wkEnd, accId), getDayTotalsForWeek(wkStart, wkEnd, accId), getTransactionsForWeek(wkStart, wkEnd, accId)
      ]);
      if (guard.cancelled) return;
      periodSummary = { expense: summary.expense, income: summary.income };
      bucketRows = rows.map(row => ({ key: row.date, date: row.date, expense: row.expense, income: row.income }));
      transactions = [];
      categoryTotals = groupTransactionsByCategory(weekTxns, categories);
    } else if (gran === 'year') {
      const [summary, trend, yearTxns] = await Promise.all([
        getYearToDate(yr, accId), getYearlyTrend(yr, accId), getTransactionsForYear(yr, accId)
      ]);
      if (guard.cancelled) return;
      periodSummary = summary;
      bucketRows = MONTH_SHORT.map((label, i) => ({
        key: `${yr}-${String(i + 1).padStart(2, '0')}`, yearMonth: `${yr}-${String(i + 1).padStart(2, '0')}`,
        label, expense: trend.expense[i], income: trend.income[i]
      }));
      transactions = [];
      categoryTotals = groupTransactionsByCategory(yearTxns, categories);
    } else { // month, no category filter
      const [summary, rows, monthTxns] = await Promise.all([
        getMonthSummary(ym, accId), getDayTotalsForMonth(ym, accId), getTransactionsForMonth(ym, accId)
      ]);
      if (guard.cancelled) return;
      periodSummary = { expense: summary.expense, income: summary.income };
      bucketRows = rows.map(row => ({ key: row.date, date: row.date, expense: row.expense, income: row.income }));
      transactions = [];
      categoryTotals = groupTransactionsByCategory(monthTxns, categories);
    }
  }

  function setView(next) {
    view = next;
    categoryFilterActive = false;
    categoryFilter = null;
  }

  function drillIntoCategory(row) {
    granularity = 'month';
    categoryFilterActive = true;
    categoryFilter = row.categoryId;
    subcategoryFilter = null; // Category view only ever groups by category, never subcategory
    categoryFilterLabel = row.category;
    view = 'date';
  }

  function clearCategoryFilter() {
    categoryFilterActive = false;
    categoryFilter = null;
    subcategoryFilter = null;
  }
</script>

<div class="activity">
  <div class="topbar">
    <div class="title">Activity</div>
    {#if !resultsMode}
      <div class="granularity-tabs">
        <button class:active={granularity === 'day'} onclick={() => setGranularity('day')}>Daily</button>
        <button class:active={granularity === 'week'} onclick={() => setGranularity('week')}>Weekly</button>
        <button class:active={granularity === 'month'} onclick={() => setGranularity('month')}>Monthly</button>
        <button class:active={granularity === 'year'} onclick={() => setGranularity('year')}>Yearly</button>
      </div>
      <div class="month-nav">
        <button onclick={prevPeriod} aria-label="Previous period">‹</button>
        <button class="month-label" onclick={openPeriodPicker}>{periodLabel}</button>
        <button onclick={nextPeriod} aria-label="Next period">›</button>
      </div>
      <div class="period-total">
        <span class="total-label">Balance</span>
        <span class="total-amount" class:pos={periodNet >= 0} class:neg={periodNet < 0}>{periodNetText}</span>
      </div>
    {/if}
  </div>

  <div class="content">
    <div class="search-row">
      <input class="search" type="text" bind:value={search} placeholder="Search description…" />
      <button class="filters-btn" onclick={() => filtersOpen = true} aria-label="Filters">
        ⚙︎{#if filtersActive}<span class="filters-dot"></span>{/if}
      </button>
    </div>

    {#if resultsMode}
      {#if searchTotal > searchResults.length}
        <div class="truncate-note">Showing the most recent {searchResults.length} of {searchTotal} matches — narrow your search to see more.</div>
      {/if}
      <button class="sort-toggle" onclick={toggleSort}>{sortDir === 'asc' ? '↑ Oldest first' : '↓ Newest first'}</button>
      <div class="tx-list">
        {#each orderedSearchResults as transaction (transaction.id)}
          <TransactionRow {transaction} onOpen={onOpenTransaction} />
        {:else}
          <div class="empty-state">No matching transactions.</div>
        {/each}
      </div>
    {:else}
      <div class="view-toggle">
        <button class:active={view === 'date'} onclick={() => setView('date')}>Date</button>
        <button class:active={view === 'category'} onclick={() => setView('category')}>Category</button>
      </div>

      {#if view === 'date' && categoryFilterActive}
        <button class="filter-chip" onclick={clearCategoryFilter}>{categoryFilterLabel} ×</button>
      {/if}

      {#if view === 'date'}
        {#if granularity === 'day' || categoryFilterActive}
          <button class="sort-toggle" onclick={toggleSort}>{sortDir === 'asc' ? '↑ Oldest first' : '↓ Newest first'}</button>
          <div class="tx-list">
            {#each orderedTransactions as transaction (transaction.id)}
              <TransactionRow {transaction} onOpen={onOpenTransaction} />
            {:else}
              <div class="empty-state">No transactions this {periodNoun}.</div>
            {/each}
          </div>
        {:else}
          <div class="cat-totals">
            {#each bucketRows as row (row.key)}
              {@const n = netText(row.income, row.expense)}
              <button
                class="cat-total-row"
                onclick={() => granularity === 'year' ? openMonthBucket(row.yearMonth) : openDayBucket(row.date)}
              >
                <span class="cat-name">{granularity === 'year' ? row.label : fmtDayLabel(row.date)}</span>
                <span class="cat-amount" class:pos={n.net >= 0} class:neg={n.net < 0}>{n.text}</span>
              </button>
            {:else}
              <div class="empty-state">No transactions this {periodNoun}.</div>
            {/each}
          </div>
        {/if}
      {:else}
        <div class="cat-totals">
          {#each categoryTotals as row (row.categoryId ?? 'uncategorised')}
            <button class="cat-total-row" onclick={() => drillIntoCategory(row)}>
              <span class="cat-name">{row.category}</span>
              <span class="cat-amount">{fmtMoney(row.total)}</span>
            </button>
          {:else}
            <div class="empty-state">No transactions this {periodNoun}.</div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if periodPickerOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => periodPickerOpen = false} onkeydown={(e) => e.key === 'Escape' && (periodPickerOpen = false)}>
    <div class="picker-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      {#if granularity === 'month'}
        <div class="picker-year-nav">
          <button onclick={() => pickerYear -= 1} aria-label="Previous year">‹</button>
          <span>{pickerYear}</span>
          <button onclick={() => pickerYear += 1} aria-label="Next year">›</button>
        </div>
        <div class="picker-month-grid">
          {#each MONTH_SHORT as label, i (label)}
            <button
              class="picker-month-btn"
              class:selected={yearMonth === `${pickerYear}-${String(i + 1).padStart(2, '0')}`}
              onclick={() => pickMonth(i + 1)}
            >{label}</button>
          {/each}
        </div>
      {:else if granularity === 'year'}
        <div class="picker-year-nav">
          <button onclick={() => pickerYear -= 1} aria-label="Previous year">‹</button>
          <span>{pickerYear}</span>
          <button onclick={() => pickerYear += 1} aria-label="Next year">›</button>
        </div>
        <button class="done-btn" onclick={pickYear}>Go to {pickerYear}</button>
      {:else}
        <span class="field-label">Jump to date</span>
        <input class="picker-date-input" type="date" bind:value={pickerDate} />
        <button class="done-btn" onclick={pickDate}>Go</button>
      {/if}
    </div>
  </div>
{/if}

{#if filtersOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => filtersOpen = false} onkeydown={(e) => e.key === 'Escape' && (filtersOpen = false)}>
    <div class="filters-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="sheet-title">Filters</div>

      <span class="field-label">Category</span>
      {#if filterCategoryActive}
        <button class="filter-chip standalone" onclick={clearFilterCategory}>{filterCategoryLabel} ×</button>
      {:else}
        <button class="picker-row" onclick={() => categoryFilterPickerOpen = true}>Any category</button>
      {/if}

      <span class="field-label">Type</span>
      <div class="view-toggle">
        <button class:active={filterType === 'all'} onclick={() => filterType = 'all'}>All</button>
        <button class:active={filterType === 'income'} onclick={() => filterType = 'income'}>Income</button>
        <button class:active={filterType === 'expense'} onclick={() => filterType = 'expense'}>Expense</button>
      </div>

      <span class="field-label">Date range</span>
      <div class="date-range-row">
        <input type="date" bind:value={filterDateFrom} />
        <span class="date-range-sep">–</span>
        <input type="date" bind:value={filterDateTo} />
      </div>

      <div class="sheet-actions">
        <button class="clear-btn" onclick={clearFilters} disabled={!filtersActive}>Clear filters</button>
        <button class="done-btn" onclick={() => filtersOpen = false}>Done</button>
      </div>
    </div>
  </div>
{/if}

{#if categoryFilterPickerOpen}
  <CategoryPicker onSelect={selectFilterCategory} onClose={() => categoryFilterPickerOpen = false} />
{/if}

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 59px) 20px 16px;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }

  .granularity-tabs { display: flex; gap: 6px; margin-top: 12px; }
  .granularity-tabs button {
    flex: 1; padding: 6px 4px; border-radius: 20px; border: 1.5px solid rgba(255,255,255,.2);
    background: transparent; color: #C7CCDC; font-family: var(--font-body); font-size: 11.5px; font-weight: 700;
  }
  .granularity-tabs button.active { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }

  .month-nav {
    display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 10px;
    font-family: var(--font-body); font-size: 14px; font-weight: 600;
  }
  .month-nav button { background: none; border: none; color: var(--paper); font-size: 16px; padding: 2px 6px; }
  .month-nav button.month-label { font-family: var(--font-body); font-size: 14px; font-weight: 600; padding: 0; min-width: 120px; text-align: center; }

  .period-total { display: flex; align-items: baseline; justify-content: center; gap: 6px; margin-top: 6px; }
  .total-label { font-size: 12.5px; color: #9BA3BC; font-weight: 500; }
  .total-amount { font-family: var(--font-display); font-size: 17px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .total-amount.pos { color: #7BC49A; }
  .total-amount.neg { color: #E39A8A; }

  .content { background: var(--paper); min-height: 100vh; min-height: 100dvh; padding: 16px 20px calc(var(--tabbar-height) + 16px); }

  .search-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .search {
    flex: 1; min-width: 0; padding: 10px 14px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 14px; color: var(--ink);
    box-sizing: border-box;
  }
  .filters-btn {
    position: relative; width: 48px; flex-shrink: 0; border-radius: var(--radius);
    border: 1.5px solid var(--paper-line); background: var(--paper-dim); font-size: 32px; color: var(--ink);
    display: flex; align-items: center; justify-content: center;
  }
  .filters-dot {
    position: absolute; top: 6px; right: 7px; width: 7px; height: 7px; border-radius: 50%; background: var(--accent);
  }
  .truncate-note {
    padding: 8px 2px; font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .6; line-height: 1.4;
  }

  .view-toggle { display: flex; gap: 8px; margin-bottom: 10px; }
  .view-toggle button {
    flex: 1; padding: 8px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 13px; font-weight: 700;
    color: var(--ink); opacity: .6;
  }
  .view-toggle button.active { background: var(--accent); color: var(--accent-ink); opacity: 1; border-color: var(--accent); }

  .filter-chip {
    display: inline-flex; padding: 5px 12px; border-radius: 20px; margin-bottom: 10px;
    background: var(--paper-line); border: none; font-family: var(--font-body);
    font-size: 12.5px; font-weight: 700; color: var(--ink);
  }

  .sort-toggle {
    display: block; margin: 8px 0 4px auto; background: none; border: none;
    color: var(--ink); opacity: .6; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
  }
  .tx-list { margin-top: 4px; }
  .empty-state { padding: 40px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }

  .cat-totals { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
  .cat-total-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 13px 16px; border-radius: var(--radius); background: var(--paper-dim); border: none;
    font-family: var(--font-body);
  }
  .cat-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .cat-amount { font-size: 14.5px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .cat-amount.pos { color: var(--green); }
  .cat-amount.neg { color: var(--rust); }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .picker-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: var(--radius); padding: 20px; }
  .picker-year-nav {
    display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 16px;
    font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--ink);
  }
  .picker-year-nav button { background: none; border: none; color: var(--ink); font-size: 18px; padding: 2px 8px; }
  .picker-month-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .picker-month-btn {
    padding: 12px 0; border-radius: var(--radius); border: none; background: var(--paper-dim);
    font-family: var(--font-body); font-size: 13.5px; font-weight: 600; color: var(--ink);
  }
  .picker-month-btn.selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
  .picker-date-input {
    display: block; width: 100%; min-width: 0; margin-bottom: 14px; padding: 10px 12px;
    border-radius: var(--radius); border: 1.5px solid var(--paper-line); background: var(--paper-dim);
    font-family: var(--font-body); font-size: 14px; color: var(--ink); box-sizing: border-box;
  }

  .filters-sheet {
    width: 100%; max-width: 400px; max-height: 85vh; overflow-y: auto;
    background: var(--paper); border-radius: var(--radius); padding: 20px;
  }
  .sheet-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); margin-bottom: 16px; }
  .field-label {
    display: block; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6; margin: 14px 0 6px;
  }
  .field-label:first-of-type { margin-top: 0; }
  .picker-row {
    display: block; width: 100%; text-align: left; padding: 10px 14px;
    border-radius: var(--radius); border: 1.5px solid var(--paper-line); background: var(--paper-dim);
    font-family: var(--font-body); font-size: 14px; color: var(--ink); opacity: .6; box-sizing: border-box;
  }
  .filter-chip.standalone { margin: 0; }
  .date-range-row { display: flex; align-items: center; gap: 8px; }
  .date-range-row input {
    flex: 1; min-width: 0; padding: 10px 12px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 13.5px; color: var(--ink);
    box-sizing: border-box;
  }
  .date-range-sep { color: var(--ink); opacity: .5; }
  .sheet-actions { display: flex; gap: 10px; margin-top: 22px; }
  .clear-btn, .done-btn {
    flex: 1; padding: 11px; border-radius: var(--radius); border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .clear-btn { background: var(--paper-dim); color: var(--ink); }
  .clear-btn:disabled { opacity: .4; }
  .done-btn { background: var(--accent); color: var(--accent-ink); width: 100%; }
</style>
