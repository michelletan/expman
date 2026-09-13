## Categories

**Status:** Approved

### Summary
Full category (and subcategory) management: browse by income/expense,
expand a category to see its subcategories, edit everything inline
(name, type, subcategories, delete), and import/export the category list
as a JSON file. Reached from Settings, same entry pattern as
[specs/accounts.md](accounts.md) — and now the same referencing rule too:
categories and subcategories are referenced **by id**, resolved live
wherever a name is shown, with soft delete. (This reverses this spec's
original name-based-reference + hard-delete design — see Notes.)

### User stories
- As a user, I want to see my categories grouped by income/expense with
  their subcategories, so I can review how my transactions get organized.
- As a user, I want to add, edit, and delete categories and subcategories
  in place, so my category list matches how I actually want to track
  spending without extra navigation.
- As a user, I want to export my category list and import it back (or on
  a new device), so I don't have to rebuild it by hand.

### Requirements

**Settings**
1. Settings SHALL list "Categories" alongside "Accounts", navigating to
   the Categories screen.
2. Categories SHALL follow the same back-button-returns-to-Settings and
   always-visible-tab-bar rules as Accounts (specs/accounts.md
   requirements 10-11).

**Categories screen — browsing**
3. THE APP SHALL show two headers, "Income" and "Expense", each listing
   that type's categories.
4. WHEN the user taps a category row THE APP SHALL expand it in place to
   show its subcategories (collapse on a second tap). This is independent
   of edit mode (requirement 6).

**Categories screen — inline editing**
5. Each category row SHALL show an edit icon.
6. WHEN the user taps the edit icon THE APP SHALL switch that row into
   inline edit mode: name and type become editable, subcategories become
   individually addable/editable/removable inline, and a delete-category
   control appears. The edit icon itself SHALL turn into a save icon.
7. WHILE a row is in edit mode, none of its changes (name, type,
   subcategory add/edit/remove) SHALL be written to the `categories`
   store until the save icon is tapped — the whole category saves as one
   unit.
8. Deleting a category or a subcategory SHALL be a **soft delete**
   (`isDeleted: true`). It disappears from the Categories screen (and any
   future picker), but the row survives — so every transaction that
   references it by id keeps resolving to its real name, unchanged
   (PRD.md: "do not remove the category or subcategory from transactions
   using it"). **Unlike Accounts' soft delete, this does NOT hide the
   category's transactions from Activity/Reports/etc.** — only Accounts'
   soft delete hides related transactions; a deleted category's
   transactions stay fully visible, just no longer editable to pick that
   category going forward.
9. Renaming a category or a subcategory is a single-field update on that
   row — no cascade needed. Every transaction referencing it by id shows
   the new name the moment it's displayed, because display always
   resolves the current name live via id.
10. Category and subcategory names are **not** required unique — nothing
    references either by name anymore, so a collision is no longer
    ambiguous. (Subcategory names were never required unique across
    categories to begin with; this drops the same-category uniqueness
    this spec used to require too.)

**Reordering**
10a. Each category row SHALL show up/down buttons that move it one
     position within its own type group (Income and Expense each have
     their own independent order — moving a category never crosses
     between groups). The topmost category's up button and the bottommost
     category's down button SHALL be disabled (or a no-op).
10b. WHILE a category is expanded, each subcategory row SHALL show
     up/down buttons that move it one position within that category's
     subcategory list, same edge-disabling at the ends.
10c. Reordering SHALL persist immediately (tapping ▲/▼ writes the new
     order right away) — it is not part of the inline-edit-then-save flow
     (requirement 7 is about name/type/subcategory-membership edits, not
     ordering).
10d. Order is stored as a numeric `order` field: on `categories` (compared
     only within the same `type`), and on each subcategory entry, which
     changes shape from a plain string to `{name, order}` — see Data
     model. `getCategoriesSorted()` (and everywhere else categories are
     listed, including the not-yet-built Category Picker) SHALL sort by
     `order` ascending instead of alphabetically.
10e. Existing rows that predate this feature (no `order` field on a
     category, `subcategories` still holding plain strings, or a
     subcategory missing its own `id`) SHALL be migrated lazily wherever
     they're read: assign `order` from current array position, wrap a
     bare subcategory string into `{id, name, order, isDeleted: false}`,
     and assign an `id` to any subcategory object that doesn't have one.
     No dedicated migration step or boot-time pass — it just normalizes
     on the way out of `getAll`/`getCategoriesSorted`.
10f. `getCategoriesSorted()` (and any category list used for browsing,
     editing, or picking) SHALL exclude soft-deleted categories, and each
     returned category's `subcategories` SHALL exclude its soft-deleted
     entries — same active-only filtering Accounts already does for
     `getAccounts()`.

**Add / Import / Export**
11. THE APP SHALL show a floating "+" button (bottom right, above the tab
    bar) that adds a new category (opens directly in the same inline-edit
    state as requirement 6, unsaved until the save icon is tapped).
12. THE APP SHALL show an import/export control (top right) that opens a
    modal offering Import and Export actions for the category list.
13. Export SHALL produce a JSON file of the current category list, in the
    schema below.
14. Import SHALL be a **full replace** of the `categories` store (same
    "full replace, not merge" precedent as `importAll()`) — no uniqueness
    validation needed on the incoming file now that names don't need to
    be unique.

**Defaults**
15. THE APP SHALL ship a small **read-only** bundled JSON
    (`public/data/default-categories.json`) that seeds the `categories`
    store only the first time it's empty — the same
    seed-once-if-empty pattern as `ensureDefaultAccount()`, scoped to
    categories. After that, all edits live in IndexedDB like every other
    store; nothing gets written back into the bundled file (that's not
    something a deployed PWA can do). PRD.md's "save to this file" is
    read as "persist the edit," not literally rewrite the asset.

### Screens / components touched
- New: `src/pages/Categories.svelte` (headers, expand/collapse, inline
  edit mode per row, FAB, import/export modal trigger), an
  import/export modal component. No separate "Edit Category" page —
  editing is inline within Categories.svelte.
- Modified: [Settings.svelte](../src/pages/Settings.svelte) (add the
  "Categories" row), [App.svelte](../src/App.svelte) (screen routing for
  Categories).
- [db.js](../src/lib/data/db.js): already has `getCategoriesSorted(type)`.
  Needs: `createCategory`, `updateCategory` (plain name/type update, no
  uniqueness check), `softDeleteCategory` (sets `isDeleted`, no hard
  delete), subcategory add/rename/soft-delete helpers keyed by
  `subcategoryId` (not name), `importCategories(list)` (full-replaces the
  store, no uniqueness validation), `ensureDefaultCategories()`
  (boot-time seed-if-empty, called from App.svelte alongside
  `ensureDefaultAccount()`), `moveCategory(id, direction)` /
  `moveSubcategory(categoryId, subcategoryId, direction)` (swap `order`
  with the neighbor in the same group, among non-deleted siblings), and
  the lazy `order`/`id`-normalizing logic inside `getCategoriesSorted`.
  No `updateCategoryReferences`/`updateSubcategoryReferences` — nothing
  to cascade once references are by id.
- Out of scope, but related: TODO.md's "Category Picker" (the
  transaction-entry-time selector) is a separate feature this doesn't
  cover.

