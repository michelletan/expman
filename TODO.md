# Migration TODO (budget-app → expman)

Full requirements + function inventory, audited from `../budget-app` (the
working vanilla JS/IndexedDB original) against this Svelte port. Source of
truth: `budget-app/index.html` screen/overlay list and `budget-app/js/**`.

## Data model (7 IndexedDB stores, all keyed by `id`)
- `transactions` — account, amount, category, subcategory, paymentMethod,
  cardId, note, status, date, type (`expense`|`income`). 9,282 seeded rows.
  Some logic (Reports) splits income by `category === 'Income'` instead of
  `type`, since older migrated rows never set `type`.
- `categories` — name, type, subcategories[]. 15 seeded.
- `accounts` — name, currency, initialBalance, type. 2 seeded (Personal
  Expense, Loans).
- `budgets` — category, monthlyLimit, createdAt. Rollover is computed at
  read time, never stored.
- `recurring` — account, description, amount, category, subcategory, type,
  frequencyMonths, startDate, endDate, nextDueDate, status
  (`active`|`completed`). Linked to the transactions it generated only by
  convention: `note === 'Repeating:<description>'`.
- `cards` — name, last4, color, cycleStartDay, status (`active`|`expired`).
  Cards are never hard-deleted.
- `meta` — key/value settings: `theme`, `lastSyncedAt`,
  `lastLocalBackupAt`, `balanceAnchorDate`, `driveConnected`, `preferences`.

## Cross-cutting requirements
- **Nav shell** — bottom tab bar (Home/Activity/Calendar/Reports/More);
  every top-level screen re-fetches fresh data each time it's shown;
  overlay sheets can stack and must paint in open-order.
- **Theming** — 4 themes (Midnight Gold default, Forest Slate, Plum Dusk,
  Harbor Blue), selection persists.
- **Offline/PWA** — installable, fully usable offline (IndexedDB only);
  first launch seeds every store from a bundled JSON snapshot.
- **Recurring auto-post** — on every launch, any active recurring rule
  whose due date has arrived (or passed while closed) gets a real
  transaction posted for each missed occurrence, dated on that occurrence;
  person is notified with a summary.
- **Backup/restore/sync** — manual backup-to-file and restore-from-file
  (full replace, with confirmation); automatic daily local backup at
  launch; optional Google Drive sync (pull on launch, debounced 4s push on
  change, last-write-wins — single device only).
- **Balance integrity** — current balance is never reconstructed from full
  transaction history (drifts wildly against a $0 start). Each account's
  real balance is anchored on a chosen date (`balanceAnchorDate`); only
  transactions after that date affect it from then on.

## Home (`screen-home`) — partial
Ported to [Home.svelte](src/pages/Home.svelte): balance hero, budgets row,
recent activity, account tabs, bottom tab bar.
- [x] Account switcher (Personal Expense / Loans / All) filters everything
      on the screen; "All" combines every account.
- [x] Lead metric is this month's expense; balance/income/YTD are ported
      inline rather than behind the original's collapsible toggle.
- [x] Budget snapshot (up to 3 cards, progress bar, tap-through) and recent
      activity (last 6 transactions, tap to edit).
- [ ] FAB "+" quick-add button (original opens Add Transaction pre-set to
      expense) — not ported.
- [ ] "+ Add Income" button is a stub (`alert(...)`) — should open Add
      Transaction pre-set to income.
- [ ] "💰 Budgets" / "🔁 Recurring" ghost buttons are stubs — should route
      to those screens once they exist.
- Uses: `getMonthSummary`, `getCurrentBalance`, `getYearToDate`,
  `computeBudgetStatus`, `fmtMoneySigned`, `fmtMonthLabel`

## Not yet migrated

### Activity (`screen-activity`, `views/activity.js`)
- [ ] Search matches note text **and** category/subcategory, not just note
- [ ] Filter chips built from categories actually present in the data
- [ ] Grouped by month, then by day within month, newest first; each
      month/day header shows its net total
- [ ] Tapping a row opens that transaction in edit mode
- Uses: `getAll('transactions')`, `monthKey`, `fmtMonthLabel`, `fmtDayLabel`

### Add/Edit Transaction (`sheet-add-transaction`, `views/addTransaction.js`)
- [ ] One sheet for both expense and income entry, and for editing
- [ ] Amount uses native numeric keyboard + a calculator button alongside it
- [ ] Up to 6 quick-pick subcategory chips (most-used for expense, Income's
      subcategories for income); "More…" opens the Category Picker
