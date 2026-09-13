/*
  DATA/TRANSACTIONS.JS
  ---------------------
  Home-page-shaped queries, composed from the generic db.js primitives.
  Now backed by the real IndexedDB store (seeded from your actual
  migrated data) instead of the prototype's sample rows.
*/

import { getAll, getMonthSummary, getCurrentBalance, getYearToDate, computeBudgetStatus } from './db.js';
import { currentYearMonth } from './format.js';

export async function getRecentTransactions(limit = 6, accountName) {
  const all = await getAll('transactions');
  return all
    .filter(t => !accountName || t.account === accountName)
    .slice()
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, limit);
}

export async function getHomeSummary(accountName) {
  const ym = currentYearMonth();
  const [monthSummary, balance, ytd] = await Promise.all([
    getMonthSummary(ym, accountName),
    getCurrentBalance(accountName),
    getYearToDate(new Date().getFullYear(), accountName)
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
    budgets.slice(0, limit).map(b => computeBudgetStatus(b.category, ym))
  );
  return statuses.filter(Boolean);
}
