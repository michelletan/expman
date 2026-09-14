<script>
  import { getBudgetsActiveForMonth } from '../lib/data/db.js';
  import { fmtMoney, fmtMonthLabel, shiftYearMonth, currentYearMonth } from '../lib/data/format.js';
  import BudgetCard from '../lib/components/BudgetCard.svelte';

  let { onBack, onAdd, onEdit, onOpenCategory } = $props();

  let yearMonth = $state(currentYearMonth());
  let statuses = $state([]);

  $effect(() => {
    const guard = { cancelled: false };
    load(yearMonth, guard);
    return () => { guard.cancelled = true; };
  });

  async function load(month, guard) {
    const result = await getBudgetsActiveForMonth(month);
    if (guard.cancelled) return;
    statuses = result;
  }

  // These sums double-count when a category and one of its subcategories
  // both have a budget (specs/budgets.md requirement 6/Notes) — a known,
  // deliberate simplification, same treatment as Accounts' naive balance.
  const totalBudgeted = $derived(statuses.reduce((s, b) => s + b.totalAvailable, 0));
  const totalSpent = $derived(statuses.reduce((s, b) => s + b.spent, 0));
  const totalLeft = $derived(totalBudgeted - totalSpent);

  function openBudget(status) {
    onOpenCategory(status.categoryId, status.subcategoryId);
  }
</script>

<div class="budgets">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Budgets</div>
    <button class="add-btn" onclick={onAdd}>+ Add</button>
  </div>

  <div class="month-nav">
    <button onclick={() => yearMonth = shiftYearMonth(yearMonth, -1)} aria-label="Previous month">‹</button>
    <span class="month-label">{fmtMonthLabel(yearMonth)}</span>
    <button onclick={() => yearMonth = shiftYearMonth(yearMonth, 1)} aria-label="Next month">›</button>
  </div>

  <div class="content">
    {#if statuses.length}
      <div class="totals-row">
        <div class="totals-item"><span class="totals-label">Budgeted</span><span class="totals-amt">{fmtMoney(totalBudgeted)}</span></div>
        <div class="totals-item"><span class="totals-label">Spent</span><span class="totals-amt">{fmtMoney(totalSpent)}</span></div>
        <div class="totals-item"><span class="totals-label">Left</span><span class="totals-amt">{fmtMoney(totalLeft)}</span></div>
      </div>
    {/if}

    <div class="budget-list">
      {#each statuses as status (status.budgetId)}
        <div class="row-wrap">
          <BudgetCard {status} onOpen={openBudget} />
          <button class="icon-btn" onclick={() => onEdit(status.budgetId)} aria-label="Edit {status.category}">✎</button>
        </div>
      {:else}
        <div class="empty-state">No budgets for this month.</div>
      {/each}
    </div>
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn, .add-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }

  .month-nav {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    background: var(--ink); color: var(--paper); padding: 0 20px 16px;
    font-family: var(--font-body); font-size: 14px; font-weight: 600;
  }
  .month-nav button { background: none; border: none; color: var(--paper); font-size: 16px; padding: 2px 6px; }
  .month-label { min-width: 120px; text-align: center; }

  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px 90px; }

  .totals-row {
    display: flex; justify-content: space-between; background: var(--paper-dim);
    border-radius: 12px; padding: 12px 16px; margin-bottom: 16px;
  }
  .totals-item { display: flex; flex-direction: column; gap: 2px; }
  .totals-label { font-family: var(--font-body); font-size: 11.5px; font-weight: 700; color: var(--ink); opacity: .55; }
  .totals-amt { font-family: var(--font-display); font-size: 16px; font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }

  .budget-list { display: flex; flex-direction: column; gap: 10px; }
  .row-wrap { display: flex; gap: 8px; align-items: center; }
  .row-wrap :global(.budget-card) { flex: 1; }
  .icon-btn {
    width: 40px; height: 40px; flex-shrink: 0; border-radius: 10px; background: var(--paper-dim); border: none;
    color: var(--ink); opacity: .6; font-size: 14px;
  }

  .empty-state { padding: 40px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }
</style>
