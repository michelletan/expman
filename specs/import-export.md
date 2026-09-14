## Import / Export

**Status:** Approved

### Summary
Two independent pieces: (1) a real, whole-app backup/restore feature —
export everything IndexedDB holds to a single minified JSON file, import
it back (full replace) — generalizing the JSON export/import
[CategoryImportExport.svelte](../src/lib/components/CategoryImportExport.svelte)
already does for categories alone up to every store. (2) A one-time,
dev-side Node script that converts the legacy `Expense Manager` SQLite
export (`data/2026-09-14_Expense Manager.db`) into a sanitized sample
JSON file in that same expman shape — not an in-app feature — so the
whole-app import has something realistic to test against.

### User stories
- As a user, I want to back up my entire budget (accounts, categories,
  transactions, cards, recurring rules, budgets) to a single file I
  control, so I'm never locked into this one browser's IndexedDB.
- As a user, I want to restore that file on a new device/browser and
  have everything come back exactly as it was.
- As a developer, I want a realistic-sized, non-sensitive sample dataset
  to test Activity/Budgets/Recurring/Reports against, without using my
  real financial history.

### Requirements

**Whole-app export**
1. THE APP SHALL export via the existing `exportAll()` (db.js) —
   `{transactions, categories, accounts, budgets, recurring, cards,
   preferences, savedAt}` — unchanged, already covers every store.
2. Serialized **minified** (`JSON.stringify(data)`, no indentation) —
   confirmed: at 2× the legacy file's transaction count (~18,600 rows)
   this is ~6MB and stringifies in ~25ms, no reason to pay the ~30% size
   cost of pretty-printing a file nobody's meant to hand-read. (Contrast
   with Categories' own export, which stays pretty-printed — it's small
   and plausibly hand-inspected.)
3. Same Blob → `navigator.share({files})` → `<a download>` fallback
   chain already used by `CategoryImportExport.svelte`. Filename:
   `expman-backup-<YYYY-MM-DD>.json` (today's date).

**Whole-app import**
4. THE APP SHALL only accept a **JSON file matching expman's own
   schema** — no raw `.db`/SQLite upload in-app. Validated the same way
   `CategoryImportExport.svelte` already does: parse, then check the
   shape (`Array.isArray(data.transactions)` etc.) before calling
   `importAll()`; a file that fails validation shows an error, nothing
   is touched.
5. Import is a **full replace** (matches `importAll()`'s existing
   semantics) — THE APP SHALL show a confirmation modal naming this
   explicitly before proceeding (matches every other destructive
   confirmation in this app).
6. Reached from a new **Settings > Backup** row (Settings currently has
   no import/export entry point of its own — Categories' import/export
   modal is scoped to categories only and stays that way).

**Backup screen** (new)
7. Two actions: **Export backup** and **Import backup**, same
   file-button-with-hidden-input pattern as
   `CategoryImportExport.svelte`, adapted to a full page (not a sheet,
   since unlike Categories this isn't opened from within another already
   open screen) since it's reached as its own Settings row.

**Legacy `.db` → sample JSON conversion (one-time script, not shipped)**
8. A Node script (`scripts/convert-legacy-db.mjs`) reads the `.db` file
   via the `sqlite3` CLI (already available; no new dependency) and
   writes a sanitized sample JSON file in the same shape `exportAll()`
   produces, importable through the feature above.
9. **Excluded entirely** (both from `expense_report` and
   `expense_repeating`): the `Income` category (all real income —
   salary, cashback, part-time work, everything — 320 transaction rows +
   4 recurring rows), `Medical`, `House`, `Pregnancy`, `Health Care`
   (medical- and renovation-adjacent; `House` is 100% resale/renovation
   rows; `Health Care` isn't even in the source's own category list).
10. **Synthetic income**: since real income is fully excluded, the
    script generates a handful of fake, clearly-synthetic income
    transactions (round numbers, generic descriptions) plus one sample
    monthly income recurring rule, spread across the sample's date
    range, so the sample still exercises Home's net-balance display and
    Recurring's income path.
11. **Categories**: `expense_category`'s 14 rows minus the 4 excluded
    ones become expman categories (id-based, ordered, colored from
    `CATEGORY_COLORS`, comma-separated subcategories split and given
    ids) — matches specs/categories.md's shape exactly. Two source
    categories used in `expense_report` but absent from
    `expense_category` (`School`, `Mum`) aren't sensitive, so they're
    kept — auto-created as categories so their transactions resolve.
    `Uncategorized` rows map to `categoryId: null`, matching expman's
    own Uncategorised concept, not a new category.
12. **Accounts**: `expense_account`'s 2 rows (`Personal Expense`,
    `Loans`) map directly.
