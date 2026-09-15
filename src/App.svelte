<script>
  import { onMount } from 'svelte';
  import { openDB, ensureDefaultAccount, ensureDefaultCategories, ensureCategoryOrdering, materializeAllRecurring, getAccounts } from './lib/data/db.js';
  import Home from './pages/Home.svelte';
  import Settings from './pages/Settings.svelte';
  import Accounts from './pages/Accounts.svelte';
  import AddAccount from './pages/AddAccount.svelte';
  import Categories from './pages/Categories.svelte';
  import Cards from './pages/Cards.svelte';
  import AddEditCard from './pages/AddEditCard.svelte';
  import CardDetails from './pages/CardDetails.svelte';
  import AddTransaction from './pages/AddTransaction.svelte';
  import Activity from './pages/Activity.svelte';
  import Recurring from './pages/Recurring.svelte';
  import AddEditRecurring from './pages/AddEditRecurring.svelte';
  import Budgets from './pages/Budgets.svelte';
  import AddEditBudget from './pages/AddEditBudget.svelte';
  import Backup from './pages/Backup.svelte';
  import Reports from './pages/Reports.svelte';
  import TabBar from './lib/components/TabBar.svelte';

  // Top-level tabs plus the Settings > {Accounts > Add Account,
  // Categories, Cards > Add/Edit Card, Card Details} screens reached
  // from Settings. Child screens keep the Settings tab highlighted;
  // their back button returns straight to Settings — except Add/Edit
  // Card, which always returns to the Cards list it's only ever opened
  // from, and Card Details, which (like Recurring/Budgets below) can
  // also be opened from Home now and returns wherever it came from
  // (see specs/accounts.md, specs/categories.md, specs/cards.md).
  let ready = $state(false);
  let screen = $state('Home');
  let editingAccountId = $state(null);
  let editingCardId = $state(null);
  let viewingCardId = $state(null);
  let editingRecurringId = $state(null);
  let editingBudgetId = $state(null);

  // Recurring and Budgets are reachable from both Home and Settings now,
  // so — same idea as addTransactionReturnTo below — each remembers
  // which one opened it, for its own back button and for which tab stays
  // highlighted while inside it or its Add/Edit form.
  let recurringReturnTo = $state('Home');
  let budgetsReturnTo = $state('Home');
  let cardDetailsReturnTo = $state('Home');

  // Set only when Activity is opened from a budget tap (specs/budgets.md
  // requirement 19) — cleared by selectTab below whenever the user
  // switches screens any other way, so a later plain tab tap into
  // Activity never inherits a stale filter.
  let activityInitialCategoryFilter = $state(null);
  let activityInitialSubcategoryFilter = $state(null);

  // Add Transaction is reached from Home (and later Activity) rather
  // than Settings, so back/save return to whichever tab opened it
  // instead of always going to Settings (specs/transactions.md
  // requirements 8-9, 16).
  let editingTransactionId = $state(null);
  let newTransactionType = $state('expense');
  let addTransactionReturnTo = $state('Home');

  // The selected account lives here, not in Home, so Home and Activity
  // (specs/transactions.md requirement 5) always agree on which account
  // they're showing.
  let accounts = $state([]);
  let accountId = $state(null);

  const TAB_FOR_SCREEN = {
    Home: 'Home', Activity: 'Activity', Reports: 'Reports',
    Settings: 'Settings', Accounts: 'Settings', AddAccount: 'Settings', Categories: 'Settings',
    Cards: 'Settings', AddEditCard: 'Settings', Backup: 'Settings'
  };

  async function refreshAccounts() {
    accounts = await getAccounts();
    if (!accounts.some(a => a.id === accountId)) accountId = accounts[0]?.id ?? null;
  }

  onMount(async () => {
    await openDB();
    await ensureDefaultAccount();
    await ensureDefaultCategories();
    await ensureCategoryOrdering(); // normalizes order/color/isDeleted before anything reads categories
    await materializeAllRecurring();
    await refreshAccounts();
    ready = true;
  });

  // Re-fetch whenever Home or Activity comes into view, so adding/
  // editing/deleting an account elsewhere (Settings > Accounts) shows up
  // immediately instead of going stale — App.svelte doesn't remount the
  // way a per-screen component would on its own onMount.
  $effect(() => {
    if (ready && (screen === 'Home' || screen === 'Activity')) refreshAccounts();
  });

  function backToSettings() {
    screen = 'Settings';
  }
  function openAddAccount(id) {
    editingAccountId = id;
    screen = 'AddAccount';
  }

  function backToCards() {
    screen = 'Cards';
  }
  function openAddCard(id) {
    editingCardId = id;
    screen = 'AddEditCard';
  }
  function openCardDetails(id) {
    viewingCardId = id;
    cardDetailsReturnTo = screen;
    screen = 'CardDetails';
  }

  function openAddTransaction(type) {
    editingTransactionId = null;
    newTransactionType = type;
    addTransactionReturnTo = screen;
    screen = 'AddTransaction';
  }
  function openEditTransaction(id) {
    editingTransactionId = id;
    addTransactionReturnTo = screen;
    screen = 'AddTransaction';
  }

  function openRecurring() {
    recurringReturnTo = screen;
    screen = 'Recurring';
  }
  function backToRecurring() {
    screen = 'Recurring';
  }
  function openAddRecurring(id) {
    editingRecurringId = id;
    screen = 'AddEditRecurring';
  }

  function openBudgets() {
    budgetsReturnTo = screen;
    screen = 'Budgets';
  }
  function backToBudgets() {
    screen = 'Budgets';
  }
  function openAddBudget(id) {
    editingBudgetId = id;
    screen = 'AddEditBudget';
  }
  function openActivityForBudget(categoryId, subcategoryId) {
    activityInitialCategoryFilter = categoryId;
    activityInitialSubcategoryFilter = subcategoryId;
    screen = 'Activity';
  }

  // Wraps every other way of changing screens (the tab bar) so a stale
  // budget filter never leaks into a later, unrelated visit to Activity.
  function selectTab(tab) {
    activityInitialCategoryFilter = null;
    activityInitialSubcategoryFilter = null;
    screen = tab;
  }

  // Which tab stays highlighted — screens reached from more than one
  // place (Add Transaction, Recurring, Budgets) resolve through wherever
  // they were actually opened from, not a fixed tab.
  function currentTab() {
    if (screen === 'AddTransaction') return TAB_FOR_SCREEN[addTransactionReturnTo];
    if (screen === 'Recurring' || screen === 'AddEditRecurring') return TAB_FOR_SCREEN[recurringReturnTo];
    if (screen === 'Budgets' || screen === 'AddEditBudget') return TAB_FOR_SCREEN[budgetsReturnTo];
    if (screen === 'CardDetails') return TAB_FOR_SCREEN[cardDetailsReturnTo];
    return TAB_FOR_SCREEN[screen];
  }
