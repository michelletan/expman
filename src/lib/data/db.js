/*
  DATA/DB.JS
  ----------
  The only file that talks to IndexedDB directly — ported 1:1 from the
  original app's js/db.js, just as plain ES module exports instead of
  window.DB. Every component reads and writes data through the
  functions exported here; none of them should call indexedDB.*
  themselves. That keeps storage concerns in one place if you ever
  want to swap IndexedDB for something else, or add a sync hook (see
  the future data/sync.js).

  Object stores:
    transactions  - one row per expense/income entry
    categories    - {id, name, type, subcategories: [string]}
    accounts      - {id, name, currency, initialBalance, type}
    budgets       - {id, category, monthlyLimit}  (per-category, rollover
                     is CALCULATED at read time, not stored — see
                     computeBudgetStatus below)
    recurring     - migrated recurring rules (see public/data/seed.json)
    cards         - {id, name, last4, color, cycleStartDay}
    meta          - plain key/value settings (theme, lastSyncedAt, ...)
*/

const DB_NAME = 'expman-db';
const DB_VERSION = 1;
const STORES = ['transactions', 'categories', 'accounts', 'budgets', 'recurring', 'cards', 'meta'];

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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

// ---- backup / restore ----------------------------------------------------
// Same JSON shape a future data/sync.js would push to Drive — a local
// file backup and a cloud sync are just two different transports for
// the same snapshot.

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

// ---- first-run seeding --------------------------------------------------

export async function isEmpty() {
  const txns = await getAll('transactions');
  return txns.length === 0;
}

export async function seedFromJSON(seed) {
  await putMany('categories', seed.categories);
  await putMany('accounts', seed.accounts);
  await putMany('transactions', seed.transactions);
  await putMany('recurring', seed.recurring);
  await putMany('cards', seed.cards);
  if (seed.budgets && seed.budgets.length) await putMany('budgets', seed.budgets);
  const metaStore = await tx('meta', 'readwrite');
  await promisify(metaStore.put({ id: 'preferences', value: seed.preferences }));
  await promisify(metaStore.put({ id: 'seededAt', value: new Date().toISOString() }));
}

// Boots the DB and seeds it from public/data/seed.json on first run.
// This replaces the boot() responsibility that used to live in
// app.js — call it once, at the app root, before rendering anything
// that reads from the DB.
export async function ensureSeeded() {
  await openDB();
  if (await isEmpty()) {
    const res = await fetch(import.meta.env.BASE_URL + 'data/seed.json');
    const seed = await res.json();
    await seedFromJSON(seed);
  }
}

// ---- meta (settings) helpers --------------------------------------------

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

export async function getTransactionsForMonth(yearMonth, accountName) {
  const all = await getAll('transactions');
  return all.filter(t => monthKey(t.date) === yearMonth && (!accountName || t.account === accountName));
}

export async function getMonthSummary(yearMonth, accountName) {
  const txns = await getTransactionsForMonth(yearMonth, accountName);
  let expense = 0, income = 0;
  for (const t of txns) {
    if (t.type === 'income') income += t.amount;
    else expense += t.amount;
  }
  return { expense, income, count: txns.length };
}

// Balance is anchored at the migration date, not reconstructed from
// years of category transactions. Why: this app (like the one it
// replaces) tracks spending by category accurately, but doesn't fully
// double-entry every transfer/income — so summing years of expense-only
// history against a $0 starting point drifts wildly negative. Set each
// account's real current balance in Accounts once (defaults to 0 until
// you do), and only transactions dated AFTER the migration affect it
// from then on.
export async function getCurrentBalance(accountName) {
  const [accounts, txns, anchor] = await Promise.all([
    getAll('accounts'), getAll('transactions'), getMeta('balanceAnchorDate', null)
  ]);
  const relevantAccounts = accountName ? accounts.filter(a => a.name === accountName) : accounts;
  const base = relevantAccounts.reduce((sum, a) => sum + (a.initialBalance || 0), 0);
  const byAccount = accountName ? txns.filter(t => t.account === accountName) : txns;
  const relevant = anchor ? byAccount.filter(t => t.date && t.date > anchor) : byAccount;
  const net = relevant.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
  return base + net;
}

export async function getYearToDate(year, accountName) {
  const all = await getAll('transactions');
  let expense = 0, income = 0;
  for (const t of all) {
    if (!t.date || !t.date.startsWith(String(year))) continue;
    if (accountName && t.account !== accountName) continue;
    if (t.type === 'income') income += t.amount; else expense += t.amount;
  }
  return { expense, income };
}

// Most-used subcategories overall — powers the "top 3" quick-pick chips
// on the Add Expense screen.
export async function getTopSubcategories(limit = 3) {
  const all = await getAll('transactions');
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
  const [budgets, allTxns] = await Promise.all([getAll('budgets'), getAll('transactions')]);
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
