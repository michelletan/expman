#!/usr/bin/env node
// One-time, dev-only conversion of the legacy "Expense Manager" SQLite
// export into a sanitized sample JSON file in expman's own backup shape
// (see specs/import-export.md). NOT part of the shipped app — run this
// manually, then import the output through Settings > Backup.
//
// Usage: node scripts/convert-legacy-db.mjs
//
// Reads:  data/2026-09-14_Expense Manager.db (gitignored, not shipped)
// Writes: data/sample-import.json (gitignored, not shipped)

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { genId, CATEGORY_COLORS } from '../src/lib/data/format.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'data', '2026-09-14_Expense Manager.db');
const OUT_PATH = path.join(__dirname, '..', 'data', 'sample-import.json');

// specs/import-export.md requirement 9 — everything income-adjacent
// (real salary and every other real income type alike, since the source
// doesn't cleanly separate them) plus everything medical- or
// renovation-adjacent, named or not in the source's own category list.
const EXCLUDED_CATEGORIES = new Set(['Income', 'Medical', 'House', 'Pregnancy', 'Health Care']);

// Recent, contiguous window rather than the full 2013-2026 history —
// PRD.md asks for "a sample amount," not everything (requirement 13).
const WINDOW_MONTHS = 18;

function q(sql) {
  const out = execFileSync('sqlite3', [DB_PATH, '.mode json', sql], { encoding: 'utf8' }).trim();
  return out ? JSON.parse(out) : [];
}

