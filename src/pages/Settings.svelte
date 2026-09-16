<script>
  import { onMount } from 'svelte';
  import { getMeta } from '../lib/data/db.js';

  let { onOpenAccounts, onOpenCategories, onOpenCards, onOpenRecurring, onOpenBudgets, onOpenSavingsGoal, onOpenBackup, onOpenTheme } = $props();

  const THEME_NAMES = { midnight: 'Midnight Gold', journal: 'Journal', ledger: 'Ledger', meadow: 'Meadow' };
  let themeName = $state('Midnight Gold');

  onMount(async () => {
    themeName = THEME_NAMES[(await getMeta('theme')) ?? 'midnight'];
  });

  // Accounts, Categories, Cards, Recurring, Budgets, Savings Goal,
  // Backup, and Theme are spec'd so far — see specs/accounts.md,
  // specs/categories.md, specs/cards.md, specs/recurring.md,
  // specs/budgets.md, specs/savings-goals.md, specs/import-export.md,
  // specs/themes.md.
  const options = $derived([
    { label: 'Accounts', onClick: onOpenAccounts },
    { label: 'Categories', onClick: onOpenCategories },
    { label: 'Cards', onClick: onOpenCards },
    { label: 'Recurring', onClick: onOpenRecurring },
    { label: 'Budgets', onClick: onOpenBudgets },
    { label: 'Savings Goal', onClick: onOpenSavingsGoal },
    { label: 'Theme', value: themeName, onClick: onOpenTheme },
    { label: 'Backup', onClick: onOpenBackup }
  ]);
</script>

<div class="settings">
  <div class="topbar"><div class="title">Settings</div></div>
  <div class="content">
    <div class="option-list">
      {#each options as opt (opt.label)}
        <button class="option-row" onclick={opt.onClick}>
          <span>{opt.label}</span>
          <span class="right">
            {#if opt.value}<span class="value">{opt.value}</span>{/if}
            <span class="chev">›</span>
          </span>
        </button>
      {/each}
    </div>
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .content { background: var(--paper); min-height: 100vh; padding-bottom: 90px; }
  .option-list { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; }
  .option-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; border-radius: var(--radius); background: var(--paper-dim); border: none;
    font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--ink);
  }
  .right { display: flex; align-items: center; gap: 8px; }
  .value { opacity: .6; font-size: 13.5px; font-weight: 500; }
  .chev { opacity: .4; font-size: 18px; }
</style>
