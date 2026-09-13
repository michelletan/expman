<script>
  let { accounts, current, onSelect, onClose } = $props();
</script>

<div class="backdrop" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="title">Switch account</div>
    {#each accounts as acct (acct.id)}
      <button class="row" class:active={acct.id === current} onclick={() => onSelect(acct.id)}>
        {acct.name}
      </button>
    {/each}
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: flex-end; justify-content: center; z-index: 50;
  }
  .sheet {
    width: 100%; max-width: 480px; background: var(--paper);
    border-radius: 16px 16px 0 0; padding: 16px 8px max(env(safe-area-inset-bottom), 16px);
  }
  .title {
    font-family: var(--font-body); font-size: 13px; font-weight: 700;
    color: var(--ink); opacity: .6; padding: 4px 12px 10px;
  }
  .row {
    display: block; width: 100%; text-align: left; padding: 12px;
    border-radius: 10px; background: none; border: none;
    font-family: var(--font-body); font-size: 15px; font-weight: 600; color: var(--ink);
  }
  .row.active { background: var(--paper-dim); color: var(--accent); }
</style>
