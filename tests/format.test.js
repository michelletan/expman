import { describe, it, expect } from 'vitest';
import { shiftYearMonth } from '../src/lib/data/format.js';

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
