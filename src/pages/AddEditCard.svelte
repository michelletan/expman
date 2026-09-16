<script>
  import { onMount } from 'svelte';
  import { getCard, createCard, updateCard, softDeleteCard, getCategoriesSorted } from '../lib/data/db.js';

  let { cardId, onBack, onSaved } = $props();

  let name = $state('');
  let resetDate = $state('1');
  /** @type {{categoryId: string, amount: string}[]} */
  let targetSpend = $state([]);
  let expenseCategories = $state([]);
  let deleteConfirmOpen = $state(false);

  const resetDateValid = $derived(Number(resetDate) >= 1 && Number(resetDate) <= 31);
  const canSave = $derived(name.trim() && resetDateValid);

  onMount(async () => {
    expenseCategories = await getCategoriesSorted('expense');
    if (!cardId) return;
    const card = await getCard(cardId);
    if (!card) return;
    name = card.name;
    resetDate = String(card.resetDate);
    targetSpend = card.targetSpend.map(t => ({ categoryId: t.categoryId, amount: String(t.amount) }));
  });

  function addTargetRow() {
    targetSpend = [...targetSpend, { categoryId: expenseCategories[0]?.id ?? '', amount: '' }];
  }

  function removeTargetRow(index) {
    targetSpend = targetSpend.filter((_, i) => i !== index);
  }

  async function save() {
    if (!canSave) return;
    const fields = {
      name: name.trim(),
      resetDate: Number(resetDate),
      targetSpend: targetSpend
        .filter(t => t.categoryId && Number(t.amount) > 0)
        .map(t => ({ categoryId: t.categoryId, amount: Number(t.amount) }))
    };
    if (cardId) {
      await updateCard(cardId, fields);
    } else {
      await createCard(fields);
    }
    onSaved();
  }

  async function confirmDelete() {
    await softDeleteCard(cardId);
    onSaved();
  }
</script>

<div class="add-card">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{cardId ? 'Edit card' : 'Add card'}</div>
    <button class="save-btn" onclick={save} disabled={!canSave}>Save</button>
  </div>

  <div class="content">
    <label class="field">
      <span class="field-label">Name</span>
      <input type="text" bind:value={name} placeholder="e.g. POSB Card" />
    </label>

    <label class="field">
      <span class="field-label">Reset date (day of month)</span>
      <input type="number" min="1" max="31" step="1" bind:value={resetDate} />
      {#if !resetDateValid}<p class="error">Must be between 1 and 31.</p>{/if}
    </label>

    <div class="field">
      <span class="field-label">Target spend per category</span>
      <div class="target-list">
        {#each targetSpend as row, i}
          <div class="target-row">
            <select bind:value={row.categoryId}>
              {#each expenseCategories as category (category.id)}
                <option value={category.id}>{category.name}</option>
              {/each}
            </select>
            <input type="number" step="0.01" min="0" bind:value={row.amount} placeholder="0.00" />
            <button class="remove-btn" onclick={() => removeTargetRow(i)} aria-label="Remove target">×</button>
          </div>
        {/each}
        <button class="add-target-btn" onclick={addTargetRow} disabled={!expenseCategories.length}>+ Add category target</button>
      </div>
    </div>

    {#if cardId}
      <button class="delete-btn" onclick={() => deleteConfirmOpen = true}>Delete card</button>
    {/if}
  </div>
</div>

{#if deleteConfirmOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => deleteConfirmOpen = false} onkeydown={(e) => e.key === 'Escape' && (deleteConfirmOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this card?</div>
      <p class="confirm-body">It disappears from this list, but the record (and transactions paid on it) stay.</p>
      <div class="confirm-actions">
        <button class="cancel-confirm-btn" onclick={() => deleteConfirmOpen = false}>Back</button>
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
  .title { font-size: 16px; font-weight: 700; font-family: var(--font-display); }
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
  .error { color: var(--rust); font-family: var(--font-body); font-size: 12.5px; margin: 6px 0 0; }

  .target-list { display: flex; flex-direction: column; gap: 8px; }
  .target-row { display: flex; gap: 6px; }
  .target-row select {
    flex: 1.2; min-width: 0; padding: 10px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 13.5px; color: var(--ink);
  }
  .target-row input {
    flex: 1; min-width: 0; padding: 10px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 13.5px; color: var(--ink);
    box-sizing: border-box;
  }
  .remove-btn {
    width: 32px; border-radius: var(--radius); background: var(--paper-dim); border: 1.5px solid var(--paper-line);
    color: var(--ink); opacity: .6; font-size: 16px;
  }
  .add-target-btn {
    align-self: flex-start; background: none; border: none; color: var(--accent);
    font-family: var(--font-body); font-size: 12.5px; font-weight: 700; padding: 4px 0;
  }
  .add-target-btn:disabled { opacity: .4; }

  .delete-btn {
    display: block; width: 100%; padding: 12px; margin-top: 24px; border-radius: var(--radius); border: none;
    background: rgba(181,75,59,.12); color: var(--rust); font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }

  .backdrop {
    position: fixed; inset: 0; background: rgba(0,0,0,.4);
    display: flex; align-items: center; justify-content: center; z-index: 50; padding: 24px;
  }
  .confirm-sheet { width: 100%; max-width: 340px; background: var(--paper); border-radius: var(--radius); padding: 20px; }
  .confirm-title { font-family: var(--font-display); font-size: 17px; font-weight: 700; color: var(--ink); }
  .confirm-body { font-family: var(--font-body); font-size: 13.5px; color: var(--ink); opacity: .7; margin: 8px 0 18px; line-height: 1.5; }
  .confirm-actions { display: flex; gap: 10px; }
  .cancel-confirm-btn, .delete-confirm-btn {
    flex: 1; padding: 10px; border-radius: var(--radius); border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .cancel-confirm-btn { background: var(--paper-dim); color: var(--ink); }
  .delete-confirm-btn { background: var(--rust); color: #fff; }
</style>
