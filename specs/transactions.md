## Transactions

**Status:** Approved

### Summary
The core feature everything else has been building toward: recording
income/expense entries, editing/deleting them, and browsing them via
Home's recent-activity list and a new Activity screen with two views
(by date, by category). Adds Add Transaction (one page for both add and
edit) plus two shared picker sheets (Category Picker, Payment Picker)
reused from it. References accounts/categories/subcategories/cards by
id, resolved live, matching the project-wide decision in
[specs/accounts.md](accounts.md).

### User stories
- As a user, I want to log an expense or income entry in a few taps, so
  tracking spending doesn't feel like a chore.
- As a user, I want to see my recent transactions on Home and browse a
  full month of them in Activity, so I can review what I've spent.
- As a user, I want to see a month's spending broken down by category, so
  I can tell at a glance where the money went, not just when.
- As a user, I want to search and page through past months, so I can
  find a specific transaction later.

### Requirements

**Data model** (see also Data model section below)
1. `type` SHALL be `income` or `expense`; `amount` is always a positive
   magnitude — the sign is implied by `type` (matches
   `fmtMoneySigned` already in format.js).
2. `categoryId` (and therefore `subcategoryId`) SHALL be optional. WHEN
   absent, the transaction displays as "Uncategorised" (PRD.md).
3. `date` is a user-editable `YYYY-MM-DD`, defaulting to today —
   distinct from `createdAt`/`modifiedAt`, which are immutable/
   auto-updated audit timestamps. Every existing month-scoped query
   (`getMonthSummary`, `getCurrentBalance`, `getTransactionsForMonth`,
   `getYearToDate`, `computeBudgetStatus`) already filters by `date` and
   is unaffected by this spec.
4. `paymentMethod` is `'cash'` or a card's id, and only meaningful for
   `expense` transactions (income has no payment method).

**Account scoping (app-wide)**
5. The currently-selected account SHALL move up out of `Home.svelte`'s
   local state into `App.svelte`, shared between Home and Activity —
   both filter by the same selection instead of each keeping their own.
   The account-switcher modal (opened from Home) updates this shared
   selection.

**Home**
6. THE APP SHALL show a collapsible section (collapsed by default) below
   the month-expense lead metric, containing: total account balance
   (`getCurrentBalance`) and this month's net balance (income − expense).
7. The "+ Add Income" button SHALL open Add Transaction pre-set to
   `income` (currently a stub).
