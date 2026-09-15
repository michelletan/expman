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
                    recurringId links an auto-posted row back to the rule
                    that generated it (null for manually-entered ones) —
                    see recurring below.
    categories    - {id, name, type, order, isDeleted, color,
                     subcategories: [{id, name, order, isDeleted}]}.
                     Soft-deleted categories/subcategories drop out of
                     every list but the row survives so old transactions
                     keep resolving correctly — see getCategoriesSorted.
                     Note: unlike accounts, a soft-deleted category does
                     NOT hide its transactions from other views (see
                     getVisibleTransactions). `color` is a hex string
                     from CATEGORY_COLORS in format.js.
    accounts      - {id, name, description, initialBalance, dateCreated,
                     isDeleted}  (soft-deleted accounts and their
                     transactions are hidden from every in-app view but
                     kept for exportAll() — see getVisibleTransactions).
    budgets       - {id, name, accountId, categoryId, subcategoryId,
                     amount, isRollover, startDate, endDate}. Monthly
                     only for now — see specs/budgets.md. Per-account
                     (amended from an earlier account-agnostic design —
                     see specs/budgets.md's amendment note): spend is
                     computed only from that account's transactions, same
                     scoping as Home/Activity/Reports. subcategoryId is
                     null for a category-level budget; a category and one
                     of its subcategories can each have their own budget
                     at once (on the same account), and a subcategory's
                     spend counts toward both. Rollover is CALCULATED at
                     read time, not stored — see computeBudgetStatus
                     below. Hard delete: nothing references a budget's id
                     elsewhere.
    recurring     - repeating transaction rules, linked to an account and
                    a category by id, same as transactions. frequency is
                    daily/weekly/monthly/annual; monthly/annual store a
                    dayOfMonth (1-31, and anchorMonth for annual)
                    decoupled from startDate so clamping to a short month
                    doesn't permanently shift later occurrences. endMode
                    is 'date'/'count'/'never'. Occurrences are computed
                    on demand (nthOccurrenceDate), never pre-generated —
                    see materializeRecurring/materializeAllRecurring.
    cards         - {id, name, resetDate, targetSpend: [{categoryId,
                    amount}], isDeleted, dateCreated}  soft-deleted, no
                    uniqueness/cascade — see specs/cards.md
    meta          - plain key/value settings (theme, lastSyncedAt, ...)
*/

import { genId, todayISO, CATEGORY_COLORS, UNCATEGORISED_COLOR, lastDayOfMonth } from './format.js';

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
 *   categoryId?: string|null, subcategoryId?: string|null, paymentMethod?: string|null, date?: string,
 *   recurringId?: string|null }} fields
 */
