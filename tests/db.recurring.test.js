import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAll, createAccount, createRecurring, updateRecurring, cancelRecurring,
  softDeleteRecurring, getRecurringRules, nthOccurrenceDate, materializeRecurring
} from '../src/lib/data/db.js';
import { resetDB } from './helpers.js';

beforeEach(resetDB);

// specs/recurring.md requirement 1 — day-of-month decoupled from
// startDate so a short month doesn't permanently shift later occurrences.
describe('nthOccurrenceDate', () => {
  it('clamps a monthly rule anchored on day 31 to each month\'s real last day', () => {
    const rule = { frequency: 'monthly', startDate: '2025-11-30', dayOfMonth: 31 };
    expect(nthOccurrenceDate(rule, 0)).toBe('2025-11-30'); // Nov only has 30 days
    expect(nthOccurrenceDate(rule, 1)).toBe('2025-12-31'); // Dec correctly lands on 31st
    expect(nthOccurrenceDate(rule, 3)).toBe('2026-02-28'); // Feb, non-leap
  });

  it('clamps an annual rule anchored on Feb 29 to Feb 28 in non-leap years', () => {
    const rule = { frequency: 'annual', startDate: '2024-02-29', dayOfMonth: 29, anchorMonth: 2 };
    expect(nthOccurrenceDate(rule, 0)).toBe('2024-02-29'); // 2024 is a leap year
    expect(nthOccurrenceDate(rule, 1)).toBe('2025-02-28');
    expect(nthOccurrenceDate(rule, 4)).toBe('2028-02-29'); // leap again
  });

  it('steps daily/weekly rules by fixed increments', () => {
    const daily = { frequency: 'daily', startDate: '2026-01-30' };
    expect(nthOccurrenceDate(daily, 3)).toBe('2026-02-02');
    const weekly = { frequency: 'weekly', startDate: '2026-01-01' };
    expect(nthOccurrenceDate(weekly, 2)).toBe('2026-01-15');
  });
});

// specs/recurring.md requirement 4 — occurrences are never pre-generated;
// only ones up to "today" ever materialize, and a missed stretch catches
// up on every one of them, not just the latest.
describe('materializeRecurring', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T00:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('posts one transaction per missed occurrence, not just the most recent', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 15, description: 'Netflix',
      frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, endMode: 'never'
    });
    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns.map(t => t.date).sort()).toEqual(['2026-01-05', '2026-02-05', '2026-03-05']);
  });

  it('never posts an occurrence dated after today', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 10, frequency: 'monthly',
      startDate: '2026-03-20', dayOfMonth: 20, endMode: 'never'
    });
    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns).toHaveLength(0); // "today" is the 15th, next due is the 20th
  });

  it('stops at occurrenceCount total occurrences ever, even much later', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'income', amount: 5000, description: 'Salary',
      frequency: 'monthly', startDate: '2025-11-30', dayOfMonth: 31, endMode: 'count', occurrenceCount: 12
    });
    let txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns).toHaveLength(4); // Nov, Dec, Jan, Feb — Mar 31 not yet due on the 15th

    vi.setSystemTime(new Date('2028-01-01'));
    await materializeRecurring(rule.id);
    txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns).toHaveLength(12); // stops at the fixed count, not open-ended
  });

  it('stops once the next occurrence would fall after endDate', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 15, frequency: 'monthly',
      startDate: '2025-01-05', dayOfMonth: 5, endMode: 'date', endDate: '2026-02-01'
    });
    const dates = (await getAll('transactions')).filter(t => t.recurringId === rule.id).map(t => t.date).sort();
    expect(dates.at(-1)).toBe('2026-01-05');
    expect(dates).not.toContain('2026-02-05');
  });

  it('a backdated start posts its overdue occurrences immediately on create, no restart needed', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 8, description: 'Coffee club',
      frequency: 'weekly', startDate: '2026-02-01', endMode: 'never'
    });
    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns.length).toBeGreaterThan(1);
  });
});

// specs/recurring.md requirement 7 — the all-vs-future choice.
describe('updateRecurring applyToAll', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T00:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  async function setUpRule() {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 15, description: 'Netflix',
      frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, endMode: 'never'
    });
    return rule;
  }

  it('rewrites every already-materialized transaction when applyToAll is true', async () => {
    const rule = await setUpRule();
    await updateRecurring(rule.id, { amount: 20, description: 'Netflix Premium' }, true);
    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns.every(t => t.amount === 20 && t.description === 'Netflix Premium')).toBe(true);
  });

  it('leaves already-materialized transactions untouched when applyToAll is false', async () => {
    const rule = await setUpRule();
    await updateRecurring(rule.id, { amount: 20, description: 'Netflix Premium' }, false);
    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns.every(t => t.amount === 15 && t.description === 'Netflix')).toBe(true);
  });
});

// specs/recurring.md requirement 9 — Cancel vs Delete.
describe('cancelRecurring', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T00:00:00'));
  });
  afterEach(() => vi.useRealTimers());

  it('stops future occurrences, keeps past ones, and moves the rule to Completed', async () => {
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 15, description: 'Netflix',
      frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, endMode: 'never'
    });
    const before = (await getAll('transactions')).filter(t => t.recurringId === rule.id).length;

    await cancelRecurring(rule.id);
    vi.setSystemTime(new Date('2026-06-01'));
    await materializeRecurring(rule.id);

    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns).toHaveLength(before); // nothing new posted after cancelling

    const rules = await getRecurringRules();
    const found = rules.find(r => r.id === rule.id);
    expect(found).toBeTruthy(); // still visible — cancel isn't delete
    expect(found.active).toBe(false); // shows under Completed, not Upcoming
  });
});

describe('softDeleteRecurring', () => {
  it('removes the rule from getRecurringRules but leaves its transactions alone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-03-15T00:00:00'));
    const account = await createAccount({ name: 'Checking' });
    const rule = await createRecurring({
      accountId: account.id, type: 'expense', amount: 15, description: 'Netflix',
      frequency: 'monthly', startDate: '2026-01-05', dayOfMonth: 5, endMode: 'never'
    });
    const before = (await getAll('transactions')).filter(t => t.recurringId === rule.id).length;
    await softDeleteRecurring(rule.id);
    vi.useRealTimers();

    const rules = await getRecurringRules();
    expect(rules.find(r => r.id === rule.id)).toBeUndefined();

    const txns = (await getAll('transactions')).filter(t => t.recurringId === rule.id);
    expect(txns).toHaveLength(before);
  });
});
