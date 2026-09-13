<script>
  import { CATEGORY_COLORS } from '../data/format.js';

  /** @type {{ draft: object, showDelete: boolean, onSave: () => void, onCancel: () => void, onDelete?: () => void, onAddSub: () => void, onRemoveSub: (index: number) => void }} */
  let { draft = $bindable(), showDelete, onSave, onCancel, onDelete = () => {}, onAddSub, onRemoveSub } = $props();
</script>

<div class="edit-card">
  <div class="edit-row">
    <input bind:value={draft.name} placeholder="Category name" />
    <select bind:value={draft.type}>
      <option value="expense">Expense</option>
      <option value="income">Income</option>
    </select>
    <button class="icon-btn save-icon" onclick={onSave} disabled={!draft.name.trim()} aria-label="Save">✓</button>
  </div>

  <div class="color-row">
    {#each CATEGORY_COLORS as color (color)}
      <button
        class="swatch" class:selected={draft.color === color}
        style:background={color} onclick={() => draft.color = color}
        aria-label="Color {color}"
      ></button>
    {/each}
  </div>

  <div class="subcat-edit-list">
    {#each draft.subs as sub, i}
      <div class="subcat-edit-row">
        <input bind:value={sub.current} placeholder="Subcategory" />
        <button class="remove-sub-btn" onclick={() => onRemoveSub(i)} aria-label="Remove subcategory">×</button>
      </div>
    {/each}
    <button class="add-sub-btn" onclick={onAddSub}>+ Add subcategory</button>
  </div>

  {#if showDelete}
    <button class="delete-btn" onclick={onDelete}>Delete category</button>
  {/if}
  <button class="cancel-btn" onclick={onCancel}>Cancel</button>
</div>

<style>
  .edit-card { background: var(--paper-dim); border-radius: 12px; padding: 12px; margin-bottom: 8px; }
  .edit-row { display: flex; gap: 6px; margin-bottom: 10px; }
  .edit-row input {
    flex: 1; min-width: 0; padding: 10px 12px; border-radius: 8px; border: 1.5px solid var(--paper-line);
    background: var(--paper); font-family: var(--font-body); font-size: 14px; color: var(--ink);
  }
  .edit-row select {
    padding: 10px; border-radius: 8px; border: 1.5px solid var(--paper-line);
    background: var(--paper); font-family: var(--font-body); font-size: 13px; color: var(--ink);
  }
  .icon-btn {
    width: 40px; border-radius: 10px; background: var(--paper-dim); border: none;
    color: var(--ink); opacity: .6; font-size: 14px;
  }
  .icon-btn.save-icon { background: var(--accent); color: var(--accent-ink); opacity: 1; }
  .icon-btn:disabled { opacity: .3; }

  .color-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .swatch {
    width: 26px; height: 26px; border-radius: 50%; border: 2px solid transparent;
    padding: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.08) inset;
  }
  .swatch.selected { border-color: var(--ink); }

  .subcat-edit-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
  .subcat-edit-row { display: flex; gap: 6px; }
  .subcat-edit-row input {
    flex: 1; padding: 8px 10px; border-radius: 8px; border: 1.5px solid var(--paper-line);
    background: var(--paper); font-family: var(--font-body); font-size: 13px; color: var(--ink);
  }
  .remove-sub-btn {
    width: 32px; border-radius: 8px; background: var(--paper); border: 1.5px solid var(--paper-line);
    color: var(--ink); opacity: .6; font-size: 16px;
  }
  .add-sub-btn {
    align-self: flex-start; background: none; border: none; color: var(--accent);
    font-family: var(--font-body); font-size: 12.5px; font-weight: 700; padding: 4px 0;
  }

  .delete-btn, .cancel-btn {
    display: block; width: 100%; padding: 9px; border-radius: 8px; border: none;
    font-family: var(--font-body); font-size: 13px; font-weight: 700; margin-top: 6px;
  }
  .delete-btn { background: rgba(181,75,59,.12); color: var(--rust); }
  .cancel-btn { background: none; color: var(--ink); opacity: .55; }
</style>
