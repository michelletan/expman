<script>
  import { onMount } from 'svelte';
  import { getAll } from '../data/db.js';

  // specs/transactions.md requirements 20-21. onSelect(paymentMethod,
  // label) — paymentMethod is 'cash' or a card's id. Cards' own db.js
  // CRUD layer doesn't exist yet, so this just reads the raw store —
  // gracefully shows "Cash" only until something creates card rows.
  let { onSelect, onClose } = $props();

  let cards = $state([]);

  onMount(async () => {
    const all = await getAll('cards');
    cards = all.filter(c => !c.isDeleted);
  });
</script>

<div class="backdrop" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="title">Payment method</div>
    <button class="row" onclick={() => onSelect('cash', 'Cash')}>Cash</button>
    {#each cards as card (card.id)}
      <button class="row" onclick={() => onSelect(card.id, card.name)}>{card.name}</button>
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
</style>
