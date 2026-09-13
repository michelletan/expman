<script>
  import { onMount } from 'svelte';
  import { getCategoriesSorted } from '../data/db.js';

  // specs/transactions.md requirements 17-19. onSelect(categoryId,
  // subcategoryId, label) — categoryId/subcategoryId are null for the
  // explicit "Uncategorised" option.
  let { type, onSelect, onClose } = $props();

  let categories = $state([]);

  onMount(async () => {
    categories = await getCategoriesSorted(type);
  });
</script>

<div class="backdrop" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="title">Choose category</div>
    <div class="list">
      <button class="uncategorised-row" onclick={() => onSelect(null, null, 'Uncategorised')}>Uncategorised</button>
      {#each categories as category (category.id)}
        <button class="cat-header" onclick={() => onSelect(category.id, null, category.name)}>{category.name}</button>
        {#each category.subcategories as sub (sub.id)}
          <button class="sub-row" onclick={() => onSelect(category.id, sub.id, category.name + ' / ' + sub.name)}>
            {sub.name}
          </button>
        {/each}
      {/each}
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: flex-end; justify-content: center; z-index: 50;
  }
  .sheet {
    width: 100%; max-width: 480px; max-height: 80vh; background: var(--paper);
    border-radius: 16px 16px 0 0; padding: 16px 8px max(env(safe-area-inset-bottom), 16px);
    display: flex; flex-direction: column;
  }
  .title {
    font-family: var(--font-body); font-size: 13px; font-weight: 700;
    color: var(--ink); opacity: .6; padding: 4px 12px 10px;
  }
  .list { overflow-y: auto; }
  .uncategorised-row, .cat-header, .sub-row {
    display: block; width: 100%; text-align: left; padding: 11px 12px;
    border-radius: 10px; background: none; border: none;
    font-family: var(--font-body); color: var(--ink);
  }
  .uncategorised-row { font-weight: 600; font-size: 14px; opacity: .7; }
  .cat-header { font-weight: 700; font-size: 14px; margin-top: 4px; }
  .sub-row { font-size: 13.5px; padding-left: 24px; opacity: .85; }
</style>