13. **Transactions**: a recent, contiguous window of the non-excluded
    `expense_report` rows (not the full 13-year history — PRD.md asks
    for "a sample amount," not everything), `expensed` (epoch seconds)
    converted to `YYYY-MM-DD`, `payment_method` mapped to `'cash'`
    (the source data has essentially no real card usage to preserve),
    `status` dropped (matches specs/transactions.md's existing decision
    not to port it).
14. **Recurring**: the 25 non-Income `expense_repeating` rows map
    directly — source `frequency` is only ever `1m`/`12m`, i.e. exactly
    expman's `monthly`/`annual`, no daily/weekly present to map. Every
    included row becomes `endMode: 'never'` (the source has no
    end-date/status signal beyond a running payment counter that isn't a
    hard limit).
15. **Budgets**: the source's one `expense_budget` row targets `"All
    Category"`, which doesn't map to expman's per-category model — it's
    dropped, and the script instead creates 1-2 sample budgets on real
    imported categories (e.g. Food, Utilities) so the Budgets screen has
    something to show.
16. Output written to `data/` (gitignored — same as the source `.db`
    file and `seed.json`, never committed), so the real conversion
    output never ships or lands in git history either.

### Screens / components touched
- New: `src/pages/Backup.svelte` (the Settings > Backup screen —
  requirements 7).
- Modified: [Settings.svelte](../src/pages/Settings.svelte) (new
  "Backup" row), [App.svelte](../src/App.svelte) (routes it, same
  `*ReturnTo` pattern already used for Recurring/Budgets/CardDetails
  since Backup is only ever reached one way here — no returnTo needed,
  plain `backToSettings`).
- New (not shipped): `scripts/convert-legacy-db.mjs`.
- No changes needed to [db.js](../src/lib/data/db.js) — `exportAll()`/
  `importAll()` already exist and already cover every store correctly.

### Data model
No schema changes — this feature is entirely about exposing the
existing `exportAll()`/`importAll()` shape through a UI, plus a
dev-only script that produces data in that same shape.

### Out of scope
- In-app raw `.db`/SQLite parsing (confirmed: JSON-only import).
- Automatic daily local backup, Google Drive sync (TODO.md's original
  app has both; PRD.md doesn't ask for either here).
- Any sanitization/scrubbing of transaction `description` text beyond
  excluding entire sensitive categories — the remaining categories'
  descriptions (groceries, subscriptions, etc.) are ordinary day-to-day
  expense text.
- Linking imported transactions back to imported recurring rules via
  `recurringId` — the legacy schema's own linkage convention
  (note-string matching) doesn't map to expman's id-based one, and
  these are historical rows that don't need to auto-materialize
  anything going forward.

### Acceptance criteria
- [ ] Settings has a "Backup" row; it opens a screen with Export and
      Import actions.
- [ ] Export produces a minified `expman-backup-<date>.json` containing
      every store, downloadable (or shareable on mobile).
- [ ] Importing a valid expman backup file fully replaces existing data
      after a confirmation modal.
- [ ] Importing a `.db` file, a categories-only export, or any
      non-matching JSON shows an error and changes nothing.
- [ ] `scripts/convert-legacy-db.mjs` produces a JSON file with zero
      transactions/recurring rows from Income, Medical, House,
      Pregnancy, or Health Care, plus a handful of synthetic income
      rows, importable end-to-end through the Backup screen.

### Notes
Source: [PRD.md](../PRD.md) → IMPORT/EXPORT section, refined through
extensive Q&A (see conversation) — most notably the JSON-vs-other-format
"let's brainstorm" question, resolved by measuring real numbers (3MB /
~6ms for the `.db` file's row count, 6MB / ~25ms at double that) rather
than guessing, and the scope question on whether `.db` import should be
a real in-app feature (decided no — a one-time conversion script is
enough, avoiding a new WASM SQLite dependency for a one-off need).

The transactions sample's exact window/count and the specific synthetic
budgets/income amounts are script-level judgment calls, not covered by
a direct answer — documented here as defaults, trivially adjustable by
re-running the script since its output is gitignored, disposable data.
