# Punchlist

Every behaviour the owner has asked for since this list was started (1 Oct 2026), written back
in plain terms so it can be corrected, and how far each has really got. The owner's own words
for each are under **Decided by the owner** in [AGENTS.md](AGENTS.md).

Status means one thing only:

| Status | Meaning |
|---|---|
| **SEEN** | The owner has watched it work in the running app. |
| **WRITTEN** | Code is in and the suites pass. **Nobody has seen it work in the real app.** |
| **OPEN** | Not built, or not understood. |

Nothing moves to **SEEN** except by the owner saying so. A green suite checks what it was
written to check and nothing else.

---

## 1. Import/export

| # | Behaviour | Status |
|---|---|---|
| 1.1 | A **FILE NAME** box under the export. A typed name is used as typed: the characters a file system refuses become dashes, and `.json` is added when it's missing. | WRITTEN |
| 1.2 | Left empty, the file is `write-timer-state-YYYY-MM-DD_HH-MM-SS.json` in local time, and the empty box shows that name as its placeholder. | WRITTEN |
| 1.3 | The placeholder, the downloaded name and the `exportedAt` inside the file are **one moment**: the snapshot, taken when the dialog opens, on a return to EXPORT while the box is untouched, and by REVERT. It does not tick. DOWNLOAD saves the box exactly as shown. | WRITTEN |
| 1.4 | The export box can be typed in. | WRITTEN |
| 1.5 | Both boxes are checked against the schema as they're typed in. Text that isn't JSON says where it breaks; JSON that isn't a state file lists what the schema rejects. | WRITTEN |
| 1.6 | IMPORT is greyed out until the import text passes. Its warning is red. | WRITTEN |
| 1.7 | The export's warning is yellow, and COPY or DOWNLOAD of text that fails asks first, **COPY IT ANYWAY?** or **DOWNLOAD IT ANYWAY?**, with the details. It has a "Keep asking this" box, and a row in the confirmations list: *Export JSON that fails its checks*. | WRITTEN |
| 1.8 | Closing with unsaved changes asks first, **DISCARD CHANGES?**, whether by CLOSE or ESC, and lists what would go. It has a "Keep asking this" box, and a row in the confirmations list: *Close import/export with unsaved changes*. | WRITTEN |
| 1.9 | Closing throws away what was typed and not saved. Every opening starts from the page as it is then, with an empty import box. | WRITTEN |

Where it lives: `client/src/components/timer/TransferDialog.tsx` (the dialog and both questions),
`stateFile.ts` (`checkStateText`, `readStateFile`, `exportState`), `format.ts`
(`exportFileName`), `suppressions.ts` (the two rows, `TransferQuestion`), and `Timer.tsx` (`asks`,
`onSilence`).

## Waiting on the owner

Choices the agent made to keep going, which the owner has not ruled on. Each is built as
described. Say which to change.

1. **REVERT.** Once the export has been edited, a REVERT button puts back the page as it is now.
   Not asked for; added because the edits otherwise had no way back short of closing.
2. **What counts as unsaved** (1.8): an export edited since it was last copied or downloaded,
   and import text that was typed or pasted. Text that LOAD FILE put in the import box doesn't
   count, since it is still in the file it came from.
3. **The typed file name survives closing**, unlike everything else in the dialog.
4. **A hand-edited `exportedAt` doesn't rename the file.** The name follows the snapshot
   (1.3), so editing the time inside the JSON leaves the two different.
5. **"Syntax, schema, or both"** (1.5): text that isn't JSON can't be held up to the schema, so
   the warning shows one or the other, never both at once.
6. **The "anyway" question covers COPY as well as DOWNLOAD** (1.7).
7. **Closing the browser tab doesn't ask.** "Closing window" was read as the dialog. Reloading
   or closing the tab with unsaved text in the dialog loses it without a word; the page's leave
   guard is armed only by a run on the clock.
8. **Both questions follow the confirmation mode** like every other half-tier question: they
   ask in half and full, and never when confirmations are off.

## What has actually been checked

- **The browser suites, 2 Oct 2026, on Windows Chrome: all 27 pass**, among them transfer 111
  checks, journey 240 and modes 125. The transfer suite drives 1.4 to 1.9; journey downloads a
  real file under both kinds of name (1.1 to 1.3) and loads one back in.
- **Screenshots in headless Chrome, 1 Oct 2026**: the export warning, COPY IT ANYWAY?, and the
  import's syntax error with IMPORT greyed out, desktop and phone width, both themes for the
  file name box. Looked at by the agent, **not** the owner, so none of it is SEEN.
- **Not checked**: Safari and Firefox (the download name and the clipboard both depend on the
  browser), a screen reader, and a person using any of it.
