import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAll, put,
  getCategoriesSorted, createCategory, updateCategory, softDeleteCategory,
  addSubcategory, renameSubcategory, softDeleteSubcategory,
  moveCategory, moveSubcategory, importCategories
} from '../src/lib/data/db.js';
import { CATEGORY_COLORS } from '../src/lib/data/format.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/categories.md — requirement 10 (uniqueness dropped) and Data model
describe('createCategory', () => {
  it('creates a category with an order assigned within its type', async () => {
    const a = await createCategory({ name: 'Food', type: 'expense' });
    const b = await createCategory({ name: 'Transport', type: 'expense' });
    const income = await createCategory({ name: 'Salary', type: 'income' });
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
    expect(income.order).toBe(0); // separate sequence per type
    expect(a.isDeleted).toBe(false);
  });

  it('allows a duplicate name regardless of type', async () => {
    await createCategory({ name: 'Other', type: 'expense' });
    const second = await createCategory({ name: 'Other', type: 'income' });
    expect(second.name).toBe('Other');
  });
});

// specs/categories.md — requirements 10g-10i (color)
describe('category color', () => {
  it('assigns a palette color automatically when none is given', async () => {
    const a = await createCategory({ name: 'Food', type: 'expense' });
    expect(CATEGORY_COLORS).toContain(a.color);
  });

  it('honors an explicit color', async () => {
    const a = await createCategory({ name: 'Food', type: 'expense', color: CATEGORY_COLORS[3] });
    expect(a.color).toBe(CATEGORY_COLORS[3]);
  });

  it('an update can change the color', async () => {
    const a = await createCategory({ name: 'Food', type: 'expense' });
    await updateCategory(a.id, { color: CATEGORY_COLORS[5] });
    const [updated] = await getCategoriesSorted('expense');
    expect(updated.color).toBe(CATEGORY_COLORS[5]);
  });

  it('assigns a color to a legacy row that predates this feature, and persists it', async () => {
    await put('categories', { id: 'c1', name: 'Food', type: 'expense', order: 0, isDeleted: false, subcategories: [] });

    const [category] = await getCategoriesSorted('expense');
    expect(CATEGORY_COLORS).toContain(category.color);

    const persisted = (await getAll('categories'))[0];
    expect(persisted.color).toBe(category.color); // migration wrote it back, not just an in-memory patch
  });
});

// specs/categories.md — requirements 8-9 (soft delete, rename resolved live)
describe('updateCategory / softDeleteCategory', () => {
  it('renaming a category is a single-row update — transactions resolve via id, not a cascade', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    await put('transactions', { id: 't1', categoryId: category.id, amount: 10, type: 'expense', date: '2026-09-01' });

    await updateCategory(category.id, { name: 'Groceries' });

    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.categoryId).toBe(category.id); // untouched — nothing needed to change
    const renamed = (await getAll('categories')).find(c => c.id === category.id);
    expect(renamed.name).toBe('Groceries');
  });

  it('allows renaming to a name that collides with another category', async () => {
    await createCategory({ name: 'Food', type: 'expense' });
    const other = await createCategory({ name: 'Transport', type: 'expense' });
    await expect(updateCategory(other.id, { name: 'Food' })).resolves.toBeTruthy();
  });

  it('soft-deletes a category: gone from getCategoriesSorted, but the row (and its transactions) survive', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    await put('transactions', { id: 't1', categoryId: category.id, amount: 10, type: 'expense', date: '2026-09-01' });

    await softDeleteCategory(category.id);

    const sorted = await getCategoriesSorted('expense');
    expect(sorted).toHaveLength(0);

    const raw = (await getAll('categories')).find(c => c.id === category.id);
    expect(raw.isDeleted).toBe(true);

    // deleting a category does NOT hide its transactions (unlike accounts)
    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.categoryId).toBe(category.id);
  });
});

// specs/categories.md — subcategory CRUD (id-addressed now, not name-addressed)
describe('subcategory CRUD', () => {
  it('adds a subcategory with an id and the next order value', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    await addSubcategory(category.id, 'Groceries');
    const updated = await addSubcategory(category.id, 'Dining');
    expect(updated.subcategories).toHaveLength(2);
    expect(updated.subcategories[0]).toMatchObject({ name: 'Groceries', order: 0, isDeleted: false });
    expect(updated.subcategories[1]).toMatchObject({ name: 'Dining', order: 1, isDeleted: false });
    expect(updated.subcategories[0].id).toBeTruthy();
  });

  it('renaming a subcategory by id is a single-row update — transactions resolve via id', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    const withSub = await addSubcategory(category.id, 'Snack');
    const subId = withSub.subcategories[0].id;
    await put('transactions', { id: 't1', categoryId: category.id, subcategoryId: subId, amount: 5, type: 'expense', date: '2026-09-01' });

    await renameSubcategory(category.id, subId, 'Snacks');

    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.subcategoryId).toBe(subId); // untouched
    const [category2] = await getCategoriesSorted('expense');
    expect(category2.subcategories[0].name).toBe('Snacks');
  });

  it('soft-deleting a subcategory removes it from the visible list but keeps transactions resolving', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    const withSub = await addSubcategory(category.id, 'Snack');
    const subId = withSub.subcategories[0].id;
    await put('transactions', { id: 't1', categoryId: category.id, subcategoryId: subId, amount: 5, type: 'expense', date: '2026-09-01' });

    await softDeleteSubcategory(category.id, subId);

    const [category2] = await getCategoriesSorted('expense');
    expect(category2.subcategories).toHaveLength(0);

    const txn = (await getAll('transactions')).find(t => t.id === 't1');
    expect(txn.subcategoryId).toBe(subId); // unchanged
  });
});

