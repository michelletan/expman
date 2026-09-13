/*
  DATA/TRANSACTIONS.JS
  ---------------------
  Home-page-shaped queries, composed from the generic db.js primitives.
  Now backed by the real IndexedDB store (seeded from your actual
  migrated data) instead of the prototype's sample rows.
*/

import { getVisibleTransactions, getMonthSummary, getCurrentBalance, getYearToDate, computeBudgetStatus, getAll } from './db.js';
import { currentYearMonth } from './format.js';

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
    const paymentLabel = !t.paymentMethod || t.paymentMethod === 'cash' ? 'Cash' : (cardById.get(t.paymentMethod)?.name ?? 'Card');
    return { ...t, categoryLabel, paymentLabel };
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

// Budget cards intentionally aren't account-filtered — budgets are a
// category-level concept shared across accounts (same call as the
// original app makes from js/views/home.js).
export async function getBudgetStatuses(limit = 3) {
  const ym = currentYearMonth();
  const budgets = await getAll('budgets');
  const statuses = await Promise.all(
    budgets.slice(0, limit).map(b => computeBudgetStatus(b.categoryId, ym))
  );
  return statuses.filter(Boolean);
}
