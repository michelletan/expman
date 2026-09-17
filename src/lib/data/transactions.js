/*
  DATA/TRANSACTIONS.JS
  ---------------------
  Home-page-shaped queries, composed from the generic db.js primitives.
  Now backed by the real IndexedDB store (seeded from your actual
  migrated data) instead of the prototype's sample rows.
*/

import { getVisibleTransactions, getMonthSummary, getCurrentBalance, getYearToDate, getBudgetsActiveForMonth, getAll, getMeta, getTransactionsForMonth, groupTransactionsByCategory } from './db.js';
import { currentYearMonth, shiftYearMonth, UNCATEGORISED_COLOR } from './format.js';

export async function getRecentTransactions(limit = 6, accountId) {
  const all = await getVisibleTransactions();
  const recent = all
    .filter(t => !accountId || t.accountId === accountId)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
  return resolveTransactionLabels(recent);
}

// Shared by Home and (later) Activity, so both display transactions the
// same way: a category/subcategory display label (resolved live via id,
// "Uncategorised" if absent) and a payment-method label ("Cash" or the
// card's current name). TransactionRow just renders these — it doesn't
// do its own lookups.
export async function resolveTransactionLabels(txns) {
  if (!txns.length) return txns;
  const [categories, cards] = await Promise.all([getAll('categories'), getAll('cards')]);
  const categoryById = new Map(categories.map(c => [c.id, c]));
  const cardById = new Map(cards.map(c => [c.id, c]));

  return txns.map(t => {
    const category = t.categoryId ? categoryById.get(t.categoryId) : null;
    const subcategory = category?.subcategories.find(s => s.id === t.subcategoryId);
    const categoryLabel = category ? (subcategory ? `${category.name} / ${subcategory.name}` : category.name) : 'Uncategorised';
    const categoryColor = category?.color ?? UNCATEGORISED_COLOR;
    const paymentLabel = !t.paymentMethod || t.paymentMethod === 'cash' ? 'Cash' : (cardById.get(t.paymentMethod)?.name ?? 'Card');
    return { ...t, categoryLabel, categoryColor, paymentLabel };
  });
}

export async function getHomeSummary(accountId) {
  const ym = currentYearMonth();
  const [monthSummary, balance, ytd] = await Promise.all([
    getMonthSummary(ym, accountId),
    getCurrentBalance(accountId),
    getYearToDate(new Date().getFullYear(), accountId)
  ]);
  return { monthSummary, balance, ytd };
}

// Only budgets active for the current month, on the given account, show
// (specs/budgets.md requirements 9, 1a) — if there are none, Home hides
// the whole section (PRD.md).
export async function getBudgetStatuses(limit = 3, accountId) {
  const statuses = await getBudgetsActiveForMonth(currentYearMonth(), accountId);
  return statuses.slice(0, limit);
}

// specs/savings-goals.md — a single ongoing monthly target per account,
// stored as a meta key rather than its own store (no history, no per-
// month rows — see the spec's Data model section). null when unset, so
// Home shows nothing for an account with no goal (requirement 6).
export async function getSavingsGoalStatus(accountId) {
  const goal = await getMeta(`savingsGoal:${accountId}`);
  if (!goal) return null;
  const summary = await getMonthSummary(currentYearMonth(), accountId);
  return { goal: Number(goal), net: summary.income - summary.expense };
}

// specs/spending-callouts.md — expense categories whose spend this month
// is a real swing (>=20% AND >=$20, requirement 3) from their own
// trailing 3-prior-month average, ranked by absolute $ deviation
// (requirement 4). Stateless: recomputed fresh every call, nothing new
// is stored (see the spec's Out of scope).
const CALLOUT_MONTHS_BACK = 3;
const CALLOUT_MIN_PCT = 20;
const CALLOUT_MIN_AMOUNT = 20;

async function expenseTotalsByCategory(yearMonth, accountId, categories) {
  const txns = await getTransactionsForMonth(yearMonth, accountId);
  const expenseTxns = txns.filter(t => t.type === 'expense' && t.categoryId); // Uncategorised excluded (requirement 9)
  const rows = groupTransactionsByCategory(expenseTxns, categories);
  return new Map(rows.map(r => [r.categoryId, r]));
}

export async function getSpendingCallouts(yearMonth, accountId) {
  const categories = await getAll('categories');
  const priorMonths = Array.from({ length: CALLOUT_MONTHS_BACK }, (_, i) => shiftYearMonth(yearMonth, -(i + 1)));
  const [targetTotals, ...priorTotals] = await Promise.all(
    [yearMonth, ...priorMonths].map(ym => expenseTotalsByCategory(ym, accountId, categories))
  );

  const categoryIds = new Set([...targetTotals.keys(), ...priorTotals.flatMap(m => [...m.keys()])]);
  const results = [];

  for (const categoryId of categoryIds) {
    // Category/name/color come from wherever this category actually has a
    // row — the target month if it spent there, else whichever prior
    // month did (covers a category that dropped to $0 this month).
    const row = targetTotals.get(categoryId) ?? priorTotals.find(m => m.has(categoryId))?.get(categoryId);
    if (!row) continue; // unreachable — categoryId always came from one of these maps
    const current = targetTotals.get(categoryId)?.total ?? 0;
    const priorSum = priorTotals.reduce((sum, m) => sum + (m.get(categoryId)?.total ?? 0), 0);
    const average = priorSum / CALLOUT_MONTHS_BACK;
    if (average <= 0) continue; // requirement 2 — no history to compare against

    const deltaAmount = current - average;
    const deltaPct = (deltaAmount / average) * 100;
    if (Math.abs(deltaPct) < CALLOUT_MIN_PCT && Math.abs(deltaAmount) < CALLOUT_MIN_AMOUNT) continue; // requirement 3

    const over = deltaAmount > 0;
    const pct = Math.round(Math.abs(deltaPct));
    results.push({
      categoryId, category: row.category, color: row.color,
      current, average, deltaAmount, deltaPct, over,
      label: `${row.category} is ${pct}% ${over ? 'above' : 'below'} your 3-month average this month`
    });
  }

  return results.sort((a, b) => Math.abs(b.deltaAmount) - Math.abs(a.deltaAmount));
}

// specs/activity-search-filter.md — description search + category/type/
// date-range filters, all-time (not month-scoped), combined with AND.
// Capped at `limit` (requirement 8) — rows beyond it are still counted
// in `total` so the caller can show a "showing X of Y" note.
/**
 * @param {{ accountId?: string|null, query?: string, categoryActive?: boolean, categoryId?: string|null,
 *   subcategoryId?: string|null, type?: string|null, dateFrom?: string|null, dateTo?: string|null, limit?: number }} params
 */
export async function searchTransactions({
  accountId = null, query = '', categoryActive = false, categoryId = null, subcategoryId = null,
  type = null, dateFrom = null, dateTo = null, limit = 200
} = {}) {
  const all = await getVisibleTransactions();
  const q = query.trim().toLowerCase();

  const matches = all.filter(t => {
    if (accountId && t.accountId !== accountId) return false;
    if (q && !(t.description || '').toLowerCase().includes(q)) return false;
    // categoryId null legitimately means "Uncategorised" here, so the
    // filter is gated on categoryActive, not truthiness of categoryId.
    if (categoryActive && (t.categoryId ?? null) !== categoryId) return false;
    if (categoryActive && subcategoryId && t.subcategoryId !== subcategoryId) return false;
    if (type && t.type !== type) return false;
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const rows = await resolveTransactionLabels(matches.slice(0, limit));
  return { total: matches.length, rows };
}
