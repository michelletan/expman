/*
  DATA/DB.JS
  ----------
  Every component reads and writes data through the functions exported here; 
  none of them should call indexedDB.* themselves. 

  Object stores:
    transactions  - one row per expense/income entry, linked to an
                    account via accountId (not account name)
    categories    - {id, name, type, subcategories: [string]}
    accounts      - {id, name, description, initialBalance, dateCreated,
                     isDeleted}  (soft-deleted accounts and their
                     transactions are hidden from every in-app view but
                     kept for exportAll() — see getVisibleTransactions)
    budgets       - {id, category, monthlyLimit}  (per-category, rollover
                     is CALCULATED at read time, not stored — see
                     computeBudgetStatus below)
    recurring     - repeating transaction rules, linked to an account via
                    accountId
    cards         - {id, name, last4, color, cycleStartDay}
    meta          - plain key/value settings (theme, lastSyncedAt, ...)
*/

import { genId, todayISO } from './format.js';

const DB_NAME = 'expman-db';
const DB_VERSION = 1;
const STORES = ['transactions', 'categories', 'accounts', 'budgets', 'recurring', 'cards', 'meta'];

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
// exportAll()) even though it disappears from every in-app view.

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
// directly instead, so a full backup still contains everything.
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
// on the Add Expense screen.
export async function getTopSubcategories(limit = 3) {
  const all = await getVisibleTransactions();
  const counts = {};
  for (const t of all) {
    if (t.type !== 'expense' || !t.subcategory) continue;
    const key = t.category + ' / ' + t.subcategory;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => {
      const [category, subcategory] = key.split(' / ');
      return { category, subcategory };
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
export async function computeBudgetStatus(category, yearMonth) {
  const [budgets, allTxns] = await Promise.all([getAll('budgets'), getVisibleTransactions()]);
  const budget = budgets.find(b => b.category === category);
  if (!budget) return null;

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
    const spent = txns.filter(t => t.category === category && t.type === 'expense')
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
    category,
    limit: result.limit,
    rolledIn: result.rolledIn,
    totalAvailable: result.limit + result.rolledIn,
    spent: result.spent,
    remaining: (result.limit + result.rolledIn) - result.spent
  };
}

// IndexedDB's getAll() returns rows in key order (lexical string sort:
// "cat_10" sorts before "cat_2"), which scrambles category lists in
// the UI. This returns them sorted by name instead, for anywhere the
// order is user-visible (category pickers, budget dropdowns).
export async function getCategoriesSorted(type) {
  const all = await getAll('categories');
  const filtered = type ? all.filter(c => c.type === type) : all;
  return filtered.sort((a, b) => a.name.localeCompare(b.name));
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
