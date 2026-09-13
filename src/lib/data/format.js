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
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
