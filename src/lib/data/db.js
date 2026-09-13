/*
  DATA/DB.JS
  ----------
  Every component reads and writes data through the functions exported here;
  none of them should call indexedDB.* themselves.

  Object stores:
    transactions  - one row per expense/income entry, linked to an
                    account/category/subcategory by id (accountId,
                    categoryId, subcategoryId). Display always resolves
                    the current name live via that id — nothing here is
                    a snapshotted name string, and nothing needs a
                    cascade when the account/category is renamed.
    categories    - {id, name, type, order, isDeleted, subcategories:
                     [{id, name, order, isDeleted}]}. Soft-deleted
                     categories/subcategories drop out of every list but
                     the row survives so old transactions keep resolving
                     correctly — see getCategoriesSorted. Note: unlike
                     accounts, a soft-deleted category does NOT hide its
                     transactions from other views (see getVisibleTransactions).
    accounts      - {id, name, description, initialBalance, dateCreated,
                     isDeleted}  (soft-deleted accounts and their
                     transactions are hidden from every in-app view but
                     kept for exportAll() — see getVisibleTransactions).
    budgets       - {id, categoryId, monthlyLimit}  (per-category, rollover
                     is CALCULATED at read time, not stored — see
                     computeBudgetStatus below)
    recurring     - repeating transaction rules, linked to an account and
                    a category by id, same as transactions
    cards         - {id, name, last4, color, cycleStartDay}
    meta          - plain key/value settings (theme, lastSyncedAt, ...)
*/

import { genId, todayISO } from './format.js';

const DB_NAME = 'expman-db';
const DB_VERSION = 1;
export const STORES = ['transactions', 'categories', 'accounts', 'budgets', 'recurring', 'cards', 'meta'];

let _dbPromise = null;

export async function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return openDB().then(db => db.transaction(storeName, mode).objectStore(storeName));
}

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---- generic CRUD -----------------------------------------------------

export async function getAll(storeName) {
  const store = await tx(storeName);
  return promisify(store.getAll());
}

export async function get(storeName, id) {
  const store = await tx(storeName);
  return promisify(store.get(id));
}

export async function put(storeName, record) {
  const store = await tx(storeName, 'readwrite');
  await promisify(store.put(record));
  markDirty();
  return record;
}

export async function putMany(storeName, records) {
  const store = await tx(storeName, 'readwrite');
  await Promise.all(records.map(r => promisify(store.put(r))));
  markDirty();
}

export async function remove(storeName, id) {
  const store = await tx(storeName, 'readwrite');
  await promisify(store.delete(id));
  markDirty();
}

export async function clearStore(storeName) {
  const store = await tx(storeName, 'readwrite');
  await promisify(store.clear());
}

// ---- accounts -------------------------------------------------------------
// Soft-delete only: deleting an account sets isDeleted instead of removing
// the row, so its transaction history survives in the DB (and in
// exportAll()) even though it disappears from every in-app view. Referenced
// elsewhere by id (transactions.accountId) — renaming is a single-field
// update, nothing to cascade, and names don't need to be unique.

export async function getAccounts() {
  const all = await getAll('accounts');
  return all.filter(a => !a.isDeleted);
}

export async function getAccount(id) {
  return get('accounts', id);
}

export async function createAccount({ name, description = '', initialBalance = 0 }) {
  const account = {
    id: genId('acct'),
    name,
    description: description || '',
    initialBalance: Number(initialBalance) || 0,
    dateCreated: todayISO(),
    isDeleted: false
  };
  await put('accounts', account);
  return account;
}

export async function updateAccount(id, fields) {
  const existing = await get('accounts', id);
  return put('accounts', { ...existing, ...fields });
}

export async function softDeleteAccount(id) {
  return updateAccount(id, { isDeleted: true });
}

// Called once at boot. Only creates the default account the very first
// time the app runs — checks the whole store (deleted rows included) so
// someone who deletes every account doesn't get one silently recreated.
export async function ensureDefaultAccount() {
  const all = await getAll('accounts');
  if (all.length === 0) await createAccount({ name: 'Personal Expense' });
}

