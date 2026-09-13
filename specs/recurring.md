## Recurring transactions

**Status:** Approved

### Summary
Recurring rules (subscriptions, salary, rent, etc.) that materialize into
real `transactions` rows as their occurrences become due — not a
separate parallel concept Home/Activity/balance have to special-case.
Each materialized transaction is a normal transaction with one extra
field, `recurringId`, linking it back to the rule that generated it
(replacing the original app's fragile `note === 'Repeating:<description>'`
string convention with a proper id, consistent with everything else this
project references by id). Reached from Home's existing "🔁 Recurring"
button (currently a stub).

### User stories
- As a user, I want to set up a subscription or salary once and have it
  keep showing up in my transactions and balance automatically, so I
  don't have to log it every month by hand.
- As a user, I want to cancel a subscription and have it stop generating
  new charges, without losing the history of what it already charged.
- As a user, when I fix a mistake in a rule (wrong amount, wrong
  category), to choose whether that fix applies only going forward or
  rewrites what it already generated.

### Requirements

**Data model** (see also Data model section below)
1. A rule's cadence is `daily`, `weekly`, `monthly`, or `annual`.
   `startDate` is always a real, valid calendar date (the first — already
   clamped — occurrence). Monthly/annual additionally store an *intended*
   `dayOfMonth` (1–31), decoupled from `startDate`, so later
   months/years re-clamp independently instead of drifting: your own
   example — reset day 31, starting November 2025 — stores
   `startDate: 2025-11-30` (November's real last day) and
   `dayOfMonth: 31`, so December correctly lands on the 31st, not the
   30th again. Annual additionally stores `anchorMonth` (1–12, taken from
   `startDate`'s month), and clamps the same way for Feb 29 in
   non-leap years. Reuses the `lastDayOfMonth`/clamp logic already
   written for Cards' `resetDate` (specs/cards.md).
2. A rule ends one of three ways — `endMode`: `'date'` (stops after
   `endDate`), `'count'` (stops after `occurrenceCount` total
   occurrences, ever — matches your salary example: "12 times"), or
   `'never'` (runs until manually cancelled).
3. Deleting a rule is a **soft delete** (`isDeleted: true`), consistent
   with Accounts/Categories/Cards — it disappears from the Recurring list
   entirely, but transactions it already generated are untouched and
   don't depend on the rule still existing (they're self-contained rows
   with their own `accountId`/`categoryId`/etc.; `recurringId` is
   provenance only).

**Materialization**
4. Occurrences are **not** pre-generated into the future. A rule's next
   due occurrence(s) become real `transactions` rows (`recurringId` set)
   WHEN: (a) the app boots, for every active rule with at least one
   occurrence whose date is `<=` today and not yet materialized —
   catching up on *every* missed occurrence if the app wasn't opened for
   a while, not just the most recent one; and (b) immediately after a
   rule is created or saved, so a backdated start date's overdue
   occurrences show up right away instead of waiting for the next boot.
5. How many occurrences already exist for a rule is **not** stored as a
   separate counter — it's computed by counting
   `transactions.filter(t => t.recurringId === rule.id)` at
   materialization time, same "derive at read time" approach already
   used for `computeBudgetStatus`/`getCardPeriod`, avoiding a counter
   that could drift out of sync with reality.
6. A rule stops generating once: `endMode==='date'` and the next
   occurrence would be after `endDate`; or `endMode==='count'` and the
   materialized count has reached `occurrenceCount`; or the rule is
   cancelled (requirement 9) or soft-deleted.

**Editing an active rule**
7. WHEN saving an edit to a rule that already has **at least one**
   materialized transaction, AND the edit changes a field that matters
   for how those transactions display (`accountId`, `categoryId`,
   `subcategoryId`, `amount`, `description`, `paymentMethod`, `type`) —
   THE APP SHALL show a choice before saving: **"Apply to all
   transactions this rule created"** (bulk-updates every existing
   `transactions` row with that `recurringId` to the new values) or
   **"Only future occurrences"** (the rule's new values are saved; every
   already-materialized transaction is left exactly as it was). Editing
   only schedule fields (frequency, `startDate`, `dayOfMonth`,
   `anchorMonth`, `endMode`/`endDate`/`occurrenceCount`) never shows this
   — those only affect what happens next, not any existing row.
8. A brand-new rule (zero materialized transactions yet) saves directly,
   no choice shown — there's nothing to apply retroactively to.

**Cancel vs. delete**
9. **Cancel** stops future occurrences but keeps the rule **visible** in
   the Recurring list's Completed section (so you can still see what it
   was) — implemented as setting `endMode: 'count'`,
   `occurrenceCount: <current materialized count>` (no separate
   "cancelled" flag; a cancelled rule is just one whose count-based end
   was reached right now). Past transactions are untouched.
