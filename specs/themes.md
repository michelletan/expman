## Themes

**Status:** Approved

### Summary
A Settings > Theme picker lets the user switch the app's entire visual
identity — colors, fonts, and corner shape — between 4 presets, each with
its own distinct character rather than being a simple color reskin.
Selecting one applies and persists it immediately.

### User stories
- As a user, I want to pick a theme that matches my taste (or mood), so
  the app feels like mine rather than a fixed default.
- As a user, I want my theme choice to persist across launches, so I
  don't have to re-pick it every time.

### The 4 themes
`tokens.css` already has 4 `[data-theme]` slots (`midnight` is the
`:root` default; `forest`/`plum`/`harbor` exist but are unused anywhere
in the UI yet). This spec keeps `midnight` as-is and replaces the other
3 with themes matching PRD.md's brief ("journal style, clinical
bookkeeping style, green cartoony style"), each with its own colors,
fonts, and corner radius:

| id | Name | ink | paper | paper-dim | paper-line | accent | accent-ink | radius | display font | body font |
|---|---|---|---|---|---|---|---|---|---|---|
| `midnight` | Midnight Gold *(default, unchanged)* | `#1C2333` | `#F6EEDD` | `#EAE0C8` | `#DDD0AE` | `#C99A3B` | `#1C2333` | `14px` | Space Grotesk | Inter |
| `journal` | Journal | `#2B2018` | `#F8EFDD` | `#EFE2C8` | `#DCC9A0` | `#7C2D3A` | `#F8EFDD` | `10px` | Lora | Source Serif 4 |
| `ledger` | Ledger | `#1A1A1A` | `#F1F5EE` | `#E1EADB` | `#BFD3B8` | `#1F4E79` | `#FFFFFF` | `2px` | IBM Plex Mono | IBM Plex Mono |
| `meadow` | Meadow | `#1B3A2B` | `#F0FBF4` | `#DFF3E6` | `#BCE6CB` | `#37B24D` | `#FFFFFF` | `22px` | Baloo 2 | Nunito |

Rationale: Journal uses a warm serif and a burgundy "sealing wax" accent
for a handwritten-ledger feel with softened corners. Ledger goes fully
monospace with near-square corners and a rubber-stamp navy accent, for a
spreadsheet/audit look — mono's fixed-width digits also suit a money app.
Meadow pairs a bright grass green with heavily rounded corners and
bubbly/soft fonts for a playful, cartoony feel.

`--green` (income) and `--rust` (expense/overdue) stay the exact same
fixed hex values across all 4 themes, unchanged from today — confirmed
with the user: financial meaning (positive/negative) should always read
the same regardless of theme, and isn't part of this spec's scope.

### Requirements
1. WHEN the user opens Settings THE APP SHALL show a "Theme" row (after
   the existing rows) displaying the current theme's name as its live
   value.
2. WHEN the user taps the Theme row THE APP SHALL open a full-screen
   Theme picker, following the same sub-screen pattern as Accounts/
   Categories/Cards: the Settings tab stays highlighted, and back
   returns to Settings.
3. WHEN the Theme picker is shown THE APP SHALL display all 4 themes as
   swatch cards, each showing its own ink/paper/accent colors, its own
   display-font sample text, and its own corner radius — rendered from a
   static swatch definition, not by live-switching `data-theme`, so all
   4 previews are visible at once regardless of which theme is active.
4. WHEN the Theme picker is shown THE APP SHALL visually mark whichever
   theme is currently active.
5. WHEN the user taps a theme swatch THE APP SHALL apply it immediately
   (no separate save step): update the `data-theme` attribute on the app
   root, update the `theme-color` meta tag to that theme's `ink` value,
   and persist the choice via `setMeta('theme', id)`.
6. WHEN the app boots THE APP SHALL read the persisted theme from `meta`
   (defaulting to `midnight` if unset) and set `data-theme` accordingly
   before the main screen area renders.
