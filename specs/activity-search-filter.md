## Activity search & filter

**Status:** Approved

### Summary
Fixes a real bug — Activity's search currently only matches the visible
month's transactions (specs/transactions.md requirement 25), so searching
for something from 3 months ago finds nothing unless you first page there
manually. This spec makes search span **all time** for the selected
account, and adds filtering by category/subcategory, type, and date
range alongside it. Confirmed with the user: this lives inside the
existing Activity screen (no new tab), stays scoped to the currently
selected account, and doesn't need a "sort by amount" option.

### User stories
- As a user, I want to find a transaction by description regardless of
  which month it happened in.
- As a user, I want to narrow results by category, income/expense, or a
  date range, on top of a text search.

### Requirements
1. WHEN the search box has any text, OR any filter (category, type, date
   range — requirement 4) is active, THE APP SHALL switch Activity from
   month browsing into **results mode**: a flat, newest-first list of
   every transaction for the selected account matching the combined
   search text + filters, regardless of month. This supersedes
   specs/transactions.md requirement 25's month-scoping.
2. WHILE in results mode THE APP SHALL hide the month nav and the Date/
   Category view toggle — neither concept applies to a cross-time result
   set.
3. WHEN the search box is cleared AND no filter is active THE APP SHALL
   return to the normal month-scoped view (Date/Category toggle, month
   nav), showing whatever month was selected before entering results
   mode (untouched the whole time, not reset).
4. THE APP SHALL show a "Filters" control next to the search box that
   opens a sheet with:
   - **Category/subcategory** — optional, any category across both
     income and expense (not limited to one type the way Add
     Transaction's picker is)
   - **Type** — All / Income / Expense
   - **Date range** — optional From/To dates, unbounded by default
   Filters apply live as they're changed (no separate "Apply" step,
   matching how search-as-you-type already works) — the sheet has a
   "Clear filters" action and a close button.
5. WHEN one or more filters are set THE APP SHALL indicate this on the
   Filters control itself (e.g. a badge/dot), visible even with the
   sheet closed.
6. Search text SHALL continue to match only `description`, case-
   insensitive substring (unchanged from today) — combined with any
   active filters using AND.
7. Results SHALL stay scoped to the currently-selected account, same as
   every other screen (confirmed with the user — not cross-account).
8. WHEN more than 200 transactions match THE APP SHALL show only the
   most recent 200 (newest first) with a note that results were
   truncated (e.g. "Showing the most recent 200 of 640 matches — narrow
   your search to see more"), rather than rendering an unbounded list.
9. The existing single-category filter chip — reached via Category
   view's drill-in, or a Budget tap from Home (specs/transactions.md
   requirement 29, specs/budgets.md requirement 19) — SHALL be
   unchanged: a separate, **month-scoped** mechanism, not merged into
   these new all-time filters. (Merging them would silently change what
   a budget tap shows, which isn't part of this spec.)

### Screens / components touched
- Existing, modified:
  - [Activity.svelte](src/pages/Activity.svelte) — results mode, the new
    Filters sheet, and the all-time query.
  - [CategoryPicker.svelte](src/lib/components/CategoryPicker.svelte) —
    extended to accept `type: 'all'` (showing both Income and Expense
    groups) alongside its existing `'income'`/`'expense'`, reused here
    rather than building a second category picker.
- New: a small `searchTransactions()` query in
  [transactions.js](src/lib/data/transactions.js), composing
  `getVisibleTransactions()` with the account/search/category/type/
  date-range filters and the 200-row cap.

### Data model
- No new stores or fields — purely a query and UI change, built on the
  existing `getVisibleTransactions()` primitive already used elsewhere
  (e.g. `getRecentTransactions`, `getYearlyTrend`).

### Out of scope
- Sorting by amount (confirmed with the user — newest-first stays the
  only order).
- A dedicated Search tab (confirmed — this lives inside Activity).
- Cross-account search (confirmed — stays scoped to the selected
  account).
- Changing the existing month-scoped Category view or the budget-tap/
  category-drill-in filter chip (requirement 9).
- Saved searches/filter presets.

### Open questions
None.

### Acceptance criteria
- [ ] Searching a description from 6 months ago finds it without first
      navigating to that month.
- [ ] Setting a category filter with no search text also enters results
      mode and narrows correctly.
- [ ] Combining search text + category + type + date range narrows by
      all of them together (AND).
- [ ] Clearing search and all filters returns to the exact month that
      was showing before.
- [ ] A budget tap from Home still opens Activity filtered to just that
      category, for just that month, exactly as before.
- [ ] A result set over 200 shows the truncation note and only renders
      200 rows.

### Notes
- The 200-row cap and "live-apply, no Apply button" behavior are
  concrete proposals — flag either for adjustment before this moves to
  Approved.
