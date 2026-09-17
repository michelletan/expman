<script>
  import { untrack } from 'svelte';
  import { getTransactionsForMonth, getAll, groupTransactionsByCategory } from '../lib/data/db.js';
  import { resolveTransactionLabels, searchTransactions } from '../lib/data/transactions.js';
  import { fmtMoney, fmtMonthLabel, shiftYearMonth, currentYearMonth, MONTH_SHORT } from '../lib/data/format.js';
  import TransactionRow from '../lib/components/TransactionRow.svelte';
  import CategoryPicker from '../lib/components/CategoryPicker.svelte';

  // Scoped to the app-wide selected account (specs/transactions.md
  // requirement 22 — the same account Home is showing).
  // initialCategoryFilter/initialSubcategoryFilter (specs/budgets.md
  // requirement 19) let a caller (a budget tap) open Activity already
  // filtered, not just Category view's own drill-in — read once via
  // untrack, same one-shot-prop pattern as AddTransaction's initialType.
  let { accountId, onOpenTransaction, initialCategoryFilter = null, initialSubcategoryFilter = null } = $props();

  let yearMonth = $state(currentYearMonth());
  let view = $state('date'); // 'date' | 'category'
  let search = $state('');

  // Tapping the month label opens a jump-to-month/year picker
  // (specs/transactions.md requirement 24) — separate from the ‹ › step
  // buttons either side of it.
  let monthPickerOpen = $state(false);
  let pickerYear = $state(0);

  function openMonthPicker() {
    pickerYear = Number(yearMonth.slice(0, 4));
    monthPickerOpen = true;
  }

  function pickMonth(monthIndex1) {
    yearMonth = `${pickerYear}-${String(monthIndex1).padStart(2, '0')}`;
    monthPickerOpen = false;
  }

  // Set either by drilling in from a Category view row (requirement 29)
  // or by an initial prop from a budget tap (requirement 19 above) —
  // switching the view toggle directly always clears this.
  let categoryFilterActive = $state(untrack(() => initialCategoryFilter != null));
  /** @type {string|null} */
  let categoryFilter = $state(untrack(() => initialCategoryFilter));
  /** @type {string|null} */
  let subcategoryFilter = $state(untrack(() => initialSubcategoryFilter));
  let categoryFilterLabel = $state('');

  let transactions = $state([]);
  let categoryTotals = $state([]);

  // specs/activity-search-filter.md — a *separate* all-time filter set
  // from categoryFilterActive/categoryFilter above (requirement 9): that
  // one stays a month-scoped drill-in (Category view, budget taps); this
  // one is the new Filters sheet, combined with search text to decide
  // whether Activity is in resultsMode (all-time, flat) or the normal
  // month view.
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
  // quick changes (e.g. clearing search right before paging the month)
  // could otherwise let the slower load() finish last and overwrite
  // fresher results with stale ones.
  $effect(() => {
    const guard = { cancelled: false };
    if (resultsMode) {
      loadSearchResults(
        accountId, search, filterCategoryActive, filterCategoryId, filterSubcategoryId,
        filterType, filterDateFrom, filterDateTo, guard
      );
    } else {
      load(yearMonth, accountId, search, categoryFilterActive, categoryFilter, subcategoryFilter, guard);
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

  async function load(month, accountId, search, chipActive, chipCategoryId, chipSubcategoryId, guard) {
    const [monthTxns, categories] = await Promise.all([
      getTransactionsForMonth(month, accountId),
      getAll('categories')
    ]);
    if (guard.cancelled) return;

    // Resolve the filter chip's label lazily here rather than requiring
    // every caller to pass one — drillIntoCategory below already sets it
    // directly (cheaper, it already has the row's label to hand), so this
    // only runs for a prop-driven filter (requirement 19) that arrived
    // without one.
    if (chipActive && !categoryFilterLabel) {
      const cat = categories.find(c => c.id === chipCategoryId);
      const sub = chipSubcategoryId ? cat?.subcategories.find(s => s.id === chipSubcategoryId) : null;
      categoryFilterLabel = cat ? (sub ? `${cat.name} / ${sub.name}` : cat.name) : '';
    }

    const q = search.trim().toLowerCase();
    const searched = q ? monthTxns.filter(t => (t.description || '').toLowerCase().includes(q)) : monthTxns;

    const dateList = chipActive
      ? searched.filter(t => (t.categoryId ?? null) === chipCategoryId && (!chipSubcategoryId || t.subcategoryId === chipSubcategoryId))
      : searched;
    const sorted = dateList.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')); // newest first
    const resolved = await resolveTransactionLabels(sorted);
    if (guard.cancelled) return;

    transactions = resolved;
    categoryTotals = groupTransactionsByCategory(searched, categories);
  }

  function setView(next) {
    view = next;
    categoryFilterActive = false;
    categoryFilter = null;
  }

  function drillIntoCategory(row) {
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
      <div class="month-nav">
        <button onclick={() => yearMonth = shiftYearMonth(yearMonth, -1)} aria-label="Previous month">‹</button>
        <button class="month-label" onclick={openMonthPicker}>{fmtMonthLabel(yearMonth)}</button>
        <button onclick={() => yearMonth = shiftYearMonth(yearMonth, 1)} aria-label="Next month">›</button>
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
      <div class="tx-list">
        {#each searchResults as transaction (transaction.id)}
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
        <div class="tx-list">
          {#each transactions as transaction (transaction.id)}
            <TransactionRow {transaction} onOpen={onOpenTransaction} />
          {:else}
            <div class="empty-state">No transactions this month.</div>
          {/each}
        </div>
      {:else}
        <div class="cat-totals">
          {#each categoryTotals as row (row.categoryId ?? 'uncategorised')}
            <button class="cat-total-row" onclick={() => drillIntoCategory(row)}>
              <span class="cat-name">{row.category}</span>
              <span class="cat-amount">{fmtMoney(row.total)}</span>
            </button>
          {:else}
            <div class="empty-state">No transactions this month.</div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if monthPickerOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => monthPickerOpen = false} onkeydown={(e) => e.key === 'Escape' && (monthPickerOpen = false)}>
    <div class="picker-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
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
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .month-nav {
    display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 8px;
    font-family: var(--font-body); font-size: 14px; font-weight: 600;
  }
  .month-nav button { background: none; border: none; color: var(--paper); font-size: 16px; padding: 2px 6px; }
  .month-label { font-family: var(--font-body); font-size: 14px; font-weight: 600; min-width: 120px; text-align: center; }

  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px calc(66px + env(safe-area-inset-bottom) + 16px); }

  .search-row { display: flex; gap: 8px; margin-bottom: 12px; }
  .search {
    flex: 1; min-width: 0; padding: 10px 14px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 14px; color: var(--ink);
    box-sizing: border-box;
  }
  .filters-btn {
    position: relative; width: 42px; flex-shrink: 0; border-radius: var(--radius);
    border: 1.5px solid var(--paper-line); background: var(--paper-dim); font-size: 16px; color: var(--ink);
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
  .done-btn { background: var(--accent); color: var(--accent-ink); }
</style>
