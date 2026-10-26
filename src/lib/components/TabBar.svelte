<script>
  let { current = 'Home', onSelect } = $props();

  const tabs = [
    { label: 'Home', icon: 'M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z' },
    { label: 'Activity', icon: 'M4 6h16M4 12h16M4 18h9' },
    { label: 'Reports', icon: 'M4 17l5-5 4 4 7-8M15 8h5v5', round: true },
    {
      label: 'Settings', icon: 'M6 4v16M12 4v16M18 4v16', round: true,
      circles: [{ cx: 6, cy: 9, r: 2 }, { cx: 12, cy: 15, r: 2 }, { cx: 18, cy: 7, r: 2 }]
    }
  ];
</script>

<div class="tabbar">
  {#each tabs as tab (tab.label)}
    <button class="tab-item" class:active={current === tab.label} onclick={() => onSelect?.(tab.label)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        {#if tab.rect}<rect x="3" y="4" width="18" height="16" rx="2" />{/if}
        {#each tab.circles ?? [] as c}<circle cx={c.cx} cy={c.cy} r={c.r} />{/each}
        <path d={tab.icon} stroke-linecap={tab.round ? 'round' : 'butt'} stroke-linejoin={tab.round ? 'round' : 'miter'} />
      </svg>
      {tab.label}
    </button>
  {/each}
</div>

<style>
  .tabbar {
    position: fixed; left: 0; right: 0; bottom: 0;
    max-width: 480px; margin: 0 auto;
    height: var(--tabbar-height);
    padding-bottom: min(env(safe-area-inset-bottom), 34px);
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
