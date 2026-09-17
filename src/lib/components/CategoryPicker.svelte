<script>
  import { onMount } from 'svelte';
  import { getCategoriesSorted } from '../data/db.js';

  // specs/transactions.md requirements 17-19. onSelect(categoryId,
  // subcategoryId, label) — categoryId/subcategoryId are null for the
  // explicit "Uncategorised" option. disabledIds (specs/budgets.md
  // requirement 16) is a generic exclusion list — each entry is either a
  // bare categoryId (that whole category is taken) or "categoryId/
  // subcategoryId" (just that subcategory is taken) — disabled rather
  // than hidden, so the tree stays browsable for picking a sibling that
  // isn't taken. allowUncategorised hides the "Uncategorised" option
  // entirely for callers (like Budgets) where it's not a valid choice.
  // type is optional (omitted/null shows every category regardless of
  // type — Activity's Filters sheet isn't scoped to one transaction's
  // type the way Add Transaction is).
  let { type = null, onSelect, onClose, disabledIds = [], allowUncategorised = true } = $props();

  let categories = $state([]);

  onMount(async () => {
    categories = await getCategoriesSorted(type);
  });

  function isDisabled(categoryId, subcategoryId = null) {
    return disabledIds.includes(subcategoryId ? `${categoryId}/${subcategoryId}` : categoryId);
  }
</script>

<div class="backdrop" role="button" tabindex="0" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
  <div class="sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
    <div class="title">Choose category</div>
    <div class="list">
      {#if allowUncategorised}
        <button class="uncategorised-row" onclick={() => onSelect(null, null, 'Uncategorised')}>Uncategorised</button>
      {/if}
      {#each categories as category (category.id)}
        <button class="cat-header" disabled={isDisabled(category.id)} onclick={() => onSelect(category.id, null, category.name)}>
          <span class="color-dot" style:background={category.color}></span>{category.name}
        </button>
        {#each category.subcategories as sub (sub.id)}
          <button class="sub-row" disabled={isDisabled(category.id, sub.id)} onclick={() => onSelect(category.id, sub.id, category.name + ' / ' + sub.name)}>
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
    border-radius: var(--radius) var(--radius) 0 0; padding: 16px 8px max(env(safe-area-inset-bottom), 16px);
    display: flex; flex-direction: column;
  }
  .title {
    font-family: var(--font-body); font-size: 13px; font-weight: 700;
    color: var(--ink); opacity: .6; padding: 4px 12px 10px;
  }
  .list { overflow-y: auto; }
  .uncategorised-row, .cat-header, .sub-row {
    display: block; width: 100%; text-align: left; padding: 11px 12px;
    border-radius: var(--radius); background: none; border: none;
    font-family: var(--font-body); color: var(--ink);
  }
  .uncategorised-row { font-weight: 600; font-size: 14px; opacity: .7; }
  .cat-header { font-weight: 700; font-size: 14px; margin-top: 4px; display: flex; align-items: center; gap: 8px; }
  .sub-row { font-size: 13.5px; padding-left: 24px; opacity: .85; }
  .cat-header:disabled, .sub-row:disabled { opacity: .35; }
  .color-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.08) inset; }
</style>