// Transactions belonging to a soft-deleted account are excluded from
// every read used by an in-app view (balances, activity, reports, budget
// spend, ...). exportAll() deliberately calls getAll('transactions')
// directly instead, so a full backup still contains everything. Note:
// this is account-specific — a soft-deleted CATEGORY does not hide its
// transactions the same way (see specs/categories.md requirement 8).
export async function getVisibleTransactions() {
  const [txns, accounts] = await Promise.all([getAll('transactions'), getAll('accounts')]);
  const deletedIds = new Set(accounts.filter(a => a.isDeleted).map(a => a.id));
  return txns.filter(t => !deletedIds.has(t.accountId));
}

// ---- backup / restore ----------------------------------------------------

export async function exportAll() {
  const [transactions, categories, accounts, budgets, recurring, cards] = await Promise.all([
    getAll('transactions'), getAll('categories'), getAll('accounts'),
    getAll('budgets'), getAll('recurring'), getAll('cards')
  ]);
  const preferences = await getMeta('preferences', {});
  return { transactions, categories, accounts, budgets, recurring, cards, preferences, savedAt: new Date().toISOString() };
}

// Full replace, not merge — matches what "restore a backup" implies.
export async function importAll(data) {
  for (const store of STORES) {
    if (store === 'meta') continue; // keep theme preference etc.
    await clearStore(store);
  }
  await putMany('categories', data.categories || []);
  await putMany('accounts', data.accounts || []);
  await putMany('transactions', data.transactions || []);
  await putMany('recurring', data.recurring || []);
  await putMany('cards', data.cards || []);
  if (data.budgets && data.budgets.length) await putMany('budgets', data.budgets);
  if (data.preferences) await setMeta('preferences', data.preferences);
}

// ---- dirty flag for sync -------------------------------------------------
// db.js doesn't know about any sync/backup destination directly — it
// just flags that something changed. A future data/sync.js would
// listen for this event and debounce the actual upload, keeping the
// two concerns separate.

function markDirty() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('expman:dirty'));
}

// ---- meta (settings) helpers --------------------------------------------

/** @param {*} [fallback] */
export async function getMeta(key, fallback = null) {
  const row = await get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  return put('meta', { id: key, value });
}

// ---- transactions -----------------------------------------------------
// Referenced by nothing else (no other store points at a transaction by
// id), so delete is a plain hard delete — no soft-delete/id-resolution
// concern the way accounts/categories have. See specs/transactions.md.

export async function getTransaction(id) {
  return get('transactions', id);
}

/**
 * @param {{ accountId: string, amount: number, type: string, description?: string,
 *   categoryId?: string|null, subcategoryId?: string|null, paymentMethod?: string|null, date?: string }} fields
 */
export async function createTransaction({
  accountId, amount, type, description = '', categoryId = null, subcategoryId = null,
  paymentMethod = null, date = todayISO()
}) {
  const now = new Date().toISOString();
  const transaction = {
    id: genId('txn'),
    accountId, amount: Number(amount) || 0, type, description,
    categoryId, subcategoryId: categoryId ? subcategoryId : null,
    paymentMethod: type === 'expense' ? (paymentMethod || 'cash') : null,
    date,
    createdAt: now, modifiedAt: now
  };
  await put('transactions', transaction);
  return transaction;
}

export async function updateTransaction(id, fields) {
  const existing = await get('transactions', id);
  return put('transactions', { ...existing, ...fields, modifiedAt: new Date().toISOString() });
}

export async function removeTransaction(id) {
  return remove('transactions', id);
}

// ---- domain-specific queries --------------------------------------------
// Small helpers that combine raw store reads into the shapes components
// need. Keeping these here (rather than duplicated per-component) means
// Home, Reports, and Budgets all agree on what "this month's spend" means.

export function monthKey(dateStr) {
  return dateStr ? dateStr.slice(0, 7) : null; // "2026-09-01" -> "2026-09"
}

export async function getTransactionsForMonth(yearMonth, accountId) {
  const all = await getVisibleTransactions();
  return all.filter(t => monthKey(t.date) === yearMonth && (!accountId || t.accountId === accountId));
}

// Category view's data source (specs/transactions.md requirement 28):
// one row per category with a transaction in the given list, summed and
// sorted largest first, plus an "Uncategorised" row when relevant.
// Exported (not just used internally) so Activity.svelte can reuse the
// exact same grouping over its own search-filtered transaction list,
// instead of re-implementing it — see getCategoryTotalsForMonth below
// for the plain, unfiltered case.
export function groupTransactionsByCategory(txns, categories) {
  const categoryById = new Map(categories.map(c => [c.id, c]));

  const totals = new Map(); // categoryId (or null) -> total
  for (const t of txns) {
    const key = t.categoryId ?? null;
    totals.set(key, (totals.get(key) || 0) + t.amount);
  }

  return Array.from(totals.entries())
    .map(([categoryId, total]) => ({
      categoryId,
      category: categoryId ? (categoryById.get(categoryId)?.name ?? 'Uncategorised') : 'Uncategorised',
      total
    }))
    .sort((a, b) => b.total - a.total);
}

