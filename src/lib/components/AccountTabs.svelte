<script>
  let { accounts, current, onSelect } = $props();
</script>

<div class="acct-tabs">
  {#each accounts as acct (acct)}
    <button class="acct-tab" class:active={current === acct} onclick={() => onSelect(acct)}>
      {acct}
    </button>
  {/each}
</div>

<style>
  .acct-tabs { display: flex; gap: 6px; margin-top: 14px; }
  .acct-tab {
    padding: 7px 14px; border-radius: 20px; font-size: 13.5px; font-weight: 600;
    background: rgba(255,255,255,.08); color: #C7CCDC; border: none; font-family: var(--font-body);
  }
  .acct-tab.active { background: var(--accent); color: var(--accent-ink); }
</style>
