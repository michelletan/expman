// Ported from the current app's js/format.js — plain functions, no
// framework dependency, so they're just as usable from a test file
// or a future non-Svelte screen as from a component.

export function fmtMoney(amount) {
  const n = Number(amount) || 0;
  return '$' + n.toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtMoneySigned(amount, type) {
  const sign = type === 'income' ? '+' : '−';
  return sign + fmtMoney(Math.abs(amount));
}

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
export const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// A category's color is picked from this fixed palette, not a free-form
// picker (specs/categories.md requirement 10g) — chosen for mutual
// distinctness and enough contrast for white text/icons on top.
export const CATEGORY_COLORS = [
  '#E07A5F', '#3D9970', '#4C6EF5', '#F4A261', '#9C6ADE',
  '#2A9D8F', '#E63946', '#457B9D', '#D68C45', '#6B7280',
  '#D6558C', '#A3C935', '#6A4C93', '#22B8CF', '#8D6748'
];

// Neutral fallback for a transaction/chart slice with no category — not
// part of the palette above, so it never collides with a real category's
// color. Shared by transactions.js (row display) and db.js (category
// totals/Reports' pie chart).
export const UNCATEGORISED_COLOR = '#9CA3AF';

export function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-').map(Number);
  return MONTH_SHORT[m - 1] + ' ' + d;
}

export function fmtMonthLabel(yearMonth) {
  // "2026-09" -> "September 2026"
  const [y, m] = yearMonth.split('-').map(Number);
  return MONTH_NAMES[m - 1] + ' ' + y;
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentYearMonth() {
  return todayISO().slice(0, 7);
}

// "2026-09" + 1 -> "2026-10"; + -1 -> "2026-08". Powers Activity's month
// picker (specs/transactions.md requirement 24) — no upper/lower bound.
export function shiftYearMonth(yearMonth, delta) {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// Exported for reuse by recurring transactions' own monthly/annual
// clamping (specs/recurring.md requirement 1), not just getCardPeriod.
export function lastDayOfMonth(year, month1Indexed) {
  return new Date(year, month1Indexed, 0).getDate();
}

// specs/activity-period-summary.md — plain day arithmetic + Monday-start
// week powering Activity's Daily/Weekly granularity.
export function shiftDate(dateISO, deltaDays) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d + deltaDays);
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// Monday–Sunday (ISO-style) — a concrete proposal per the spec's Notes,
// flagged there for adjustment if the original app used Sunday-start.
export function weekStartISO(dateISO) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay(); // 0 = Sun .. 6 = Sat
  return shiftDate(dateISO, day === 0 ? -6 : 1 - day);
}

// "2026-01-31" + 1 month -> "2026-02-28", clamped to the new month's last
// real day so Activity's Monthly nav keeps the same day-of-month in view
// instead of overflowing into the month after.
export function shiftAnchorByMonth(dateISO, delta) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const [ny, nm] = shiftYearMonth(`${y}-${String(m).padStart(2, '0')}`, delta).split('-').map(Number);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(ny, nm))).padStart(2, '0')}`;
}

export function shiftAnchorByYear(dateISO, delta) {
  const [y, m, d] = dateISO.split('-').map(Number);
  const ny = y + delta;
  return `${ny}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(ny, m))).padStart(2, '0')}`;
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function fmtDayLabel(dateISO) {
  if (!dateISO) return '';
  const [y, m, d] = dateISO.split('-').map(Number);
  return `${WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()]}, ${MONTH_SHORT[m - 1]} ${d}`;
}

export function fmtWeekLabel(weekStart) {
  return `${fmtDateShort(weekStart)} – ${fmtDateShort(shiftDate(weekStart, 6))}`;
}

// A card's current spending cycle from its resetDate (a day-of-month,
// 1-31): if today is on/after resetDate, the cycle runs from this
// month's resetDate to the day before next month's; otherwise from last
// month's resetDate to the day before this month's (specs/cards.md
// requirements 14-15). Clamps to a month's last real day when resetDate
// doesn't exist in it (e.g. 31 in February).
export function getCardPeriod(resetDate, referenceDate = todayISO()) {
  const [y, m, d] = referenceDate.split('-').map(Number);

  let startYear = y, startMonth = m;
  if (d < resetDate) {
    startMonth -= 1;
    if (startMonth < 1) { startMonth = 12; startYear -= 1; }
  }
  const startDay = Math.min(resetDate, lastDayOfMonth(startYear, startMonth));
  const start = `${startYear}-${String(startMonth).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;

  let endYear = startYear, endMonth = startMonth + 1;
  if (endMonth > 12) { endMonth = 1; endYear += 1; }
  const endResetDay = Math.min(resetDate, lastDayOfMonth(endYear, endMonth));
  const endDate = new Date(endYear, endMonth - 1, endResetDay - 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

  return { start, end };
}

export function genId(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
