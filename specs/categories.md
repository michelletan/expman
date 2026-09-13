## Categories

**Status:** Approved

### Summary
Full category (and subcategory) management: browse by income/expense,
expand a category to see its subcategories, edit everything inline
(name, type, subcategories, delete), and import/export the category list
as a JSON file. Reached from Settings, same entry pattern as
[specs/accounts.md](accounts.md) — but categories are referenced **by
name**, not id, deletes are hard deletes, and renames cascade.

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
8. Deleting a category or a subcategory SHALL NOT touch any transaction
   that already references it by name — those transactions keep showing
   the old name as-is, unchanged (PRD.md: "do not remove the category or
   subcategory from transactions using it").
9. Renaming a category or a subcategory SHALL cascade: every transaction
   referencing the old name SHALL be updated to the new name (unlike
   delete). Same treatment `updateRecurringInstances` already gives
   recurring-linked transactions when a category is fixed up.
10. Category names SHALL be unique within the list (case-sensitive exact
    match is enough). Saving a rename/add that collides with an existing
    name SHALL be rejected with an error, not silently overwritten.

**Add / Import / Export**
11. THE APP SHALL show a floating "+" button (bottom right, above the tab
    bar) that adds a new category (opens directly in the same inline-edit
    state as requirement 6, unsaved until the save icon is tapped).
12. THE APP SHALL show an import/export control (top right) that opens a
    modal offering Import and Export actions for the category list.
13. Export SHALL produce a JSON file of the current category list, in the
    schema below.
14. Import SHALL be a **full replace** of the `categories` store (same
    "full replace, not merge" precedent as `importAll()`). If the chosen
    file contains duplicate category names, THE APP SHALL reject the
    entire import with an error and leave the existing list untouched —
    no partial replace.

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
  Needs: `createCategory`, `updateCategory` (name/type, with uniqueness
  check), `removeCategory` (hard delete), subcategory add/rename/remove
  helpers, `updateCategoryReferences(oldName, newName)` /
  `updateSubcategoryReferences(category, oldSub, newSub)` (cascade
  rename into `transactions`), `importCategories(list)` (validates
  uniqueness, full-replaces the store), and `ensureDefaultCategories()`
  (boot-time seed-if-empty, called from App.svelte alongside
  `ensureDefaultAccount()`).
- Out of scope, but related: TODO.md's "Category Picker" (the
  transaction-entry-time selector) is a separate feature this doesn't
  cover.

### Data model
- `categories`: `{id, name, type, subcategories: [string]}` — unchanged
  shape. `id` stays the store's required primary key even though nothing
  else references a category by id.
- `transactions.category` / `transactions.subcategory` stay plain name
  strings — unaffected by this spec except that a rename now cascades
  into them (requirement 9).
- `public/data/default-categories.json` (new, read-only, bundled) — same
  shape as an export: `{categories: [...]}`.

### Out of scope
- The Category Picker used when adding/editing a transaction.
- Transactions themselves (PRD.md's TRANSACTIONS section — a separate
  spec), beyond the fact that they reference categories by name.
- Everything else in Settings besides the new "Categories" row.

### Acceptance criteria
- [ ] Settings lists "Categories" and navigates to it; back/tab-bar rules
      match Accounts.
- [ ] Categories screen shows Income/Expense headers; tapping a row
      expands/collapses its subcategories.
- [ ] Tapping a row's edit icon switches it to inline edit mode (icon
      becomes a save icon); no store write happens until save is tapped.
- [ ] Renaming a category or subcategory updates every transaction that
      referenced the old name; deleting one touches zero transactions.
- [ ] Saving a name that collides with an existing category is rejected
      with an error.
- [ ] FAB opens a new, unsaved inline-edit row; import/export modal
      exports a JSON file and imports one (full replace; a file with
      duplicate names is rejected, existing list untouched).
- [ ] First launch with an empty `categories` store gets populated from
      `public/data/default-categories.json`.

### Notes
Source: [PRD.md](../PRD.md) → CATEGORIES section, refined through Q&A.
Cross-reference [TODO.md](../TODO.md) → "Category Picker" for the
separate transaction-entry-time feature this does not cover, and
[specs/accounts.md](accounts.md) — which is being updated to match this
spec's name-based-reference + cascade-rename approach for accounts too
(see that file).

The actual default category list's *content* (which categories/
subcategories ship out of the box) isn't specified anywhere and is
low-stakes to change later since categories have full CRUD — a reasonable
starter set (Food, Transport, Shopping, Bills, Entertainment, Health for
expense; Salary, Other for income) can be proposed at implementation time
rather than blocking this spec on it.
