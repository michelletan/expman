## Accounts

**Status:** Approved

### Summary
Full account management (create, list, edit, soft-delete), a default
account created automatically on first boot, and the account-switcher on
Home. This is a genuinely new feature — the original `budget-app` only let
you set an existing account's balance, never create/edit/delete one (see
[TODO.md](../TODO.md) → "After the migration is done").

### User stories
- As a first-time user, I want a default account already there on first
  launch, so I can start recording transactions immediately.
- As a user with more than one account, I want to switch which account
  Home is showing, so I can check balances/activity per account.
- As a user, I want to add, edit, and delete accounts from Settings, so my
  account list matches reality (new account, renamed account, account I no
  longer use) — without losing the transaction history tied to a deleted
  account.

### Requirements

**First boot**
1. WHEN the app has no accounts yet THE APP SHALL automatically create one
   default account named "Personal Expense" (`initialBalance: 0`,
   `description: ''`) — no user prompt.

**Main navigation**
2. THE APP SHALL show a tab bar with: Home, Activity, Reports, Settings
   (replacing the current Home/Activity/Calendar/Reports/More — Calendar
   is dropped, "More" becomes "Settings").
3. Home SHALL be the default tab on launch.
4. THE APP SHALL visually highlight whichever tab is currently active.

**Home**
5. Home SHALL display the currently-selected account's name at the top.
6. WHEN the user has more than one non-deleted account THE APP SHALL show
   a switch control next to the account name.
7. WHEN the user taps the switch control THE APP SHALL open a modal
   listing every non-deleted account, and selecting one SHALL make it the
   account Home displays.

**Settings**
8. Settings SHALL list its options, including "Accounts".
9. WHEN the user taps "Accounts" THE APP SHALL navigate to the Accounts
   screen.
10. Every screen reached from Settings SHALL show a back button (top left)
    that returns to Settings.
11. THE APP SHALL keep the tab bar visible on every screen, including
    Accounts and Add Account.

**Accounts screen**
12. THE APP SHALL list every non-deleted account with its name,
    description, and current balance.
13. THE APP SHALL show an "Add account" control (top left) that navigates
    to Add Account.
14. WHEN the user taps an account's name THE APP SHALL open Add Account
    pre-filled with that account's data (edit mode).
15. WHEN the user swipes an account row THE APP SHALL reveal a delete
    button.
16. WHEN the user taps delete THE APP SHALL show a confirmation modal
    before deleting.
17. Deleting an account SHALL be a **soft delete**: set
    `account.isDeleted = true`. The account and its transactions stay in
    IndexedDB untouched, but both disappear from every in-app view (Home,
    Accounts list, switcher modal, Activity, Reports, balance totals, …).
    `exportAll()` SHALL keep including deleted accounts and their
    transactions unfiltered.

**Add Account**
18. Add Account SHALL show fields for: name, description, initial balance.
19. Add Account SHALL show a back button and a save button.

**Account references (data integrity)**
20. Every other store that references an account (`transactions.account`,
    and `recurring.account` once Recurring is built) SHALL store the
    account's **name**, not its id — reverting the earlier `accountId`
    approach so accounts follow the same rule as Categories
    (specs/categories.md requirement 12): reference by name.
21. Renaming an account SHALL cascade: every transaction (and recurring
    rule, once built) referencing the old name gets updated to the new
    name — same treatment as the categories rename-cascade decision
    (specs/categories.md requirement 9), and the same pattern
    `updateRecurringInstances` already uses for category-linked rows.
22. Account names SHALL be unique among **active (non-deleted)**
    accounts. Creating or renaming an account to a name that collides
    with another active account SHALL be rejected with an error. A
    soft-deleted account's old name becomes reusable again (same active-
    only uniqueness rule categories uses, specs/categories.md requirement
    10).

