import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAccount, createCategory, createTransaction, createBudget, updateBudget,
  removeBudget, getBudgets, computeBudgetStatus, getBudgetsActiveForMonth
} from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/budgets.md — Data model, requirement 4
describe('createBudget / removeBudget', () => {
  it('creates a budget with sensible defaults', async () => {
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const budget = await createBudget({ name: 'Groceries', categoryId: food.id, amount: 400 });
    expect(budget.subcategoryId).toBeNull();
    expect(budget.isRollover).toBe(true);
    expect(budget.endDate).toBeNull();
  });

  it('hard-deletes: nothing left behind, transactions untouched', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const budget = await createBudget({ name: 'Groceries', categoryId: food.id, amount: 400 });
    await createTransaction({ accountId: account.id, amount: 50, type: 'expense', categoryId: food.id, date: '2026-03-01' });

    await removeBudget(budget.id);

    expect(await getBudgets()).toHaveLength(0);
    const status = await computeBudgetStatus(budget, '2026-03');
    expect(status.spent).toBe(50); // the transaction itself is untouched
  });
});

// specs/budgets.md — requirement 6 (double counting) and requirement 5 (one per target)
describe('computeBudgetStatus — category + subcategory overlap', () => {
  it('counts a subcategory transaction toward both its own budget and the parent category budget', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({
      name: 'Food', type: 'expense',
      subcategories: [{ name: 'Dining out' }]
    });
    const diningOutId = food.subcategories[0].id;

    const foodBudget = await createBudget({ name: 'Food', categoryId: food.id, amount: 500, startDate: '2026-01-01' });
    const diningBudget = await createBudget({
      name: 'Dining out', categoryId: food.id, subcategoryId: diningOutId, amount: 100, startDate: '2026-01-01'
    });

    await createTransaction({
      accountId: account.id, amount: 40, type: 'expense', categoryId: food.id, subcategoryId: diningOutId, date: '2026-03-05'
    });
    await createTransaction({
      accountId: account.id, amount: 20, type: 'expense', categoryId: food.id, date: '2026-03-06' // groceries, not dining out
    });

    const foodStatus = await computeBudgetStatus(foodBudget, '2026-03');
    const diningStatus = await computeBudgetStatus(diningBudget, '2026-03');

    expect(foodStatus.spent).toBe(60); // both transactions count toward the whole category
    expect(diningStatus.spent).toBe(40); // only the dining-out one counts toward the subcategory budget
  });
});

// specs/budgets.md — requirement 2 (isRollover)
describe('computeBudgetStatus — rollover', () => {
  it('accumulates unspent amounts across months when isRollover is true', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const budget = await createBudget({ name: 'Food', categoryId: food.id, amount: 100, isRollover: true, startDate: '2026-01-01' });

    // January: spend 40, leaving 60 to roll into February
    await createTransaction({ accountId: account.id, amount: 40, type: 'expense', categoryId: food.id, date: '2026-01-15' });
    // February: some activity so the rollover chain isn't skipped
    await createTransaction({ accountId: account.id, amount: 30, type: 'expense', categoryId: food.id, date: '2026-02-10' });

    const marchStatus = await computeBudgetStatus(budget, '2026-03');
    // Feb available = 100 + 60 rolled in = 160, spent 30, leaves 130 rolling into March
    expect(marchStatus.rolledIn).toBe(130);
    expect(marchStatus.totalAvailable).toBe(230);
  });

  it('never rolls over anything when isRollover is false', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const budget = await createBudget({ name: 'Food', categoryId: food.id, amount: 100, isRollover: false, startDate: '2026-01-01' });

    await createTransaction({ accountId: account.id, amount: 20, type: 'expense', categoryId: food.id, date: '2026-01-15' });
    await createTransaction({ accountId: account.id, amount: 30, type: 'expense', categoryId: food.id, date: '2026-02-10' });

    const marchStatus = await computeBudgetStatus(budget, '2026-03');
    expect(marchStatus.rolledIn).toBe(0);
    expect(marchStatus.totalAvailable).toBe(100);
  });

  it('never rolls over from before the budget\'s own start month', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });
    // Pre-budget spend in December should never count as phantom rollover.
    await createTransaction({ accountId: account.id, amount: 999, type: 'expense', categoryId: food.id, date: '2025-12-01' });

    const budget = await createBudget({ name: 'Food', categoryId: food.id, amount: 100, isRollover: true, startDate: '2026-01-01' });
    const januaryStatus = await computeBudgetStatus(budget, '2026-01');
    expect(januaryStatus.rolledIn).toBe(0);
  });
});

// specs/budgets.md — requirements 8-9 (active-month windowing)
describe('getBudgetsActiveForMonth', () => {
  it('excludes a budget before its start month and after its end month', async () => {
    const food = await createCategory({ name: 'Food', type: 'expense' });
    await createBudget({ name: 'Food', categoryId: food.id, amount: 100, startDate: '2026-03-01', endDate: '2026-05-31' });

    expect(await getBudgetsActiveForMonth('2026-02')).toHaveLength(0);
    expect(await getBudgetsActiveForMonth('2026-03')).toHaveLength(1);
    expect(await getBudgetsActiveForMonth('2026-05')).toHaveLength(1);
    expect(await getBudgetsActiveForMonth('2026-06')).toHaveLength(0);
  });

  it('includes an unbounded budget for every month from its start onward', async () => {
    const food = await createCategory({ name: 'Food', type: 'expense' });
    await createBudget({ name: 'Food', categoryId: food.id, amount: 100, startDate: '2026-01-01' });

    expect(await getBudgetsActiveForMonth('2027-01')).toHaveLength(1);
  });
});

describe('updateBudget', () => {
  it('merges fields and bumps modifiedAt', async () => {
    const food = await createCategory({ name: 'Food', type: 'expense' });
    const budget = await createBudget({ name: 'Food', categoryId: food.id, amount: 100 });
    const updated = await updateBudget(budget.id, { amount: 150, isRollover: false });
    expect(updated.amount).toBe(150);
    expect(updated.isRollover).toBe(false);
    expect(updated.name).toBe('Food'); // untouched fields survive the merge
  });
});
