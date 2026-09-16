<script>
  import { onMount } from 'svelte';
  import { getAccounts, getCurrentBalance, softDeleteAccount } from '../lib/data/db.js';
  import { fmtMoney } from '../lib/data/format.js';

  let { onBack, onAdd, onEdit } = $props();

  let rows = $state([]); // [{ account, balance }]
  let revealedId = $state(null); // account whose delete button is showing
  let confirmDeleteId = $state(null);

  onMount(load);

  async function load() {
    const accounts = await getAccounts();
    const balances = await Promise.all(accounts.map(a => getCurrentBalance(a.id)));
    rows = accounts.map((account, i) => ({ account, balance: balances[i] }));
  }

  // Discrete swipe detection: compare pointerdown/pointerup x. A left
  // swipe past the threshold reveals delete; anything smaller is a tap.
  let dragStartX = 0;

  function handlePointerDown(e) {
    dragStartX = e.clientX;
  }

  function handlePointerUp(e, accountId) {
    const dx = e.clientX - dragStartX;
    if (dx < -40) {
      revealedId = accountId;
    } else if (revealedId === accountId) {
      revealedId = null;
    } else if (Math.abs(dx) < 10) {
      onEdit(accountId);
    }
  }

  function requestDelete(accountId) {
    confirmDeleteId = accountId;
  }

  async function confirmDelete() {
    await softDeleteAccount(confirmDeleteId);
    confirmDeleteId = null;
    revealedId = null;
    await load();
  }
</script>

<div class="accounts">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Accounts</div>
    <button class="add-btn" onclick={onAdd}>+ Add</button>
  </div>

  <div class="content">
    {#each rows as { account, balance } (account.id)}
      <div class="row-wrap">
        <button class="delete-btn" class:visible={revealedId === account.id} onclick={() => requestDelete(account.id)}>
          Delete
        </button>
        <button
          class="account-row"
          class:shifted={revealedId === account.id}
          onpointerdown={handlePointerDown}
          onpointerup={(e) => handlePointerUp(e, account.id)}
        >
          <div class="info">
            <div class="name">{account.name}</div>
            {#if account.description}<div class="desc">{account.description}</div>{/if}
          </div>
          <div class="balance">{fmtMoney(balance)}</div>
        </button>
      </div>
    {:else}
      <div class="empty-state">No accounts yet.</div>
    {/each}
  </div>
</div>

{#if confirmDeleteId}
  <div
    class="backdrop"
    role="button"
    tabindex="0"
    onclick={() => confirmDeleteId = null}
    onkeydown={(e) => e.key === 'Escape' && (confirmDeleteId = null)}
  >
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this account?</div>
      <p class="confirm-body">Its transactions stay in your data (and in exports) but won't show in the app anymore.</p>
      <div class="confirm-actions">
        <button class="cancel-btn" onclick={() => confirmDeleteId = null}>Cancel</button>
        <button class="delete-confirm-btn" onclick={confirmDelete}>Delete</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn, .add-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .content { background: var(--paper); min-height: 100vh; padding: 16px 20px 90px; }

  .row-wrap { position: relative; margin-bottom: 10px; border-radius: var(--radius); overflow: hidden; }
  .delete-btn {
    position: absolute; right: 0; top: 0; bottom: 0; width: 80px;
    background: var(--rust); color: #fff; border: none; font-family: var(--font-body);
    font-size: 13px; font-weight: 700; opacity: 0; pointer-events: none;
  }
  .delete-btn.visible { opacity: 1; pointer-events: auto; }

  .account-row {
    position: relative; width: 100%; display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px; background: var(--paper-dim); border: none; border-radius: var(--radius);
    transition: transform .15s ease; transform: translateX(0);
  }
  .account-row.shifted { transform: translateX(-80px); }

  .info { text-align: left; }
  .name { font-family: var(--font-body); font-size: 15px; font-weight: 700; color: var(--ink); }
  .desc { font-family: var(--font-body); font-size: 12.5px; color: var(--ink); opacity: .6; margin-top: 2px; }
  .balance { font-family: var(--font-display); font-weight: 600; font-size: 15px; color: var(--ink); }

  .empty-state { padding: 40px 0; text-align: center; color: var(--ink); opacity: .5; font-size: 14px; }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .confirm-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: var(--radius); padding: 20px; }
  .confirm-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); }
  .confirm-body { font-family: var(--font-body); font-size: 13.5px; color: var(--ink); opacity: .7; margin: 8px 0 18px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; }
  .cancel-btn, .delete-confirm-btn {
    flex: 1; padding: 10px; border-radius: var(--radius); border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .cancel-btn { background: var(--paper-dim); color: var(--ink); }
  .delete-confirm-btn { background: var(--rust); color: #fff; }
</style>
