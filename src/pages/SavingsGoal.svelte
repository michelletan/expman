<script>
  import { onMount } from 'svelte';
  import { getMeta, setMeta, remove } from '../lib/data/db.js';

  let { accountId, onBack, onSaved } = $props();

  const metaKey = $derived(`savingsGoal:${accountId}`);
  let amount = $state('');
  let hasGoal = $state(false);

  onMount(async () => {
    const existing = await getMeta(metaKey);
    if (existing) {
      amount = String(existing);
      hasGoal = true;
    }
  });

  async function save() {
    if (!(Number(amount) > 0)) return;
    await setMeta(metaKey, Number(amount));
    onSaved();
  }

  async function clearGoal() {
    await remove('meta', metaKey);
    onSaved();
  }
</script>

<div class="savings-goal">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Savings Goal</div>
    <button class="save-btn" onclick={save} disabled={!(Number(amount) > 0)}>Save</button>
  </div>

  <div class="content">
    <label class="field">
      <span class="field-label">Monthly savings target</span>
      <input type="number" step="0.01" min="0" bind:value={amount} placeholder="0.00" />
    </label>
    <p class="hint">
      Applies every calendar month, starting now — measured as this
      month's income minus expense for this account.
    </p>

    {#if hasGoal}
      <button class="clear-btn" onclick={clearGoal}>Clear goal</button>
    {/if}
  </div>
</div>

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn, .save-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .save-btn:disabled { opacity: .4; }
  .content { background: var(--paper); min-height: 100vh; padding: 20px 20px 90px; }
  .field { display: block; margin-bottom: 10px; }
  .field-label {
    display: block; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6; margin-bottom: 6px;
  }
  .field input {
    width: 100%; padding: 12px 14px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 15px; color: var(--ink);
    box-sizing: border-box;
  }
  .hint { font-family: var(--font-body); font-size: 12.5px; color: var(--ink); opacity: .55; line-height: 1.5; margin: 0 0 24px; }
  .clear-btn {
    display: block; width: 100%; padding: 12px; border-radius: var(--radius); border: none;
    background: rgba(181,75,59,.12); color: var(--rust); font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
</style>
