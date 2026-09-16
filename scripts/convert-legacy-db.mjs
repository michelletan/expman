#!/usr/bin/env node
// One-time, dev-only conversion of the legacy "Expense Manager" SQLite
// export into a full, real JSON backup in expman's own shape (see
// specs/import-export.md). NOT part of the shipped app — run this
// manually, then import the output through Settings > Backup.
//
// A full, unfiltered conversion of everything in the source, including
// real income — confirmed with the user, reversing this script's
// original "sanitized sample, exclude anything sensitive" design.
//
// Usage: node scripts/convert-legacy-db.mjs
//
// Reads:  data/2026-09-16_Expense Manager.db (gitignored, not shipped)
// Writes: data/sample-import.json (gitignored, not shipped)

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { genId, CATEGORY_COLORS } from '../src/lib/data/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', '2026-09-16_Expense Manager.db');
const OUT_PATH = path.join(__dirname, '..', 'data', 'sample-import.json');

function q(sql) {
  const out = execFileSync('sqlite3', [DB_PATH, '.mode json', sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : [];
}

function epochToISODate(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// ---- accounts -------------------------------------------------------------

const sourceAccounts = q('select name from expense_account');
/** @type {Record<string, string>} */
const accountIdByName = {};
const accounts = sourceAccounts.map(({ name }) => {
  const id = genId('acct');
  accountIdByName[name] = id;
  return { id, name, description: '', initialBalance: 0, dateCreated: todayISO(), isDeleted: false };
});
const defaultAccountId = accountIdByName['Personal Expense'] ?? accounts[0]?.id;

// ---- categories -------------------------------------------------------------
// Every source category, unfiltered — plus a handful used by real rows
// but absent from expense_category itself (Mum/Treats have no
// meaningful subcategory of their own in the source; School and Income
// do, so those are given their real ones instead of being dropped).

const sourceCategories = q('select category, subcategory from expense_category');
const EXTRA_CATEGORIES = [
  { name: 'School', subNames: ['Tuition', 'Textbooks', 'Other'], type: 'expense' },
  { name: 'Mum', subNames: [], type: 'expense' },
  { name: 'Treats', subNames: [], type: 'expense' },
  { name: 'Income', subNames: ['Salary', 'Scholarship', 'Part-time work', 'Personal Savings', 'Cashback/Rebates', 'Windfall'], type: 'income' }
];

/** @type {Record<string, {id: string, subIdByName: Record<string,string>}>} */
const categoryIndex = {};
const categories = [];

function addCategory(name, subNames, order, type = 'expense') {
  const id = genId('cat');
  const subIdByName = {};
  const subcategories = subNames.filter(Boolean).map((subName, i) => {
    const subId = genId('sub');
    subIdByName[subName] = subId;
    return { id: subId, name: subName, order: i, isDeleted: false };
  });
  categoryIndex[name] = { id, subIdByName };
  categories.push({
    id, name, type, order, isDeleted: false,
    color: CATEGORY_COLORS[order % CATEGORY_COLORS.length],
    subcategories
  });
}

sourceCategories.forEach((c, i) => addCategory(c.category, (c.subcategory || '').split(','), i));
EXTRA_CATEGORIES.forEach((c, i) => addCategory(c.name, c.subNames, sourceCategories.length + i, c.type));

function resolveCategory(name, subName) {
  const entry = categoryIndex[name];
  if (!entry) return { categoryId: null, subcategoryId: null }; // "Uncategorized" etc.
  const subcategoryId = subName ? (entry.subIdByName[subName] ?? null) : null;
  return { categoryId: entry.id, subcategoryId };
}

// ---- transactions -------------------------------------------------------------
// Full history, not a recent window (the user wants everything since
// 2013, not a sample) — windowStart is the source's own real earliest
// transaction date, derived rather than guessed.

const windowEnd = todayISO();
const [{ minDate }] = q(`select date(min(expensed),'unixepoch') as minDate from expense_report`);
const windowStart = minDate;

const sourceTxns = q(`
  select amount, description, category, subcategory, expensed
  from expense_report
`);

const transactions = [];
for (const t of sourceTxns) {
  const date = epochToISODate(t.expensed);
  if (date < windowStart || date > windowEnd) continue;
  const { categoryId, subcategoryId } = resolveCategory(t.category, t.subcategory);
  const type = t.category === 'Income' ? 'income' : 'expense';
  const now = new Date().toISOString();
  transactions.push({
    id: genId('txn'), accountId: defaultAccountId,
    amount: Number(t.amount) || 0, description: (t.description || '').trim(),
    type, categoryId, subcategoryId, paymentMethod: type === 'expense' ? 'cash' : null,
    date, recurringId: null, createdAt: now, modifiedAt: now
  });
}

// ---- recurring -------------------------------------------------------------
// Every source row, including real income rules now.
//
// startDate is deliberately NOT the source's own first_expensed (years
// in the past): the real transaction history above already contains
// rows for these same expenses, so backdating the rule would make
// materializeAllRecurring() regenerate hundreds of duplicate
// transactions on first boot, double-counting against budgets (caught
// live — a sample Utilities budget showed $1,705 spent against a $300
// target before this fix). Every rule instead starts the day after the
// export's own "today," so nothing materializes until the app is
// actually used on a later day — dayOfMonth/anchorMonth still come from
// the source's real first_expensed, so "next due" stays realistic.

const RECURRING_START = addDaysISO(windowEnd, 1);

const sourceRepeating = q(`
  select description, category, subcategory, amount, frequency, first_expensed, no_of_payment, paid_cycle
  from expense_repeating
`);

// no_of_payment (total planned payments) / paid_cycle (how many are
// already done) is a real, hard signal — every row's paid_cycle is <=
// its no_of_payment, and a rule with paid_cycle === no_of_payment (e.g.
// "netflix yr 3", 6/6) has genuinely finished in real life. Since
// imported historical transactions aren't linked via recurringId
// (materializedCount starts at 0 for all of these — see the
// transactions section above), the remaining count is what expman
// needs: endMode 'count' with occurrenceCount = payments left. A
// finished rule gets occurrenceCount 0, which isRecurringActive()
// correctly reads as already-ended (0 < 0 is false).
const recurring = [];
for (const r of sourceRepeating) {
  const { categoryId, subcategoryId } = resolveCategory(r.category, r.subcategory);
  if (!categoryId) continue; // shouldn't happen — every source repeating row has a real category
  const type = r.category === 'Income' ? 'income' : 'expense';
  const frequency = r.frequency === '12m' ? 'annual' : 'monthly';
  const naturalDate = epochToISODate(r.first_expensed);
  const [, naturalMonth] = naturalDate.split('-').map(Number);
  const remaining = Math.max(0, (Number(r.no_of_payment) || 0) - (Number(r.paid_cycle) || 0));
  const now = new Date().toISOString();
  recurring.push({
    id: genId('rec'), accountId: defaultAccountId, categoryId, subcategoryId,
    type, amount: Number(r.amount) || 0, description: (r.description || '').trim(),
    paymentMethod: type === 'expense' ? 'cash' : null, frequency, startDate: RECURRING_START,
    dayOfMonth: Number(naturalDate.split('-')[2]),
    anchorMonth: frequency === 'annual' ? naturalMonth : null,
    endMode: 'count', endDate: null, occurrenceCount: remaining,
    isDeleted: false, createdAt: now, modifiedAt: now
  });
}

// ---- budgets -------------------------------------------------------------
// The source's one budget row targets "All Category," which doesn't map
// to expman's per-category model — dropped in favor of a couple of
// sample budgets on real imported categories (requirement 15).

const budgets = [];
// Amounts picked from this sample's own real monthly averages (Food
// ~$602/mo, Utilities ~$1470/mo — Utilities includes rent, so it runs
// much higher) rather than round guesses, so the budgets look plausible
// from the very first month shown instead of immediately blowing past
// target.
for (const [name, amount] of [['Food', 600], ['Utilities', 1200]]) {
  const entry = categoryIndex[name];
  if (!entry) continue;
  const now = new Date().toISOString();
  budgets.push({
    id: genId('bud'), name, accountId: defaultAccountId, categoryId: entry.id, subcategoryId: null, amount,
    isRollover: true, startDate: windowStart, endDate: null, createdAt: now, modifiedAt: now
  });
}

// ---- assemble -------------------------------------------------------------

const output = {
  transactions, categories, accounts, budgets, recurring, cards: [],
  preferences: {}, savedAt: new Date().toISOString()
};

writeFileSync(OUT_PATH, JSON.stringify(output));

console.log(`Wrote ${OUT_PATH}`);
console.log(`  accounts: ${accounts.length}`);
console.log(`  categories: ${categories.length}`);
console.log(`  transactions: ${transactions.length} (window ${windowStart} – ${windowEnd})`);
console.log(`  recurring: ${recurring.length}`);
console.log(`  budgets: ${budgets.length}`);