export async function getCategoryTotalsForMonth(yearMonth, accountId) {
  const [txns, categories] = await Promise.all([getTransactionsForMonth(yearMonth, accountId), getAll('categories')]);
  return groupTransactionsByCategory(txns, categories);
}

export async function getMonthSummary(yearMonth, accountId) {
  const txns = await getTransactionsForMonth(yearMonth, accountId);
  let expense = 0, income = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { expense, income, count: txns.length };
}

// Naive running total: initialBalance + every one of the account's
// transactions ever. This deliberately replaces the previous
// anchor-date-based calculation (per accounts spec decision) — simpler,
// revisit if it causes problems once there's real transaction history.
export async function getCurrentBalance(accountId) {
  const [accounts, txns] = await Promise.all([getAll('accounts'), getVisibleTransactions()]);
  const relevantAccounts = accountId ? accounts.filter(a => a.id === accountId) : accounts.filter(a => !a.isDeleted);
  const base = relevantAccounts.reduce((sum, a) => sum + (a.initialBalance || 0), 0);
  const relevantIds = new Set(relevantAccounts.map(a => a.id));
  const relevant = txns.filter(t => relevantIds.has(t.accountId));
  const net = relevant.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  return base + net;
}

export async function getYearToDate(year, accountId) {
  const all = await getVisibleTransactions();
  let expense = 0, income = 0;
  for (const t of all) {
    if (!t.date || !t.date.startsWith(String(year))) continue;
    if (accountId && t.accountId !== accountId) continue;
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  }
  return { expense, income };
}

// Most-used subcategories overall — powers the "top 3" quick-pick chips
// on the Add Expense screen. Counts by id (categoryId/subcategoryId),
// then resolves the current display names once at the end.
export async function getTopSubcategories(limit = 3) {
  const [all, categories] = await Promise.all([getVisibleTransactions(), getAll('categories')]);
  const counts = {};
  for (const t of all) {
    if (t.type !== 'expense' || !t.subcategoryId) continue;
    const key = t.categoryId + ' / ' + t.subcategoryId;
    counts[key] = (counts[key] || 0) + 1;
  }
  const categoryById = new Map(categories.map(c => [c.id, c]));
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => {
      const [categoryId, subcategoryId] = key.split(' / ');
      const category = categoryById.get(categoryId);
      const subcategory = category?.subcategories.find(s => s.id === subcategoryId);
      return { categoryId, subcategoryId, category: category?.name, subcategory: subcategory?.name };
    });
}

// Budget status with rollover: this month's available = this month's
// limit + last month's leftover (recursively, so a string of underspent
// months keeps accumulating). Computed at read time so it's always
// correct even if past transactions change.
//
// Performance note: fetches the full transaction list ONCE and does
// all month-filtering in memory across the recursion, rather than
// re-querying IndexedDB at every level. A category with years of
// history can recurse up to 24 levels — querying IndexedDB fresh each
// time (real async round-trips, not free) made the UI visibly lag;
// filtering an already-fetched array is effectively instant.
export async function computeBudgetStatus(categoryId, yearMonth) {
  const [budgets, allTxns, categories] = await Promise.all([getAll('budgets'), getVisibleTransactions(), getAll('categories')]);
  const budget = budgets.find(b => b.categoryId === categoryId);
  if (!budget) return null;
  const categoryName = categories.find(c => c.id === categoryId)?.name ?? '';

  const byMonth = {}; // yearMonth -> transactions, built once
  for (const t of allTxns) {
    const mk = monthKey(t.date);
    if (!mk) continue;
    (byMonth[mk] = byMonth[mk] || []).push(t);
  }

  function availableFor(ym) {
    const [y, m] = ym.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1); // m is 1-indexed; -2 => previous month
    const prevYm = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

    const txns = byMonth[ym] || [];
    const spent = txns.filter(t => t.categoryId === categoryId && t.type === 'expense')
                       .reduce((s, t) => s + t.amount, 0);

    // Never roll over from before the budget existed — otherwise a
    // brand-new budget "inherits" years of pre-budget underspend as
    // phantom rollover, which isn't a real leftover the person ever
    // had available to spend.
    const createdAt = budget.createdAt || yearMonth;
    if (ym < createdAt) return { limit: budget.monthlyLimit, spent, rolledIn: 0 };

    const monthsBack = (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - m);
    if (monthsBack > 24) return { limit: budget.monthlyLimit, spent, rolledIn: 0 };

    const hasPrevActivity = (byMonth[prevYm] || []).length > 0;
    let rolledIn = 0;
    if (hasPrevActivity && prevYm >= createdAt) {
      const prev = availableFor(prevYm);
      if (prev) rolledIn = Math.max(0, (prev.limit + prev.rolledIn) - prev.spent);
    }
    return { limit: budget.monthlyLimit, spent, rolledIn };
  }

  const result = availableFor(yearMonth);
  return {
    categoryId,
    category: categoryName,
    limit: result.limit,
    rolledIn: result.rolledIn,
    totalAvailable: result.limit + result.rolledIn,
    spent: result.spent,
    remaining: (result.limit + result.rolledIn) - result.spent
  };
}

