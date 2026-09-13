<script>
  import { onMount } from 'svelte';
  import { openDB, ensureDefaultAccount, ensureDefaultCategories, ensureCategoryOrdering, getAccounts } from './lib/data/db.js';
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
  import Placeholder from './pages/Placeholder.svelte';
  import TabBar from './lib/components/TabBar.svelte';

  // Top-level tabs plus the Settings > {Accounts > Add Account,
  // Categories, Cards > Add/Edit Card, Card Details} screens reached
  // from Settings. Child screens keep the Settings tab highlighted;
  // their back button returns straight to Settings — except Add/Edit
  // Card and Card Details, which return to the Cards list they came
  // from (see specs/accounts.md, specs/categories.md, specs/cards.md).
  let ready = $state(false);
  let screen = $state('Home');
  let editingAccountId = $state(null);
  let editingCardId = $state(null);
  let viewingCardId = $state(null);

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
    Cards: 'Settings', AddEditCard: 'Settings', CardDetails: 'Settings'
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
        <Activity {accountId} onOpenTransaction={openEditTransaction} />
      {:else if screen === 'Reports'}
        <Placeholder title={screen} />
      {:else if screen === 'Settings'}
        <Settings
          onOpenAccounts={() => screen = 'Accounts'}
          onOpenCategories={() => screen = 'Categories'}
          onOpenCards={() => screen = 'Cards'}
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
        <CardDetails cardId={viewingCardId} onBack={backToCards} />
      {/if}
    </div>
    <TabBar
      current={screen === 'AddTransaction' ? TAB_FOR_SCREEN[addTransactionReturnTo] : TAB_FOR_SCREEN[screen]}
      onSelect={(tab) => screen = tab}
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