function epochToISODate(epochSeconds) {
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function addMonthsISO(dateStr, months) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1 + months, d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
// Source rows minus excluded ones, plus School/Mum (used by transactions
// but absent from the source's own category table — not sensitive, so
// kept and auto-created here) — see requirement 11.

const sourceCategories = q('select category, subcategory from expense_category')
  .filter(c => !EXCLUDED_CATEGORIES.has(c.category));
const EXTRA_CATEGORY_NAMES = ['School', 'Mum'];

/** @type {Record<string, {id: string, subIdByName: Record<string,string>}>} */
const categoryIndex = {};
const categories = [];

function addCategory(name, subNames, order) {
  const id = genId('cat');
  const subIdByName = {};
  const subcategories = subNames.filter(Boolean).map((subName, i) => {
    const subId = genId('sub');
    subIdByName[subName] = subId;
    return { id: subId, name: subName, order: i, isDeleted: false };
  });
  categoryIndex[name] = { id, subIdByName };
  categories.push({
    id, name, type: 'expense', order, isDeleted: false,
    color: CATEGORY_COLORS[order % CATEGORY_COLORS.length],
    subcategories
  });
}

sourceCategories.forEach((c, i) => addCategory(c.category, (c.subcategory || '').split(','), i));
EXTRA_CATEGORY_NAMES.forEach((name, i) => addCategory(name, [], sourceCategories.length + i));

// A synthetic Income category for the generated sample income below —
// real income is never imported (requirement 9-10).
const incomeCategoryId = genId('cat');
categories.push({
  id: incomeCategoryId, name: 'Income', type: 'income', order: 0, isDeleted: false,
  color: CATEGORY_COLORS[categories.length % CATEGORY_COLORS.length],
  subcategories: [{ id: genId('sub'), name: 'Salary', order: 0, isDeleted: false }]
});
const incomeSubcategoryId = categories.find(c => c.id === incomeCategoryId).subcategories[0].id;

function resolveCategory(name, subName) {
  const entry = categoryIndex[name];
  if (!entry) return { categoryId: null, subcategoryId: null }; // "Uncategorized" etc.
  const subcategoryId = subName ? (entry.subIdByName[subName] ?? null) : null;
  return { categoryId: entry.id, subcategoryId };
}

// ---- transactions -------------------------------------------------------------

const windowEnd = todayISO();
const windowStart = addMonthsISO(windowEnd, -WINDOW_MONTHS);

const excludedList = [...EXCLUDED_CATEGORIES].map(c => `'${c}'`).join(',');
const sourceTxns = q(`
  select amount, description, category, subcategory, expensed
  from expense_report
  where category not in (${excludedList})
`);

const transactions = [];
for (const t of sourceTxns) {
  const date = epochToISODate(t.expensed);
  if (date < windowStart || date > windowEnd) continue;
  const { categoryId, subcategoryId } = resolveCategory(t.category, t.subcategory);
  const now = new Date().toISOString();
  transactions.push({
    id: genId('txn'), accountId: defaultAccountId,
    amount: Number(t.amount) || 0, description: (t.description || '').trim(),
    type: 'expense', categoryId, subcategoryId, paymentMethod: 'cash',
    date, recurringId: null, createdAt: now, modifiedAt: now
  });
}

// ---- synthetic income (requirement 10) -------------------------------------------------------------
// Real income is fully excluded above; these are clearly-fake, round-
// number stand-ins so Home's net-balance and Recurring's income path
// still have something to show.

for (let i = 0; i < WINDOW_MONTHS; i++) {
  const date = addMonthsISO(windowStart, i);
  const now = new Date().toISOString();
  transactions.push({
    id: genId('txn'), accountId: defaultAccountId,
    amount: 5000, description: 'Sample salary',
    type: 'income', categoryId: incomeCategoryId, subcategoryId: incomeSubcategoryId,
    paymentMethod: null, date, recurringId: null, createdAt: now, modifiedAt: now
  });
}

// ---- recurring -------------------------------------------------------------
// Source rows minus Income ones (requirement 14), plus one synthetic
// sample income rule. Frequencies in the source are only ever 1m/12m —
// exactly monthly/annual, nothing else to map.
//
// startDate is deliberately NOT the source's own first_expensed (years
// in the past): the real transaction sample above already contains
// history for these same expenses, so backdating the rule would make
// materializeAllRecurring() regenerate hundreds of duplicate
// transactions on first boot, double-counting against budgets (caught
// live — a sample Utilities budget showed $1,705 spent against a $300
// target before this fix). Every rule instead starts the day after the
// sample's own "today," so nothing materializes until the app is
// actually used on a later day — dayOfMonth/anchorMonth still come from
// the source's real first_expensed, so "next due" stays realistic.

const RECURRING_START = addDaysISO(windowEnd, 1);

const sourceRepeating = q(`
  select description, category, subcategory, amount, frequency, first_expensed
  from expense_repeating where category != 'Income'
`);

const recurring = [];
for (const r of sourceRepeating) {
  const { categoryId, subcategoryId } = resolveCategory(r.category, r.subcategory);
  if (!categoryId) continue; // shouldn't happen — every source repeating row has a real category
  const frequency = r.frequency === '12m' ? 'annual' : 'monthly';
  const naturalDate = epochToISODate(r.first_expensed);
  const [, naturalMonth] = naturalDate.split('-').map(Number);
  const now = new Date().toISOString();
  recurring.push({
    id: genId('rec'), accountId: defaultAccountId, categoryId, subcategoryId,
    type: 'expense', amount: Number(r.amount) || 0, description: (r.description || '').trim(),
    paymentMethod: 'cash', frequency, startDate: RECURRING_START,
    dayOfMonth: Number(naturalDate.split('-')[2]),
    anchorMonth: frequency === 'annual' ? naturalMonth : null,
    endMode: 'never', endDate: null, occurrenceCount: null,
    isDeleted: false, createdAt: now, modifiedAt: now
  });
}

recurring.push({
  id: genId('rec'), accountId: defaultAccountId, categoryId: incomeCategoryId, subcategoryId: incomeSubcategoryId,
  type: 'income', amount: 5000, description: 'Sample salary', paymentMethod: null,
  frequency: 'monthly', startDate: RECURRING_START, dayOfMonth: Number(RECURRING_START.split('-')[2]), anchorMonth: null,
  endMode: 'never', endDate: null, occurrenceCount: null,
  isDeleted: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString()
});

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
    id: genId('bud'), name, categoryId: entry.id, subcategoryId: null, amount,
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
