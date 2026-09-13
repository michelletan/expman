<script>
  let { current = 'Home', onSelect } = $props();

  const tabs = [
    { label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
    { label: 'Activity', icon: 'M4 6h16M4 12h16M4 18h9' },
    { label: 'Reports', icon: 'M4 19V9M12 19V4M20 19v-7' },
    { label: 'Settings', icon: 'M12 8v4l3 2', circle: true }
  ];
</script>

<div class="tabbar">
  {#each tabs as tab (tab.label)}
    <button class="tab-item" class:active={current === tab.label} onclick={() => onSelect?.(tab.label)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        {#if tab.rect}<rect x="3" y="4" width="18" height="16" rx="2" />{/if}
        {#if tab.circle}<circle cx="12" cy="12" r="9" />{/if}
        <path d={tab.icon} />
      </svg>
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0;
    max-width: 480px; margin: 0 auto;
    height: calc(66px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(12px);
    border-top: 1px solid var(--paper-line);
    display: flex; align-items: flex-start; padding-top: 10px;
  }
  .tab-item {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    color: #9C8F6B; font-size: 10.5px; font-weight: 600;
    background: none; border: none; font-family: var(--font-body);
  }
  .tab-item.active { color: var(--accent); }
  .tab-item svg { width: 22px; height: 22px; }
</style>
