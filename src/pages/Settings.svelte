<script>
  let { onOpenAccounts } = $props();

  // Only "Accounts" is spec'd so far — see specs/accounts.md. Other rows
  // (Categories, Recurring, Budgets, Theme, Backup & Sync) are TODO.md's
  // "More / Settings hub" list, not yet built.
  const options = $derived([
    { label: 'Accounts', onClick: onOpenAccounts }
  ]);
</script>

<div class="settings">
  <div class="topbar"><div class="title">Settings</div></div>
  <div class="content">
    <div class="option-list">
      {#each options as opt (opt.label)}
        <button class="option-row" onclick={opt.onClick}>
          <span>{opt.label}</span>
          <span class="chev">›</span>
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
    padding: 14px 16px; border-radius: 12px; background: var(--paper-dim); border: none;
    font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--ink);
  }
  .chev { opacity: .4; font-size: 18px; }
</style>
