## Cards

**Status:** Approved

### Summary
Credit card management: track a monthly-cycle spending target per
category for each card, and see at a glance whether it's been hit for
the current cycle. Reached from Settings, same entry pattern as
[specs/accounts.md](accounts.md) and [specs/categories.md](categories.md)
— follows Accounts' list + separate Add/Edit page + swipe-to-delete
pattern (not Categories' inline editing), and Accounts' soft-delete.

Actual spend still isn't computable from real data — transactions have no
way to link to a card yet, and PRD.md says as much for Card Details
("taken from transactions, which will be done later"). This spec ships
the card/target-spend management and the cycle math, and stubs the
computed-spend numbers until a Transactions spec adds that linkage.

### User stories
- As a user, I want to set a monthly spending target per category for
  each credit card, so I know what "on track" looks like before the
  statement closes.
- As a user, I want to see each card's current cycle (based on its reset
  date) at a glance, so I know how many days are left before it resets.
- As a user, I want to add, edit, and delete cards, so my card list
  matches the cards I actually use.

### Requirements

**Settings**
1. Settings SHALL list "Cards" alongside "Accounts" and "Categories",
   navigating to the Cards screen.
2. Cards and its child screens SHALL follow the same
   back-button-returns-to-Settings and always-visible-tab-bar rules as
   Accounts (specs/accounts.md requirements 10-11).

**Cards screen (list)**
3. THE APP SHALL list every non-deleted card as its own UI card/tile,
   showing: the card's name, its current spending period (computed —
   see Spending period below), and `$<spend> / $<total target>` (spend is
   a stubbed `$0` for now — see Out of scope).
4. THE APP SHALL show an "Add card" control (top left, matching Accounts)
   that opens Add/Edit Card in add mode.
5. WHEN the user taps a card tile THE APP SHALL open Card Details for
   that card (a view, not an editor).
6. Each tile SHALL show an edit icon (separate from the tap-to-view
   gesture) that opens Add/Edit Card pre-filled, in edit mode.
7. WHEN the user swipes a card tile THE APP SHALL reveal a delete button;
   tapping it SHALL show a confirmation modal before deleting.
8. Deleting a card SHALL be a **soft delete** (`card.isDeleted = true`),
   same treatment as Accounts — it disappears from the list but the row
   survives, in case a future transaction-linkage needs the history.

**Add/Edit Card**
9. THE APP SHALL show fields for: name, reset date (a day-of-month,
   1–31), and a target-spend-per-category list — add/remove rows, each
   picking a category and an amount.
10. Saving SHALL require a name and a reset date between 1 and 31.
11. THE APP SHALL show a back button and a save button.

**Card Details**
12. THE APP SHALL show the card's name, its current spending period, and
    its target-spend breakdown per category.
13. Actual spend per category (and the card total) SHALL show as a
    placeholder (e.g. "—") rather than a computed number — this needs a
    transaction↔card link that doesn't exist yet (PRD.md's own note, plus
    your earlier decision to not add `transactions.cardId` in this
    spec).

**Spending period**
14. THE APP SHALL compute a card's current spending period from its
    `resetDate`: if today's day-of-month is on or after `resetDate`, the
    period runs from this month's `resetDate` to the day before next
    month's `resetDate`; otherwise it runs from last month's `resetDate`
    to the day before this month's `resetDate` (PRD.md's example: reset
    day 11 → "11th Aug – 10th Sep").
15. WHEN `resetDate` doesn't exist in a given month (e.g. 31 in February)
    THE APP SHALL clamp to that month's last real day.

### Screens / components touched
- New: `src/pages/Cards.svelte` (list), `src/pages/AddEditCard.svelte`
  (add/edit form), `src/pages/CardDetails.svelte` (view).
- Modified: [Settings.svelte](../src/pages/Settings.svelte) (add the
  "Cards" row), [App.svelte](../src/App.svelte) (screen routing).
- [db.js](../src/lib/data/db.js): `getCards`, `getCard`, `createCard`,
  `updateCard`, `softDeleteCard` — same soft-delete shape as the
  `accounts` functions, minus name-uniqueness (see Data model) and minus
  any rename-cascade (nothing references a card yet).
- A new pure date function for the cycle math (requirements 14-15) —
  proposed as `getCardPeriod(resetDate, todayISO)` in
  [format.js](../src/lib/data/format.js), alongside the other date
  helpers there.
- No default card is created on first boot (unlike
  `ensureDefaultAccount()`) — the Cards list just starts empty.

### Data model
- `cards`: `{id, name, resetDate, targetSpend: [{category, amount}],
  isDeleted, dateCreated}`.
- Card names are **not** required unique. Unlike Accounts/Categories,
  nothing references a card by name or id yet (no
  `transactions.cardId`), so there's no ambiguous-reference risk to guard
  against — revisit if/when a Transactions spec adds that link.
- `targetSpend` entries reference a category **by id**, consistent with
  the project-wide id-based-reference decision (see
  [specs/accounts.md](accounts.md) Notes) — resolved live against the
  `categories` store, so renaming a category updates its target-spend
  label here for free, and a soft-deleted category's target row still
  resolves to its real name.

### Out of scope
- Any change to the `transactions` schema (no `cardId`/payment-method
  link) — deferred to a future Transactions spec, per your decision.
- Computing real spend (list tile's `$<spend>` and Card Details' per-
  category actuals) — both are stubbed until that linkage exists.
- The Payment Picker / "assign a transaction to a card" flow generally
  (TODO.md's original-app feature) — separate, future spec.

### Acceptance criteria
- [ ] Settings lists "Cards" and navigates to it; back/tab-bar rules
      match Accounts/Categories.
- [ ] Cards list shows each active card's name, computed spending period,
      and `$0 / $<sum of targetSpend>`.
- [ ] Add/Edit Card saves name, reset date (1–31, required), and a
      target-spend-per-category list; back/save both work.
- [ ] Tapping a tile opens Card Details showing the period and the
      target-spend breakdown, with spend shown as a placeholder.
- [ ] A tile's edit icon opens Add/Edit Card pre-filled; swipe → delete →
      confirm soft-deletes the card and it disappears from the list.
- [ ] Spending period is correct across a month boundary and for a
      `resetDate` that doesn't exist in a short month (e.g. 31 in Feb).

### Notes
Source: [PRD.md](../PRD.md) → CARDS section. Two things I inferred rather
than found spelled out verbatim, worth a quick sanity check:
- PRD names two distinct destinations ("Cards page" and "Card Details
  page") without naming a third "Add/Edit" screen; I've read "Allows
  CRUD" as needing that third screen anyway (requirements 4, 6, 9-11),
  with tapping a tile going to the read-only Details view instead of
  straight to editing — different from Accounts, where tapping opens
  edit mode directly.
- The edit icon's placement on the tile (requirement 6) mirrors the
  pattern already built for Categories, since PRD doesn't specify where
  the edit entry point lives on a Cards tile.

Cross-reference [TODO.md](../TODO.md) → "Cards" and "Card Detail" for the
original app's cycle-spend/expired-card behavior, which this spec covers
the CRUD/target-setting half of but not the spend-computation half.
