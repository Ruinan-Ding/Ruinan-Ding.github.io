---
name: state-file-sync
description: Change what Write Timer's import/export JSON file holds without the schema, the export, the import and the stored keys drifting apart. Use when adding, renaming or removing anything the page remembers (a localStorage key, a setting, a field of the timer, presets, history or word counter), when changing timer-state.schema.json, or when an import or a fresh export is refused for something that looks valid.
---

# State file sync

The file is everything the page remembers, in a shape of its own rather than a dump of
`localStorage`: the stored keys have names nobody chose for reading, and two of them are left over
from migrations. Its contract is **one file**, `client/public/timer-state.schema.json`. The site
serves it at `/timer-state.schema.json` for editors to fetch, and `stateFile.ts` imports the same
file to check imports, and every keystroke in both boxes of the import/export dialog. So the
published contract and the rules the page enforces can't disagree.

Changing what the file holds touches these, in this order:

| # | File | Holds |
|---|---|---|
| 1 | `client/public/timer-state.schema.json` | The contract, with a `description` for every field. `additionalProperties: false` nearly everywhere, so an unknown field is refused outright. |
| 2 | `client/src/components/timer/constants.ts` | `STORAGE_KEYS`, every key the page stores. |
| 3 | `client/src/components/timer/stateFile.ts` | The `StateFile` type; `exportState()`, which reads the store into a file; `readStateFile()`, which checks a file and turns it into store entries; `check()`, which both it and `checkStateText()` use. |
| 4 | The key's reader | Whatever reads the key back after the reload: a `useState` initialiser in `Timer.tsx`, `WordCounter.tsx`, `useClockSettings.ts`, `entries.ts`, or `suppressions.ts`. |
| 5 | `tests/transfer.test.mjs`, `tests/journey.test.mjs` | The round trip. |

## Procedure

1. **Schema first.** Add the field with a `description` saying what it means and what leaving
   it out means. Decide on purpose whether it goes in `required`. Usually it doesn't: a partial
   file is allowed, and anything it leaves out goes back to its default.
2. **Only keywords the validator knows.** `validate()` in `stateFile.ts` is hand-rolled and
   understands the `Schema` interface: `type` (one or a list), `const`, `enum`, `minimum`,
   `maximum`, `maxItems`, `items`, `properties`, `required`, `additionalProperties`, and `$ref`
   into `$defs`. **Anything else is ignored without a word** (`pattern`, `minLength`,
   `minItems`, `format`, `uniqueItems`). Either teach `validate()` the keyword, with its own
   message, or express the rule with the ones above. A keyword the page ignores is a promise the
   published schema makes and nothing keeps.
3. **Export.** Add it to `StateFile` and to `exportState()`. **Clamp to what the schema
   allows**, as `toEntry`, the volume and the remaining time already do. A fresh export that
   fails its own schema makes COPY and DOWNLOAD ask "anyway?" on every export, and its import
   is refused.
4. **Import.** Map it in `readStateFile()` to its store entry with `put(STORAGE_KEYS.x, value)`.
   An import is a **replacement, not a merge**: `handleImportState` wipes every stored key
   (`ALL_STORED_KEYS`) and writes only what the file holds, then reloads, so a field left out
   reads its default on the way back in. If the field needs the import's question to say what is
   coming, add a line to `summary` or `warnings`.
5. **The reader does the guarding.** After the reload the value comes back through the same
   reader a normal reload uses (AGENTS.md invariant 2), and that reader has to survive anything:
   a hand-edited file, a store from an older build. It validates or clamps, and falls back to
   the default. `readStateFile` is not the only gate.
6. **Version.** `STATE_VERSION` is 1. A file newer than the page is refused with "a newer copy of
   this page" before the schema is consulted. Adding an optional field doesn't need a bump, but
   remember that a page from before the change refuses files that carry the field
   (`additionalProperties: false`). Bump it only when an old page would misread a new file
   rather than refuse it, and then decide what this page does with version-1 files.

## Checks

- **The round trip is exact.** The transfer suite seeds every key off its default, exports,
  imports into an empty browser and exports again, then compares (`withoutStamp`). Seed the new
  key there with a non-default value, and add it to the export's `check` lines.
- **A fresh export passes its own checks.** Transfer's section 6 asserts there are no warnings
  on a fresh export. Push the new field to its limits there if it has any.
- **Refusals name the field.** Add the boundaries to transfer's `rejected(...)` list: one over
  the maximum, one under the minimum, the wrong type. Its errors read like
  `presets[0].minutes must be at most 59`.
- Run `pnpm run check`, `pnpm test`, and the `transfer` and `journey` suites (the `ui-suites`
  skill).

## Removing a field

Remove it from the schema, `StateFile`, `exportState`, `readStateFile` and the tests, and grep
for the key before assuming nothing reads it. Files exported before the removal still carry the
field, and with `additionalProperties: false` they would now be refused. Either keep the field in
the schema as accepted and ignored, saying so in its `description`, or bump `STATE_VERSION`
and say why in the commit.
