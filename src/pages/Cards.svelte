<script>
  import { onMount } from 'svelte';
  import { getCards, softDeleteCard, getCardSpendSummary } from '../lib/data/db.js';
  import { getCardPeriod } from '../lib/data/format.js';
  import CardRow from '../lib/components/CardRow.svelte';

  let { onBack, onAdd, onEdit, onView } = $props();

  let rows = $state([]); // [{ card, period, totalTarget, spend }]
  let revealedId = $state(null); // card whose delete button is showing
  let confirmDeleteId = $state(null);

  onMount(load);

  async function load() {
    const cards = await getCards();
    rows = await Promise.all(cards.map(async card => {
      const period = getCardPeriod(card.resetDate);
      const { total } = await getCardSpendSummary(card.id, period);
      return {
        card, period, spend: total,
        totalTarget: card.targetSpend.reduce((sum, t) => sum + (t.amount || 0), 0)
      };
    }));
  }

  // Discrete swipe detection: compare pointerdown/pointerup x. A left
  // swipe past the threshold reveals delete; a small tap opens Card
  // Details (edit has its own icon button — specs/cards.md requirement 6).
  let dragStartX = 0;

  function handlePointerDown(e) {
    dragStartX = e.clientX;
  }

  function handlePointerUp(e, cardId) {
    const dx = e.clientX - dragStartX;
    if (dx < -40) {
      revealedId = cardId;
    } else if (revealedId === cardId) {
      revealedId = null;
    } else if (Math.abs(dx) < 10) {
      onView(cardId);
    }
  }

  function requestDelete(cardId) {
    confirmDeleteId = cardId;
  }

  async function confirmDelete() {
    await softDeleteCard(confirmDeleteId);
    confirmDeleteId = null;
    revealedId = null;
    await load();
  }
</script>

<div class="cards">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Cards</div>
    <button class="add-btn" onclick={onAdd}>+ Add</button>
  </div>

  <div class="content">
    {#each rows as { card, period, spend, totalTarget } (card.id)}
      <div class="tile-wrap">
        <div class="row-wrap">
          <button class="delete-btn" class:visible={revealedId === card.id} onclick={() => requestDelete(card.id)}>
            Delete
          </button>
          <button
            class="card-row"
            class:shifted={revealedId === card.id}
            onpointerdown={handlePointerDown}
            onpointerup={(e) => handlePointerUp(e, card.id)}
          >
            <CardRow {card} {period} {spend} {totalTarget} />
          </button>
        </div>
        <button class="icon-btn" onclick={() => onEdit(card.id)} aria-label="Edit {card.name}">✎</button>
      </div>
    {:else}
      <div class="empty-state">No cards yet.</div>
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
      <div class="confirm-title">Delete this card?</div>
      <p class="confirm-body">It disappears from this list, but the record (and transactions paid on it) stay.</p>
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

  .tile-wrap { display: flex; gap: 6px; margin-bottom: 10px; }
  .row-wrap { flex: 1; position: relative; border-radius: var(--radius); overflow: hidden; }
  .delete-btn {
    position: absolute; right: 0; top: 0; bottom: 0; width: 80px;
    background: var(--rust); color: #fff; border: none; font-family: var(--font-body);
    font-size: 13px; font-weight: 700; opacity: 0; pointer-events: none;
  }
  .delete-btn.visible { opacity: 1; pointer-events: auto; }

  .card-row {
    position: relative; width: 100%; display: block; text-align: left;
    padding: 13px 16px; background: #fff; border: 1px solid var(--paper-line); border-radius: var(--radius);
    transition: transform .15s ease; transform: translateX(0); box-sizing: border-box;
  }
  .card-row.shifted { transform: translateX(-80px); }

  .icon-btn {
    width: 40px; border-radius: var(--radius); background: var(--paper-dim); border: none;
    color: var(--ink); opacity: .6; font-size: 14px;
  }

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
