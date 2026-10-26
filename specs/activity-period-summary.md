## Activity period summary

**Status:** Done

### Summary
The original app let you see expense/balance totals "by date or by
category" at a glance, paging between Daily/Weekly/Monthly/Yearly periods
with that period's total shown right at the top, and tapping a bucket
(e.g. a month while viewing a year) to drill into it. Today's
[Activity.svelte](src/pages/Activity.svelte) already has a Date/Category
toggle and month-only navigation (specs/transactions.md,
specs/activity-search-filter.md), but its header shows no total, and there's
no Daily/Weekly/Yearly granularity or drill-down. This spec adds all of
that. Confirmed with the user: Daily/Weekly/Monthly/Yearly (matching the
original's 4-way tab bar), Yearly's Date view shows one row per month
(drill into Monthly), and the header total is always just the selected
period's net — no separate all-time balance line.

### User stories
- As a user, I want to see a running total (balance, or expense when I'm
  filtered to expenses) at the top of Activity without adding it up myself.
- As a user, I want to switch between Daily/Weekly/Monthly/Yearly and page
  back and forth within whichever one I'm on, with the total updating to
  match.
- As a user, I want to tap a bucket (a month inside a year, a day inside a
  month/week) to drop straight into that narrower period.

### Requirements
1. THE APP SHALL add a granularity switcher (Daily / Weekly / Monthly /
   Yearly) to Activity's normal (non-results-mode) view, replacing the
   current month-only nav row. Monthly is the default on first open.
2. WHILE in any granularity THE APP SHALL show prev/next nav for that
   granularity's unit (day/week/month/year), unbounded in both directions
   (matches TODO.md's `Calendar` entry: future-dated transactions page in
   fine).
3. THE APP SHALL show a total in the header for the selected period: its
   net balance (income − expense), colored positive/negative the same way
   Home's "this month" net already is. This is the *only* total shown —
   no separate all-time balance line, and it does not key off the
   Filters-sheet Type control (that control already forces results mode
   the moment it leaves "All" — see requirement 7 — so there's no state
   where a non-"All" Type and a visible period header coexist). On first
   open (Monthly, current month), this is simply the current month's net.
4. Non-finest granularities' Date view SHALL list one row per sub-bucket
   with that bucket's total, instead of a flat transaction list:
   - Yearly → one row per month (Jan–Dec) with that month's total.
     Tapping a row switches to Monthly, navigated to that month.
   - Monthly → one row per day in the month with that day's total
     (same shape as the original app's screenshots). Tapping a row
     switches to Daily, navigated to that day.
   - Weekly → one row per day in the week (Mon–Sun — see Notes) with that
     day's total. Tapping a row switches to Daily, navigated to that day.
   - Daily (finest) → the existing flat list of that single day's
     transactions (today's Date view, just narrowed from a month to a day).
5. Category view SHALL keep working as it does today, grouping by category
   — just scoped to whatever period (day/week/month/year) is currently
   selected, instead of always a month.
6. The existing month-jump picker (tap the period label) SHALL continue to
   work, adapted per granularity: Yearly picks a year, Monthly keeps
   today's month/year grid, Weekly/Daily pick a date (reuse a native
   `<input type="date">` rather than building a new calendar widget).
7. WHILE in results mode (search text or a Filters-sheet filter active,
   per specs/activity-search-filter.md) THE APP SHALL continue to hide the
   granularity switcher, period nav, and header total — unchanged from
   today.
8. Everything in this spec SHALL stay scoped to the currently selected
   account, same as the rest of Activity.

### Screens / components touched
- Existing, modified: [Activity.svelte](src/pages/Activity.svelte) —
  granularity switcher, per-granularity nav/picker, header total, bucketed
  Date view, period-scoped Category view.
- New data helpers (exact placement — `db.js` alongside `getMonthSummary`/
  `getYearlyTrend`, or `transactions.js` next to the other Activity-only
  queries — TBD during implementation):
  - Day and week summaries/transaction lists (expense/income totals for a
    single day; for a Mon–Sun range).
  - Per-day totals within a month (for requirement 4's Monthly bucket
    list) and within a week.
  - Per-month totals within a year (requirement 4's Yearly bucket list) —
    `getYearlyTrend` already returns this shape (income[]/expense[] by
    month index), reusable directly.

### Data model
- Stores read: `transactions`, `accounts` (unchanged stores, no new
  fields).

### Out of scope
- A "Chart" tab (the original app has one alongside Date/Category) — this
  app already has charts on the Reports page; not duplicating here.
- An all-time/lifetime balance display inside Activity (confirmed with
  the user — Home already shows this).
- Changing results-mode (search/filter) behavior — untouched.

### Open questions
None.

### Acceptance criteria
- [ ] Activity opens to Monthly/current-month/Type=All, header showing
      this month's net.
- [ ] Switching granularity and paging (day/week/month/year, both
      directions, including into the future) updates the header total and
      the Date/Category lists to match.
- [ ] Yearly Date view shows 12 month rows; tapping one switches to
      Monthly for that month.
- [ ] Monthly and Weekly Date views show day rows; tapping one switches to
      Daily for that day, showing that day's transactions.
- [ ] Category view's totals match whatever period is currently selected.
- [ ] Entering results mode (including setting the Filters-sheet Type to
      Income/Expense) hides the switcher/nav/header total, same as today.

### Notes
- Week boundary (Monday–Sunday vs Sunday–Saturday) is a concrete proposal
  (Monday–Sunday, ISO-style) — flag for adjustment if the original app
  used Sunday-start weeks.
- Switching granularity while mid-period (e.g. Yearly → Monthly) anchoring
  behavior (jump to today's month, or to a month inside the year you were
  looking at) is an implementation detail to settle while building, not
  blocking approval.
- TODO.md's `Activity` entry (search, filter chips, grouped by month/day
  with net totals, tap-to-edit) and `Calendar` entry (unbounded month nav)
  are the closest audited originals; neither fully covers this screen, so
  this spec stands on its own rather than extending either entry.
