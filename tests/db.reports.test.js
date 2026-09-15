import { describe, it, expect, beforeEach } from 'vitest';
import {
  createAccount, createCategory, createTransaction, getYearlyTrend, getTopSubcategories
} from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/reports.md — requirements 4-5 (Charts 2-3 share this one query)
describe('getYearlyTrend', () => {
  it('buckets income and expense per month across the given year', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense' });

    await createTransaction({ accountId: account.id, amount: 10, type: 'expense', categoryId: food.id, date: '2026-01-05' });
    await createTransaction({ accountId: account.id, amount: 5, type: 'expense', categoryId: food.id, date: '2026-01-20' });
    await createTransaction({ accountId: account.id, amount: 3000, type: 'income', date: '2026-03-01' });
    await createTransaction({ accountId: account.id, amount: 999, type: 'expense', categoryId: food.id, date: '2025-12-31' }); // different year, excluded

    const trend = await getYearlyTrend(2026, account.id);

    expect(trend.expense[0]).toBe(15); // January
    expect(trend.income[2]).toBe(3000); // March
    expect(trend.expense.reduce((a, b) => a + b, 0)).toBe(15); // the 2025 row never counted
    expect(trend.expense).toHaveLength(12);
  });

  it('is scoped by account', async () => {
    const accountA = await createAccount({ name: 'A' });
    const accountB = await createAccount({ name: 'B' });
    await createTransaction({ accountId: accountA.id, amount: 10, type: 'expense', date: '2026-01-05' });
    await createTransaction({ accountId: accountB.id, amount: 999, type: 'expense', date: '2026-01-05' });

    const trend = await getYearlyTrend(2026, accountA.id);
    expect(trend.expense[0]).toBe(10);
  });
});

// specs/reports.md — requirement 7 (Chart 5)
describe('getTopSubcategories — month/account scoping', () => {
  it('ranks by spend amount (not count) when a yearMonth is given', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense', subcategories: [{ name: 'Snacks' }, { name: 'Dining out' }] });
    const [snacks, diningOut] = food.subcategories;

    // Snacks: 3 small transactions (more frequent). Dining out: 1 big one (more spend).
    await createTransaction({ accountId: account.id, amount: 5, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-09-01' });
    await createTransaction({ accountId: account.id, amount: 5, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-09-02' });
    await createTransaction({ accountId: account.id, amount: 5, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-09-03' });
    await createTransaction({ accountId: account.id, amount: 100, type: 'expense', categoryId: food.id, subcategoryId: diningOut.id, date: '2026-09-04' });

    const top = await getTopSubcategories(5, '2026-09', account.id);
    expect(top[0].subcategory).toBe('Dining out'); // ranked by amount (100), not count (1 vs 3)
    expect(top[0].amount).toBe(100);
  });

  it('excludes transactions outside the given month and account', async () => {
    const accountA = await createAccount({ name: 'A' });
    const accountB = await createAccount({ name: 'B' });
    const food = await createCategory({ name: 'Food', type: 'expense', subcategories: [{ name: 'Snacks' }] });
    const snacks = food.subcategories[0];

    await createTransaction({ accountId: accountA.id, amount: 5, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-09-01' });
    await createTransaction({ accountId: accountB.id, amount: 999, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-09-01' }); // different account
    await createTransaction({ accountId: accountA.id, amount: 999, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2026-08-01' }); // different month

    const top = await getTopSubcategories(5, '2026-09', accountA.id);
    expect(top).toHaveLength(1);
    expect(top[0].amount).toBe(5);
  });

  it('keeps the original all-time, no-args behavior for existing callers', async () => {
    const account = await createAccount({ name: 'Checking' });
    const food = await createCategory({ name: 'Food', type: 'expense', subcategories: [{ name: 'Snacks' }] });
    const snacks = food.subcategories[0];
    await createTransaction({ accountId: account.id, amount: 5, type: 'expense', categoryId: food.id, subcategoryId: snacks.id, date: '2020-01-01' });

    const top = await getTopSubcategories(3);
    expect(top).toHaveLength(1);
    expect(top[0].subcategory).toBe('Snacks');
  });
});
