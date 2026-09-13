<script>
  import { onMount } from 'svelte';
  import {
    getCategoriesSorted, createCategory, updateCategory, softDeleteCategory,
    addSubcategory, renameSubcategory, softDeleteSubcategory,
    moveCategory, moveSubcategory
  } from '../lib/data/db.js';
  import CategoryEditCard from '../lib/components/CategoryEditCard.svelte';
  import CategoryImportExport from '../lib/components/CategoryImportExport.svelte';
  import { CATEGORY_COLORS } from '../lib/data/format.js';

  let { onBack } = $props();

  // Each sub tracks its own id (null = not yet saved) so save() can tell
  // add/rename/remove apart without relying on name matching.
  /** @typedef {{ name: string, type: string, color: string, subs: {id: string|null, original: string, current: string}[], removed: string[] }} Draft */

  let categories = $state([]);
  let expanded = $state(new Set());
  /** @type {string|null} */
  let editingId = $state(null); // a category id, 'new', or null
  /** @type {Draft|null} */
  let draft = $state(null);
  let confirmDeleteOpen = $state(false);
  let importExportOpen = $state(false);

  onMount(load);

  async function load() {
    categories = await getCategoriesSorted();
  }

  const income = $derived(categories.filter(c => c.type === 'income'));
  const expense = $derived(categories.filter(c => c.type === 'expense'));

  function toggleExpand(id) {
    if (editingId) return; // browsing is independent of edit mode, but don't fight it mid-edit
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    expanded = next;
  }

  function startEdit(category) {
    editingId = category.id;
    draft = {
      name: category.name,
      type: category.type,
      color: category.color,
      subs: category.subcategories.map(s => ({ id: s.id, original: s.name, current: s.name })),
      removed: []
    };
  }

  // Reordering persists immediately — it's not part of the edit-then-save
  // flow (specs/categories.md requirement 10c).
  async function moveCategoryOrder(id, direction) {
    await moveCategory(id, direction);
    await load();
  }

  async function moveSubcategoryOrder(categoryId, subcategoryId, direction) {
    await moveSubcategory(categoryId, subcategoryId, direction);
    await load();
  }

  function startNew() {
    editingId = 'new';
    draft = { name: '', type: 'expense', color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length], subs: [], removed: [] };
  }

  function cancelEdit() {
    editingId = null;
    draft = null;
    confirmDeleteOpen = false;
  }

  // These three are only ever called while a row is being edited, i.e.
  // while `draft` is set — the guards below are for the type-checker.
  function addSubRow() {
    if (!draft) return;
    draft.subs = [...draft.subs, { id: null, original: '', current: '' }];
  }

  function removeSubRow(index) {
    if (!draft) return;
    const sub = draft.subs[index];
    if (sub.id) draft.removed = [...draft.removed, sub.id];
    draft.subs = draft.subs.filter((_, i) => i !== index);
  }

  // Nothing touches the store until this runs — everything above only
  // edits local `draft` state (specs/categories.md requirement 7).
  async function save() {
    if (!draft || !draft.name.trim()) return;
    let id = editingId === 'new' ? null : editingId;
    if (!id) {
      const created = await createCategory({ name: draft.name.trim(), type: draft.type, color: draft.color });
      id = created.id;
    } else {
      await updateCategory(id, { name: draft.name.trim(), type: draft.type, color: draft.color });
    }
    for (const sub of draft.subs) {
      const current = sub.current.trim();
      if (!current) continue;
      if (sub.id == null) await addSubcategory(id, current);
      else if (current !== sub.original) await renameSubcategory(id, sub.id, current);
    }
    for (const removedId of draft.removed) {
      await softDeleteSubcategory(id, removedId);
    }
    cancelEdit();
    await load();
  }

  async function confirmDelete() {
    await softDeleteCategory(editingId);
    cancelEdit();
    await load();
  }
</script>

