<script>
  import { onMount } from 'svelte';
  import { getAccounts } from '../lib/data/db.js';
  import { getRecentTransactions, getHomeSummary, getBudgetStatuses } from '../lib/data/transactions.js';
  import { fmtMoneySigned, fmtMonthLabel, currentYearMonth } from '../lib/data/format.js';
  import TransactionRow from '../lib/components/TransactionRow.svelte';
  import BudgetCard from '../lib/components/BudgetCard.svelte';
  import AccountSwitcher from '../lib/components/AccountSwitcher.svelte';

  // $state is Svelte 5's reactivity primitive — reassigning these
  // variables anywhere automatically re-renders whatever reads them.
  let accounts = $state([]);
  let accountId = $state(null);
  let switcherOpen = $state(false);
  let recent = $state([]);
  let monthExpense = $state(0);
  let budgets = $state([]);
  const monthLabel = fmtMonthLabel(currentYearMonth());

  const currentAccountName = $derived(accounts.find(a => a.id === accountId)?.name ?? '');

  onMount(async () => {
    accounts = await getAccounts();
    accountId = accounts[0]?.id ?? null;
  });

  // $effect re-runs whenever a value it read synchronously
  // (currentAccountName) changes — this is what makes switching accounts
  // actually refetch and re-render, unlike the prototype's one-shot
  // onMount. Data-layer queries key off the account's name (see
  // specs/accounts.md); accountId only drives which account is selected
  // in this component and in AccountSwitcher.
  $effect(() => {
    if (accountId != null) loadData(currentAccountName);
  });

  async function loadData(accountName) {
    const [summary, budgetStatuses, recentTxns] = await Promise.all([
      getHomeSummary(accountName),
      getBudgetStatuses(3),
      getRecentTransactions(6, accountName)
    ]);
    monthExpense = summary.monthSummary.expense;
    budgets = budgetStatuses;
    recent = recentTxns;
  }

  function openTransaction(id) {
    alert('Would open transaction ' + id + ' for editing.');
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
    onSelect={(id) => { accountId = id; switcherOpen = false; }}
    onClose={() => switcherOpen = false}
  />
{/if}

<div class="content">
  <div class="balance-hero">
    <div class="label">Spent this month · {monthLabel}</div>
    <div class="amount">{fmtMoneySigned(monthExpense, 'expense')}</div>
    <div class="income-btn-row">
      <button class="ghost-btn">+ Add Income</button>
      <button class="ghost-btn neutral">🔁 Recurring</button>
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
      <TransactionRow {transaction} onOpen={openTransaction} />
    {:else}
      <div class="empty-state">No transactions yet.</div>
    {/each}
  </div>
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
</style>
