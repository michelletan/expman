## Budgets

**Status:** Approved

### Summary
Per-category (or per-subcategory) monthly spending limits, with optional
rollover of unspent amounts into the next month — reusing/extending the
`computeBudgetStatus` rollover math already built in
[db.js](../src/lib/data/db.js). Shown as a snapshot on Home (existing
stub, currently fed by placeholder data) and managed on a new, full
Budgets screen (list/add/edit), reached from Home's "💰 Budgets" button
(currently a stub). Tapping a budget drills into Activity, filtered to
its category — the same pattern Recurring uses instead of a dedicated
detail screen.

### User stories
- As a user, I want to cap my monthly spend on a category (or a specific
  subcategory within it), so I notice when I'm close to going over.
- As a user, I want unspent budget to optionally carry into next month, so
  a light month gives me more room the month after — but I want to be
  able to turn that off for a budget where it doesn't make sense.
- As a user, I want to see all my budgets and their totals at a glance,
  not just the few Home has room for.

### Requirements

**Data model** (see also Data model section below)
1. A budget targets either a whole category (`subcategoryId: null`) or one
   specific subcategory within it (`subcategoryId` set, `categoryId` its
   parent) — id-based, resolved live, consistent with every other entity
   in this app. Monthly only for v1 (see Notes) — no `period` field yet.
2. `isRollover` (boolean): when true, a month's available amount is that
   month's `amount` plus the previous month's leftover, recursively
   (existing `computeBudgetStatus` behavior, capped 24 months back). When
   false, available is always just that month's own `amount` — nothing
   ever carries over.
3. `startDate` (the month rollover/history starts from — replaces the
   current `budget.createdAt` boundary) and optional `endDate`. A budget
   with no `endDate` runs indefinitely.
4. Deleting a budget is a **hard** delete — nothing references a budget's
   id elsewhere (matches Transactions' rationale, and TODO.md's original
   "Remove this budget deletes the limit only, transactions stay").
5. **Uniqueness**: at most one budget per category, and separately at
   most one budget per subcategory — so "Food" and "Food / Dining out"
   can each have their own budget at the same time. "+ Add budget" only
   offers categories/subcategories that don't already have one.
6. **Spend counts toward every budget it matches**: a Dining Out expense
   counts against both the Dining Out subcategory budget (if one exists)
   and the parent Food category budget (if one exists) — a category
   budget's spend is every expense under it regardless of subcategory,
   same as `computeBudgetStatus` already computes today. This means a
   category's total and its subcategory's total can overlap by design;
   see Notes.
7. Budgets only ever target **expense** categories/subcategories — spend
   tracking is meaningless for income, and `computeBudgetStatus` already
   only sums `type === 'expense'` transactions.
8. A budget is **active for a given month** when that month falls within
   `[startDate's month, endDate's month or unbounded]`.

**Home** (existing stub — see [Home.svelte](../src/pages/Home.svelte))
9. THE APP SHALL show up to 3 budgets active for the current month, same
   as today's stub — if there are none, the whole "Budgets this month"
   section shows nothing (PRD.md, matches the existing `{#if
   budgets.length}` guard).
10. The "💰 Budgets" ghost button (currently a stub) SHALL open the
    Budgets screen.
11. Tapping a budget card (Home or the Budgets screen) SHALL switch to
    Activity, current month, Date view, filtered to that budget's
    category (or subcategory, if subcategory-scoped) — see requirement
    15.

