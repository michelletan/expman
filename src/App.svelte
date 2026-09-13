<script>
  import { onMount } from 'svelte';
  import { ensureSeeded } from './lib/data/db.js';
  import Home from './pages/Home.svelte';

  // Mirrors the original app's boot() in js/app.js: open the DB and
  // seed it from the migrated export on first run only. Everything
  // that reads from the DB (Home included) waits behind this so it
  // never renders against an empty store.
  let ready = $state(false);

  onMount(async () => {
    await ensureSeeded();
    ready = true;
  });
</script>

<div id="app-shell" data-theme="midnight">
  {#if ready}
    <Home />
  {:else}
    <div class="boot-loading">Loading…</div>
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
