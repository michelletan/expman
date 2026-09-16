## Spending call-outs

**Status:** Approved

### Summary
Surfaces short, data-driven insights like "Food is 42% above your
3-month average this month" — purely a comparison of each expense
category's spend against its own recent history, with no dependency on
whether a budget exists (confirmed with the user: budget-relative
pacing/overspend warnings are explicitly out of scope, a separate
feature for later). Shown as a single compact line on Home (current
month) and a fuller ranked list on Reports (whichever month is being
viewed there).

### User stories
- As a user, I want to be told when a category is unusually high or low
  this month compared to my recent habits, without having to go dig
  through Reports charts to notice it myself.

### Requirements
1. WHEN computing call-outs for a given month + account THE APP SHALL
   compare each expense category's spend that month against its own
   trailing 3-prior-month average (the 3 calendar months immediately
   before the target month, excluding the target month itself), scoped
   to that account.
2. WHEN a category's trailing average is $0 (no spend in any of the 3
   prior months) THE APP SHALL exclude it from call-outs — avoids
   divide-by-zero and noise from a category that's simply new.
3. WHEN a category's deviation from its average is under 20% AND under
   $20 in absolute dollar terms THE APP SHALL exclude it — avoids noise
   from trivially small categories/amounts.
4. WHEN ranking qualifying categories THE APP SHALL sort by absolute
   dollar deviation (largest real swings first), not percentage alone,
   so a $5→$15 category (200%) doesn't outrank a $400→$600 one (50%).
5. WHEN Home is shown THE APP SHALL display the single highest-ranked
   call-out for the current calendar month and the selected account (if
   any category qualifies), as one compact line.
6. WHEN Reports is shown THE APP SHALL display up to 3 ranked call-outs
   for whichever month Reports' own month-nav is currently on, as their
   own card positioned above "Spend by category."
7. WHEN no category qualifies for a given month/account THE APP SHALL
   show nothing for this feature — no line on Home, no card on Reports —
   matching the rest of the app's "nothing to show → show nothing"
   convention.
8. WHEN a category is spending notably less than its average THE APP
   SHALL phrase it positively (e.g. "30% below your average"), not only
   surface overspending warnings.
9. WHEN ranking categories THE APP SHALL exclude "Uncategorised" spend
   — it isn't a real, nameable category to compare against itself.

### Screens / components touched
- New: `getSpendingCallouts(yearMonth, accountId)` in
  [transactions.js](src/lib/data/transactions.js) (composed from
  existing per-month category totals, called once for the target month
  and once each for the 3 prior months).
- Existing, modified:
  - [Home.svelte](src/pages/Home.svelte) — loads and shows the single
    top call-out (current month only).
  - [Reports.svelte](src/pages/Reports.svelte) — new call-out card
    (up to 3), respecting the page's existing month-nav.

### Data model
- Stores read: `transactions`, `categories` (no new store/fields) — via
  the existing per-month category aggregation already used by Reports'
  pie chart (`groupTransactionsByCategory`), extended to also total the
  3 prior months per category.

### Out of scope
- Budget-relative call-outs ("pacing to exceed your Food budget") —
  confirmed with the user as a separate, later feature.
- Income call-outs (expense categories only, for now).
- Dismiss/snooze state, or persisting call-outs at all — recomputed
  fresh on every load, nothing new is stored.
- Push notifications/reminders.
- Cross-account aggregation (always scoped to one account, same as
  Budgets/Reports today).

### Open questions
None — the 20%/$20 thresholds, 3-month window, and top-1/top-3 counts
below are concrete proposals; flag any of them for adjustment before
this moves to Approved.

### Acceptance criteria
- [ ] A category spending 42% above its trailing 3-month average shows
      up, worded with the real % and $ figures.
- [ ] A category within 20% and $20 of its average never shows up.
- [ ] A category with no spend in the prior 3 months never shows up
      (avoids the divide-by-zero / "new category" case).
- [ ] Home shows at most 1 line; Reports shows up to 3, ranked by
      absolute $ deviation.
- [ ] Reports' call-outs update when its month-nav changes; Home's
      always reflects the current calendar month.
- [ ] A month/account with no qualifying category shows nothing on
      either screen.
- [ ] Uncategorised spend never appears as a call-out.

### Notes
- Deliberately stateless — no new IndexedDB rows, so there's nothing to
  migrate or clean up if the ranking logic changes later.