</script>

<div id="app-shell" data-theme="midnight">
  {#if !ready}
    <div class="boot-loading">Loading…</div>
  {:else}
    <div class="screen-area">
      {#if screen === 'Home'}
        <Home
          {accounts} {accountId} onSelectAccount={(id) => accountId = id}
          onAddExpense={() => openAddTransaction('expense')}
          onAddIncome={() => openAddTransaction('income')}
          onOpenTransaction={openEditTransaction}
          onOpenRecurring={openRecurring}
          onOpenBudgets={openBudgets}
          onOpenBudgetCategory={openActivityForBudget}
          onOpenCardDetails={openCardDetails}
        />
      {:else if screen === 'AddTransaction'}
        <AddTransaction
          transactionId={editingTransactionId}
          initialType={newTransactionType}
          defaultAccountId={accountId}
          onBack={() => screen = addTransactionReturnTo}
          onSaved={() => screen = addTransactionReturnTo}
        />
      {:else if screen === 'Activity'}
        <Activity
          {accountId}
          onOpenTransaction={openEditTransaction}
          initialCategoryFilter={activityInitialCategoryFilter}
          initialSubcategoryFilter={activityInitialSubcategoryFilter}
        />
      {:else if screen === 'Recurring'}
        <Recurring
          onBack={() => screen = recurringReturnTo}
          onAdd={() => openAddRecurring(null)}
          onEdit={(id) => openAddRecurring(id)}
        />
      {:else if screen === 'AddEditRecurring'}
        <AddEditRecurring
          recurringId={editingRecurringId}
          defaultAccountId={accountId}
          onBack={backToRecurring}
          onSaved={backToRecurring}
        />
      {:else if screen === 'Budgets'}
        <Budgets
          {accountId}
          onBack={() => screen = budgetsReturnTo}
          onAdd={() => openAddBudget(null)}
          onEdit={(id) => openAddBudget(id)}
          onOpenCategory={openActivityForBudget}
        />
      {:else if screen === 'AddEditBudget'}
        <AddEditBudget
          budgetId={editingBudgetId}
          defaultAccountId={accountId}
          onBack={backToBudgets}
          onSaved={backToBudgets}
        />
      {:else if screen === 'Reports'}
        <Reports {accountId} />
      {:else if screen === 'Settings'}
        <Settings
          onOpenAccounts={() => screen = 'Accounts'}
          onOpenCategories={() => screen = 'Categories'}
          onOpenCards={() => screen = 'Cards'}
          onOpenRecurring={openRecurring}
          onOpenBudgets={openBudgets}
          onOpenBackup={() => screen = 'Backup'}
        />
      {:else if screen === 'Accounts'}
        <Accounts
          onBack={backToSettings}
          onAdd={() => openAddAccount(null)}
          onEdit={(id) => openAddAccount(id)}
        />
      {:else if screen === 'AddAccount'}
        <AddAccount accountId={editingAccountId} onBack={backToSettings} onSaved={() => screen = 'Accounts'} />
      {:else if screen === 'Categories'}
        <Categories onBack={backToSettings} />
      {:else if screen === 'Cards'}
        <Cards
          onBack={backToSettings}
          onAdd={() => openAddCard(null)}
          onEdit={(id) => openAddCard(id)}
          onView={openCardDetails}
        />
      {:else if screen === 'AddEditCard'}
        <AddEditCard cardId={editingCardId} onBack={backToCards} onSaved={backToCards} />
      {:else if screen === 'CardDetails'}
        <CardDetails cardId={viewingCardId} onBack={() => screen = cardDetailsReturnTo} />
      {:else if screen === 'Backup'}
        <Backup onBack={backToSettings} onImported={() => screen = 'Home'} />
      {/if}
    </div>
    <TabBar
      current={currentTab()}
      onSelect={selectTab}
    />
  {/if}
</div>

<style>
  #app-shell {
    max-width: 480px;
    margin: 0 auto;
    min-height: 100vh;
    background: var(--paper);
  }
  .boot-loading {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    color: var(--ink); opacity: .5; font-family: var(--font-body); font-size: 14px;
  }
</style>