8. THE APP SHALL show a floating "+" button (bottom right, above the tab
   bar — same pattern as Categories' FAB) that opens Add Transaction
   pre-set to `expense`.
9. Recent activity SHALL show the last **5** transactions (was 6 —
   correcting to match PRD.md). Tapping a row SHALL open that
   transaction in Add Transaction, in edit mode (currently a stub).
10. "Recurring" and "Budgets" shortcut buttons stay stubs — out of scope.

**Add Transaction**
11. One page SHALL serve both adding a new transaction and editing an
    existing one.
12. THE APP SHALL show an Income/Expense toggle, defaulting to whichever
    the entry point implies (requirements 7-9) — the user can still
    switch it before saving.
13. Fields: account (picker among active, non-deleted accounts), amount,
    description (optional), date (defaults to today), category +
    subcategory (via Category Picker, optional), payment method (via
    Payment Picker, expense only).
14. Saving SHALL require `amount > 0`; everything else is optional.
    Creating sets `createdAt`; every save (create or edit) sets
    `modifiedAt`.
15. WHEN editing an existing transaction THE APP SHALL show a Delete
    button with a confirmation modal (matching Accounts/Categories'
    delete-confirmation pattern). Deleting a transaction is a **hard**
    delete — nothing else references a transaction by id, so there's no
    id-resolution reason to soft-delete it (unlike accounts/categories).
16. A back button SHALL discard unsaved changes and return to wherever
    Add Transaction was opened from.

**Category Picker** (shared sheet, opened from Add Transaction)
17. THE APP SHALL list categories filtered by the transaction's current
    type (income categories for an income transaction, expense for
    expense), using the existing `getCategoriesSorted(type)`.
18. Selecting a subcategory SHALL set both `categoryId` and
    `subcategoryId` on the draft and close the picker. THE APP SHALL also
    offer an explicit "No category" / "Uncategorised" option, so an
    existing choice can be cleared (category being optional, per
    requirement 2).
19. Opening the picker SHALL NOT clear an amount (or any other field)
    already entered on the Add Transaction sheet underneath (matches
    TODO.md's original-app requirement for this same component).

**Payment Picker** (shared sheet, expense only)
20. THE APP SHALL show "Cash" plus one row per active (non-deleted) card
    from `getCards()`. Selecting a row sets `paymentMethod` to `'cash'`
    or that card's id.
21. **Dependency**: Cards ([specs/cards.md](cards.md)) is specced but its
    `db.js` layer (`getCards`, etc.) isn't built yet. Until it is, this
    picker SHALL just show "Cash" — no error, no broken state, just an
    empty card section.

**Activity — shared behavior**
22. Activity SHALL replace the current `Placeholder` for that tab, and
    SHALL be scoped to the app-wide selected account (requirement 5).
23. Default view: the current month.
24. A month picker (`‹ Sep 2026 ›`), centered at the top of the screen,
    SHALL let the user page to any other month, with no upper/lower
    bound. Tapping the month/year label itself (rather than the ‹ ›
    arrows) SHALL open a jump-to picker: a year stepper plus a 12-month
    grid, so paging isn't the only way to reach a distant month.
25. A search bar SHALL filter the visible month's transactions by
    `description` text (scoped to description only, not
    category/subcategory — see Notes).
26. A view toggle SHALL let the user switch between **Date view** and
    **Category view** for the selected month (requirements 27-28).

**Activity — Date view**
27. Lists every matching transaction for the month, **newest first**.
    Each row shows: description on the first line, category/subcategory
    name on the second line (or, if there's no description, just the
    single category/subcategory line); amount top right; payment method
    (resolved to "Cash" or the card's current name) bottom right. Tapping
    a row opens it in Add Transaction, in edit mode.

**Activity — Category view**
28. Shows a summary, not individual transactions: one row per category
    that has at least one matching transaction that month (including an
    "Uncategorised" row when applicable), each showing that category's
    total for the month, sorted largest total first. Grouped by category
    only — subcategories aren't broken out separately here.
29. WHEN the user taps a category row THE APP SHALL switch to Date view,
    filtered to just that category, for the same month (so category view
    is a way *into* the transaction list, not a dead end).

### Screens / components touched
- New: `src/pages/AddTransaction.svelte`, `src/pages/Activity.svelte`
  (replaces the `Placeholder` currently used for that tab, and renders
  both Date view and Category view internally, toggled by requirement 26),
  `src/lib/components/CategoryPicker.svelte`,
  `src/lib/components/PaymentPicker.svelte`.
- Modified: [Home.svelte](../src/pages/Home.svelte) (collapsible balance
  section, FAB, Add Income wiring, recent-activity tap → edit, limit
  6 → 5, and its account-selection state moves out per requirement 5),
  [App.svelte](../src/App.svelte) (owns the shared `accounts`/
  `accountId`/switcher state per requirement 5; routes Activity to the
  real page; routes Add Transaction from Home's FAB/Add Income/
  recent-activity tap and from Activity's row tap).
- [format.js](../src/lib/data/format.js): `shiftYearMonth(yearMonth,
  delta)` for the ‹ › step buttons (listed as not-yet-ported in TODO.md),
  and the exported `MONTH_SHORT` array (already used internally for
  `fmtDateShort`) reused for the jump-to picker's month grid labels — no
  new picker component; it's built inline in Activity.svelte since
  nothing else needs month-jumping yet.
- [db.js](../src/lib/data/db.js): `createTransaction`, `updateTransaction`,
  `removeTransaction` (hard delete), `getTransaction(id)`, and a
  category-totals helper for Category view (group a month's visible
  transactions by `categoryId`, summing `amount`). Existing
  `getTransactionsForMonth`/`getRecentTransactions` etc. are reused as-is
  (requirement 3).

### Data model
- `transactions`: `{id, accountId, amount, description, type, categoryId,
  subcategoryId, paymentMethod, date, createdAt, modifiedAt}`.
- No `status` field (the original app's `'Uncleared'` default) — PRD.md's
  schema doesn't include one, so it's deliberately dropped, not
  ported.

### Out of scope
- The Calculator sheet (TODO.md) — a plain numeric input is enough for
  now; PRD.md's Add Transaction description doesn't ask for one.
- Recurring transactions and Budgets (both still separate, not-yet-built
  features — their Home shortcut buttons stay stubs).
- Filter chips on Activity (TODO.md's original app had them; this PRD
  doesn't ask for them).
- Day-level grouping/headers in Date view (TODO.md's original app
  grouped by month-then-day; Category view now covers the "group by
  something other than a flat list" need a different way).
- Building out Cards' `db.js` layer — Payment Picker depends on it
  (requirement 21) but this spec doesn't implement it.

### Acceptance criteria
- [ ] Home and Activity share one selected-account state (owned by
      App.svelte); switching accounts on Home changes what Activity shows
      too.
- [ ] Home's collapsible section shows total balance + this month's net
      (income − expense), collapsed by default.
- [ ] "+ Add Income" and the new FAB both open Add Transaction, pre-set
      to income/expense respectively.
- [ ] Recent activity shows 5 rows (not 6); tapping one opens it in edit
      mode.
- [ ] Add Transaction saves with just an amount; category, description,
      payment method, and a backdated `date` are all optional/editable.
- [ ] Editing shows Delete with confirmation; deleting removes the row
      entirely (hard delete) and touches nothing else.
- [ ] Category Picker filters by the transaction's type, offers an
      explicit "Uncategorised" option, and never clobbers an
      already-typed amount underneath it.
- [ ] Payment Picker shows Cash plus active cards (or just Cash, if Cards
      isn't implemented yet) with no error either way.
- [ ] Activity defaults to the current month in Date view, newest first;
      the month picker (centered) pages with no bound; tapping the
      month/year label jumps straight to any month via the year+grid
      picker; search filters by description.
- [ ] Category view shows one row per category present that month
      (including Uncategorised when relevant), sorted by total
      descending; tapping one switches to Date view filtered to that
      category, same month.

### Notes
Source: [PRD.md](../PRD.md) → TRANSACTIONS section, refined through Q&A.
Cross-reference [TODO.md](../TODO.md) → "Activity", "Add/Edit
Transaction", "Category Picker", "Payment Picker", "Calculator" for the
original app's richer versions of these screens — several of that
richness (filter chips, day-grouping, the Calculator, Debit/Electronic
Transfer as payment methods beyond Cash/card) is deliberately not carried
over here since this PRD doesn't ask for it; easy to add later since none
of it is a data-model change.

PRD.md literally said Activity sorts "asc" (oldest-first) and that search
matches description only; confirmed in Q&A that sorting should actually
be newest-first (requirement 27), and description-only search is correct
as read.
