# AGENTS.md

Guidance for AI agents working in this repo. Human-readable too: `README.md` covers what the
app does and how to build it, and this covers the things that are easy to get wrong.

## How to work here

**Invoke the `ponytail` plugin for all code work in this repo**: `/ponytail` (default level
`full`). Source: the `DietrichGebert/ponytail` marketplace; install with
`/plugin marketplace add DietrichGebert/ponytail`, then `/plugin install ponytail@ponytail`.
`.claude/settings.json` enables it for this repo, and it is installed in the owner's Windows
Claude Code (user scope, and project scope for this repo). It is **not** installed in the WSL
Claude Code, so a session started from WSL has to install it or go without and say so.

The plugin is the source of truth for what "lazy" means here. Don't restate its rules in this
file; just run it. Its sibling skills: `/ponytail-review` (an over-engineering review of a diff),
`/ponytail-audit` (the whole repo), `/ponytail-debt` (collects `ponytail:` comments into a
ledger), `/ponytail-help`.

**How this owner works:**

- **What the app does is the owner's call.** Never invent behaviour to fill a gap: what a
  button does, what a dialog says, what is kept or thrown away, what asks first. If a rule you
  need isn't written under **Decided by the owner** below, ask, in a small batch, the most
  expensive question first. Where you had to pick something to keep going, say so plainly and
  list it under "Waiting on the owner" in `PUNCHLIST.md`.
- **Record a decision in the same turn it is made**, under **Decided by the owner**, with the
  date and the owner's words quoted verbatim, typos included. A decision that lives only in a
  chat log is one the next session will silently contradict. When a decision is reversed, edit
  the entry; don't append a contradiction.
- **A passing suite is not the owner having seen it.** `PUNCHLIST.md` tracks each
  owner-requested behaviour as SEEN, WRITTEN or OPEN, and nothing moves to SEEN unless the owner
  says so.
- **Commit only when asked, and push only when asked.** Approval for one push doesn't carry over
  to the next commit. Commit as the owner:
  `git -c user.name="Ruinan Ding" -c user.email=ding.r866@gmail.com commit ...`. Never change
  git config. Commit messages are prose: a subject that says what changed for a person, and a
  body that says why.
- **Verify before claiming.** Run `pnpm run check` and `pnpm test`, and the browser suites a
  change touches (the `ui-suites` skill). Run all 27 before a push the owner asked to be
  tested. Report failures with their output, and say when a step was skipped.
- **Style:**
  - Comments are long, reasoned, plain English, and explain why. Match their density.
  - Single quotes in TS, 2-space indent, LF (see `.editorconfig`).
  - Read the code a change touches before changing it; most files open with a comment saying
    what was tried before and why it was dropped.

## What this is

