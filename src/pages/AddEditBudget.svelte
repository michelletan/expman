<script>
  import { onMount } from 'svelte';
  import { getBudget, getBudgets, createBudget, updateBudget, removeBudget, getAll, getAccounts } from '../lib/data/db.js';
  import { todayISO } from '../lib/data/format.js';
  import CategoryPicker from '../lib/components/CategoryPicker.svelte';

  let { budgetId, defaultAccountId, onBack, onSaved } = $props();

  let name = $state('');
  let accounts = $state([]);
  /** @type {string|null} */
  let accountId = $state(null);
  /** @type {string|null} */
  let categoryId = $state(null);
  /** @type {string|null} */
  let subcategoryId = $state(null);
  let targetLabel = $state('Choose a category');
  let amount = $state('');
  let isRollover = $state(true);
  let startDate = $state(todayISO());
  let endDate = $state('');

  let pickerOpen = $state(false);
  let deleteConfirmOpen = $state(false);
  /** @type {any[]} */
  let allBudgets = $state([]);

  const canSave = $derived(
    !!(name.trim() && accountId && categoryId && Number(amount) > 0 && startDate && (!endDate || endDate >= startDate))
  );

  // Recomputes whenever accountId changes — switching accounts in the
  // form re-checks which targets are already taken *on that account*
  // (specs/budgets.md requirement 16): a target taken on the old account
  // may be free on the new one, or vice versa.
  const disabledIds = $derived(
    allBudgets.filter(b => b.id !== budgetId && b.accountId === accountId).map(targetKey)
  );

  onMount(async () => {
    accounts = await getAccounts();
    allBudgets = await getBudgets();
    if (budgetId) {
      const budget = await getBudget(budgetId);
      if (budget) {
        name = budget.name;
        accountId = budget.accountId;
        categoryId = budget.categoryId;
        subcategoryId = budget.subcategoryId;
        amount = String(budget.amount);
        isRollover = budget.isRollover;
        startDate = budget.startDate;
        endDate = budget.endDate || '';
        await resolveTargetLabel();
      }
    } else {
      accountId = defaultAccountId ?? accounts[0]?.id ?? null;
    }
  });

  function targetKey(budget) {
    return budget.subcategoryId ? `${budget.categoryId}/${budget.subcategoryId}` : budget.categoryId;
  }

  async function resolveTargetLabel() {
    const categories = await getAll('categories');
    const cat = categories.find(c => c.id === categoryId);
    const sub = subcategoryId ? cat?.subcategories.find(s => s.id === subcategoryId) : null;
    targetLabel = cat ? (sub ? `${cat.name} / ${sub.name}` : cat.name) : 'Choose a category';
  }

  function selectTarget(newCategoryId, newSubcategoryId, label) {
    categoryId = newCategoryId;
    subcategoryId = newSubcategoryId;
    targetLabel = label;
    pickerOpen = false;
  }

  async function save() {
    if (!canSave) return;
    const fields = {
      name: name.trim(), accountId: /** @type {string} */ (accountId),
      categoryId: /** @type {string} */ (categoryId), subcategoryId, amount: Number(amount),
      isRollover, startDate, endDate: endDate || null
    };
    if (budgetId) {
      await updateBudget(budgetId, fields);
    } else {
      await createBudget(fields);
    }
    onSaved();
  }

  async function confirmDelete() {
    await removeBudget(budgetId);
    onSaved();
  }
</script>

<div class="add-budget">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{budgetId ? 'Edit' : 'Add'} Budget</div>
    <button class="save-btn" onclick={save} disabled={!canSave}>Save</button>
  </div>

  <div class="content">
    <label class="field">
      <span class="field-label">Account</span>
      <select bind:value={accountId}>
        {#each accounts as acct (acct.id)}
          <option value={acct.id}>{acct.name}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="field-label">Name</span>
      <input type="text" bind:value={name} placeholder="e.g. Groceries" />
    </label>

    <button class="picker-row" onclick={() => pickerOpen = true}>
      <span class="field-label">Category</span>
      <span class="picker-value">{targetLabel}</span>
    </button>

    <label class="field">
      <span class="field-label">Amount per month</span>
      <input type="number" step="0.01" min="0" bind:value={amount} placeholder="0.00" />
    </label>

    <label class="field rollover-field">
      <span class="field-label">Roll over unspent amount</span>
      <input type="checkbox" bind:checked={isRollover} />
    </label>

    <label class="field">
      <span class="field-label">Start date</span>
      <input type="date" bind:value={startDate} />
    </label>

    <label class="field">
      <span class="field-label">End date</span>
      <input type="date" bind:value={endDate} min={startDate} placeholder="No end date" />
    </label>

    {#if budgetId}
      <button class="delete-btn" onclick={() => deleteConfirmOpen = true}>Delete budget</button>
    {/if}
  </div>
</div>

{#if pickerOpen}
  <CategoryPicker type="expense" allowUncategorised={false} {disabledIds} onSelect={selectTarget} onClose={() => pickerOpen = false} />
{/if}

{#if deleteConfirmOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => deleteConfirmOpen = false} onkeydown={(e) => e.key === 'Escape' && (deleteConfirmOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this budget?</div>
      <p class="confirm-body">It disappears from this list. Its category's transactions are untouched.</p>
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

  .field { display: block; margin-bottom: 16px; }
  .field-label {
    display: block; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6; margin-bottom: 6px;
  }
  .field input, .field select {
    width: 100%; padding: 12px 14px; border-radius: 10px; border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 15px; color: var(--ink);
    box-sizing: border-box;
  }
  .rollover-field { display: flex; align-items: center; justify-content: space-between; }
  .rollover-field .field-label { margin-bottom: 0; }
  .rollover-field input { width: auto; }

  .picker-row {
    display: block; width: 100%; text-align: left; margin-bottom: 16px; padding: 12px 14px;
    border-radius: 10px; border: 1.5px solid var(--paper-line); background: var(--paper-dim);
    box-sizing: border-box;
  }
  .picker-value { display: block; font-family: var(--font-body); font-size: 15px; color: var(--ink); margin-top: 2px; }

  .delete-btn {
    display: block; width: 100%; padding: 12px; margin-top: 12px; border-radius: 10px; border: none;
    background: rgba(181,75,59,.12); color: var(--rust); font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
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
