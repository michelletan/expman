## Split transactions

**Status:** Drafting

### Summary
Lets Add Transaction create more than one transaction in one sitting —
e.g. a single supermarket run becomes 3 separate transactions (Vegetables/
Food, Laundry/Household, Baby food/Baby) without re-entering the account,
date, type, or payment method for each one. Confirmed with the user: this
is purely a data-entry shortcut, not a new persisted "split" concept —
once saved, the resulting transactions are completely ordinary and
independent, with no link between them.

### User stories
- As a user, when one purchase covers several categories, I want to log
  each part as its own transaction without retyping the account/date/
  payment method 3 times.

### Requirements
1. WHEN adding a new transaction THE APP SHALL let the user enter more
   than one line, each with its own description, category/subcategory,
   and amount — while account, date, type, and payment method stay
   single shared fields at the top of the form (unchanged from today).
2. WHEN more than one line is present THE APP SHALL show a running total
   of all entered line amounts, for the user's own reference — this
   total is informational only and is never validated against anything
   (there is no separate "total amount" field to match).
3. WHEN the user taps "Add another line" THE APP SHALL append a new
   blank line (description/category/amount).
4. WHEN 2 or more lines are present THE APP SHALL let the user remove
   any one of them; the last remaining line can't be removed.
5. WHEN the user saves with N lines (N ≥ 1) THE APP SHALL create N
   independent transactions — each its own id, description, categoryId/
   subcategoryId, and amount — all sharing the entered accountId, date,
   type, and paymentMethod. With exactly 1 line, this is identical to
   today's single-transaction save.
6. WHEN editing an existing transaction THE APP SHALL NOT show "Add
   another line" — edit always operates on exactly the one transaction
   being edited, same as today, regardless of how it was originally
   created.
7. WHEN transactions are created from multiple lines THE APP SHALL treat
   each one exactly like any other transaction afterward — no shared id,
   group, or marker of any kind links them. They sort, filter, budget,
   and report individually in Activity/Home/Budgets/Reports with zero
   special-casing anywhere else in the app.

### Screens / components touched
- Existing, modified: [AddTransaction.svelte](src/pages/AddTransaction.svelte)
  only — the single Description/Category/Amount block becomes a
  repeatable list of blocks; account/date/type/payment method stay as
  they are today. Saving calls the existing `createTransaction()` once
  per line instead of once total.

### Data model
- Stores written: `transactions` — 1 `put` per line via the existing
  `createTransaction`, unmodified. No new fields, no new store.

### Out of scope
- Editing or "un-splitting" the resulting transactions as a group later
  — once saved they're independent, full stop.
- Any shared id/marker connecting split-created transactions.
- Enforcing line amounts to sum to a declared total (there is no total
  field to enforce against — see requirement 2).
- Splitting an already-saved transaction after the fact (only available
  while adding a new one).

### Open questions
None.

### Acceptance criteria
- [ ] Adding a transaction with 1 line behaves identically to today.
- [ ] Adding 3 lines and saving creates exactly 3 new transactions, each
      independently visible/editable/deletable in Activity.
- [ ] Each of the 3 shares the same account, date, type, and payment
      method; each keeps its own description/category/amount.
- [ ] Save is disabled unless every line has a positive amount and an
      account is selected (category stays optional, "Uncategorised" by
      default, same as today).
- [ ] Editing an existing transaction never shows "Add another line."
- [ ] The running total updates live as lines are added/removed/edited,
      and blocks nothing on save.

### Notes
- No new architecture: this only touches the Add Transaction UI. Every
  other screen (Budgets, Reports, Activity, exports) already operates
  per-transaction-row and needs no changes.
