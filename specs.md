# Spec template

Before starting a new feature or screen, copy this file to
`specs/<feature-name>.md` (kebab-case — e.g. `specs/activity.md`,
`specs/add-edit-transaction.md`) and fill it in. Delete this instructions
block from your copy once you do.

Check [TODO.md](TODO.md) for this feature's entry first — it's an audited
function inventory of the original `budget-app`, and is more reliable than
resketching behavior from memory. Pull the relevant bullet points and
`Uses:` line into this spec's Requirements/Data model sections instead of
re-deriving them.

A spec is ready to build from once **Open questions** is empty and
**Status** is `Approved`. Don't start implementation before that.

---

## <Feature name>

**Status:** Not started | Drafting | Approved | In progress | Done

### Summary
One or two sentences — what this feature is and why it matters to the user.

### User stories
- As a [user], I want to [action], so that [benefit].

### Requirements
Numbered, testable statements. Prefer this shape:
`WHEN <trigger/condition> THE APP SHALL <observable behavior>`

1. WHEN ... THE APP SHALL ...
2. WHEN ... THE APP SHALL ...

### Screens / components touched
- New: `src/pages/...`, `src/lib/components/...`
- Existing, modified: `src/...`

### Data model
- Stores read: `transactions`, ...
- Stores written: ...
- New fields, if any, and why the existing shape in
  [db.js](src/lib/data/db.js) doesn't already cover it.

### Out of scope
What this spec explicitly does NOT cover — defer it to a later spec rather
than quietly building it now.

### Open questions
Anything not yet confirmed with the user. Must be empty before
implementation starts.

### Acceptance criteria
- [ ] ...
- [ ] ...

### Notes
Edge cases, gotchas, or original-app behavior worth remembering — link back
to the relevant [TODO.md](TODO.md) section.