// ---- categories -----------------------------------------------------------
// Referenced elsewhere by id (transactions.categoryId/subcategoryId,
// budgets.categoryId). Soft-deleted, like accounts — but unlike accounts,
// a soft-deleted category/subcategory does NOT hide its transactions from
// other views (see getVisibleTransactions and specs/categories.md
// requirement 8). Names aren't required unique. See specs/categories.md.

// A subcategory used to be a bare string, then {name, order}; it's now
// {id, name, order, isDeleted}. Accepts any of those shapes on the way
// in so rows that predate a given migration don't crash.
function normalizeSubs(subcategories) {
  return (subcategories || []).map((s, i) => {
    if (typeof s === 'string') return { id: genId('sub'), name: s, order: i, isDeleted: false };
    return { ...s, id: s.id || genId('sub'), order: s.order ?? i, isDeleted: s.isDeleted ?? false };
  });
}

// Rows that predate ordering/soft-delete have no `order` (categories), or
// subcategories missing `order`/`id`/`isDeleted`. Assigns `order` from
// each category's current alphabetical position within its type (so
// nothing visually jumps the first time this runs), normalizes
// subcategory shape, then writes back only the rows that actually
// changed — a no-op on every later call. Called from
// getCategoriesSorted/moveCategory/moveSubcategory rather than as a
// separate boot-time migration step.
async function ensureCategoryOrdering() {
  const all = await getAll('categories');

  const byType = {};
  for (const c of all) (byType[c.type] ??= []).push(c);

  const toWrite = [];
  for (const group of Object.values(byType)) {
    const maxOrder = group.reduce((m, c) => (c.order != null ? Math.max(m, c.order) : m), -1);
    const missing = group.filter(c => c.order == null).sort((a, b) => a.name.localeCompare(b.name));
    missing.forEach((c, i) => {
      c.order = maxOrder + 1 + i;
      toWrite.push(c);
    });
  }

  for (const c of all) {
    const needsNormalizing = (c.subcategories || []).some(s => typeof s === 'string' || s.id == null || s.isDeleted == null);
    if (needsNormalizing) {
      c.subcategories = normalizeSubs(c.subcategories);
      if (!toWrite.includes(c)) toWrite.push(c);
    }
    if (c.isDeleted == null) {
      c.isDeleted = false;
      if (!toWrite.includes(c)) toWrite.push(c);
    }
  }

  if (toWrite.length) await putMany('categories', toWrite);
  return all;
}

// IndexedDB's getAll() returns rows in key order (lexical string sort:
// "cat_10" sorts before "cat_2"), which scrambles category lists in the
// UI. This returns active categories (and each one's active
// subcategories) sorted by `order`, for anywhere the order is
// user-visible (category pickers, budget dropdowns, the Categories
// screen) — soft-deleted rows are excluded here but still resolvable via
// getAll('categories') for anything reading a transaction's category by id.
export async function getCategoriesSorted(type) {
  const all = await ensureCategoryOrdering();
  const filtered = all.filter(c => !c.isDeleted && (!type || c.type === type));
  for (const c of filtered) {
    c.subcategories = c.subcategories.filter(s => !s.isDeleted).sort((a, b) => a.order - b.order);
  }
  return filtered.sort((a, b) => a.order - b.order);
}

