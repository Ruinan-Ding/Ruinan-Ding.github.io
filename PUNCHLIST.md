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

## 2. History

| # | Behaviour | Status |
|---|---|---|
| 2.1 | STOP, RESET or switching timers before a run first reaches red makes that history entry's border red while its time text stays white. Pausing and reloading keep the run active; a run that reached red keeps its normal colour even if time is added afterward. | WRITTEN |
| 2.2 | The red outline and active-run tracking survive reload and import/export. Older history entries without outcome data stay white, and deleting the active entry cannot mark a different row as ended early. | WRITTEN |

## 3. Development workflow

| # | Behaviour | Status |
|---|---|---|
| 3.1 | Claude has the ChessPlusPlus-style Scrum team adapted to Write Timer: nine senior capabilities, shared delivery/review and an active SDD → BDD → TDD workflow. The owner retains product decisions and observation status. | WRITTEN |
| 3.2 | Informal/vibe development requirements automatically become compact scoped specs, stable BDD criteria and test-first tasks; clear intent needs no extra approval and unresolved product rules remain explicit. | WRITTEN |
| 3.3 | Use scoped context, small task packets, one spec source and proportionate staffing to reduce token overhead without dropping required checks or evidence. | WRITTEN |
| 3.4 | SAFe-aligned feature/story and PI coordination reuses the nine profiles, with explicit dependencies, risks, integrated evidence and owner decisions; expanded guidance loads only when needed. | WRITTEN |
| 3.5 | Relevant Claude plugins, including Ralph, are installed in WSL and Windows with focused usage, bounded iteration and setup instructions. The PR toolkit is opt-in; Context7 uses public MCP and awaits Claude's normal project-server trust approval. | WRITTEN |

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

- **Claude plugins, 17 Oct 2026**: both native inventories, required binaries,
  isolated Ralph hook checks and real TypeScript definition/type-error checks
  pass in WSL and Windows. Type/unit, settings/link/LF and dirty-work preservation
  checks pass. Context7's canonical public endpoint responds anonymously; native
  project trust is still pending. The PR toolkit stays opt-in to avoid its idle
  context. Browser/build checks were skipped for configuration/docs only. Actual
  plugin-driven delivery/token cost and owner observation remain untried. See WF-004.
- **SAFe alignment, 17 Oct 2026**: type/unit checks, skill validation, profile and
  settings preservation, links and LF pass. Independent direct-story, PI-planning
  and release scenarios pass. A preview-cleanup review finding was corrected and
  rechecked. Entry/core text is 0.8% smaller; expanded SAFe guidance loads on demand.
  Runtime token cost and real PI/team operation remain untried. Browser/build
  checks were skipped for unchanged app/test/CI sources. See WF-003 for evidence.
- **Compact SDD workflow, 17 Oct 2026**: skill/profile/link/LF validation, type and
  unit checks pass. Native discovery retains nine profiles and four project skills;
  Claude 2.1.285 reports agent listing 487 → 235 tokens. Operating text including
  the translator is 36.4% smaller. Independent simulated clear/ambiguous/steering
  cases pass. This measures instruction size and followability, not total task
  cost, live-team delivery or owner acceptance. Browser/build checks were skipped
  because app/test/CI source is unchanged. See WF-002 for evidence and limits.
- **The Claude workflow, 15 Oct 2026**: YAML/JSON, inherited models, advisory tool
  restrictions, skill validation, links and LF pass. Claude Code 2.1.300 discovers
  nine profiles and the four project skills in an isolated copy; type and unit
  checks pass. An independent planning walkthrough found no actionable workflow
  defect. Browser/build checks were skipped for this workflow-only change. Native
  team delivery, owner observation and Ponytail invocation in WSL were not tested;
  that Claude installation reports no installed plugins. See WF-001 in the backlog.
- **The red-outline revision, 3 Oct 2026**: type checks, word-count and format checks, and
  the build pass. Windows Chrome passes all 11 affected browser suites: journey (268 checks),
  transfer (122), clockgap, fill, header, joinright, layout, rows, samefill, spill and tipfit.
  Journey checks the red border and normal time text in both themes, including after reload.
- **The initial history change, 3 Oct 2026**: type checks, word-count and format checks, and the build
  pass. Windows Chrome passes all 27 browser suites, including journey (268 checks) and
  transfer (122). Journey checks both colours, early endings and cancelled
  confirmations, reloads, deleting the active row, zero and negative starts, and extending a
  run that reached red. Transfer checks the round trip and a restored run's history link.
- **The browser suites, 2 Oct 2026, on Windows Chrome: all 27 pass**, among them transfer 111
  checks, journey 240 and modes 125. The transfer suite drives 1.4 to 1.9; journey downloads a
  real file under both kinds of name (1.1 to 1.3) and loads one back in.
- **Screenshots in headless Chrome, 1 Oct 2026**: the export warning, COPY IT ANYWAY?, and the
  import's syntax error with IMPORT greyed out, desktop and phone width, both themes for the
  file name box. Looked at by the agent, **not** the owner, so none of it is SEEN.
- **Not checked**: Safari and Firefox (the download name and the clipboard both depend on the
  browser), a screen reader, and a person using any of it.
