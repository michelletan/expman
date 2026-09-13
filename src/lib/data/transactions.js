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
  return all
    .filter(t => !accountId || t.accountId === accountId)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
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
