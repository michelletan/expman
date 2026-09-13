<script>
  import { onMount } from 'svelte';
  import { openDB, ensureDefaultAccount, ensureDefaultCategories } from './lib/data/db.js';
  import Home from './pages/Home.svelte';
  import Settings from './pages/Settings.svelte';
  import Accounts from './pages/Accounts.svelte';
  import AddAccount from './pages/AddAccount.svelte';
  import Categories from './pages/Categories.svelte';
  import Placeholder from './pages/Placeholder.svelte';
  import TabBar from './lib/components/TabBar.svelte';

  // Top-level tabs plus the Settings > {Accounts > Add Account,
  // Categories} screens reached from Settings. Child screens keep the
  // Settings tab highlighted; their back button returns straight to
  // Settings (see specs/accounts.md, specs/categories.md).
  let ready = $state(false);
  let screen = $state('Home');
  let editingAccountId = $state(null);

  const TAB_FOR_SCREEN = {
    Home: 'Home', Activity: 'Activity', Reports: 'Reports',
    Settings: 'Settings', Accounts: 'Settings', AddAccount: 'Settings', Categories: 'Settings'
  };

  onMount(async () => {
    await openDB();
    await ensureDefaultAccount();
    await ensureDefaultCategories();
    ready = true;
  });

  function backToSettings() {
    screen = 'Settings';
  }
  function openAddAccount(accountId) {
    editingAccountId = accountId;
    screen = 'AddAccount';
  }
</script>

<div id="app-shell" data-theme="midnight">
  {#if !ready}
    <div class="boot-loading">Loading…</div>
  {:else}
    <div class="screen-area">
      {#if screen === 'Home'}
        <Home />
      {:else if screen === 'Activity' || screen === 'Reports'}
        <Placeholder title={screen} />
      {:else if screen === 'Settings'}
        <Settings onOpenAccounts={() => screen = 'Accounts'} onOpenCategories={() => screen = 'Categories'} />
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
      {/if}
    </div>
    <TabBar current={TAB_FOR_SCREEN[screen]} onSelect={(tab) => screen = tab} />
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