export async function createTransaction({
  accountId, amount, type, description = '', categoryId = null, subcategoryId = null,
  paymentMethod = null, date = todayISO(), recurringId = null
}) {
  const now = new Date().toISOString();
  const transaction = {
    id: genId('txn'),
    accountId, amount: Number(amount) || 0, type, description,
    categoryId, subcategoryId: categoryId ? subcategoryId : null,
    paymentMethod: type === 'expense' ? (paymentMethod || 'cash') : null,
    date, recurringId,
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
    .map(([categoryId, total]) => {
      const category = categoryId ? categoryById.get(categoryId) : null;
      return {
        categoryId,
        category: category?.name ?? 'Uncategorised',
        color: category?.color ?? UNCATEGORISED_COLOR,
        total
      };
    })
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

// Most-used subcategories — powers the "top 3" quick-pick chips on the
// Add Expense screen (all-time, no args — unchanged) and, with
// yearMonth/accountId given, Reports' top-subcategories-by-SPEND chart
// (specs/reports.md requirement 7 — ranked by amount there, not count,
// hence the separate `amount` accumulator below always being tracked
// even though the quick-pick chips only ever sort by count).
export async function getTopSubcategories(limit = 3, yearMonth = null, accountId = null) {
  const [rawTxns, categories] = await Promise.all([
    yearMonth ? getTransactionsForMonth(yearMonth, accountId) : getVisibleTransactions(),
    getAll('categories')
  ]);
  const all = (!yearMonth && accountId) ? rawTxns.filter(t => t.accountId === accountId) : rawTxns;

  const counts = {};
  const amounts = {};
  for (const t of all) {
    if (t.type !== 'expense' || !t.subcategoryId) continue;
    const key = t.categoryId + ' / ' + t.subcategoryId;
    counts[key] = (counts[key] || 0) + 1;
    amounts[key] = (amounts[key] || 0) + t.amount;
  }
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const rankBy = yearMonth ? amounts : counts; // by spend when scoped to a month (Reports), by frequency otherwise (quick-pick chips)
  return Object.entries(rankBy)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => {
      const [categoryId, subcategoryId] = key.split(' / ');
      const category = categoryById.get(categoryId);
      const subcategory = category?.subcategories.find(s => s.id === subcategoryId);
      return {
        categoryId, subcategoryId, category: category?.name, subcategory: subcategory?.name,
        amount: amounts[key]
      };
    });
}

// Total income + expense per month across a whole year, in one pass over
// transactions — powers Reports' monthly trend and income-vs-expense
// charts together (specs/reports.md requirements 4-5), rather than
// querying per month (12 round trips) or per chart (duplicate scans).
export async function getYearlyTrend(year, accountId) {
  const all = await getVisibleTransactions();
  const income = new Array(12).fill(0);
  const expense = new Array(12).fill(0);
  for (const t of all) {
    if (!t.date || !t.date.startsWith(String(year))) continue;
    if (accountId && t.accountId !== accountId) continue;
    const monthIdx = Number(t.date.slice(5, 7)) - 1;
    if (t.type === 'income') income[monthIdx] += t.amount;
    else expense[monthIdx] += t.amount;
  }
  return { income, expense };
}

// Budget status with rollover: this month's available = this month's
// amount + last month's leftover (recursively, so a string of underspent
// months keeps accumulating) — only when budget.isRollover is true;
// otherwise available is always just that month's own amount. Computed
// at read time so it's always correct even if past transactions change.
// Takes the budget row directly (not a categoryId lookup) since v1 allows
// a category AND one of its subcategories to each have their own budget
// — see specs/budgets.md requirements 5-6.
//
// Performance note: fetches the full transaction list ONCE and does
// all month-filtering in memory across the recursion, rather than
// re-querying IndexedDB at every level. A category with years of
// history can recurse up to 24 levels — querying IndexedDB fresh each
// time (real async round-trips, not free) made the UI visibly lag;
// filtering an already-fetched array is effectively instant.
export async function computeBudgetStatus(budget, yearMonth) {
  const [allTxns, categories] = await Promise.all([getVisibleTransactions(), getAll('categories')]);
  const category = categories.find(c => c.id === budget.categoryId);
  const subcategory = budget.subcategoryId ? category?.subcategories.find(s => s.id === budget.subcategoryId) : null;
  const label = category ? (subcategory ? `${category.name} / ${subcategory.name}` : category.name) : 'Unknown';

  const byMonth = {}; // yearMonth -> transactions, built once
  for (const t of allTxns) {
    const mk = monthKey(t.date);
    if (!mk) continue;
    (byMonth[mk] = byMonth[mk] || []).push(t);
  }

  // A subcategory budget's spend is that subcategory only; a category
  // budget's spend is every expense under it regardless of subcategory —
  // so a subcategory's spend deliberately counts toward both when both
  // have a budget (specs/budgets.md requirement 6). Also scoped to the
  // budget's own account (requirement 1a) — same account-per-budget
  // model Home/Activity/Reports already use.
  function spentFor(ym) {
    const txns = byMonth[ym] || [];
    return txns
      .filter(t => t.type === 'expense' && t.accountId === budget.accountId && (
        budget.subcategoryId ? t.subcategoryId === budget.subcategoryId : t.categoryId === budget.categoryId
      ))
      .reduce((s, t) => s + t.amount, 0);
  }

  const startYm = monthKey(budget.startDate);

  function availableFor(ym) {
    const spent = spentFor(ym);
    if (!budget.isRollover) return { spent, rolledIn: 0 };

    // Never roll over from before (or into) the budget's own start month
    // — otherwise a brand-new budget "inherits" years of pre-budget
    // underspend as phantom rollover, which isn't a real leftover the
    // person ever had available to spend.
    if (ym <= startYm) return { spent, rolledIn: 0 };

    const [y, m] = ym.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1); // m is 1-indexed; -2 => previous month
    const prevYm = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
    if (prevYm < startYm) return { spent, rolledIn: 0 };

    const monthsBack = (new Date().getFullYear() - y) * 12 + (new Date().getMonth() + 1 - m);
    if (monthsBack > 24) return { spent, rolledIn: 0 };

    const hasPrevActivity = (byMonth[prevYm] || []).length > 0;
    let rolledIn = 0;
    if (hasPrevActivity) {
      const prev = availableFor(prevYm);
      rolledIn = Math.max(0, (budget.amount + prev.rolledIn) - prev.spent);
    }
    return { spent, rolledIn };
  }

  const result = availableFor(yearMonth);
  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    subcategoryId: budget.subcategoryId,
    category: label,
    limit: budget.amount,
    rolledIn: result.rolledIn,
    totalAvailable: budget.amount + result.rolledIn,
    spent: result.spent,
    remaining: (budget.amount + result.rolledIn) - result.spent
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

// Rows that predate ordering/soft-delete/color have no `order` (or
// `color`) on the category, or subcategories missing `order`/`id`/
// `isDeleted`. Assigns `order` from each category's current alphabetical
// position within its type (so nothing visually jumps the first time
// this runs), a palette `color`, normalizes subcategory shape, then
// writes back only the rows that actually changed — a no-op on every
// later call. Exported so App.svelte can also run it once at boot
// (alongside ensureDefaultCategories()) — some reads (resolving a
// transaction's category for display, budgets, Card Details) go through
// plain getAll('categories') rather than getCategoriesSorted, and would
// otherwise see un-migrated rows until something happens to call
// getCategoriesSorted first.
export async function ensureCategoryOrdering() {
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

  all.forEach((c, i) => {
    const needsNormalizing = (c.subcategories || []).some(s => typeof s === 'string' || s.id == null || s.isDeleted == null);
    if (needsNormalizing) {
      c.subcategories = normalizeSubs(c.subcategories);
      if (!toWrite.includes(c)) toWrite.push(c);
    }
    if (c.isDeleted == null) {
      c.isDeleted = false;
      if (!toWrite.includes(c)) toWrite.push(c);
    }
    if (!c.color) {
      c.color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
      if (!toWrite.includes(c)) toWrite.push(c);
    }
  });

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

export async function createCategory({ name, type, subcategories = [], color }) {
  const all = await getAll('categories');
  const maxOrder = all.reduce((m, c) => (c.type === type && c.order != null ? Math.max(m, c.order) : m), -1);
  const category = {
    id: genId('cat'), name, type, order: maxOrder + 1, isDeleted: false,
    color: color || CATEGORY_COLORS[all.length % CATEGORY_COLORS.length],
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

// ---- cards ------------------------------------------------------------
// Soft-delete, same shape as accounts — but no uniqueness check and no
// rename-cascade. targetSpend entries reference a category by id,
// resolved live like everything else. Actual spend is linked via
// transactions.paymentMethod (set to a card's id by Payment Picker —
// see specs/transactions.md requirement 4), not a separate cardId field —
// see getCardSpendSummary below.

export async function getCards() {
  const all = await getAll('cards');
  return all.filter(c => !c.isDeleted);
}

export async function getCard(id) {
  return get('cards', id);
}

/** @param {{ name: string, resetDate: number, targetSpend?: {categoryId: string, amount: number}[] }} fields */
export async function createCard({ name, resetDate, targetSpend = [] }) {
  const card = {
    id: genId('card'), name, resetDate: Number(resetDate),
    targetSpend, isDeleted: false, dateCreated: todayISO()
  };
  await put('cards', card);
  return card;
}

export async function updateCard(id, fields) {
  const existing = await get('cards', id);
  return put('cards', { ...existing, ...fields });
}

export async function softDeleteCard(id) {
  return updateCard(id, { isDeleted: true });
}

// Total spend + spend broken down by categoryId for one card's current
// period — powers the Cards list total, Card Details' per-category
// breakdown, and Home's card preview, all from a single pass over
// transactions rather than a query per category.
export async function getCardSpendSummary(cardId, period) {
  const txns = await getVisibleTransactions();
  const inPeriod = txns.filter(t =>
    t.type === 'expense' && t.paymentMethod === cardId && t.date >= period.start && t.date <= period.end
  );
  const byCategory = {};
  let total = 0;
  for (const t of inPeriod) {
    total += t.amount;
    if (t.categoryId) byCategory[t.categoryId] = (byCategory[t.categoryId] || 0) + t.amount;
  }
  return { total, byCategory };
}

// ---- budgets ------------------------------------------------------------
// See specs/budgets.md. Hard delete (like transactions) — nothing else
// references a budget's id.

export async function getBudgets() {
  return getAll('budgets');
}

export async function getBudget(id) {
  return get('budgets', id);
}

/**
 * @param {{ name: string, accountId: string, categoryId: string, subcategoryId?: string|null, amount: number,
 *   isRollover?: boolean, startDate?: string, endDate?: string|null }} fields
 */
export async function createBudget({
  name, accountId, categoryId, subcategoryId = null, amount, isRollover = true,
  startDate = todayISO(), endDate = null
}) {
  const now = new Date().toISOString();
  const budget = {
    id: genId('bud'), name, accountId, categoryId, subcategoryId, amount: Number(amount) || 0,
    isRollover, startDate, endDate: endDate || null,
    createdAt: now, modifiedAt: now
  };
  await put('budgets', budget);
  return budget;
}

export async function updateBudget(id, fields) {
  const existing = await get('budgets', id);
  return put('budgets', { ...existing, ...fields, modifiedAt: new Date().toISOString() });
}

export async function removeBudget(id) {
  return remove('budgets', id);
}

// A budget is active for a month when that month falls within
// [startDate's month, endDate's month or unbounded] (specs/budgets.md
// requirement 8) — used by Home's snapshot and the Budgets screen so an
// ended or not-yet-started budget doesn't show for months outside its
// own range.
function isBudgetActiveForMonth(budget, yearMonth) {
  if (yearMonth < monthKey(budget.startDate)) return false;
  if (budget.endDate && yearMonth > monthKey(budget.endDate)) return false;
  return true;
}

export async function getBudgetsActiveForMonth(yearMonth, accountId) {
  const budgets = await getBudgets();
  const active = budgets.filter(b => isBudgetActiveForMonth(b, yearMonth) && (!accountId || b.accountId === accountId));
  return Promise.all(active.map(b => computeBudgetStatus(b, yearMonth)));
}

// ---- recurring ------------------------------------------------------------
// See specs/recurring.md. A rule never pre-generates future rows — only
// occurrences up to today ever become real `transactions` (linked via
// transactions.recurringId), so cancelling or shortening a rule needs no
// cleanup: the never-materialized future occurrences simply never existed.

function isoDate(year, month1Indexed, day) {
  return `${year}-${String(month1Indexed).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Occurrence index n (0-based; n=0 is rule.startDate itself) resolved to a
// real calendar date. Monthly/annual re-derive the day from
// dayOfMonth/anchorMonth every time (clamped via lastDayOfMonth) instead
// of walking forward from startDate, so a short month doesn't permanently
// shift every later occurrence — this is what lets day 31 correctly land
// on the 31st again in December after clamping to the 30th in November.
export function nthOccurrenceDate(rule, n) {
  const [sy, sm, sd] = rule.startDate.split('-').map(Number);
  if (rule.frequency === 'daily') {
    const d = new Date(sy, sm - 1, sd + n);
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (rule.frequency === 'weekly') {
    const d = new Date(sy, sm - 1, sd + n * 7);
    return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (rule.frequency === 'monthly') {
    const total = (sm - 1) + n;
    const year = sy + Math.floor(total / 12);
    const month = (((total % 12) + 12) % 12) + 1;
    const day = Math.min(rule.dayOfMonth, lastDayOfMonth(year, month));
    return isoDate(year, month, day);
  }
  // annual
  const year = sy + n;
  const day = Math.min(rule.dayOfMonth, lastDayOfMonth(year, rule.anchorMonth));
  return isoDate(year, rule.anchorMonth, day);
}

export function isRecurringActive(rule, materializedCount) {
  if (rule.isDeleted) return false;
  if (rule.endMode === 'count') return materializedCount < rule.occurrenceCount;
  if (rule.endMode === 'date') return nthOccurrenceDate(rule, materializedCount) <= rule.endDate;
  return true; // 'never'
}

// Every rule annotated with its live-computed materializedCount/active/
// nextDueDate (specs/recurring.md requirement 11) — nothing here is
// stored, so it's always correct even if past transactions changed.
export async function getRecurringRules() {
  const [all, txns] = await Promise.all([getAll('recurring'), getAll('transactions')]);
  const countByRule = new Map();
  for (const t of txns) {
    if (t.recurringId) countByRule.set(t.recurringId, (countByRule.get(t.recurringId) || 0) + 1);
  }
  return all.filter(r => !r.isDeleted).map(r => {
    const materializedCount = countByRule.get(r.id) || 0;
    const active = isRecurringActive(r, materializedCount);
    return { ...r, materializedCount, active, nextDueDate: active ? nthOccurrenceDate(r, materializedCount) : null };
  });
}

export async function getRecurringRule(id) {
  return get('recurring', id);
}

/**
 * @param {{ accountId: string, categoryId?: string|null, subcategoryId?: string|null,
 *   type: string, amount: number, description?: string, paymentMethod?: string|null,
 *   frequency: string, startDate: string, dayOfMonth?: number|null, anchorMonth?: number|null,
 *   endMode: string, endDate?: string|null, occurrenceCount?: number|null }} fields
 */
export async function createRecurring({
  accountId, categoryId = null, subcategoryId = null, type, amount, description = '',
  paymentMethod = null, frequency, startDate, dayOfMonth = null, anchorMonth = null,
  endMode, endDate = null, occurrenceCount = null
}) {
  const [, sm] = startDate.split('-').map(Number);
  const now = new Date().toISOString();
  const rule = {
    id: genId('rec'), accountId, categoryId, subcategoryId, type, amount: Number(amount) || 0,
    description, paymentMethod: type === 'expense' ? (paymentMethod || 'cash') : null,
    frequency, startDate,
    dayOfMonth: (frequency === 'monthly' || frequency === 'annual') ? Number(dayOfMonth) : null,
    anchorMonth: frequency === 'annual' ? (anchorMonth || sm) : null,
    endMode, endDate: endMode === 'date' ? endDate : null,
    occurrenceCount: endMode === 'count' ? Number(occurrenceCount) : null,
    isDeleted: false, createdAt: now, modifiedAt: now
  };
  await put('recurring', rule);
  await materializeRecurring(rule.id);
  return rule;
}

// applyToAll (specs/recurring.md requirement 7): when true, every
// already-materialized transaction linked to this rule is overwritten to
// match the new display fields too, not just future occurrences. Schedule
// fields (frequency/dates/endMode/...) never need this — they only ever
// affect what materializes next.
export async function updateRecurring(id, fields, applyToAll = false) {
  const existing = await get('recurring', id);
  const updated = { ...existing, ...fields, modifiedAt: new Date().toISOString() };
  await put('recurring', updated);

  if (applyToAll) {
    const txns = await getAll('transactions');
    const linked = txns.filter(t => t.recurringId === id);
    if (linked.length) {
      const now = new Date().toISOString();
      await putMany('transactions', linked.map(t => ({
        ...t,
        accountId: updated.accountId, categoryId: updated.categoryId, subcategoryId: updated.subcategoryId,
        amount: updated.amount, description: updated.description,
        paymentMethod: updated.paymentMethod, type: updated.type,
        modifiedAt: now
      })));
    }
  }

  await materializeRecurring(id);
  return updated;
}

// Stops future occurrences but keeps the rule visible in the Completed
// section rather than soft-deleting it — modeled as reaching its
// count-based end right now, so there's no separate "cancelled" flag
// (specs/recurring.md requirement 9). Past transactions are untouched.
export async function cancelRecurring(id) {
  const txns = await getAll('transactions');
  const materializedCount = txns.filter(t => t.recurringId === id).length;
  return updateRecurring(id, { endMode: 'count', occurrenceCount: materializedCount });
}

export async function softDeleteRecurring(id) {
  const existing = await get('recurring', id);
  return put('recurring', { ...existing, isDeleted: true, modifiedAt: new Date().toISOString() });
}

// Materializes every occurrence up to (and including) today that hasn't
// posted yet — catching up on all of them if the app wasn't opened for a
// while, not just the latest (specs/recurring.md requirement 4). Called
// after a rule is created/saved, and looped over every rule at boot by
// materializeAllRecurring below.
export async function materializeRecurring(ruleId) {
  const rule = await get('recurring', ruleId);
  if (!rule || rule.isDeleted) return 0;

  const today = todayISO();
  const allTxns = await getAll('transactions');
  let n = allTxns.filter(t => t.recurringId === ruleId).length;
  let created = 0;

  while (true) {
    if (rule.endMode === 'count' && n >= rule.occurrenceCount) break;
    const date = nthOccurrenceDate(rule, n);
    if (date > today) break;
    if (rule.endMode === 'date' && date > rule.endDate) break;

    await createTransaction({
      accountId: rule.accountId, amount: rule.amount, type: rule.type,
      description: rule.description, categoryId: rule.categoryId, subcategoryId: rule.subcategoryId,
      paymentMethod: rule.paymentMethod, date, recurringId: ruleId
    });
    n++;
    created++;
  }
  return created;
}

export async function materializeAllRecurring() {
  const rules = await getAll('recurring');
  for (const rule of rules) {
    if (rule.isDeleted) continue;
    await materializeRecurring(rule.id);
  }
}
