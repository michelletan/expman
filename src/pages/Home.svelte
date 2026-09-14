<script>
  import { getRecentTransactions, getHomeSummary, getBudgetStatuses } from '../lib/data/transactions.js';
  import { fmtMoneySigned, fmtMonthLabel, currentYearMonth } from '../lib/data/format.js';
  import TransactionRow from '../lib/components/TransactionRow.svelte';
  import BudgetCard from '../lib/components/BudgetCard.svelte';
  import AccountSwitcher from '../lib/components/AccountSwitcher.svelte';

  // accounts/accountId live in App.svelte now, shared with Activity
  // (specs/transactions.md requirement 5) — this component just renders
  // them and reports selections back up via onSelectAccount.
  let { accounts, accountId, onSelectAccount, onAddExpense, onAddIncome, onOpenTransaction, onOpenRecurring } = $props();

  let switcherOpen = $state(false);
  let recent = $state([]);
  let monthExpense = $state(0);
  let budgets = $state([]);
  const monthLabel = fmtMonthLabel(currentYearMonth());

  const currentAccountName = $derived(accounts.find(a => a.id === accountId)?.name ?? '');

  // $effect re-runs whenever a value it read synchronously (accountId)
  // changes — this is what makes switching accounts actually refetch and
  // re-render. Data-layer queries key off the account's id (see
  // specs/accounts.md) and resolve its current name live wherever one
  // needs to be displayed. The guard discards a slower, older load() if
  // the account is switched again before it finishes, so a stale result
  // can't land after a fresher one (same fix as Activity.svelte).
  $effect(() => {
    if (accountId == null) return;
    const guard = { cancelled: false };
    loadData(accountId, guard);
    return () => { guard.cancelled = true; };
  });

  async function loadData(id, guard) {
    const [summary, budgetStatuses, recentTxns] = await Promise.all([
      getHomeSummary(id),
      getBudgetStatuses(3),
      getRecentTransactions(5, id)
    ]);
    if (guard.cancelled) return;
    monthExpense = summary.monthSummary.expense;
    budgets = budgetStatuses;
    recent = recentTxns;
  }

  function openBudget(category) {
    alert('Would open ' + category + ' budget detail.');
  }
</script>

<div class="topbar">
  <div class="eyebrow">Good to see you</div>
  <div class="account-row">
    <span class="account-name">{currentAccountName}</span>
    {#if accounts.length > 1}
      <button class="switch-btn" onclick={() => switcherOpen = true}>Switch</button>
    {/if}
  </div>
</div>

{#if switcherOpen}
  <AccountSwitcher
    {accounts}
    current={accountId}
    onSelect={(id) => { onSelectAccount(id); switcherOpen = false; }}
    onClose={() => switcherOpen = false}
  />
{/if}

<div class="content">
  <div class="balance-hero">
    <div class="label">Spent this month · {monthLabel}</div>
    <div class="amount">{fmtMoneySigned(monthExpense, 'expense')}</div>
    <div class="income-btn-row">
      <button class="ghost-btn" onclick={onAddIncome}>+ Add Income</button>
      <button class="ghost-btn neutral" onclick={onOpenRecurring}>🔁 Recurring</button>
      <button class="ghost-btn neutral">💰 Budgets</button>
    </div>
  </div>

  {#if budgets.length}
    <div class="section-label">Budgets this month</div>
    <div class="budget-row">
      {#each budgets as status (status.category)}
        <BudgetCard {status} onOpen={openBudget} />
      {/each}
    </div>
  {/if}

  <div class="section-label">Recent activity</div>
  <div class="tx-list">
    {#each recent as transaction (transaction.id)}
      <TransactionRow {transaction} onOpen={onOpenTransaction} />
    {:else}
      <div class="empty-state">No transactions yet.</div>
    {/each}
  </div>
</div>

<div class="fab-wrap">
  <button class="fab" onclick={onAddExpense} aria-label="Add expense">+</button>
</div>

<style>
  /* Page-level layout only — everything reusable already moved out
     into lib/components. This file is now ~90 lines of markup+logic
     instead of home.js's mix of template strings, DOM queries and
     manually-wired event listeners. */
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
  }
  .eyebrow { font-size: 12.5px; color: #9BA3BC; font-weight: 500; }
  .account-row { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
  .account-name {
    font-family: var(--font-display); font-weight: 600; font-size: 20px; color: var(--paper);
  }
  .switch-btn {
    padding: 5px 12px; border-radius: 20px; font-size: 12.5px; font-weight: 700;
    background: rgba(255,255,255,.08); color: #C7CCDC; border: none; font-family: var(--font-body);
  }

  .content { background: var(--paper); min-height: 100vh; padding-bottom: 90px; }

  .balance-hero { background: var(--ink); color: var(--paper); padding: 6px 20px 20px; }
  .label { font-size: 13px; color: #9BA3BC; font-weight: 500; }
  .amount {
    font-family: var(--font-display); font-weight: 600; font-size: 40px;
    font-variant-numeric: tabular-nums; margin-top: 2px; color: #E39A8A;
  }
  .income-btn-row { margin-top: 16px; display: flex; flex-wrap: wrap; gap: 8px; }
  .ghost-btn {
    display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 20px;
    font-size: 12.5px; font-weight: 700; border: 1.5px solid rgba(123,196,154,.5);
    color: #7BC49A; background: transparent; font-family: var(--font-body);
  }
  .ghost-btn.neutral { border-color: rgba(199,204,220,.35); color: #C7CCDC; }

  .section-label { padding: 18px 20px 8px; font-size: 13px; font-weight: 700; color: var(--ink); opacity: .6; }
  .budget-row { padding: 0 20px; display: flex; flex-direction: column; gap: 10px; }
  .tx-list { padding: 0 20px; }
  .empty-state { padding: 40px 24px; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }

  .fab-wrap {
    position: fixed; left: 0; right: 0; bottom: calc(66px + env(safe-area-inset-bottom) + 16px);
    max-width: 480px; margin: 0 auto; pointer-events: none;
  }
  .fab {
    position: absolute; right: 20px; bottom: 0; pointer-events: auto;
    width: 52px; height: 52px; border-radius: 50%; border: none;
    background: var(--accent); color: var(--accent-ink);
    font-size: 26px; line-height: 1; box-shadow: 0 4px 14px rgba(0,0,0,.25);
  }
</style>