// specs/categories.md — requirements 10a-10d, 10f (reordering, active-only)
describe('moveCategory', () => {
  it('swaps order with the neighbor above/below, within the same type', async () => {
    const a = await createCategory({ name: 'A', type: 'expense' });
    const b = await createCategory({ name: 'B', type: 'expense' });
    await createCategory({ name: 'C', type: 'expense' });

    await moveCategory(b.id, 'up'); // B and A swap: B,A,C

    const sorted = await getCategoriesSorted('expense');
    expect(sorted.map(x => x.name)).toEqual(['B', 'A', 'C']);
  });

  it('is a no-op at the top/bottom edge of the group', async () => {
    const a = await createCategory({ name: 'A', type: 'expense' });
    const b = await createCategory({ name: 'B', type: 'expense' });

    await moveCategory(a.id, 'up'); // already first
    await moveCategory(b.id, 'down'); // already last

    const sorted = await getCategoriesSorted('expense');
    expect(sorted.map(x => x.name)).toEqual(['A', 'B']);
  });

  it('never crosses between Income and Expense groups', async () => {
    const expenseA = await createCategory({ name: 'ExpenseA', type: 'expense' });
    await createCategory({ name: 'IncomeA', type: 'income' });

    await moveCategory(expenseA.id, 'up'); // already first in its own group — no-op

    const expense = await getCategoriesSorted('expense');
    const income = await getCategoriesSorted('income');
    expect(expense.map(x => x.name)).toEqual(['ExpenseA']);
    expect(income.map(x => x.name)).toEqual(['IncomeA']);
  });

  it('skips soft-deleted categories when finding a neighbor', async () => {
    const a = await createCategory({ name: 'A', type: 'expense' });
    const b = await createCategory({ name: 'B', type: 'expense' });
    const c = await createCategory({ name: 'C', type: 'expense' });
    await softDeleteCategory(b.id);

    await moveCategory(c.id, 'up'); // B is hidden, so C should swap with A

    const sorted = await getCategoriesSorted('expense');
    expect(sorted.map(x => x.name)).toEqual(['C', 'A']);
  });
});

describe('moveSubcategory', () => {
  it('swaps order with the neighboring subcategory within one category', async () => {
    const category = await createCategory({ name: 'Food', type: 'expense' });
    await addSubcategory(category.id, 'Groceries');
    const withDining = await addSubcategory(category.id, 'Dining');
    await addSubcategory(category.id, 'Snacks');
    const diningId = withDining.subcategories.find(s => s.name === 'Dining').id;

    await moveSubcategory(category.id, diningId, 'up'); // Dining,Groceries,Snacks

    const [sorted] = await getCategoriesSorted('expense');
    expect(sorted.subcategories.map(s => s.name)).toEqual(['Dining', 'Groceries', 'Snacks']);
  });
});

// specs/categories.md — requirement 10e (lazy migration)
describe('legacy data without ordering/ids', () => {
  it('assigns order (alphabetically) to categories missing it, and persists the fix', async () => {
    await put('categories', { id: 'c1', name: 'Zebra', type: 'expense', subcategories: [] });
    await put('categories', { id: 'c2', name: 'Apple', type: 'expense', subcategories: [] });

    const sorted = await getCategoriesSorted('expense');
    expect(sorted.map(c => c.name)).toEqual(['Apple', 'Zebra']); // alphabetical, since neither had an order

    const persisted = await getAll('categories');
    expect(persisted.every(c => c.order != null && c.isDeleted === false)).toBe(true);
  });

  it('wraps bare-string subcategories into {id, name, order, isDeleted} objects', async () => {
    await put('categories', { id: 'c1', name: 'Food', type: 'expense', subcategories: ['Groceries', 'Snacks'] });

    const [category] = await getCategoriesSorted('expense');
    expect(category.subcategories.map(s => s.name)).toEqual(['Groceries', 'Snacks']);
    expect(category.subcategories.every(s => s.id && s.isDeleted === false)).toBe(true);

    const persisted = (await getAll('categories'))[0];
    expect(persisted.subcategories.every(s => typeof s === 'object' && s.id)).toBe(true);
  });

  it('assigns an id to a subcategory object that already has {name, order} but no id', async () => {
    await put('categories', { id: 'c1', name: 'Food', type: 'expense', order: 0, subcategories: [{ name: 'Groceries', order: 0 }] });

    const [category] = await getCategoriesSorted('expense');
    expect(category.subcategories[0].id).toBeTruthy();
  });

  it('does not collide with categories that already have an explicit order', async () => {
    await put('categories', { id: 'c1', name: 'Ordered', type: 'expense', order: 0, subcategories: [] });
    await put('categories', { id: 'c2', name: 'Legacy', type: 'expense', subcategories: [] });

    const sorted = await getCategoriesSorted('expense');
    expect(sorted.map(c => c.name)).toEqual(['Ordered', 'Legacy']); // Legacy appended after, not colliding at order 0
  });
});

// specs/categories.md — requirement 14 (import, full replace, no uniqueness check)
describe('importCategories', () => {
  it('fully replaces the store, allowing duplicate names', async () => {
    await createCategory({ name: 'Existing', type: 'expense' });
    await importCategories([
      { name: 'A', type: 'expense', subcategories: [] },
      { name: 'A', type: 'income', subcategories: [] }
    ]);
    const all = await getAll('categories');
    expect(all.map(c => c.name)).toEqual(['A', 'A']);
  });
});
