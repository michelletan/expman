<script>
  import { onMount, untrack } from 'svelte';
  import { getAccounts, getAll, getTransaction, createTransaction, updateTransaction, removeTransaction } from '../lib/data/db.js';
  import { todayISO, fmtMoney } from '../lib/data/format.js';
  import CategoryPicker from '../lib/components/CategoryPicker.svelte';
  import PaymentPicker from '../lib/components/PaymentPicker.svelte';

  // One page for both add and edit (specs/transactions.md requirement 11).
  // transactionId is null when adding; initialType/defaultAccountId only
  // matter for a new transaction (editing loads the real values).
  let { transactionId, initialType, defaultAccountId, onBack, onSaved } = $props();

  let accounts = $state([]);
  let accountId = $state(null);
  // A fresh instance is mounted each time Add Transaction opens (see
  // App.svelte's routing), so this only needs to read initialType once —
  // untrack() says so explicitly instead of fighting the linter.
  let type = $state(untrack(() => initialType) || 'expense');
  let date = $state(todayISO());
  let paymentMethod = $state('cash');
  let paymentLabel = $state('Cash');

  // specs/split-transactions.md — adding a new transaction can enter more
  // than one description/category/amount line, all sharing account/date/
  // type/payment method above. Editing always has exactly one line (see
  // save()) — "Add another line" never shows once transactionId is set.
  function newLine() {
    return { description: '', amount: '', categoryId: /** @type {string|null} */ (null), subcategoryId: /** @type {string|null} */ (null), categoryLabel: 'Uncategorised' };
  }
  let lines = $state([newLine()]);
  let categoryPickerLineIndex = $state(/** @type {number|null} */ (null));

  let paymentPickerOpen = $state(false);
  let confirmDeleteOpen = $state(false);

  const total = $derived(lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
  const canSave = $derived(!!accountId && lines.every(l => Number(l.amount) > 0));

  onMount(async () => {
    accounts = await getAccounts();
    if (transactionId) {
      const txn = await getTransaction(transactionId);
      if (txn) {
        accountId = txn.accountId;
        type = txn.type;
        date = txn.date;
        paymentMethod = txn.paymentMethod || 'cash';
        lines = [{ description: txn.description || '', amount: String(txn.amount), categoryId: txn.categoryId, subcategoryId: txn.subcategoryId, categoryLabel: 'Uncategorised' }];
        await resolveLabels();
      }
    } else {
      accountId = defaultAccountId ?? accounts[0]?.id ?? null;
    }
  });

  // Categories are type-specific — switching Income/Expense clears
  // whatever was chosen on every line, since none of it applies anymore.
  function setType(newType) {
    if (newType === type) return;
    type = newType;
    lines = lines.map(l => ({ ...l, categoryId: null, subcategoryId: null, categoryLabel: 'Uncategorised' }));
  }

  // Resolves categoryId/subcategoryId/paymentMethod into display labels
  // when editing — reads the raw stores (not getCategoriesSorted) so a
  // since-soft-deleted category still resolves correctly here, same as
  // any other view of an existing transaction. Only ever line 0: editing
  // always has exactly one line.
  async function resolveLabels() {
    const line = lines[0];
    if (line.categoryId) {
      const categories = await getAll('categories');
      const cat = categories.find(c => c.id === line.categoryId);
      const sub = cat?.subcategories.find(s => s.id === line.subcategoryId);
      lines[0].categoryLabel = cat ? (sub ? `${cat.name} / ${sub.name}` : cat.name) : 'Uncategorised';
    }
    if (paymentMethod && paymentMethod !== 'cash') {
      const cards = await getAll('cards');
      paymentLabel = cards.find(c => c.id === paymentMethod)?.name ?? 'Card';
    }
  }

  function addLine() {
    lines.push(newLine());
  }

  function removeLine(index) {
    if (lines.length <= 1) return;
    lines.splice(index, 1);
  }

  function openCategoryPicker(index) {
    categoryPickerLineIndex = index;
  }

  function selectCategory(newCategoryId, newSubcategoryId, label) {
    const line = lines[/** @type {number} */ (categoryPickerLineIndex)];
    line.categoryId = newCategoryId;
    line.subcategoryId = newSubcategoryId;
    line.categoryLabel = label;
    categoryPickerLineIndex = null;
  }

  function selectPayment(newPaymentMethod, label) {
    paymentMethod = newPaymentMethod;
    paymentLabel = label;
    paymentPickerOpen = false;
  }

  // With exactly 1 line this is identical to the pre-split single save
  // (specs/split-transactions.md requirement 5); with more, each line
  // becomes its own independent transaction (requirement 7) — no shared
  // id or marker is ever written anywhere.
  async function save() {
    if (!canSave || !accountId) return;
    const shared = { accountId, type, date, paymentMethod: type === 'expense' ? paymentMethod : null };
    if (transactionId) {
      const line = lines[0];
      await updateTransaction(transactionId, {
        ...shared, amount: Number(line.amount), description: line.description.trim(),
        categoryId: line.categoryId, subcategoryId: line.subcategoryId
      });
    } else {
      for (const line of lines) {
        await createTransaction({
          ...shared, amount: Number(line.amount), description: line.description.trim(),
          categoryId: line.categoryId, subcategoryId: line.subcategoryId
        });
      }
    }
    onSaved();
  }

  async function confirmDelete() {
    await removeTransaction(transactionId);
    onSaved();
  }
</script>

<div class="add-transaction">
  <div class="topbar">
    <button class="back-btn" onclick={onBack}>‹ Back</button>
    <div class="title">{transactionId ? 'Edit' : 'Add'} {type === 'income' ? 'Income' : 'Expense'}</div>
    <button class="save-btn" onclick={save} disabled={!canSave}>Save</button>
  </div>

  <div class="content">
    <div class="type-toggle">
      <button class="type-btn" class:active={type === 'expense'} onclick={() => setType('expense')}>Expense</button>
      <button class="type-btn" class:active={type === 'income'} onclick={() => setType('income')}>Income</button>
    </div>

    {#each lines as line, i (i)}
      {#if lines.length > 1}
        <div class="line-header">
          <span class="line-label">Item {i + 1}</span>
          <button class="remove-line-btn" onclick={() => removeLine(i)}>Remove</button>
        </div>
      {/if}

      <label class="field">
        <span class="field-label">Amount</span>
        <input type="number" step="0.01" min="0" bind:value={line.amount} placeholder="0.00" />
      </label>

      <label class="field">
        <span class="field-label">Description</span>
        <input type="text" bind:value={line.description} placeholder="Optional" />
      </label>

      <button class="picker-row" onclick={() => openCategoryPicker(i)}>
        <span class="field-label">Category</span>
        <span class="picker-value">{line.categoryLabel}</span>
      </button>
    {/each}

    {#if !transactionId}
      <button class="add-line-btn" onclick={addLine}>+ Add another line</button>
    {/if}

    {#if lines.length > 1}
      <div class="total-row">
        <span>Total</span>
        <span class="total-amount">{fmtMoney(total)}</span>
      </div>
    {/if}

    <label class="field">
      <span class="field-label">Account</span>
      <select bind:value={accountId}>
        {#each accounts as acct (acct.id)}
          <option value={acct.id}>{acct.name}</option>
        {/each}
      </select>
    </label>

    <label class="field">
      <span class="field-label">Date</span>
      <input type="date" bind:value={date} />
    </label>

    {#if type === 'expense'}
      <button class="picker-row" onclick={() => paymentPickerOpen = true}>
        <span class="field-label">Payment method</span>
        <span class="picker-value">{paymentLabel}</span>
      </button>
    {/if}

    {#if transactionId}
      <button class="delete-btn" onclick={() => confirmDeleteOpen = true}>Delete transaction</button>
    {/if}
  </div>
</div>

{#if categoryPickerLineIndex !== null}
  <CategoryPicker {type} onSelect={selectCategory} onClose={() => categoryPickerLineIndex = null} />
{/if}

{#if paymentPickerOpen}
  <PaymentPicker onSelect={selectPayment} onClose={() => paymentPickerOpen = false} />
{/if}

{#if confirmDeleteOpen}
  <div class="backdrop" role="button" tabindex="0" onclick={() => confirmDeleteOpen = false} onkeydown={(e) => e.key === 'Escape' && (confirmDeleteOpen = false)}>
    <div class="confirm-sheet" role="presentation" onclick={(e) => e.stopPropagation()}>
      <div class="confirm-title">Delete this transaction?</div>
      <p class="confirm-body">This can't be undone.</p>
      <div class="confirm-actions">
        <button class="cancel-confirm-btn" onclick={() => confirmDeleteOpen = false}>Cancel</button>
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
    flex: 1; padding: 10px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 14px; font-weight: 700;
    color: var(--ink); opacity: .6;
  }
  .type-btn.active { background: var(--accent); color: var(--accent-ink); opacity: 1; border-color: var(--accent); }

  .line-header {
    display: flex; align-items: center; justify-content: space-between; margin: 4px 0 10px;
    padding-top: 12px; border-top: 1px solid var(--paper-line);
  }
  .line-label { font-family: var(--font-body); font-size: 12.5px; font-weight: 700; color: var(--ink); opacity: .6; }
  .remove-line-btn { background: none; border: none; color: var(--rust); font-family: var(--font-body); font-size: 12.5px; font-weight: 700; }

  .field { display: block; margin-bottom: 16px; }
  .field-label {
    display: block; font-family: var(--font-body); font-size: 12.5px; font-weight: 700;
    color: var(--ink); opacity: .6; margin-bottom: 6px;
  }
  .field input, .field select {
    width: 100%; padding: 12px 14px; border-radius: var(--radius); border: 1.5px solid var(--paper-line);
    background: var(--paper-dim); font-family: var(--font-body); font-size: 15px; color: var(--ink);
    box-sizing: border-box;
  }

  .picker-row {
    display: block; width: 100%; text-align: left; margin-bottom: 16px; padding: 12px 14px;
    border-radius: var(--radius); border: 1.5px solid var(--paper-line); background: var(--paper-dim);
    box-sizing: border-box;
  }
  .picker-value { display: block; font-family: var(--font-body); font-size: 15px; color: var(--ink); margin-top: 2px; }

  .add-line-btn {
    display: block; width: 100%; padding: 12px; margin-bottom: 16px; border-radius: var(--radius);
    border: 1.5px dashed var(--paper-line); background: none; color: var(--ink); opacity: .7;
    font-family: var(--font-body); font-size: 14px; font-weight: 700;
  }

  .total-row {
    display: flex; align-items: center; justify-content: space-between; padding: 12px 14px;
    margin-bottom: 16px; border-radius: var(--radius); background: var(--paper-dim);
    font-family: var(--font-body); font-size: 14px; font-weight: 700; color: var(--ink);
  }
  .total-amount { font-family: var(--font-display); font-size: 16px; }

  .delete-btn {
    display: block; width: 100%; padding: 12px; margin-top: 12px; border-radius: var(--radius); border: none;
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