Write Timer (https://ruinan-ding.com): a countdown timer that keeps counting past zero, with
presets, run history, a wall clock and a word counter, for timed writing sessions. A static
React 19 + TypeScript + Tailwind 4 single-page app built with Vite and deployed to GitHub Pages.
There is no backend: everything the page remembers lives in the browser's `localStorage`.

## Commands

```bash
pnpm install
pnpm run dev          # Vite on :3000 - the owner's dev server; leave it alone
pnpm run check        # tsc --noEmit
pnpm test             # unit checks: wordCount.check.mjs, format.check.mjs
pnpm run test:ui      # the 27 browser suites in tests/, headless Chrome (~25 min)
pnpm run test:ui transfer journey   # just those
pnpm run build        # dist/
```

Counts on 2 Oct 2026: 27 suites, among them journey 240 checks, transfer 111, modes 125.

**CI** (`.github/workflows/deploy.yml`) runs on every push to `main`: `pnpm run check`, `pnpm
test`, the build, then deploys `dist/` to the `gh-pages` branch with `dist/404.html` copied
from `index.html` and the custom domain `ruinan-ding.com`. **It does not run the browser
suites** (they need Chrome and take minutes), so a red layout or dialog never stops a deploy.
Run them locally before pushing anything that touches the UI. Pull requests run nothing.

**Where the owner runs things.** The repo lives on the Windows drive, and Claude Code runs in
WSL against it (`/mnt/c/Users/DRuin/OneDrive/Documents/Ruinan-Ding.github.io`):

- `node_modules` was installed by pnpm in **WSL**, so its links are Linux symlinks. Windows
  Node can't follow them, and `pnpm` isn't on WSL's PATH, so call the tools by path from WSL:
  `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vite/bin/vite.js build`.
- WSL has no usable Chrome, so the browser suites run on **Windows** Node and Chrome against a
  server started in WSL. The `ui-suites` skill has the exact procedure and its traps.
- **Push with Windows git.** WSL git has no credentials, and Windows git has Credential
  Manager: `cmd.exe /c "cd /d C:\Users\DRuin\OneDrive\Documents\Ruinan-Ding.github.io && git
  push origin main"`. WSL git can commit (with the `-c` identity above) and do everything else.

**Line endings are LF everywhere**, in the repo and in every checkout: `.gitattributes` sets
`* text=auto eol=lf`, which overrides a Windows git's `core.autocrlf=true`, and `.editorconfig`
asks editors for LF. Two commits rewrote whole files for line endings alone (`f0116aa` to CRLF,
`bfe3242` back to LF); `.git-blame-ignore-revs` lists them. GitHub reads that file on its own,
and locally `git config blame.ignoreRevsFile .git-blame-ignore-revs` does the same.

## Architecture invariants

Break these and the design stops working.

**1. `localStorage` is the only state, and every key is in `STORAGE_KEYS`**
(`client/src/components/timer/constants.ts`). Reads go through `client/src/lib/storage.ts`,
which never throws: a full, blocked or corrupt store falls back to the default rather than
taking the page down. Writes go through `usePersisted`, one key per call, so a ticking timer
doesn't drag every other setting through `JSON.stringify` each second. **One key is spelled
twice**: `timerLightTheme` is also read by an inline script in `client/index.html`, which sets
the theme before first paint. Renaming that key means renaming it there too. **A retired key
is still wiped**: `ALL_STORED_KEYS` in `Timer.tsx` is everything the site RESET clears and an
import replaces, and it keeps `timerHasMutedBefore` (muting asks every time now) because the
browsers that stored it still have it. Retiring a key means moving it there, not deleting it.

**2. Everything comes back through its own reader.** The site RESET and an import both write the
store and then reload, so every piece of state is rebuilt by the same guarded reader a normal
reload uses. There is no second path by which state gets in. `wipeStorage` and
`replaceStorage` seal the store afterwards so nothing the page flushes on its way out lands over
what was written; `replaceStorage` puts back every key it touched if a write fails.

**3. The state file's contract is `client/public/timer-state.schema.json`.** It is served
publicly at `/timer-state.schema.json` (`$id` `https://ruinan-ding.com/timer-state.schema.json`),
and `stateFile.ts` imports the same file to check every import, and every keystroke in either
box of the import/export dialog. So the published schema and the rules the page enforces are one
file. The validator is hand-rolled and understands only the keywords in its `Schema` interface;
**any other keyword is silently ignored.** Changing the file's shape is the `state-file-sync`
skill.

**4. Every confirmation question has a key, and the key is its row in the list.**
`client/src/components/timer/suppressions.ts` holds the list (`HALF_QUESTIONS`, `FULL_ACTS`,
`FULL_RULES`) and `dialogKey()`, which maps a `ConfirmDialog` to its key; `shouldAsk()` weighs a
question against the mode (half, full or none). A row whose key no dialog asks is a checkbox that
silences nothing. `clearCache` (the site RESET) can never be silenced: it is the one action that
clears the list. The import/export dialog asks two questions inside itself rather than through
`ConfirmDialog` (`exportInvalid`, `discardTransfer`, the `TransferQuestion` type), reading them
through `asks(key)` and `onSilence(key)` from `Timer.tsx`. Adding a question is the
`confirmation-question` skill.

**5. Dialogs reset on the way in, not on the way out.** Radix keeps a closing dialog mounted
through its exit fade, and clearing its state on close swapped the view out from under the fade.
Both `ConfirmDialog` and `TransferDialog` hold what they showed until the next opening.

**6. One route, no router.** `App.tsx` renders `Home` for the base path (and `/index.html`) and
`NotFound` for anything else. GitHub Pages serves `dist/404.html`, the same bundle, for any path
it can't resolve, so the path is the whole of what there is to branch on.

**7. Sizes are clamps measured on screen, not breakpoints.** The layout suites (`clockgap`,
`fill`, `header`, `layout`, `rows`, `spill`, `tipfit` and others) sweep hundreds of viewport sizes
and assert on real measurements. After any change to a stylesheet, a size constant or a panel's
markup, run them.

**8. The leave guard is armed only mid-run** (`useLeaveGuard`). It returns an escape hatch the
app sets before a reload it asked for itself (an import, the RESET), because that reload has
already been confirmed once. An idle page carries no `beforeunload` listener.

## Decided by the owner (living; grows as the owner specifies it)

The app's behaviour is specified incrementally by the owner, decision by decision. This section
is the running record. It is **not** complete and is not meant to be. It starts on 1 Oct 2026;
behaviour from before then is described in `README.md` and the code's own comments.

**Import/export** (the arrows button, top right; `TransferDialog.tsx`, `stateFile.ts`):

- **A file name box under the export** (1 Oct 2026): *"for export, add a box to give the name of
  a file, else, add timestamp to the file"*. A typed name is used as typed, with the characters
  a file system refuses turned into dashes and `.json` added when it's missing. Left empty, the
  file is `write-timer-state-YYYY-MM-DD_HH-MM-SS.json` in local time (`exportFileName` in
  `format.ts`).
- **The name and `exportedAt` are one moment, and the name does not tick** (2 Oct 2026, reversing
  a ticking placeholder from 1 Oct): *"lets not make the hinter tick anymore as it wont match
  the expoted at anymore. just keep them the same and at the time you hit hte button."* The
  moment is the snapshot: when the dialog opened, or when the box was refreshed (a return to
  EXPORT while untouched, or REVERT). DOWNLOAD saves the box exactly as shown.
- **Both boxes are typeable and checked against the schema as typed** (1 Oct 2026): *"for export,
  can you make the payload actually typeable? for inport and export can you add built in schema?
  and it will say warning when violating json syntax, schema, or both, and it will gray out the
  import button. but for export, you can do it but it gives warning on syntax or violating
  schema with the details in the warning, which you can disable with a checkbox, that you can
  add on the list of disable checkbox"*. Import: a red warning, and IMPORT greyed out until the
  text passes. Export: a yellow warning; COPY or DOWNLOAD of text that fails asks first with the
  details, and that question (`exportInvalid`) is a row in the confirmations list.
- **Closing with unsaved changes asks first** (2 Oct 2026): *"if changes are made to export or
  imports, then ask for confirm when closing window, which can be checked off to turn off asking
  again, and at that into the list of checks"*. The question is `discardTransfer`. Closing
  throws away what was typed and not saved, and every opening starts from the page as it is.

**History** (3 Oct 2026):

- **Yellow for a run ended before red**: *"in history entries, notice how each entry is boxed in white of the time it ran? if it ends prematurly (before it got to ring in red) i want you to make the box yellow"*. Asked which endings and which parts of the box, the owner chose *"All early endings (Recommended)"* and *"Border and time text"*: STOP, RESET and switching to another timer mark the old entry yellow if the run never reached red. Pausing and reloading continue the same run. Once a run reaches red, extending its time cannot make it early-ended later. The colour and active-run tracking survive reload and import/export; older entries without outcome data stay white.

The agent's own choices around these, which the owner has not ruled on, are listed under
"Waiting on the owner" in `PUNCHLIST.md`.

## Known quirks

- **The Windows clipboard holds text with CRLF**, so `navigator.clipboard.readText()` gives back
  a copied `\n` as `\r\n` on Windows. A check that reads the clipboard must normalise it (journey
  does). The transfer suite goes further and stubs `navigator.clipboard.writeText` in the page,
  so it never touches the machine's real clipboard.
- **A suite's `ev()` can't return a DOM element.** CDP's `returnByValue` errors on a node, the
  response has no `result`, and the suite dies with *"Cannot read properties of undefined
  (reading 'result')"*. Evaluate to a value instead: `!!(element)`, `element.textContent`.
- **The deploy workflow's comment** above `pnpm test` still describes it as the counting and
  capping rules alone. The format checks run there too now.