export async function createCategory({ name, type, subcategories = [] }) {
  const all = await getAll('categories');
  const maxOrder = all.reduce((m, c) => (c.type === type && c.order != null ? Math.max(m, c.order) : m), -1);
  const category = {
    id: genId('cat'), name, type, order: maxOrder + 1, isDeleted: false,
    subcategories: normalizeSubs(subcategories)
  };
  await put('categories', category);
  return category;
}

export async function updateCategory(id, fields) {
  const existing = await get('categories', id);
  return put('categories', { ...existing, ...fields });
}

export async function softDeleteCategory(id) {
  return updateCategory(id, { isDeleted: true });
}

// Swaps `order` with the category's neighbor within its own (non-deleted)
// type group — moving a category never crosses between Income and
// Expense, and never swaps with a hidden, soft-deleted one. A no-op at
// either edge of the group.
export async function moveCategory(id, direction) {
  const all = await ensureCategoryOrdering();
  const category = all.find(c => c.id === id);
  if (!category) return;
  const group = all.filter(c => c.type === category.type && !c.isDeleted).sort((a, b) => a.order - b.order);
  const idx = group.findIndex(c => c.id === id);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= group.length) return;
  const other = group[swapIdx];
  [category.order, other.order] = [other.order, category.order];
  await putMany('categories', [category, other]);
}

// Same idea as moveCategory, but within one category's (non-deleted)
// subcategory list.
export async function moveSubcategory(categoryId, subcategoryId, direction) {
  const all = await ensureCategoryOrdering();
  const category = all.find(c => c.id === categoryId);
  if (!category) return;
  const sorted = category.subcategories.filter(s => !s.isDeleted).sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex(s => s.id === subcategoryId);
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const a = sorted[idx], b = sorted[swapIdx];
  [a.order, b.order] = [b.order, a.order];
  await put('categories', category);
}

export async function addSubcategory(id, name) {
  const category = await get('categories', id);
  const subs = normalizeSubs(category.subcategories);
  const maxOrder = subs.reduce((m, s) => Math.max(m, s.order ?? -1), -1);
  const updated = [...subs, { id: genId('sub'), name, order: maxOrder + 1, isDeleted: false }];
  return put('categories', { ...category, subcategories: updated });
}

export async function renameSubcategory(categoryId, subcategoryId, newName) {
  const category = await get('categories', categoryId);
  const subcategories = normalizeSubs(category.subcategories).map(s => (s.id === subcategoryId ? { ...s, name: newName } : s));
  return put('categories', { ...category, subcategories });
}

export async function softDeleteSubcategory(categoryId, subcategoryId) {
  const category = await get('categories', categoryId);
  const subcategories = normalizeSubs(category.subcategories).map(s => (s.id === subcategoryId ? { ...s, isDeleted: true } : s));
  return put('categories', { ...category, subcategories });
}

export async function exportCategories() {
  return { categories: await getAll('categories') };
}

// Full replace, not merge — matches importAll()'s existing precedent.
// No uniqueness validation: names don't need to be unique.
export async function importCategories(list) {
  const withIds = list.map(c => ({
    ...c,
    id: c.id || genId('cat'),
    isDeleted: c.isDeleted ?? false,
    subcategories: normalizeSubs(c.subcategories)
  }));
  await clearStore('categories');
  await putMany('categories', withIds);
}

// Boot-time default categories, scoped to just this store — mirrors
// ensureDefaultAccount(), not the old whole-app ensureSeeded().
export async function ensureDefaultCategories() {
  const all = await getAll('categories');
  if (all.length > 0) return;
  const res = await fetch(import.meta.env.BASE_URL + 'data/default-categories.json');
  const data = await res.json();
  await putMany('categories', data.categories);
}

// Recurring rules (the `recurring` store) are just a schedule/label —
// the actual historical entries are plain rows in `transactions`,
// linked only by convention via note === 'Repeating:<description>'.
// Editing a rule's type/category doesn't touch those past rows on its
// own, so when a rule was migrated wrong (e.g. a salary imported as an
// expense), this brings every linked transaction in line with the fix.
export async function updateRecurringInstances(oldNote, newNote, fields) {
  const all = await getAll('transactions');
  const matches = all.filter(t => t.note === oldNote);
  if (!matches.length) return 0;
  await putMany('transactions', matches.map(t => ({ ...t, ...fields, note: newNote })));
  return matches.length;
}
