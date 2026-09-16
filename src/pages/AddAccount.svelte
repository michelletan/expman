<script>
  import { onMount } from 'svelte';
  import { getAccount, createAccount, updateAccount } from '../lib/data/db.js';

  let { accountId, onBack, onSaved } = $props();

  let name = $state('');
  let description = $state('');
  let initialBalance = $state('0');

  onMount(async () => {
    if (!accountId) return;
    const account = await getAccount(accountId);
    if (!account) return;
    name = account.name;
    description = account.description || '';
    initialBalance = String(account.initialBalance ?? 0);
  });

  async function save() {
    if (!name.trim()) return;
    const fields = { name: name.trim(), description: description.trim(), initialBalance: Number(initialBalance) || 0 };
    if (accountId) {
      await updateAccount(accountId, fields);
    } else {
      await createAccount(fields);
    }
    onSaved();
  }
</script>

<div class="add-account">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{accountId ? 'Edit account' : 'Add account'}</div>
    <button class="save-btn" onclick={save} disabled={!name.trim()}>Save</button>
  </div>

  <div class="content">
    <label class="field">
      <span class="field-label">Name</span>
      <input type="text" bind:value={name} placeholder="e.g. Personal Expense" />
    </label>
    <label class="field">
      <span class="field-label">Description</span>
      <input type="text" bind:value={description} placeholder="Optional" />
    </label>
    <label class="field">
      <span class="field-label">Initial balance</span>
      <input type="number" step="0.01" bind:value={initialBalance} />
    </label>
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
  .field { display: block; margin-bottom: 18px; }
  .field-label {
    display: block; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6; margin-bottom: 6px;
  }
  .field input {
    width: 100%; padding: 12px 14px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 15px; color: var(--ink);
    box-sizing: border-box;
  }
</style>
