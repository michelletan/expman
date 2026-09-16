<script>
  import { onMount } from 'svelte';
  import { getMeta, setMeta } from '../lib/data/db.js';

  let { onBack, onApplied } = $props();

  // Mirrors tokens.css (specs/themes.md) — kept as static data here (not
  // read from the live CSS vars) so every swatch can preview its own
  // theme at once, independent of which one is actually active.
  const THEMES = [
    { id: 'midnight', name: 'Midnight Gold', ink: '#1C2333', paper: '#F6EEDD', accent: '#C99A3B', radius: '14px', font: "'Space Grotesk', sans-serif" },
    { id: 'journal', name: 'Journal', ink: '#2B2018', paper: '#F8EFDD', accent: '#7C2D3A', radius: '10px', font: "'Lora', serif" },
    { id: 'ledger', name: 'Ledger', ink: '#1A1A1A', paper: '#F1F5EE', accent: '#1F4E79', radius: '2px', font: "'IBM Plex Mono', monospace" },
    { id: 'meadow', name: 'Meadow', ink: '#1B3A2B', paper: '#F0FBF4', accent: '#37B24D', radius: '22px', font: "'Baloo 2', sans-serif" }
  ];

  let activeId = $state('midnight');

  onMount(async () => {
    activeId = (await getMeta('theme')) ?? 'midnight';
  });

  async function select(id) {
    activeId = id;
    await setMeta('theme', id);
    onApplied?.(id);
  }
</script>

<div class="themes">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Theme</div>
    <span class="spacer"></span>
  </div>

  <div class="content">
    {#each THEMES as theme (theme.id)}
      <button class="swatch" class:active={activeId === theme.id} onclick={() => select(theme.id)}>
        <div class="colors">
          <span class="dot" style:background={theme.paper} style:border-color={theme.ink}></span>
          <span class="dot" style:background={theme.ink}></span>
          <span class="dot" style:background={theme.accent}></span>
        </div>
        <div class="info">
          <div class="name" style:font-family={theme.font}>{theme.name}</div>
          <div class="sample" style:font-family={theme.font} style:border-radius={theme.radius} style:background={theme.paper} style:color={theme.ink} style:border-color={theme.ink}>
            Aa 123
          </div>
        </div>
        {#if activeId === theme.id}<span class="check">✓</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn { background: none; border: none; color: var(--paper); font-family: var(--font-body); font-size: 14px; font-weight: 600; }
  .spacer { width: 40px; }
  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px 90px; display: flex; flex-direction: column; gap: 10px; }

  .swatch {
    position: relative; display: flex; align-items: center; gap: 14px;
    padding: 14px 16px; background: var(--paper-dim); border: 2px solid transparent; border-radius: var(--radius);
    text-align: left; width: 100%;
  }
  .swatch.active { border-color: var(--accent); }

  .colors { display: flex; flex-direction: column; gap: 3px; }
  .dot { width: 16px; height: 16px; border-radius: 50%; border: 1px solid transparent; }

  .info { flex: 1; display: flex; flex-direction: column; gap: 6px; }
  .name { font-size: 15px; font-weight: 700; color: var(--ink); }
  .sample {
    display: inline-block; align-self: flex-start; padding: 4px 10px; font-size: 13px;
    border: 1px solid; opacity: .9;
  }

  .check { font-size: 18px; color: var(--accent); font-weight: 700; }
</style>
