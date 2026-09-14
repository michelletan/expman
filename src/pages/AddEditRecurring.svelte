<script>
  import { onMount, untrack } from 'svelte';
  import {
    getAccounts, getAll, getRecurringRule, createRecurring, updateRecurring,
    cancelRecurring, softDeleteRecurring
  } from '../lib/data/db.js';
  import { todayISO } from '../lib/data/format.js';
  import CategoryPicker from '../lib/components/CategoryPicker.svelte';
  import PaymentPicker from '../lib/components/PaymentPicker.svelte';

  let { recurringId, defaultAccountId, onBack, onSaved } = $props();

  let accounts = $state([]);
  /** @type {string|null} */
  let accountId = $state(null);
  let type = $state(untrack(() => 'expense'));
  let amount = $state('');
  let description = $state('');
  /** @type {string|null} */
  let categoryId = $state(null);
  /** @type {string|null} */
  let subcategoryId = $state(null);
  let categoryLabel = $state('Uncategorised');
  let paymentMethod = $state('cash');
  let paymentLabel = $state('Cash');

  let frequency = $state('monthly');
  let startDate = $state(todayISO());
  let dayOfMonth = $state('');
  let endMode = $state('never');
  let endDate = $state('');
  let occurrenceCount = $state('');

  let materializedCount = $state(0);
  /** @type {{accountId:string, categoryId:string|null, subcategoryId:string|null, amount:number, description:string, paymentMethod:string|null, type:string}|null} */
  let original = $state(null);

  let categoryPickerOpen = $state(false);
  let paymentPickerOpen = $state(false);
  let applyChoiceOpen = $state(false);
  let cancelConfirmOpen = $state(false);
  let deleteConfirmOpen = $state(false);

  const needsDayOfMonth = $derived(frequency === 'monthly' || frequency === 'annual');
  const canSave = $derived(
    Number(amount) > 0 && !!accountId && !!startDate &&
    (!needsDayOfMonth || (Number(dayOfMonth) >= 1 && Number(dayOfMonth) <= 31)) &&
    (endMode !== 'date' || (endDate && endDate >= startDate)) &&
    (endMode !== 'count' || Number(occurrenceCount) >= 1)
  );

  onMount(async () => {
    accounts = await getAccounts();
    if (recurringId) {
      const rule = await getRecurringRule(recurringId);
      if (rule) {
        accountId = rule.accountId;
        type = rule.type;
        amount = String(rule.amount);
        description = rule.description || '';
        categoryId = rule.categoryId;
        subcategoryId = rule.subcategoryId;
        paymentMethod = rule.paymentMethod || 'cash';
        frequency = rule.frequency;
        startDate = rule.startDate;
        dayOfMonth = rule.dayOfMonth != null ? String(rule.dayOfMonth) : '';
        endMode = rule.endMode;
        endDate = rule.endDate || '';
        occurrenceCount = rule.occurrenceCount != null ? String(rule.occurrenceCount) : '';

        original = {
          accountId: rule.accountId, categoryId: rule.categoryId, subcategoryId: rule.subcategoryId,
          amount: rule.amount, description: rule.description || '',
          paymentMethod: rule.paymentMethod, type: rule.type
        };

        const txns = await getAll('transactions');
        materializedCount = txns.filter(t => t.recurringId === recurringId).length;
        await resolveLabels();
      }
    } else {
      accountId = defaultAccountId ?? accounts[0]?.id ?? null;
    }
  });

  async function resolveLabels() {
    if (categoryId) {
      const categories = await getAll('categories');
      const cat = categories.find(c => c.id === categoryId);
      const sub = cat?.subcategories.find(s => s.id === subcategoryId);
      categoryLabel = cat ? (sub ? `${cat.name} / ${sub.name}` : cat.name) : 'Uncategorised';
    }
    if (paymentMethod && paymentMethod !== 'cash') {
      const cards = await getAll('cards');
      paymentLabel = cards.find(c => c.id === paymentMethod)?.name ?? 'Card';
    }
  }

  function setType(newType) {
    if (newType === type) return;
    type = newType;
    categoryId = null;
    subcategoryId = null;
    categoryLabel = 'Uncategorised';
  }

  // dayOfMonth defaults to the start date's own day the first time it
  // becomes relevant, then stays freely editable — this is how "the
  // 31st" gets entered even though startDate itself has to be a real
  // calendar day (specs/recurring.md requirement 14).
  function setFrequency(f) {
    const prevNeeds = frequency === 'monthly' || frequency === 'annual';
    frequency = f;
    const nowNeeds = f === 'monthly' || f === 'annual';
    if (nowNeeds && !prevNeeds && !dayOfMonth) {
      dayOfMonth = String(Number(startDate.split('-')[2]) || 1);
    }
  }

  function selectCategory(newCategoryId, newSubcategoryId, label) {
    categoryId = newCategoryId;
    subcategoryId = newSubcategoryId;
    categoryLabel = label;
    categoryPickerOpen = false;
  }

  function selectPayment(newPaymentMethod, label) {
    paymentMethod = newPaymentMethod;
    paymentLabel = label;
    paymentPickerOpen = false;
  }

  function displayFieldsChanged() {
    if (!original) return false;
    return (
      accountId !== original.accountId ||
      categoryId !== original.categoryId ||
      subcategoryId !== original.subcategoryId ||
      Number(amount) !== original.amount ||
      description.trim() !== original.description ||
      (type === 'expense' ? paymentMethod : null) !== original.paymentMethod ||
      type !== original.type
    );
  }

  function attemptSave() {
    if (!canSave) return;
    if (recurringId && materializedCount > 0 && displayFieldsChanged()) {
      applyChoiceOpen = true;
      return;
    }
    doSave(false);
  }

  function buildFields() {
    const [, sm] = startDate.split('-').map(Number);
    return {
      accountId: /** @type {string} */ (accountId), categoryId, subcategoryId, type, amount: Number(amount), description: description.trim(),
      paymentMethod: type === 'expense' ? paymentMethod : null,
      frequency, startDate,
      dayOfMonth: needsDayOfMonth ? Number(dayOfMonth) : null,
      anchorMonth: frequency === 'annual' ? sm : null,
      endMode, endDate: endMode === 'date' ? endDate : null,
      occurrenceCount: endMode === 'count' ? Number(occurrenceCount) : null
    };
  }

  async function doSave(applyToAll) {
    applyChoiceOpen = false;
    const fields = buildFields();
    if (recurringId) {
      await updateRecurring(recurringId, fields, applyToAll);
    } else {
      await createRecurring(fields);
    }
    onSaved();
  }

  async function confirmCancel() {
    await cancelRecurring(recurringId);
    onSaved();
  }

  async function confirmDelete() {
    await softDeleteRecurring(recurringId);
    onSaved();
  }