10. **Delete** (requirement 3) removes the rule from the list entirely —
    a different action from Cancel, reachable separately in the edit
    form (matching TODO.md's original-app pattern of "Mark as ended
    today" and "Delete" as two distinct actions).

**Recurring list**
11. THE APP SHALL split rules into **Upcoming** (active — not deleted,
    and not yet at their end condition) and **Completed** (deleted-
    status aside — reached their end date/count, or cancelled), each row
    showing description, amount, frequency, and next due date (Upcoming)
    or nothing further (Completed).
12. Tapping a rule opens it in the Add/Edit form (requirement 13) — no
    separate read-only Details screen, unlike Cards; a recurring rule's
    "detail" already lives in the real transactions it generated,
    browsable in Activity.
13. THE APP SHALL show an "Add" control that opens the form blank.

**Add/Edit Recurring form**
14. Fields: type (income/expense) toggle, amount, description, account
    (picker), category (Category Picker, optional — same as a regular
    transaction), payment method (Payment Picker, expense only),
    frequency, start date, day-of-month (monthly/annual only, defaults to
    the start date's own day when the field first appears, freely
    editable after — this is how the salary example's "31" gets entered
    even though the visible start date has to be a real day), end mode
    with its corresponding field (end date, or occurrence count).
15. Saving requires: amount > 0, a start date, and (if `endMode` is
    `'date'`) an end date on/after the start date, or (if `'count'`) a
    count `>= 1`.
16. Editing an existing rule shows both **Cancel** (requirement 9) and
    **Delete** (requirement 10) as separate actions, each with its own
    confirmation.

**Home**
17. The existing "🔁 Recurring" ghost button (currently a stub) SHALL
    navigate to the Recurring list.

### Screens / components touched
- New: `src/pages/Recurring.svelte` (list, Upcoming/Completed split),
  `src/pages/AddEditRecurring.svelte` (form), a small "apply to
  all/future" confirmation modal.
- Modified: [Home.svelte](../src/pages/Home.svelte) (wire the Recurring
  button), [App.svelte](../src/App.svelte) (screen routing; runs
  materialization at boot alongside `ensureDefaultAccount`/
  `ensureDefaultCategories`).
- [format.js](../src/lib/data/format.js): the `lastDayOfMonth` helper
  already written for `getCardPeriod` needs exporting (currently
  private) so the recurring date math can reuse it instead of
  duplicating it.
- [db.js](../src/lib/data/db.js): `getRecurringRules`, `getRecurringRule`,
  `createRecurring`, `updateRecurring` (accepts an `applyToAll` flag —
  requirement 7), `cancelRecurring`, `softDeleteRecurring`, and the
  materialization functions: `materializeRecurring(ruleId)` (single
  rule — used after create/save) and `materializeAllRecurring()` (loops
  active rules — used at boot). Both reuse `createTransaction` under the
  hood so a materialized occurrence gets identical defaulting/shape to
  a manually-entered one, plus `recurringId` set.

### Data model
- `recurring`: `{id, accountId, categoryId, subcategoryId, type, amount,
  description, paymentMethod, frequency, startDate, dayOfMonth,
  anchorMonth, endMode, endDate, occurrenceCount, isDeleted, createdAt,
  modifiedAt}`. `dayOfMonth`/`anchorMonth` are `null` for daily/weekly;
  `anchorMonth` is `null` for monthly too (only annual needs it).
- `transactions.recurringId`: `string | null` — set on every
  auto-materialized transaction, `null` on manually-entered ones. Not
  required for a transaction to display or compute correctly; purely
  provenance, resolved live if the app ever wants to show "this came
  from your Netflix rule," same optional-enrichment pattern as
  `categoryLabel`/`paymentLabel` in `resolveTransactionLabels`.

### Out of scope
- A notification/summary of what got auto-posted at boot (TODO.md's
  original app had one — "person is notified with a summary"); this spec
  just posts silently. Easy to add later without a data model change.
- Quarterly/half-yearly cadences (TODO.md's original app had these; your
  ask specifies daily/weekly/monthly/annual only).
- Any Budgets integration (materialized transactions count toward
  balance/Activity like any other transaction, but nothing here builds
  the not-yet-existing Budgets CRUD feature).

### Acceptance criteria
- [ ] A monthly rule anchored on day 31, starting in a 30-day month,
      posts on that month's last real day, then correctly lands on the
      31st in a month that has one.
- [ ] An annual rule anchored on Feb 29 posts on Feb 28 in non-leap
      years.
- [ ] Opening the app with an overdue rule posts one transaction per
      missed occurrence, not just the most recent.
- [ ] Creating a rule with a start date in the past immediately posts
      its overdue occurrences, without needing an app restart.
- [ ] Reducing a count-based rule's `occurrenceCount` below what's
      already materialized stops further posting; every already-posted
      transaction is untouched.
- [ ] Editing amount/category on a rule with existing transactions shows
      the all-vs-future choice; picking "all" updates every linked
      transaction, picking "future" changes none of them. A brand-new
      rule with nothing materialized yet skips the choice entirely.
- [ ] Cancel stops future occurrences and moves the rule to the
      Completed section, still visible; Delete removes it from the list
      entirely. Neither touches already-materialized transactions.
- [ ] Home's "🔁 Recurring" button opens the Recurring list instead of
      alerting.

### Notes
Source: this feature wasn't in PRD.md — spec'd directly from your
description, refined through Q&A. Cross-reference
[TODO.md](../TODO.md) → "Recurring", "Recurring Form" for the original
app's version (frequency options, note-based linkage, "Mark as ended
today" wording) that this deliberately diverges from where noted above.

The day-of-month/anchor-month decoupling (requirement 1) is the one
piece of real design work in this spec, not just a straightforward CRUD
port — it exists specifically because a literal `startDate` alone can't
express "the 31st" starting from a 30-day month, which your own salary
example requires.
