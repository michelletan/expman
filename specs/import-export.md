## Import / Export

**Status:** Approved

### Summary
Two independent pieces: (1) a real, whole-app backup/restore feature —
export everything IndexedDB holds to a single minified JSON file, import
it back (full replace) — generalizing the JSON export/import
[CategoryImportExport.svelte](../src/lib/components/CategoryImportExport.svelte)
already does for categories alone up to every store. (2) A one-time,
dev-side Node script that converts the legacy `Expense Manager` SQLite
export (`data/2026-09-16_Expense Manager.db`) into a full, real JSON
file in that same expman shape — not an in-app feature — used to
actually migrate the user's real history into expman, not just to
produce test data. **Amended**: this script originally produced a
sanitized sample (excluding income and a few other categories, a short
recent window) — the user has since confirmed they want their real,
complete history instead (see requirements 9-14 below).

### User stories
- As a user, I want to back up my entire budget (accounts, categories,
  transactions, cards, recurring rules, budgets) to a single file I
  control, so I'm never locked into this one browser's IndexedDB.
- As a user, I want to restore that file on a new device/browser and
  have everything come back exactly as it was.
- As a user, I want my real legacy history (2013–present, including real
  income) converted into expman's format, not a sanitized sample.

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

**Legacy `.db` → full JSON conversion (one-time script, not shipped)**
8. A Node script (`scripts/convert-legacy-db.mjs`) reads the `.db` file
   via the `sqlite3` CLI (already available; no new dependency) and
   writes a full JSON file in the same shape `exportAll()` produces,
   importable through the feature above.
9. **Nothing is excluded** — including the `Income` category (real
   salary, cashback, part-time work, scholarships, etc.) and every other
   category (Medical, House, Pregnancy, and everything else). This
   reverses the script's original design, which excluded anything
   income- or sensitive-adjacent for a shareable test sample — the user
   has since confirmed they want their real, complete data converted,
   not a sanitized sample (see Notes).
10. ~~Synthetic income~~ — removed. Real income transactions and real
    income recurring rules (see 14) are converted directly; nothing is
    fabricated.
11. **Categories**: every `expense_category` row becomes an expman
    category (id-based, ordered, colored from `CATEGORY_COLORS`,
    comma-separated subcategories split and given ids) — matches
    specs/categories.md's shape exactly. A handful of categories used by
    real rows but absent from `expense_category` itself are auto-created
    too: `School` (with its real subcategories — Tuition, Textbooks,
    Other), `Mum` and `Treats` (no meaningful subcategory of their own
    in the source), and `Income` (with its real subcategories — Salary,
    Scholarship, Part-time work, Personal Savings, Cashback/Rebates,
    Windfall), type `income` unlike every other category. `Uncategorized`
    rows map to `categoryId: null`, matching expman's own Uncategorised
    concept, not a new category.
12. **Accounts**: `expense_account`'s 2 rows (`Personal Expense`,
    `Loans`) map directly.
13. **Transactions**: the **full** `expense_report` history — window is
    the source's own real earliest transaction date (derived via
    `min(expensed)`, currently 2013-04-28) through today, not an
    artificially shortened recent sample. `expensed` (epoch seconds)
    converted to `YYYY-MM-DD`; `type` is `income` when the source
    category is `Income`, `expense` otherwise; `payment_method` mapped
    to `'cash'` for expense rows (the source data has essentially no
    real card usage to preserve) and `null` for income rows, matching
    expman's own `type === 'expense' ? paymentMethod : null` convention;
    `status` dropped (matches specs/transactions.md's existing decision
    not to port it).
14. **Recurring**: every `expense_repeating` row maps directly,
    including real income rules — source `frequency` is only ever
    `1m`/`12m`, i.e. exactly expman's `monthly`/`annual`, no daily/weekly
    present to map. `type`/`paymentMethod` follow the same
    income-vs-expense rule as transactions above. Every row becomes
    `endMode: 'count'` with `occurrenceCount` set to `no_of_payment -
    paid_cycle` (payments remaining) — **correcting an earlier
    assumption that no hard-limit signal existed**: it does
    (`no_of_payment` is the total planned payments, `paid_cycle` how
    many are already done, and `paid_cycle` never exceeds
    `no_of_payment`). A rule that's already fully paid off gets
    `occurrenceCount: 0`, which `isRecurringActive()` correctly reads as
    already-ended, instead of the old blanket `endMode: 'never'`, which
    wrongly resurrected every completed subscription (income or expense)
    as open-ended.
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
- Any sanitization/scrubbing of transaction `description` text — this
  is now a full, real conversion (see requirement 9), not a sanitized
  sample.
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
- [ ] `scripts/convert-legacy-db.mjs` produces a JSON file covering the
      full real history (every category including Income, full date
      range from the source's earliest transaction), importable
      end-to-end through the Backup screen.
- [ ] A recurring rule that's already fully paid off in the source
      (`paid_cycle === no_of_payment`) imports as already-ended, not as
      an open-ended active rule.

### Notes
Source: [PRD.md](../PRD.md) → IMPORT/EXPORT section, refined through
extensive Q&A (see conversation) — most notably the JSON-vs-other-format
"let's brainstorm" question, resolved by measuring real numbers (3MB /
~6ms for the `.db` file's row count, 6MB / ~25ms at double that) rather
than guessing, and the scope question on whether `.db` import should be
a real in-app feature (decided no — a one-time conversion script is
enough, avoiding a new WASM SQLite dependency for a one-off need).

The specific sample budget amounts (Food/Utilities) are still a
script-level judgment call, not covered by a direct answer — documented
here as a default, trivially adjustable by re-running the script since
its output is gitignored, disposable data.

The switch from a sanitized sample to a full real conversion happened
mid-project: the user manually widened the script's window (18 months →
180) to get their full history, which surfaced two bugs at that scale —
an unrealistic ~$487k balance (the old synthetic-income model, 180 ×
$5,000, never designed for 15 years) and the absence of any real
recurring income (by the original sanitization design). Rather than
patch the synthetic model to scale, the user clarified they wanted real
income all along, which removed the need for synthetic income entirely
and simplified the script.
