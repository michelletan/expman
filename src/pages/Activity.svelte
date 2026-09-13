<script>
  import { getTransactionsForMonth, getAll, groupTransactionsByCategory } from '../lib/data/db.js';
  import { resolveTransactionLabels } from '../lib/data/transactions.js';
  import { fmtMoney, fmtMonthLabel, shiftYearMonth, currentYearMonth, MONTH_SHORT } from '../lib/data/format.js';
  import TransactionRow from '../lib/components/TransactionRow.svelte';

  // Scoped to the app-wide selected account (specs/transactions.md
  // requirement 22 — the same account Home is showing).
  let { accountId, onOpenTransaction } = $props();

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

  // Set only by drilling in from a Category view row (requirement 29) —
  // switching the view toggle directly always clears this.
  let categoryFilterActive = $state(false);
  /** @type {string|null} */
  let categoryFilter = $state(null);
  let categoryFilterLabel = $state('');

  let transactions = $state([]);
  let categoryTotals = $state([]);

  // Every reactive input this reads is captured as a plain argument
  // *before* the first await below, inside the effect body — reading
  // them after an await wouldn't be tracked as a dependency. The guard
  // object lets a newer run cancel an older, still-in-flight one — two
  // quick changes (e.g. clearing search right before paging the month)
  // could otherwise let the slower load() finish last and overwrite
  // fresher results with stale ones.
  $effect(() => {
    const guard = { cancelled: false };
    load(yearMonth, accountId, search, categoryFilterActive, categoryFilter, guard);
    return () => { guard.cancelled = true; };
  });

  async function load(month, accountId, search, filterActive, filterCategoryId, guard) {
    const [monthTxns, categories] = await Promise.all([
      getTransactionsForMonth(month, accountId),
      getAll('categories')
    ]);
    if (guard.cancelled) return;

    const q = search.trim().toLowerCase();
    const searched = q ? monthTxns.filter(t => (t.description || '').toLowerCase().includes(q)) : monthTxns;

    const dateList = filterActive ? searched.filter(t => (t.categoryId ?? null) === filterCategoryId) : searched;
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
    categoryFilterLabel = row.category;
    view = 'date';
  }

  function clearCategoryFilter() {
    categoryFilterActive = false;
    categoryFilter = null;
  }
</script>

<div class="activity">
  <div class="topbar">
    <div class="title">Activity</div>
    <div class="month-nav">
      <button onclick={() => yearMonth = shiftYearMonth(yearMonth, -1)} aria-label="Previous month">‹</button>
      <button class="month-label" onclick={openMonthPicker}>{fmtMonthLabel(yearMonth)}</button>
      <button onclick={() => yearMonth = shiftYearMonth(yearMonth, 1)} aria-label="Next month">›</button>
    </div>
  </div>

  <div class="content">
    <input class="search" type="text" bind:value={search} placeholder="Search description…" />

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

  .search {
    width: 100%; padding: 10px 14px; border-radius: 10px; border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 14px; color: var(--ink);
    box-sizing: border-box; margin-bottom: 12px;
  }

  .view-toggle { display: flex; gap: 8px; margin-bottom: 10px; }
  .view-toggle button {
    flex: 1; padding: 8px; border-radius: 10px; border: 1.5px solid var(--paper-line);
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
    padding: 13px 16px; border-radius: 12px; background: var(--paper-dim); border: none;
    font-family: var(--font-body);
  }
  .cat-name { font-size: 14.5px; font-weight: 600; color: var(--ink); }
  .cat-amount { font-size: 14.5px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .picker-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: 16px; padding: 20px; }
  .picker-year-nav {
    display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 16px;
    font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--ink);
  }
  .picker-year-nav button { background: none; border: none; color: var(--ink); font-size: 18px; padding: 2px 8px; }
  .picker-month-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .picker-month-btn {
    padding: 12px 0; border-radius: 10px; border: none; background: var(--paper-dim);
    font-family: var(--font-body); font-size: 13.5px; font-weight: 600; color: var(--ink);
  }
  .picker-month-btn.selected { background: var(--accent); color: var(--accent-ink); font-weight: 700; }
</style>