**Balance**
23. An account's current balance SHALL be computed as `initialBalance +
    sum of all its transactions` (income adds, expense subtracts) — a
    plain running total, not the existing anchor-date-based
    `getCurrentBalance()`. This is a deliberate simplification to revisit
    later if it causes problems.

**Import**
24. WHEN the user initiates a data import THE APP SHALL warn them that it
    replaces all existing data before proceeding (matches `importAll()`'s
    existing full-replace behavior in db.js — nothing to change there).
    The import screen/flow itself is a separate feature to spec — this
    only fixes how it interacts with account data.

### Screens / components touched
- New: `src/pages/Accounts.svelte`, `src/pages/AddAccount.svelte`, an
  account-switcher modal component, `src/pages/Settings.svelte` (doesn't
  exist yet).
- Modified:
  - [TabBar.svelte](../src/lib/components/TabBar.svelte) — tabs become
    Home/Activity/Reports/Settings.
  - [AccountTabs.svelte](../src/lib/components/AccountTabs.svelte) /
    [Home.svelte](../src/pages/Home.svelte) — replace the hardcoded
    `['Personal Expense', 'Loans', 'All']` pill-tab row with "account name
    + switch button" reading real accounts from the `accounts` store.
    Home/Accounts/AddAccount can keep selecting/editing accounts by
    `id` internally (it's still the store's primary key) — only what
    *other stores* write into `transactions.account`/`recurring.account`
    changes, back to the account's name.
  - [db.js](../src/lib/data/db.js) — `getCurrentBalance`,
    `getMonthSummary`, `getTransactionsForMonth`, `getYearToDate` take an
    account **name** again (not id) and filter `t.account === accountName`,
    while still excluding transactions whose account is soft-deleted
    (look up the deleted-name set from `accounts`, same idea as
    `getVisibleTransactions` had for ids). `getCurrentBalance` also
    changes to the naive-sum calculation (requirement 22). A new
    `updateAccountReferences(oldName, newName)` (mirroring
    `updateCategoryReferences`) handles the rename cascade (requirement
    21).
  - [App.svelte](../src/App.svelte) — create the default account on first
    boot (requirement 1) instead of nothing; hold current-screen state for
    the new tab bar and Settings sub-navigation.

### Data model
- `accounts`: `{id, name, description, initialBalance, dateCreated,
  isDeleted}` — `currency` and `type` dropped from the current shape.
  `id` stays the store's required primary key.
- `transactions.account` / `recurring.account` (once Recurring is built)
  stay plain name strings, same as before this spec ever introduced
  `accountId` — reverted per requirement 20.
- `exportAll()`/`importAll()` need no shape change — they already pass
  whatever's in each store through as-is, deleted rows included.

### Out of scope
- Activity, Reports, and the rest of Settings' option list beyond
  "Accounts" — left blank per PRD.md, to be spec'd separately.
- The import/export screen itself (file picker, share-sheet flow) — only
  the "warn before replacing data" requirement above is in scope here.
- Calculator, Category/Payment pickers, Calendar, Budgets, Recurring,
  Cards.

### Open questions
None.

### Acceptance criteria
- [ ] First launch with zero accounts silently creates "Personal Expense"
      and shows Home with it selected — no prompt.
- [ ] Tab bar shows Home/Activity/Reports/Settings, Home is default and
      active-tab highlighting works.
- [ ] Home shows the current account's name; the switch control only
      appears with 2+ non-deleted accounts and opens a working
      account-switch modal.
- [ ] Settings lists "Accounts" and navigates to it; every child screen has
      a working back button; tab bar stays visible throughout.
- [ ] Accounts screen lists name/description/current balance per
      non-deleted account; Add, edit (tap), and soft-delete (swipe →
      confirm) all work end to end; deleted accounts and their
      transactions vanish from every in-app view.
- [ ] Add Account's form matches the agreed schema and both back/save work.
- [ ] `transactions`/`recurring` reference accounts by name, and renaming
      an account updates every transaction that referenced the old name.
- [ ] Creating or renaming an account to a name already used by another
      active account is rejected; reusing a soft-deleted account's old
      name is allowed.
- [ ] Balance shown equals `initialBalance` + sum of that account's
      transactions.
- [ ] Exporting data includes soft-deleted accounts and their
      transactions; importing shows a replace-everything warning first.

### Notes
Source: [PRD.md](../PRD.md). Cross-reference [TODO.md](../TODO.md) →
"Accounts" and "After the migration is done" sections for the original
app's balance-anchor behavior, which requirement 22 deliberately departs
from for now.

This spec was originally built and shipped with `accountId`-based
references (26 passing tests, verified in-browser). Requirements 20-21
reverse that in favor of name-based references, to stay consistent with
[specs/categories.md](categories.md). Implementing this means reverting
the `accountId` plumbing in db.js/Home.svelte/tests back toward how it
worked before the Accounts feature existed, plus adding the new
rename-cascade function categories also needs.
