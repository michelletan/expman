import { describe, it, expect } from 'vitest';
import { shiftYearMonth, getCardPeriod } from '../src/lib/data/format.js';

// specs/transactions.md — requirement 24 (Activity month picker, no bound)
describe('shiftYearMonth', () => {
  it('moves forward within a year', () => {
    expect(shiftYearMonth('2026-01', 1)).toBe('2026-02');
  });

  it('moves backward within a year', () => {
    expect(shiftYearMonth('2026-05', -1)).toBe('2026-04');
  });

  it('rolls forward across a year boundary', () => {
    expect(shiftYearMonth('2026-12', 1)).toBe('2027-01');
  });

  it('rolls backward across a year boundary', () => {
    expect(shiftYearMonth('2026-01', -1)).toBe('2025-12');
  });

  it('has no bound — large deltas still work', () => {
    expect(shiftYearMonth('2026-01', 25)).toBe('2028-02');
  });
});

// specs/cards.md — requirements 14-15 (spending period, PRD.md's own example)
describe('getCardPeriod', () => {
  it('matches PRD.md\'s example: reset day 11, "today" mid-cycle after reset', () => {
    expect(getCardPeriod(11, '2026-08-15')).toEqual({ start: '2026-08-11', end: '2026-09-10' });
  });

  it('same cycle before this month\'s reset day', () => {
    expect(getCardPeriod(11, '2026-09-05')).toEqual({ start: '2026-08-11', end: '2026-09-10' });
  });

  it('a new cycle starts exactly on the reset day', () => {
    expect(getCardPeriod(11, '2026-09-11')).toEqual({ start: '2026-09-11', end: '2026-10-10' });
  });

  it('rolls across a year boundary', () => {
    expect(getCardPeriod(15, '2026-01-05')).toEqual({ start: '2025-12-15', end: '2026-01-14' });
  });

  it('clamps a reset day that does not exist in a short month (31 in Feb)', () => {
    // Jan 31 -> Feb clamped to 28 (2026 is not a leap year) -> ends Feb 27
    expect(getCardPeriod(31, '2026-02-15')).toEqual({ start: '2026-01-31', end: '2026-02-27' });
  });
});
