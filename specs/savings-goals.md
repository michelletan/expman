## Savings goals

**Status:** Approved

### Summary
An optional, ongoing per-account monthly target: "save at least $X this
calendar month," where saved = that month's income minus expense (the
same net Home already computes). Confirmed with the user: calendar-month
aligned (1st–last day), evaluated from real transactions, no manual
"amount saved" entry and no link to a specific account's balance —
purely income-minus-expense for the month.

### User stories
- As a user, I want to set a monthly savings target for an account and
  see at a glance whether I'm on track this month.

### Requirements
1. WHEN the user opens Settings THE APP SHALL show a "Savings Goal" row.
2. WHEN the user taps the Savings Goal row THE APP SHALL open an edit
   screen scoped to the currently selected account, pre-filled with that
   account's current goal amount if one is set (blank otherwise).
3. WHEN the user enters an amount and saves THE APP SHALL persist it as
   that account's ongoing monthly goal (via the existing `meta` store,
   key `savingsGoal:<accountId>`) — no start/end date: it applies to the
   current and every future calendar month until changed or cleared.
4. WHEN the user clears the goal THE APP SHALL remove that meta key, so
   Home stops showing a goal card for that account.
5. WHEN Home is shown for an account with a goal set THE APP SHALL show
   a "Savings goal" card (placed after the balance/net section, before
   the Budgets section) with this calendar month's net (income −
   expense, via the same `getMonthSummary` calculation Home's own net
   figure already uses) against the goal amount, as a `$saved / $goal`
   line plus a progress bar clamped to 0–100%.
6. WHEN Home is shown for an account with no goal set THE APP SHALL show
   nothing for this feature — no empty state, matching how Budgets/Cards
   already behave when there's nothing to show.
7. WHEN the month's net is negative (spent more than earned) THE APP
   SHALL still display the real signed amount as text, with the progress
   bar showing 0%.
8. WHEN the selected account on Home changes THE APP SHALL show, hide,
   or recompute the goal card for the newly selected account — each
   account's goal (or lack of one) is independent.

### Screens / components touched
- New: `src/pages/SavingsGoal.svelte` — small edit screen (amount input,
  Save, Clear, Back), scoped to the current account, following the same
  topbar/field pattern as [AddAccount.svelte](src/pages/AddAccount.svelte).
- New: a small presentational card for Home (e.g.
  `src/lib/components/GoalCard.svelte`), following the same
  label/amount/progress-bar shape [BudgetCard.svelte](src/lib/components/BudgetCard.svelte)
  already establishes.
- Existing, modified:
  - [Home.svelte](src/pages/Home.svelte) — load + render the goal card
    for the selected account.
  - [Settings.svelte](src/pages/Settings.svelte) — new "Savings Goal" row.
  - [App.svelte](src/App.svelte) — new `SavingsGoal` screen route
    (reached from Settings, same pattern as Accounts/Theme).

### Data model
- Stores read/written: `meta`, via the existing `getMeta`/`setMeta`
  helpers, key `savingsGoal:<accountId>` → number. No new IndexedDB
  store, no `DB_VERSION` bump.
- No new low-level query needed — goal status reuses the existing
  `getMonthSummary(currentYearMonth(), accountId)` (already computes
  `{income, expense}` for a month/account, same call Home already
  makes for its own net figure). A small `getSavingsGoalStatus(accountId)`
  helper in [transactions.js](src/lib/data/transactions.js), mirroring
  `getBudgetStatuses`'s shape, composes the meta read + summary call for
  Home to consume in one call.

### Out of scope
- Goal history / viewing past months' goal status — this is always
  "this calendar month," same as Home's own net figure (no month-nav).
- Multiple simultaneous goals per account, or category-specific goals.
- Rollover (unmet/exceeded amounts carrying into next month's target).
- Reminders/notifications when off-pace mid-month.
- Linking progress to a specific account's balance rather than its
  monthly income/expense (confirmed with the user — see Summary).

### Open questions
None.

### Acceptance criteria
- [ ] Settings shows "Savings Goal"; opening it shows the current
      account's goal (or blank).
- [ ] Saving an amount makes Home immediately show the goal card for
      that account with this month's real income − expense vs. the goal.
- [ ] Clearing the goal removes the card from Home for that account.
- [ ] Switching accounts on Home shows each account's own goal
      independently (or nothing, if that account has none).
- [ ] A month where expenses exceed income shows a negative signed
      amount and a 0% bar, not a crash or a clamped-positive number.
- [ ] Example from the user holds: income $5,000, expense $3,000 → net
      $2,000 shown against the goal amount.

### Notes
- Mirrors the existing Budgets/Cards convention of "if there's nothing
  to show, show nothing" on Home rather than an empty-state placeholder.