7. WHEN any theme is active THE APP SHALL render every existing screen
   using that theme's ink/paper/paper-dim/paper-line/accent/accent-ink
   colors, its own display and body fonts, and its own `--radius` value,
   via the existing CSS custom property mechanism — with no other
   per-screen visual differences between themes.
8. WHERE a component currently hardcodes a rectangular corner radius
   (cards, sheets, buttons, inputs, rows) THE APP SHALL read it from
   `var(--radius)` instead, so a theme's radius choice applies app-wide.
   Circular (`50%`) and pill (`999px`) shapes are left as-is — radius
   theming doesn't apply to shapes that are already fully round.
9. WHEN a transaction/amount is rendered as income, expense, or overdue
   THE APP SHALL always use the same fixed `--green`/`--rust` values,
   regardless of the active theme.

### Screens / components touched
- New: `src/pages/Themes.svelte` (theme picker screen)
- Existing, modified:
  - `src/App.svelte` — new `Themes` screen route from Settings (same
    pattern as Accounts/Categories/Cards); boot sequence reads
    `getMeta('theme')` and sets `data-theme` + `theme-color` before
    `ready = true`.
  - `src/pages/Settings.svelte` — add the "Theme" row.
  - `src/lib/styles/tokens.css` — replace the unused `forest`/`plum`/
    `harbor` blocks with `journal`/`ledger`/`meadow` per the table above;
    add a `--radius` value to every theme block (including `midnight`).
  - `index.html` — add Google Fonts entries for Lora, Source Serif 4,
    IBM Plex Mono, Baloo 2, Nunito (Space Grotesk/Inter stay for
    `midnight`).
  - Every component/page currently hardcoding a rectangular
    `border-radius` (~87 declarations across ~24 files, per a repo-wide
    grep) — swapped to `var(--radius)`, excluding `50%`/`999px` shapes.

### Data model
- Stores read: `meta` (key `theme`) via the existing `getMeta` helper.
- Stores written: `meta` (key `theme`) via the existing `setMeta`
  helper — no new db.js functions needed.
- New fields: none in IndexedDB. New CSS custom property: `--radius`
  (one value per theme block in `tokens.css`).

### Out of scope
- A 5th "custom theme" / user-defined colors — only the 4 presets.
- Automatic theme switching by system light/dark preference.
- New app-icon variants for the home-screen PWA icon — a separate
  PRD.md TODO item, not part of this spec.
- Per-theme illustrations, icons, or box-shadow styling.
- Theming `--green`/`--rust` (confirmed fixed, see above).

### Open questions
None.

### Acceptance criteria
- [ ] Settings shows a Theme row with the current theme's name.
- [ ] Tapping it opens a full-screen picker showing all 4 themes as
      distinct swatch cards (own colors + font sample + radius), with
      the active one visually marked.
- [ ] Tapping a swatch applies it immediately app-wide (colors, fonts,
      radius) and survives a reload with no re-selection needed.
- [ ] `theme-color` meta tag matches the active theme after both a
      switch and a fresh boot.
- [ ] Income/expense/overdue colors are visually identical across all 4
      themes.
- [ ] Circular avatars and pill-shaped controls keep their shape in
      every theme (not affected by `--radius`).
- [ ] No screen regresses visually under any of the 4 themes (spot-check
      Home, Activity, Budgets, Reports, Settings, and at least one
      Add/Edit form).

### Notes
- `#app-shell` in [App.svelte](src/App.svelte) already has a hardcoded
  `data-theme="midnight"` placeholder — this spec makes it dynamic.
- Original app precedent: TODO.md's "Theme picker" section describes
  4 *color-only* themes reusing the current fonts everywhere; this spec
  deliberately supersedes that with PRD.md's richer brief (per-theme
  fonts + shape), confirmed with the user.
- Color/font/radius choices above are concrete proposals for review —
  flag any of them for adjustment before this moves to Approved.
