# expman

A personal expense/budget tracker, being ported from a vanilla JS + IndexedDB
app (`budget-app`) to Svelte + Vite. It's a local-first, installable PWA:
all data lives in IndexedDB on-device, with optional Google Drive sync.

Migration status and the full audited requirements live in [TODO.md](TODO.md).
Only [Home.svelte](src/pages/Home.svelte) has been ported so far; everything
else below describes the target feature set from the original app.

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
npm run deploy   # build and publish dist/ to GitHub Pages
```

## Features

### Home
- Account switcher (Personal Expense / Loans / All) filters the whole screen;
  "All" combines every account
- Balance, this month's expense/income, and year-to-date at a glance
- Budget snapshot cards (progress bar, tap through to detail)
- Recent activity list, tap a row to edit
- Bottom tab bar: Home / Activity / Calendar / Reports / More

### Activity
- Full transaction list, searchable by note, category, or subcategory
- Filter chips built from categories actually present in the data
- Grouped by month, then by day, newest first, each header showing its net total
- Tap a row to open it in edit mode

### Add / Edit Transaction
- One sheet for expense entry, income entry, and editing
- Numeric keypad plus an inline calculator for the amount
- Up to 6 quick-pick subcategory chips (most-used, or Income's subcategories),
  with a full Category Picker behind "More…"
- Account, date, payment method (expense only), and note fields
- Delete with confirmation when editing
- Save requires an amount > 0 and a category; new transactions default to
  `Uncleared` status

### Calculator
- Left-to-right evaluation (like a physical calculator, no operator precedence)
- Clear / backspace / digits / operators / equals, rounded to 2 decimals
- "Use this amount" feeds the result back into Add/Edit Transaction

### Category Picker
- Categories filtered by type (expense vs. the single Income category),
  sorted alphabetically and grouped/collapsible
- Reused by both the transaction form and the recurring form

### Payment Picker
- General methods (Cash, Debit, Electronic Transfer) always available
- Active credit cards listed below; expired cards excluded
- Selection records both a display name and a stable card id, so renaming a
  card never orphans past transactions

### Calendar
- Month-by-month view of transactions, unbounded navigation (future months
  included, unlike Home/Reports)
- Header shows the visible month's transaction count and net total

### Reports
- Mini bar chart of expense-by-month for the selected year, tap for detail
- This month's expense broken down by category (% and amount, largest first)
- Custom report: pick a date range and optional category for an
  income/expense breakdown, with date validation

### Chart Detail
- One row per month for the selected year with exact amounts
- Year navigation; current month highlighted when viewing the current year
- Year total expense shown

### Budgets
- Per-category monthly limits with independent month navigation
- Rollover: a month's available amount is its limit plus the previous
  month's leftover, computed recursively (capped 24 months back)
- Header totals: total budgeted, total spent, amount left
- "+ Add category budget" only offers categories that don't have one yet

### Budget Detail
- Reached by tapping a budget card on Home or Budgets
- Independent month navigation
- Lists that category's expense transactions for the month, newest first
- "Remove this budget" deletes the limit only; transactions are untouched

### Recurring transactions
- Rules split into Upcoming (sorted by next due date) and Completed/expired
- Header shows total monthly amount committed across active expense rules
- On every app launch, any due rule automatically posts a real transaction
  for each missed occurrence, with a summary notification
- Recurring Form: description, amount, type, category, frequency
  (monthly/quarterly/half-yearly/yearly), start date, optional end date
- Status and next-due-date are derived by walking forward from the start
  date, never entered directly
- Editing a rule's category/type cascades to every transaction it already
  generated
- "Mark as ended today" and delete, when editing an existing rule

### Cards
- Active card tiles show the current billing cycle's spend and date range
  (custom cycle start day per card, not calendar month)
- Cards are never deleted, only expired — history is kept, but expired
  cards drop out of the Payment Picker
- Expired cards show lifetime spend instead of cycle spend
- Card Detail: independent cycle navigation, category breakdown, full
  transaction list for the visible cycle, and an "Expire this card" action

### More / Settings
- Hub rows for Cards, Accounts, Categories, Recurring, Budgets, and Theme,
  each showing a live count or current value
- Backup & Sync: optional Google Drive sign-in, "Synced Xm ago" status
- Manual backup-to-file (full JSON export) and restore-from-file
  (full replace, with confirmation, reloads the app)
- Automatic daily local backup at launch

### Theme picker
- 4 themes — Midnight Gold (default), Forest Slate, Plum Dusk, Harbor Blue
- Selecting a theme applies and persists it immediately

### Accounts
- Set each account's real current balance
- Saving stamps a `balanceAnchorDate`; only transactions after that date
  affect the balance going forward, so balance is never reconstructed from
  full transaction history
- Planned: create/edit/delete accounts (a new feature beyond the original
  app — see [TODO.md](TODO.md#after-the-migration-is-done))

### Cross-cutting
- Installable PWA, fully usable offline (IndexedDB-backed)
- First launch seeds every store from a bundled JSON snapshot
- Overlay sheets can stack, painted in open-order
- Every top-level screen re-fetches fresh data each time it's shown

## Tech stack

- [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/)
- IndexedDB for local storage, optional Google Drive sync
- Deployed to GitHub Pages via `gh-pages`