- [ ] Fields: account, date, payment method (expense only), note
- [ ] Editing shows Delete (with confirmation)
- [ ] Save requires amount > 0 and a category; new rows default
      `status: 'Uncleared'`
- Uses: `getTopSubcategories`, `genId`, `todayISO`, `put`/`remove('transactions')`

### Calculator (`sheet-calculator`, `js/calculator.js`)
- [ ] Left-to-right evaluation only, no operator precedence (matches a
      physical calculator, not a formula parser)
- [ ] C / backspace / digits / operators / equals; rounds to 2 decimals
- [ ] "Use this amount" hands the result to the open Add Transaction sheet
- Uses: `createCalculator()` → `{input, clear, backspace, equals, value}`

### Category Picker (`sheet-category-picker`, `views/categoryPicker.js`)
- [ ] Categories filtered by type (expense vs. the single Income category),
      sorted alphabetically, grouped/collapsible
- [ ] Selecting a subcategory writes into the transaction draft, or invokes
      a caller-supplied callback (reused by the Recurring form)
- [ ] Must not clear an amount already typed on the sheet underneath
- Uses: `getCategoriesSorted`

### Payment Picker (`sheet-payment-picker`, `views/paymentPicker.js`)
- [ ] General methods (Cash, Debit, Electronic Transfer) always shown;
      active credit cards listed below, expired cards excluded
- [ ] Selecting a card records both a display name and its id (id is
      authoritative — renaming a card must not orphan its past transactions)
- Uses: `getAll('cards')`

### Calendar (`screen-calendar`, `views/calendar.js`)
- [ ] Month navigation has no upper bound — future-dated transactions
      appear when paging forward (unlike Home/Reports)
- [ ] Header shows transaction count + net total for the visible month
- Uses: `getTransactionsForMonth`, `shiftYearMonth`, `fmtDayLabel`

### Reports (`screen-reports`, `views/reports.js`)
- [ ] Mini bar chart of expense-by-month for the selected year; tap opens
      Chart Detail
- [ ] This month's expense by category, % + amount, sorted largest first
- [ ] Custom report: date range + optional single category → Income/Expense
      breakdown (income identified by `category === 'Income'`, not `type`)
- [ ] Validates both dates picked and start ≤ end before generating
- Uses: `getCategoriesSorted`, `monthKey`, `fmtDateShortYear`

### Chart Detail (`screen-chart-detail`, `views/reportDetail.js`)
- [ ] One row per month for the selected year with exact amount printed
- [ ] Year navigation; current month highlighted when viewing current year
- [ ] Shows year total expense
- Uses: `fmtMoney`

### Budgets (`screen-budgets`, `views/budgets.js`)
- [ ] Month navigation local to the screen, resets to current month on open
- [ ] Rollover: month's available = its limit + previous month's leftover,
      recursively (capped 24 months back; never rolls over from before the
      budget existed)
- [ ] "+ Add category budget" only offers categories without a budget yet
- [ ] Header totals: total budgeted, total spent, amount left
- Uses: `computeBudgetStatus`, `getCategoriesSorted`, `genId`, `shiftYearMonth`

### Budget Detail (`screen-budget-detail`, `views/budgetDetail.js`)
- [ ] Reached by tapping a budget card on Home or Budgets
- [ ] Independent month navigation (offset-based)
- [ ] Lists that category's expense transactions for the month, newest first
- [ ] "Remove this budget" deletes the limit only, transactions stay
- Uses: `computeBudgetStatus`, `getTransactionsForMonth`, `shiftYearMonth`

### Recurring (`screen-recurring`, `views/recurring.js`)
- [ ] Split into Upcoming (active, sorted by next due date) and
      Completed/expired
- [ ] Header shows total monthly amount committed across active expense rules
- [ ] Tapping a rule opens it in the Recurring Form
- Uses: `getAll('recurring')`, `fmtMoney`, `fmtDateShort`

### Recurring Form (`sheet-recurring-form`, `views/recurringForm.js`)
- [ ] Fields: description, amount, type, category (via Category Picker),
      frequency (monthly/quarterly/half-yearly/yearly), start date,
      optional end date
- [ ] Status/next-due-date derived by walking forward from start date in
      frequency steps, not entered directly
- [ ] Editing category/type cascades the fix to every transaction the rule
      already generated (matched via `Repeating:<description>` note)
- [ ] "Mark as ended today" and "Delete" when editing an existing rule
- Uses: `computeRecurringStatus`, `addMonthsISO`, `updateRecurringInstances`, `genId`

