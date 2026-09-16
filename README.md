# expman

A personal expense/budget tracker: Svelte 5 + Vite, installable as a PWA.
Local-first — every store lives in IndexedDB on-device, there's no backend
or account, and the app is fully usable offline once installed.

Originally ported from a vanilla JS + IndexedDB app (`budget-app`); see
[PRD.md](PRD.md) and [TODO.md](TODO.md) for that history. Every feature
below now has its own spec in [specs/](specs/), which is the up-to-date
source of truth for exact behavior — this file is a summary.

## Getting started

```bash
npm install
npm run dev
```

```bash
npm run build    # production build to dist/
npm run preview  # preview the production build
npm run deploy   # build and publish dist/ to GitHub Pages
npm test         # run the test suite once
npm run test:watch
npx svelte-check # type-check
```

## Features

### Home
- Account switcher (when more than one account exists) filters the whole
  screen
- This month's spend front and center, with a collapsible balance /
  this month's net detail
- A spending call-out, when a category is notably above or below its own
  3-month average this month
- A savings goal card, when one is set for the account
- Budget snapshot cards for any budgets active this month
- Card snapshot tiles (cycle spend vs. target)
- Recent activity (last 5 transactions), tap to edit
- Floating "+" for a new expense; shortcuts for Add Income, Recurring,
  and Budgets

### Activity
- Month picker (`‹ Sep 2026 ›`), unbounded, plus a jump-to year/month grid
- Search by description within the visible month
- Date view (every transaction, newest first) or Category view (one row
  per category, tap through to that category's transactions)

### Add / Edit transaction
- One page for both adding and editing
- Income/expense toggle, account, date, description, category +
  subcategory, payment method (cash or an active card)
- Split entry: add more than one description/category/amount line to
  create several independent transactions in one sitting, sharing the
  same account/date/payment method — e.g. one supermarket run becomes
  separate Food/Household/Baby transactions
- Delete with confirmation when editing

### Budgets
- Per-category (or per-subcategory) monthly spending limits, scoped to
  one account
- Optional rollover: unspent amount carries into the next month
- Each budget row clearly shows how much is left (or how far over)
- Snapshot on Home; full list + add/edit screen with its own month nav

### Savings goals
- One ongoing monthly target per account: "save at least $X," measured
  as that calendar month's income minus expense
- Progress card on Home when set; edited from Settings

### Spending call-outs
- Surfaces categories spending notably more or less than their own
  trailing 3-month average, filtered to real swings (not noise)
- The single top call-out on Home; up to 3, ranked, on Reports

### Reports
- Five charts, all scoped to the selected account and a shared month/
  year navigator: spend by category, monthly spend trend, income vs.
  expense, budget vs. actual, and top spending subcategories

### Recurring transactions
- Rules (subscriptions, salary, rent, etc.) with daily/weekly/monthly/
  annual cadence and a flexible end condition (date, occurrence count,
  or never)
- Due occurrences post automatically as real transactions on launch,
  catching up on anything missed while the app was closed
- Editing an active rule can bulk-update every transaction it already
  generated, or affect only future ones
- Cancel (keeps history, stops future occurrences) vs. delete (removes
  the rule from the list)

### Categories
- Income and expense categories, each with subcategories, browsable and
  expandable
- Inline editing: name, type, subcategories, color, and manual reordering
- Soft delete — a deleted category's past transactions keep showing
  correctly, it just can't be picked for new ones
- Import/export just the category list as its own JSON file

### Cards
- Track a monthly target spend per category, per credit card
- Custom cycle start day per card (e.g. 11th–10th), computed automatically
- Soft delete — expired cards keep their history but drop out of the
  payment picker

### Accounts
- Full create/edit/soft-delete (a new capability beyond the original app)
- Balance computed live from initial balance + every transaction

### Backup & restore
- Whole-app export/import as a single JSON file, from Settings > Backup
- Import is a full replace, with an explicit confirmation first

### Themes
- 4 built-in themes — Midnight Gold, Journal, Ledger, Meadow — each with
  its own colors, fonts, and corner-radius character, not just a palette
  swap
- Applies instantly and persists across launches

### Cross-cutting
- Installable PWA (manifest + service worker via `vite-plugin-pwa`),
  fully usable offline
- Home, Activity, Budgets, and Reports all stay scoped to one selected
  account at a time
- Every screen re-fetches fresh data each time it's shown

## Tech stack

- [Svelte 5](https://svelte.dev/) + [Vite](https://vitejs.dev/)
- IndexedDB for local storage — no backend, no account
- [Chart.js](https://www.chartjs.org/) for Reports
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) for offline/installable support
- [Vitest](https://vitest.dev/) for tests
- Deployed to GitHub Pages via `gh-pages`
