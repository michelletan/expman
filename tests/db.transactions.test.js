import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAll, createAccount, createCategory, addSubcategory,
  createTransaction, updateTransaction, removeTransaction, getTransaction,
  getCategoryTotalsForMonth
} from '../src/lib/data/db.js';
import { todayISO } from '../src/lib/data/format.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/transactions.md — requirements 1-4, 13-14 (data model, Add Transaction)
describe('createTransaction', () => {
  it('defaults description, category, date, and payment method sensibly', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({ accountId: account.id, amount: 20, type: 'expense' });

    expect(txn.description).toBe('');
    expect(txn.categoryId).toBeNull();
    expect(txn.subcategoryId).toBeNull();
    expect(txn.date).toBe(todayISO());
    expect(txn.paymentMethod).toBe('cash'); // expense defaults to cash
    expect(txn.createdAt).toBeTruthy();
    expect(txn.modifiedAt).toBe(txn.createdAt);
  });

  it('leaves paymentMethod null for income', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({ accountId: account.id, amount: 100, type: 'income' });
    expect(txn.paymentMethod).toBeNull();
  });

  it('drops subcategoryId if no categoryId is given, even if one is passed', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({ accountId: account.id, amount: 5, type: 'expense', subcategoryId: 'sub_orphan' });
    expect(txn.subcategoryId).toBeNull();
  });

  it('accepts a specific date and payment method', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({
      accountId: account.id, amount: 5, type: 'expense', date: '2026-01-15', paymentMethod: 'card_1'
    });
    expect(txn.date).toBe('2026-01-15');
    expect(txn.paymentMethod).toBe('card_1');
  });
});

describe('updateTransaction', () => {
  it('merges fields and bumps modifiedAt without touching createdAt', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({ accountId: account.id, amount: 20, type: 'expense' });

    await new Promise(r => setTimeout(r, 2));
    const updated = await updateTransaction(txn.id, { amount: 30, description: 'Lunch' });

    expect(updated.amount).toBe(30);
    expect(updated.description).toBe('Lunch');
    expect(updated.createdAt).toBe(txn.createdAt);
    expect(updated.modifiedAt).not.toBe(txn.createdAt);
  });
});

// specs/transactions.md — requirement 15 (hard delete, nothing else affected)
describe('removeTransaction', () => {
  it('hard-deletes the row', async () => {
    const account = await createAccount({ name: 'Checking' });
    const txn = await createTransaction({ accountId: account.id, amount: 20, type: 'expense' });

    await removeTransaction(txn.id);

    expect(await getTransaction(txn.id)).toBeUndefined();
    expect(await getAll('transactions')).toHaveLength(0);
  });
});

// specs/transactions.md — requirement 28 (Category view)
describe('getCategoryTotalsForMonth', () => {
  it('sums by category, sorted largest first, resolving live category names', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const transport = await createCategory({ name: 'Transport', type: 'expense' });

    await createTransaction({ accountId: account.id, amount: 10, type: 'expense', categoryId: food.id, date: '2026-09-01' });
    await createTransaction({ accountId: account.id, amount: 25, type: 'expense', categoryId: food.id, date: '2026-09-02' });
    await createTransaction({ accountId: account.id, amount: 15, type: 'expense', categoryId: transport.id, date: '2026-09-03' });

    const totals = await getCategoryTotalsForMonth('2026-09', account.id);

    expect(totals).toEqual([
      { categoryId: food.id, category: 'Food', color: food.color, total: 35 },
      { categoryId: transport.id, category: 'Transport', color: transport.color, total: 15 }
    ]);
  });

  it('groups uncategorised transactions under an "Uncategorised" row', async () => {
    const account = await createAccount({ name: 'Checking' });
    await createTransaction({ accountId: account.id, amount: 10, type: 'expense', date: '2026-09-01' });

    const totals = await getCategoryTotalsForMonth('2026-09', account.id);

    expect(totals).toEqual([{ categoryId: null, category: 'Uncategorised', color: '#9CA3AF', total: 10 }]);
  });

  it('still resolves a category name after it has been renamed', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    await createTransaction({ accountId: account.id, amount: 10, type: 'expense', categoryId: food.id, date: '2026-09-01' });

    const { updateCategory } = await import('../src/lib/data/db.js');
    await updateCategory(food.id, { name: 'Groceries' });

    const totals = await getCategoryTotalsForMonth('2026-09', account.id);
    expect(totals[0].category).toBe('Groceries');
  });

  it('is scoped by month and by account', async () => {
    const accountA = await createAccount({ name: 'A' });
    const accountB = await createAccount({ name: 'B' });
    const food = await createCategory({ name: 'Food', type: 'expense' });

    await createTransaction({ accountId: accountA.id, amount: 10, type: 'expense', categoryId: food.id, date: '2026-09-01' });
    await createTransaction({ accountId: accountB.id, amount: 999, type: 'expense', categoryId: food.id, date: '2026-09-01' });
    await createTransaction({ accountId: accountA.id, amount: 999, type: 'expense', categoryId: food.id, date: '2026-08-01' });

    const totals = await getCategoryTotalsForMonth('2026-09', accountA.id);
    expect(totals).toEqual([{ categoryId: food.id, category: 'Food', color: food.color, total: 10 }]);
  });
});