### Cards (`screen-cards`, `views/cards.js`)
- [ ] Active card tiles show this cycle's spend + date range (custom start
      day per card, not calendar month)
- [ ] Cards are never deleted, only expired — expiring keeps history but
      removes it from the Payment Picker
- [ ] Expired cards show lifetime spend instead of cycle spend
- Uses: `fmtMoney`, `genId`

### Card Detail (`screen-card-detail`)
- [ ] Cycle navigation, independent per card
- [ ] Category breakdown + full transaction list for the visible cycle
- [ ] "Expire this card" (confirmation) when active; notice banner once expired
- Uses: `fmtMoney`, `fmtDateShort`

### More / Settings hub (`screen-more`, `views/settings.js`)
- [ ] Rows: Cards, Accounts, Categories, Recurring, Budgets, Theme — each
      shows a live count/current value
- [ ] Backup & Sync row: Drive OAuth setup prompt or sign-in; shows
      "Synced Xm ago" / "Not connected"
- [ ] Backup to file (full JSON export) / Restore from file (full replace,
      confirmation, reloads app)
- Uses: `exportAll`, `importAll`, `getMeta`

### Theme picker (`screen-themes`, part of `views/settings.js`)
- [ ] 4 themes shown as ink/paper/accent swatches; selecting applies +
      persists immediately
- Tokens for all 4 themes already exist in
  [tokens.css](src/lib/styles/tokens.css) — this is UI-only work
- Uses: `setMeta('theme', id)`

### Accounts (`screen-accounts`, `views/accounts.js`)
- [ ] Set each account's real current balance (not create/edit/delete —
      see "After the migration" below)
- [ ] Saving sets `initialBalance` + stamps `balanceAnchorDate = today`;
      only transactions after the anchor affect balance from then on
- [ ] Shows whether an anchor is already set and what date it's anchored to
- Uses: `getCurrentBalance`, `put('accounts')`, `setMeta('balanceAnchorDate')`

## Supporting logic not yet ported

### `format.js` — partial (6/10 ported)
Ported: `fmtMoney`, `fmtMoneySigned`, `fmtMonthLabel`, `fmtDateShort`,
`todayISO`, `currentYearMonth`.
- [ ] `fmtDayLabel(dateStr)` — "2026-09-03" → "Thu, Sep 3" (needed by
      Activity/Calendar day headers)
- [ ] `fmtDateShortYear(dateStr)` — "2026-09-01" → "Sep 1, 2026" (needed by
      custom reports)
- [ ] `shiftYearMonth(yearMonth, delta)` — month nav arithmetic (needed by
      Calendar/Budgets/Budget Detail prev/next)
- [ ] `genId(prefix)` — unique id generator (needed by any create-record
      flow: transactions, budgets, recurring, cards)

### `js/calculator.js` — not ported
- [ ] `createCalculator()` — see Calculator overlay above

### `js/recurringLogic.js` — not ported
- [ ] `addMonthsISO(iso, months)` — calendar-correct month addition
- [ ] `computeRecurringStatus(startDate, frequencyMonths, endDate)` — walks
      forward to next due occurrence → `{status, nextDueDate}`

### `js/sync/drive.js` — not ported
- [ ] `isConfigured()`, `init()`, `signIn()`, `pushToDrive()`,
      `pullFromDrive()` — optional Google Drive backup, inert until an
      OAuth Client ID is configured

### `js/app.js` boot/nav — not ported (needs a Svelte-native equivalent,
not a literal port)
- [ ] Theme load + persist at boot (currently only seeding happens in
      [App.svelte](src/App.svelte))
- [ ] Recurring auto-post at boot (`postDueRecurring`)
- [ ] Screen/overlay routing + stacking model — `showScreen`,
      `openOverlay`/`closeOverlay`, `refreshCurrentScreen`

## After the migration is done
- [ ] **New feature (not in original budget-app):** Settings > Accounts —
      add create/edit/delete for accounts.
  - Add: name, currency, type
  - Edit: name/currency/type without breaking transaction history
    (transactions reference accounts by `name` — a rename needs to
    cascade, same problem `updateRecurringInstances` already solves for
    category renames)
  - Delete: needs a decision on what happens to its transactions (reassign,
    block while any exist, or archive) before this ships
  - No new storage work needed — [db.js](src/lib/data/db.js)'s generic
    `put('accounts', …)` / `remove('accounts', id)` are already ported;
    this is UI-only, gated on the Accounts screen itself being built first
