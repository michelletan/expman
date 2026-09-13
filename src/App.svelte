<script>
  import { onMount } from 'svelte';
  import { openDB } from './lib/data/db.js';
  import Home from './pages/Home.svelte';

  let ready = $state(false);

  onMount(async () => {
    await openDB();
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