</script>

<div class="add-recurring">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{recurringId ? 'Edit' : 'Add'} Recurring</div>
    <button class="save-btn" onclick={attemptSave} disabled={!canSave}>Save</button>
  </div>

  <div class="content">
    <div class="type-toggle">
      <button class="type-btn" class:active={type === 'expense'} onclick={() => setType('expense')}>Expense</button>
      <button class="type-btn" class:active={type === 'income'} onclick={() => setType('income')}>Income</button>
    </div>

    <label class="field">
      <span class="field-label">Amount</span>
      <input type="number" step="0.01" min="0" bind:value={amount} placeholder="0.00" />
    </label>

    <label class="field">
      <span class="field-label">Account</span>
      <select bind:value={accountId}>
        {#each accounts as acct (acct.id)}
          <option value={acct.id}>{acct.name}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="field-label">Description</span>
      <input type="text" bind:value={description} placeholder="e.g. Netflix" />
    </label>

    <button class="picker-row" onclick={() => categoryPickerOpen = true}>
      <span class="field-label">Category</span>
      <span class="picker-value">{categoryLabel}</span>
    </button>

    {#if type === 'expense'}
      <button class="picker-row" onclick={() => paymentPickerOpen = true}>
        <span class="field-label">Payment method</span>
        <span class="picker-value">{paymentLabel}</span>
      </button>
    {/if}

    <label class="field">
      <span class="field-label">Frequency</span>
      <select value={frequency} onchange={(e) => setFrequency(/** @type {HTMLSelectElement} */ (e.target).value)}>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="annual">Annual</option>
      </select>
    </label>

    <label class="field">
      <span class="field-label">Start date</span>
      <input type="date" bind:value={startDate} />
    </label>

    {#if needsDayOfMonth}
      <label class="field">
        <span class="field-label">Day of month</span>
        <input type="number" min="1" max="31" step="1" bind:value={dayOfMonth} placeholder="1–31" />
        <p class="hint">If a month doesn't have this day, it posts on that month's last day instead.</p>
      </label>
    {/if}

    <div class="field">
      <span class="field-label">Ends</span>
      <div class="end-mode-toggle">
        <button class="end-mode-btn" class:active={endMode === 'never'} onclick={() => endMode = 'never'}>Never</button>
        <button class="end-mode-btn" class:active={endMode === 'date'} onclick={() => endMode = 'date'}>On date</button>
        <button class="end-mode-btn" class:active={endMode === 'count'} onclick={() => endMode = 'count'}>After count</button>
      </div>
    </div>

    {#if endMode === 'date'}
      <label class="field">
        <span class="field-label">End date</span>
        <input type="date" bind:value={endDate} min={startDate} />
      </label>
    {:else if endMode === 'count'}
      <label class="field">
        <span class="field-label">Number of occurrences</span>
        <input type="number" min="1" step="1" bind:value={occurrenceCount} placeholder="e.g. 12" />
      </label>
    {/if}

    {#if recurringId}
      <div class="rule-actions">
        <button class="cancel-btn" onclick={() => cancelConfirmOpen = true}>Cancel recurring</button>
        <button class="delete-btn" onclick={() => deleteConfirmOpen = true}>Delete</button>
      </div>
    {/if}
  </div>
</div>

{#if categoryPickerOpen}
  <CategoryPicker {type} onSelect={selectCategory} onClose={() => categoryPickerOpen = false} />
{/if}

{#if paymentPickerOpen}
  <PaymentPicker onSelect={selectPayment} onClose={() => paymentPickerOpen = false} />
{/if}

{#if applyChoiceOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => applyChoiceOpen = false} onkeydown={(e) => e.key === 'Escape' && (applyChoiceOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Apply this change to past transactions too?</div>
      <p class="confirm-body">
        This rule already created {materializedCount} transaction{materializedCount === 1 ? '' : 's'}.
        Choose whether this edit updates those too, or only affects occurrences from now on.
      </p>
      <div class="confirm-actions-col">
        <button class="primary-btn" onclick={() => doSave(true)}>Apply to all transactions</button>
        <button class="secondary-btn" onclick={() => doSave(false)}>Only future occurrences</button>
      </div>
    </div>
  </div>
{/if}

{#if cancelConfirmOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => cancelConfirmOpen = false} onkeydown={(e) => e.key === 'Escape' && (cancelConfirmOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Cancel this recurring transaction?</div>
      <p class="confirm-body">No further occurrences will post. It stays visible under Completed, and past transactions are untouched.</p>
      <div class="confirm-actions">
        <button class="cancel-confirm-btn" onclick={() => cancelConfirmOpen = false}>Back</button>
        <button class="delete-confirm-btn" onclick={confirmCancel}>Cancel it</button>
      </div>
    </div>
  </div>
{/if}

{#if deleteConfirmOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => deleteConfirmOpen = false} onkeydown={(e) => e.key === 'Escape' && (deleteConfirmOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this recurring rule?</div>
      <p class="confirm-body">It disappears from this list entirely. Past transactions it already created are untouched.</p>
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

  .type-toggle { display: flex; gap: 8px; margin-bottom: 20px; }
  .type-btn {
    flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 14px; font-weight: 700;
    color: var(--ink); opacity: .6;
  }
  .type-btn.active { background: var(--accent); color: var(--accent-ink); opacity: 1; border-color: var(--accent); }

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
  .hint { font-family: var(--font-body); font-size: 12px; color: var(--ink); opacity: .55; margin: 6px 0 0; }

  .picker-row {
    display: block; width: 100%; text-align: left; margin-bottom: 16px; padding: 12px 14px;
    border-radius: 10px; border: 1.5px solid var(--paper-line); background: var(--paper-dim);
    box-sizing: border-box;
  }
  .picker-value { display: block; font-family: var(--font-body); font-size: 15px; color: var(--ink); margin-top: 2px; }

  .end-mode-toggle { display: flex; gap: 6px; }
  .end-mode-btn {
    flex: 1; padding: 10px 4px; border-radius: 10px; border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6;
  }
  .end-mode-btn.active { background: var(--accent); color: var(--accent-ink); opacity: 1; border-color: var(--accent); }

  .rule-actions { display: flex; gap: 10px; margin-top: 24px; }
  .cancel-btn, .delete-btn {
    flex: 1; padding: 12px; border-radius: 10px; border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .cancel-btn { background: var(--paper-dim); color: var(--ink); }
  .delete-btn { background: rgba(181,75,59,.12); color: var(--rust); }

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

  .confirm-actions-col { display: flex; flex-direction: column; gap: 10px; }
  .primary-btn, .secondary-btn {
    padding: 12px; border-radius: 10px; border: none; font-family: var(--font-body);
    font-size: 14px; font-weight: 700;
  }
  .primary-btn { background: var(--accent); color: var(--accent-ink); }
  .secondary-btn { background: var(--paper-dim); color: var(--ink); }
</style>