**Budgets screen** (new)
12. Month navigation local to the screen (`‹ Sep 2026 ›`), resetting to
    the current month every time the screen opens — no tap-to-jump picker
    (unlike Activity's), matching TODO.md's original scope for this
    screen.
13. Header totals for the selected month: total budgeted (sum of each
    active budget's `amount` + any rolled-in amount), total spent, amount
    left (budgeted − spent) — simple sums across every active budget; see
    Notes on overlap.
14. Lists every budget active for the selected month as a card (reusing
    [BudgetCard.svelte](../src/lib/components/BudgetCard.svelte)),
    tapping one drills into Activity per requirement 11.
15. A floating "+ Add" button opens the Add/Edit Budget form.

**Add/Edit Budget form** (new)
16. Fields: name, target (category or subcategory — via
    [CategoryPicker](../src/lib/components/CategoryPicker.svelte),
    expense-only, extended to hide already-budgeted targets — requirement
    5), amount, rollover toggle, start date (defaults to today), optional
    end date.
17. Saving requires: name, a target, `amount > 0`, a start date, and (if
    set) an end date on/after the start date.
18. Editing an existing budget shows Delete with a confirmation modal
    (matching every other delete flow in this app). Deleting a budget
    never touches transactions.

**Activity** (extended)
19. Activity's existing category drill-in (specs/transactions.md
    requirement 29) is extended to optionally also filter by
    `subcategoryId`, and to accept the filter as an entry prop (consumed
    once on open) rather than only being reachable by tapping a Category
    view row — this is what lets a Budget's "view transactions" jump land
    pre-filtered.

### Screens / components touched
- New: `src/pages/Budgets.svelte` (list + header totals + month nav),
  `src/pages/AddEditBudget.svelte` (form).
- Modified: [Home.svelte](../src/pages/Home.svelte) (wire the "💰
  Budgets" button; budget snapshot already exists, just needs real
  active-this-month data), [App.svelte](../src/App.svelte) (routes
  Budgets/AddEditBudget; passes an optional category/subcategory filter
  into Activity when opened from a budget tap),
  [Activity.svelte](../src/pages/Activity.svelte) (requirement 19: accept
  an initial category/subcategory filter, extend the existing filter to
  cover subcategoryId too),
  [CategoryPicker.svelte](../src/lib/components/CategoryPicker.svelte)
  (accepts an optional set of already-taken category/subcategory ids to
  exclude from the list — generic enough for any future caller, not
  budget-specific).
- [db.js](../src/lib/data/db.js): `getBudgets`, `getBudget`,
  `createBudget`, `updateBudget`, `removeBudget` (hard delete), and a
  rewrite of `computeBudgetStatus` to: key off `subcategoryId` when
  present (falling back to `categoryId`-only spend otherwise, unchanged
  from today), respect `isRollover` (skip the recursive lookup entirely
  when false), use `startDate` instead of `createdAt` as the rollover/
  active boundary, and resolve a display label ("Food" or "Food / Dining
  out") the way `resolveTransactionLabels` already does. Add
  `getBudgetsActiveForMonth(yearMonth)` for Home/Budgets screen to share.

### Data model
- `budgets`: `{id, name, categoryId, subcategoryId, amount, isRollover,
  startDate, endDate, createdAt, modifiedAt}`. `subcategoryId` is `null`
  for a category-level budget.

### Out of scope
- Non-monthly periods (daily/weekly/annual) — PRD.md's schema lists a
  `period` field, but this spec deliberately defers it (see Notes).
  Adding it later means adding the field back and building the
  non-monthly rollover math; no migration of existing monthly budgets
  needed.
- A dedicated Budget Detail screen (independent month nav, "Remove this
  budget" inline) — TODO.md's original app has one; this spec reuses
  Activity's drill-in instead, same call already made for Recurring.
- Settings > Budgets — Recurring isn't reachable from Settings either
  (Home-only for now); Budgets follows the same precedent rather than
  adding a second entry point nothing else has yet.
- Reconciling a budget's account-agnostic spend total (every account,
  same as `computeBudgetStatus` computes today) with Activity's
  account-scoped view when drilling in — a pre-existing inconsistency
  also already true of Category view's own drill-in, not something this
  spec introduces or needs to resolve.

### Acceptance criteria
- [ ] Home shows up to 3 budgets active this month; the whole section
      disappears when there are none.
- [ ] A Food category budget and a Food/Dining Out subcategory budget can
      coexist; a Dining Out expense counts against both.
- [ ] "+ Add budget" hides categories/subcategories that already have
      one.
- [ ] A non-rollover budget's available amount never includes last
      month's leftover; a rollover budget's does, recursively.
- [ ] A budget with an `endDate` in the past no longer shows on Home or
      in the Budgets screen's current-month list, but still shows when
      the Budgets screen is paged back to a month before its end.
- [ ] Tapping a budget (Home or Budgets screen) opens Activity, current
      month, filtered to that category or subcategory.
- [ ] Deleting a budget removes it from every list; its category's past
      transactions are untouched.

### Notes
Source: [PRD.md](../PRD.md) → BUDGETS section, refined through Q&A.
Cross-reference [TODO.md](../TODO.md) → "Budgets", "Budget Detail" for
the original app's simpler (category-only, monthly-only, no name/dates)
version this expands on.

**Monthly-only for v1**: confirmed in Q&A — the already-built
`computeBudgetStatus` rollover math is monthly-specific, and nothing
today needs daily/weekly/annual budgets. PRD.md's `period` field is
deferred rather than added now and left unused.

**Overlapping totals are a known, deliberate simplification**: since a
category budget's spend already includes every subcategory's spend
(requirement 6), a screen showing both a category's budget and one of
its subcategory's budgets side by side — including the Budgets screen's
own header totals (requirement 13) — will show a "total budgeted" and
"total spent" that double-count that overlap. This mirrors the same kind
of deliberate simplification already accepted for Accounts' naive balance
calculation — revisit if it proves confusing in practice, e.g. by
excluding subcategory-budgeted amounts from their parent category's
totals specifically in the *header sum*, while still keeping the
category card's own number as-is.