### Data model
- `categories`: `{id, name, type, order, isDeleted, subcategories:
  [{id, name, order, isDeleted}]}`. Every subcategory now has its own
  `id` — it's an addressable, individually soft-deletable row-like entry,
  not just a display string.
- `transactions.categoryId` / `transactions.subcategoryId` (renamed from
  `.category`/`.subcategory`) store ids, resolved live against the
  `categories` store — settled per requirement 9.
- `public/data/default-categories.json` (bundled) — same shape as an
  export: `{categories: [...]}`, with `order`, `isDeleted: false`, and a
  stable `id` per subcategory baked in.

### Out of scope
- The Category Picker used when adding/editing a transaction.
- Transactions themselves (PRD.md's TRANSACTIONS section — a separate
  spec), beyond the fact that they reference categories by id.
- Everything else in Settings besides the new "Categories" row.

### Acceptance criteria
- [ ] Settings lists "Categories" and navigates to it; back/tab-bar rules
      match Accounts.
- [ ] Categories screen shows Income/Expense headers; tapping a row
      expands/collapses its subcategories.
- [ ] Tapping a row's edit icon switches it to inline edit mode (icon
      becomes a save icon); no store write happens until save is tapped.
- [ ] Renaming a category or subcategory immediately shows the new name
      on every transaction that references it (resolved live, no
      rewrite); soft-deleting one leaves every transaction's display
      unaffected — still shows the (now-deleted) category/subcategory's
      real name, and the transaction itself stays visible in
      Activity/Reports (unlike a soft-deleted account, which does hide
      its transactions).
- [ ] Two categories (or two subcategories within one category) can share
      a name with no error.
- [ ] Up/down buttons reorder a category within its own type group (never
      crossing Income/Expense), and reorder a subcategory within its
      category; the new order persists immediately and survives a reload.
      Edge buttons (top-most up, bottom-most down) are disabled.
- [ ] A category/subcategory that predates this feature (no `order`, or a
      plain-string subcategory) still lists and reorders correctly —
      normalized on read, no crash, no explicit migration step needed.
- [ ] FAB opens a new, unsaved inline-edit row; import/export modal
      exports a JSON file and imports one (full replace, no uniqueness
      check).
- [ ] First launch with an empty `categories` store gets populated from
      `public/data/default-categories.json`.

### Notes
Source: [PRD.md](../PRD.md) → CATEGORIES section, refined through Q&A.
Cross-reference [TODO.md](../TODO.md) → "Category Picker" for the
separate transaction-entry-time feature this does not cover.

This spec originally chose name-based references + hard delete + rename
cascade. After building and shipping that (and separately reverting
Accounts to match it), we settled the id-vs-name question project-wide
the other way: id-based references, resolved live, with soft delete
everywhere — see [specs/accounts.md](accounts.md)'s Notes for the
tradeoffs weighed. This spec now matches that, including giving up the
hard-delete this spec specifically argued for — soft-delete still
satisfies the original "don't break old transactions" requirement (the
row survives), it just does so via id resolution instead of a frozen
name string.

The actual default category list's *content* (which categories/
subcategories ship out of the box) isn't specified anywhere and is
low-stakes to change later since categories have full CRUD — a reasonable
starter set (Food, Transport, Shopping, Bills, Entertainment, Health for
expense; Salary, Other for income) can be proposed at implementation time
rather than blocking this spec on it.
