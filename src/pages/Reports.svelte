<script>
  import {
    getTransactionsForMonth, getAll, groupTransactionsByCategory,
    getYearlyTrend, getBudgetsActiveForMonth, getTopSubcategories
  } from '../lib/data/db.js';
  import { getSpendingCallouts } from '../lib/data/transactions.js';
  import { fmtMoney, fmtMonthLabel, shiftYearMonth, currentYearMonth, MONTH_SHORT } from '../lib/data/format.js';
  import PieChart from '../lib/components/charts/PieChart.svelte';
  import BarChart from '../lib/components/charts/BarChart.svelte';

  // Scoped to the app-wide selected account, like Activity/Budgets
  // (specs/reports.md requirement 2).
  let { accountId } = $props();

  let yearMonth = $state(currentYearMonth());
  const year = $derived(Number(yearMonth.slice(0, 4)));
  const isCurrentYear = $derived(yearMonth.slice(0, 4) === currentYearMonth().slice(0, 4));
  const currentMonthIndex = $derived(Number(currentYearMonth().slice(5, 7)) - 1);

  let pieRows = $state([]);
  /** @type {{income: number[], expense: number[]}} */
  let trend = $state({ income: [], expense: [] });
  let budgetStatuses = $state([]);
  let topSubs = $state([]);
  let callouts = $state([]); // specs/spending-callouts.md — up to 3, follows this page's own month-nav

  // Resolved once from CSS custom properties — Canvas's fillStyle can't
  // resolve var(--x) itself the way DOM elements can, so chart colors
  // need real hex values handed to Chart.js.
  let colors = $state({ accent: '#C99A3B', rust: '#B54B3B', green: '#3F7D58', line: '#DDD0AE' });

  $effect(() => {
    const style = getComputedStyle(document.documentElement);
    colors = {
      accent: style.getPropertyValue('--accent').trim() || colors.accent,
      rust: style.getPropertyValue('--rust').trim() || colors.rust,
      green: style.getPropertyValue('--green').trim() || colors.green,
      line: style.getPropertyValue('--paper-line').trim() || colors.line
    };
  });

  $effect(() => {
    const guard = { cancelled: false };
    load(yearMonth, accountId, guard);
    return () => { guard.cancelled = true; };
  });

  async function load(month, accId, guard) {
    const y = Number(month.slice(0, 4));
    const [monthTxns, categories, yearlyTrend, budgets, subs, calloutRows] = await Promise.all([
      getTransactionsForMonth(month, accId),
      getAll('categories'),
      getYearlyTrend(y, accId),
      getBudgetsActiveForMonth(month, accId),
      getTopSubcategories(5, month, accId),
      getSpendingCallouts(month, accId)
    ]);
    if (guard.cancelled) return;

    pieRows = groupTransactionsByCategory(monthTxns.filter(t => t.type === 'expense'), categories);
    trend = yearlyTrend;
    budgetStatuses = budgets;
    topSubs = subs;
    callouts = calloutRows.slice(0, 3);
  }

  const trendColors = $derived(
    MONTH_SHORT.map((_, i) => (isCurrentYear && i === currentMonthIndex) ? colors.accent : colors.line)
  );
</script>

<div class="reports">
  <div class="topbar">
    <div class="title">Reports</div>
  </div>

  <div class="month-nav">
    <button onclick={() => yearMonth = shiftYearMonth(yearMonth, -1)} aria-label="Previous month">‹</button>
    <span class="month-label">{fmtMonthLabel(yearMonth)}</span>
    <button onclick={() => yearMonth = shiftYearMonth(yearMonth, 1)} aria-label="Next month">›</button>
  </div>

  <div class="content">
    {#if callouts.length}
      <div class="card">
        <div class="card-title">Call-outs</div>
        <div class="callout-list">
          {#each callouts as c (c.categoryId)}
            <div class="callout-row">
              <span class="dot" style:background={c.color}></span>
              <span class="callout-text" class:warn={c.over}>{c.label}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="card">
      <div class="card-title">Spend by category</div>
      {#if pieRows.length}
        <PieChart
          labels={pieRows.map(r => r.category)}
          values={pieRows.map(r => r.total)}
          colors={pieRows.map(r => r.color)}
        />
      {:else}
        <div class="empty-state">No expenses this month.</div>
      {/if}
    </div>

    <div class="card">
      <div class="card-title">Monthly spend trend · {year}</div>
      <BarChart labels={MONTH_SHORT} datasets={[{ label: 'Expense', data: trend.expense, color: trendColors }]} />
    </div>

    <div class="card">
      <div class="card-title">Income vs. expense · {year}</div>
      <BarChart
        labels={MONTH_SHORT}
        datasets={[
          { label: 'Income', data: trend.income, color: colors.green },
          { label: 'Expense', data: trend.expense, color: colors.rust }
        ]}
      />
    </div>

    <div class="card">
      <div class="card-title">Budget vs. actual</div>
      {#if budgetStatuses.length}
        <BarChart
          labels={budgetStatuses.map(b => b.category)}
          datasets={[
            { label: 'Budgeted', data: budgetStatuses.map(b => b.totalAvailable), color: colors.accent },
            { label: 'Spent', data: budgetStatuses.map(b => b.spent), color: colors.rust }
          ]}
        />
      {:else}
        <div class="empty-state">No budgets this month.</div>
      {/if}
    </div>

    <div class="card">
      <div class="card-title">Top spending subcategories</div>
      {#if topSubs.length}
        <BarChart
          horizontal
          labels={topSubs.map(s => `${s.category} / ${s.subcategory}`)}
          datasets={[{ label: 'Spent', data: topSubs.map(s => s.amount), color: colors.accent }]}
        />
      {:else}
        <div class="empty-state">No categorised spend this month.</div>
      {/if}
    </div>
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }

  .month-nav {
    display: flex; align-items: center; justify-content: center; gap: 12px;
    background: var(--ink); color: var(--paper); padding: 0 20px 16px;
    font-family: var(--font-body); font-size: 14px; font-weight: 600;
  }
  .month-nav button { background: none; border: none; color: var(--paper); font-size: 16px; padding: 2px 6px; }
  .month-label { min-width: 120px; text-align: center; }

  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px calc(66px + env(safe-area-inset-bottom) + 24px); display: flex; flex-direction: column; gap: 14px; }

  .card {
    background: #fff; border: 1px solid var(--paper-line); border-radius: var(--radius); padding: 16px;
  }
  .card-title { font-family: var(--font-body); font-size: 13px; font-weight: 700; color: var(--ink); opacity: .7; margin-bottom: 12px; }

  .empty-state { padding: 30px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 13.5px; }

  .callout-list { display: flex; flex-direction: column; gap: 10px; }
  .callout-row { display: flex; align-items: flex-start; gap: 8px; }
  .callout-row .dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }
  .callout-text { font-family: var(--font-body); font-size: 13.5px; color: var(--green); font-weight: 600; line-height: 1.4; }
  .callout-text.warn { color: var(--rust); }
</style>
