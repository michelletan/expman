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
20. Every other store that references an account (`transactions.accountId`,
    and `recurring.accountId` once Recurring is built) SHALL store the
    account's **id**, not its name — settled project-wide (see
    specs/categories.md's matching decision): reference by id, resolved
    live wherever a name needs to be displayed or exported, never
    snapshotted or cascaded.
21. Renaming an account is therefore a single-field update — no cascade
    function needed. Every transaction referencing the account by id
    automatically shows the new name the next time it's displayed,
    because display always resolves the current name live via id.
22. Account names are **not** required unique. Since nothing references
    an account by name anymore, two accounts can share a name with no
    ambiguity — dropping the uniqueness check (and its rejection-error
    UX) that name-based references required.

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
    + switch button" reading real accounts from the `accounts` store,
    selecting by `id`.
  - [db.js](../src/lib/data/db.js) — `getCurrentBalance`,
    `getMonthSummary`, `getTransactionsForMonth`, `getYearToDate` take an
    account **id** and filter `t.accountId === accountId`, while still
    excluding transactions whose account is soft-deleted
    (`getVisibleTransactions` filters by the deleted-id set). No
    `assertUniqueAccountName` or `updateAccountReferences` — neither is
    needed once references are by id.
  - [App.svelte](../src/App.svelte) — create the default account on first
    boot (requirement 1) instead of nothing; hold current-screen state for
    the new tab bar and Settings sub-navigation.

### Data model
- `accounts`: `{id, name, description, initialBalance, dateCreated,
  isDeleted}` — `currency` and `type` dropped from the current shape.
  `id` stays the store's required primary key.
- `transactions.accountId` / `recurring.accountId` (once Recurring is
  built) store the account's `id` — settled per requirement 20.
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
- [ ] `transactions`/`recurring` reference accounts by id; renaming an
      account changes only that one row, and every transaction
      referencing it shows the new name immediately (resolved live).
- [ ] Two accounts can share the same name with no error or ambiguity.
- [ ] Balance shown equals `initialBalance` + sum of that account's
      transactions.
- [ ] Exporting data includes soft-deleted accounts and their
      transactions; importing shows a replace-everything warning first.

### Notes
Source: [PRD.md](../PRD.md). Cross-reference [TODO.md](../TODO.md) →
"Accounts" and "After the migration is done" sections for the original
app's balance-anchor behavior, which requirement 22 deliberately departs
from for now.

This spec has flip-flopped on referencing twice now: `accountId` →
name-based (to match Categories' then-hard-delete design) → back to
`accountId` (settled project-wide: id-based references, resolved live,
with soft delete everywhere — see the equivalent decision now in
specs/categories.md, which also gives up its hard-delete for this).
This should be the final form — the tradeoffs (rename cost, uniqueness,
export readability) were weighed explicitly before landing here.