{#snippet reorderButtons(atTop, atBottom, onUp, onDown)}
  <div class="reorder-btns">
    <button class="reorder-btn" disabled={atTop} onclick={onUp} aria-label="Move up">▲</button>
    <button class="reorder-btn" disabled={atBottom} onclick={onDown} aria-label="Move down">▼</button>
  </div>
{/snippet}

{#snippet categoryGroup(list, emptyLabel)}
  <div class="cat-list">
    {#each list as category, i (category.id)}
      {#if editingId === category.id}
        <CategoryEditCard
          bind:draft
          showDelete={true}
          onSave={save} onCancel={cancelEdit} onDelete={() => confirmDeleteOpen = true}
          onAddSub={addSubRow} onRemoveSub={removeSubRow}
        />
      {:else}
        <div class="cat-row">
          {@render reorderButtons(
            i === 0, i === list.length - 1,
            () => moveCategoryOrder(category.id, 'up'), () => moveCategoryOrder(category.id, 'down')
          )}
          <button class="cat-main" onclick={() => toggleExpand(category.id)}>
            <span class="cat-name"><span class="color-dot" style:background={category.color}></span>{category.name}</span>
            <span class="chev">{expanded.has(category.id) ? '⌄' : '›'}</span>
          </button>
          <button class="icon-btn" onclick={() => startEdit(category)} aria-label="Edit {category.name}">✎</button>
        </div>
        {#if expanded.has(category.id)}
          <div class="subcat-list">
            {#each category.subcategories as sub, j (sub.id)}
              <div class="subcat-row">
                {@render reorderButtons(
                  j === 0, j === category.subcategories.length - 1,
                  () => moveSubcategoryOrder(category.id, sub.id, 'up'), () => moveSubcategoryOrder(category.id, sub.id, 'down')
                )}
                <span class="subcat-name">{sub.name}</span>
              </div>
            {:else}
              <span class="subcat-empty">No subcategories</span>
            {/each}
          </div>
        {/if}
      {/if}
    {:else}
      <div class="empty-state">{emptyLabel}</div>
    {/each}
  </div>
{/snippet}

<div class="categories">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">Categories</div>
    <button class="io-btn" onclick={() => importExportOpen = true} aria-label="Import or export categories">⇅</button>
  </div>

  <div class="content">
    {#if editingId === 'new'}
      <CategoryEditCard
        bind:draft
        showDelete={false}
        onSave={save} onCancel={cancelEdit}
        onAddSub={addSubRow} onRemoveSub={removeSubRow}
      />
    {/if}

    <div class="section-label">Income</div>
    {@render categoryGroup(income, 'No income categories yet.')}

    <div class="section-label">Expense</div>
    {@render categoryGroup(expense, 'No expense categories yet.')}
  </div>

  <div class="fab-wrap">
    <button class="fab" onclick={startNew} aria-label="Add category">+</button>
  </div>
</div>

{#if confirmDeleteOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => confirmDeleteOpen = false} onkeydown={(e) => e.key === 'Escape' && (confirmDeleteOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this category?</div>
      <p class="confirm-body">It disappears from this list, but existing transactions keep showing it — they're never hidden or changed.</p>
      <div class="confirm-actions">
        <button class="cancel-confirm-btn" onclick={() => confirmDeleteOpen = false}>Cancel</button>
        <button class="delete-confirm-btn" onclick={confirmDelete}>Delete</button>
      </div>
    </div>
  </div>
{/if}

{#if importExportOpen}
  <CategoryImportExport
    onImported={() => { importExportOpen = false; load(); }}
    onClose={() => importExportOpen = false}
  />
{/if}

<style>
  .topbar {
    background: var(--ink); color: var(--paper);
    padding: max(env(safe-area-inset-top), 16px) 20px 16px;
    display: flex; align-items: center; justify-content: space-between;
  }
  .title { font-size: 18px; font-weight: 700; font-family: var(--font-display); }
  .back-btn, .io-btn {
    background: none; border: none; color: var(--paper); font-family: var(--font-body);
    font-size: 14px; font-weight: 600;
  }
  .io-btn { font-size: 18px; }

  .content { background: var(--paper); min-height: 100vh; padding: 4px 20px calc(66px + env(safe-area-inset-bottom) + 90px); }

  .section-label { padding: 16px 0 8px; font-size: 13px; font-weight: 700; color: var(--ink); opacity: .6; }
  .cat-list { display: flex; flex-direction: column; gap: 8px; }
  .empty-state { padding: 12px 0; color: var(--ink); opacity: .5; font-size: 13.5px; }

  .cat-row { display: flex; align-items: stretch; gap: 6px; }
  .cat-main {
    flex: 1; display: flex; align-items: center; justify-content: space-between;
    padding: 12px 14px; border-radius: 10px; background: var(--paper-dim); border: none;
    font-family: var(--font-body); font-size: 14.5px; font-weight: 700; color: var(--ink);
  }
  .cat-name { display: inline-flex; align-items: center; gap: 8px; }
  .color-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 1px rgba(0,0,0,.08) inset; }
  .chev { opacity: .4; }
  .icon-btn {
    width: 40px; border-radius: 10px; background: var(--paper-dim); border: none;
    color: var(--ink); opacity: .6; font-size: 14px;
  }

  .reorder-btns { display: flex; flex-direction: column; gap: 2px; }
  .reorder-btn {
    width: 26px; height: 19px; border-radius: 5px; background: var(--paper-dim); border: none;
    color: var(--ink); opacity: .55; font-size: 9px; line-height: 1;
  }
  .reorder-btn:disabled { opacity: .2; }

  .subcat-list { display: flex; flex-direction: column; gap: 6px; padding: 8px 4px 2px 14px; }
  .subcat-row { display: flex; align-items: center; gap: 8px; }
  .subcat-name {
    padding: 4px 10px; border-radius: 20px; background: var(--paper-line);
    font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .8;
  }
  .subcat-empty { font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .4; }

  .fab-wrap {
    position: fixed; left: 0; right: 0; bottom: calc(66px + env(safe-area-inset-bottom) + 16px);
    max-width: 480px; margin: 0 auto; pointer-events: none;
  }
  .fab {
    position: absolute; right: 20px; bottom: 0; pointer-events: auto;
    width: 52px; height: 52px; border-radius: 50%; border: none;
    background: var(--accent); color: var(--accent-ink);
    font-size: 26px; line-height: 1; box-shadow: 0 4px 14px rgba(0,0,0,.25);
  }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .confirm-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: 16px; padding: 20px; }
  .confirm-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); }
  .confirm-body { font-family: var(--font-body); font-size: 13.5px; color: var(--ink); opacity: .7; margin: 8px 0 18px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; }
  .cancel-confirm-btn, .delete-confirm-btn {
    flex: 1; padding: 10px; border-radius: 10px; border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .cancel-confirm-btn { background: var(--paper-dim); color: var(--ink); }
  .delete-confirm-btn { background: var(--rust); color: #fff; }
</style>
