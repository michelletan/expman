## Reports

**Status:** Approved

### Summary
Five charts replacing the Reports tab's current placeholder: spend by
category (the pie chart this was built for), monthly spend trend, income
vs. expense over time, budget vs. actual, and top spending subcategories
— all scoped to the app-wide selected account (like Home/Activity), all
driven by one shared month/year navigator at the top of the screen.
Rendered with Chart.js — this app's first real runtime dependency,
chosen over hand-rolled SVG for built-in tooltips/legends/animation.

PRD.md has no Reports section at all (just names it as a tab); this spec
is designed from scratch through Q&A, loosely informed by TODO.md's
original Reports/Chart Detail screens (a bar chart + a plain sorted
list, no pie chart, no year-over-year income comparison).

### User stories
- As a user, I want to see where my money went this month at a glance,
  broken down by category.
- As a user, I want to see whether my spending is trending up or down
  over the year, and whether I'm actually saving (income vs. expense).
- As a user with budgets set, I want to see budgeted vs. actual spend
  side by side, not just as separate numbers on the Budgets screen.
- As a user, I want to know which specific subcategories are eating the
  most of my spend, not just which top-level category.

### Requirements

**Navigation (shared across every chart)**
1. One month/year nav at the top (`‹ Sep 2026 ›`, same component as
   Activity/Budgets), resetting to the current month each time the
   screen opens. Month-scoped charts (2, 4, 5 below) use the selected
   month directly; year-scoped charts (3, 4 below — wait, see per-chart
   notes) use just its year.
2. Scoped to the **app-wide selected account** (`accountId` from
   App.svelte) — switching accounts elsewhere changes what Reports shows
   next time it's viewed, same as Activity. No "all accounts" mode (none
   of Home/Activity have one either in this rewrite).

**Chart 1 — Spend by category** (the one originally asked for)
3. A pie/doughnut chart of the selected month's **expense** transactions
   grouped by category (`getCategoryTotalsForMonth`, already built and
   already account-scoped — direct reuse), each category colored to
   match its own `color` field (same colors used everywhere else:
   Category Picker, transaction rows). Legend shows category name +
   amount. Empty state ("No expenses this month") when there's nothing
   to chart.

**Chart 2 — Monthly spend trend**
4. A bar chart of total expense per month across the selected **year**
   (Jan–Dec, current month highlighted if viewing the current year) —
   matches TODO.md's original "mini bar chart of expense-by-month,"
   upgraded from a static mini-chart to the real thing.

**Chart 3 — Income vs. expense over time**
5. A grouped bar chart, two series (income, expense) per month across
   the selected year — same underlying per-month data as Chart 2 (one
   shared query, see below), rendered as its own card so the two
   comparisons stay visually distinct rather than merged into one
   overloaded chart.

**Chart 4 — Budget vs. actual**
6. For every budget active in the selected month
   (`getBudgetsActiveForMonth`, now account-scoped per the
   specs/budgets.md amendment), a grouped bar: budgeted (`totalAvailable`,
   rollover included) vs. spent. Empty state ("No budgets this month")
   when none are active — mirrors Home/Budgets' own empty handling.

**Chart 5 — Top spending subcategories**
7. A horizontal bar chart of the selected month's top 5 subcategories by
   expense (extends the existing, currently-unused `getTopSubcategories`
   to take an optional `yearMonth`/`accountId` scope instead of being
   all-time-only). Uncategorised spend is excluded (matches
   `getTopSubcategories`'s existing behavior — it only counts rows with a
   real `subcategoryId`).

### Screens / components touched
- New: `src/pages/Reports.svelte` (replaces the `Placeholder` currently
  used for this tab), `src/lib/components/charts/PieChart.svelte` and
  `src/lib/components/charts/BarChart.svelte` — thin, reusable Chart.js
  wrappers (canvas ref, create-on-mount, update-in-place when
  labels/datasets change via `$effect`, destroy-on-unmount). `BarChart`
  takes a `horizontal` flag so it also renders Chart 5 without a third
  wrapper component.
- Modified: [App.svelte](../src/App.svelte) (routes Reports with
  `accountId`, same way Activity gets it), [db.js](../src/lib/data/db.js)
  (new `getYearlyTrend(year, accountId)` returning per-month
  `{income, expense}` for all 12 months in one pass over transactions —
  powers Charts 2 and 3 together; `getTopSubcategories` extended with
  optional `yearMonth`/`accountId` params, existing all-time/no-args
  behavior unchanged for any future caller that wants it).
- `package.json`: adds `chart.js` as a real dependency (not a CDN
  script) — this app's first one.
- See also the account-scoping amendment to
  [specs/budgets.md](budgets.md), made while speccing this.

### Data model
No new stores. `getYearlyTrend` and the extended `getTopSubcategories`
are pure read queries over existing `transactions`/`budgets` data.

### Out of scope
- The original app's "Custom report" (arbitrary date range + optional
  category filter) — a filtered summary tool, not a chart; not asked for
  this round, easy to add later as a 6th card without touching the
  others.
- Tapping a chart to drill into Activity (the way Budgets/Recurring
  drill in) — none of the five charts have an obvious single "the
  category/month you tapped" target the way a budget card does; revisit
  if a specific drill-in turns out to be wanted.
- Any chart export/sharing (image, PDF) — not asked for.

### Acceptance criteria
- [ ] All five charts render for a month/account with real data, each
      matching a hand-computed expectation for that data.
- [ ] Switching the account (via Home's switcher) changes what Reports
      shows the next time it's opened.
- [ ] Paging the month/year nav updates every chart consistently (month-
      scoped charts follow the month, year-scoped charts follow the
      year).
- [ ] Each chart has its own empty state when there's nothing to show,
      rather than rendering a broken/blank chart.
- [ ] Chart 5 excludes Uncategorised spend and caps at 5 subcategories.

### Notes
Source: PRD.md names "Reports" as a tab only, no further detail —
designed from scratch through Q&A. TODO.md → "Reports", "Chart Detail"
cross-referenced for the original app's simpler version (one bar chart +
a plain % list, a separate full-year "Chart Detail" drill-down screen —
folded here into Chart 2 directly rather than a separate screen, and the
plain list replaced by an actual pie chart per this round's request).

**Chart.js, not hand-rolled SVG**: confirmed in Q&A — the project's
dependency-free run ends here, traded for real tooltip/legend/animation
support out of the box across five charts rather than hand-building that
in SVG.

**The Budgets account-scoping amendment** (specs/budgets.md) exists
because of this spec: Reports needed an account-scope decision, and
Budgets — the one screen already inconsistent with Home/Activity's
account scoping — got reconciled in the same conversation rather than
left as a second, differently-scoped precedent alongside Reports' new
one.
