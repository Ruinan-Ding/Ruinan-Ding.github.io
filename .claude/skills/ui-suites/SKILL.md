---
name: ui-suites
description: Run Write Timer's headless-Chrome browser suites (tests/*.test.mjs) and read their verdicts, including on the owner's WSL + Windows machine, where it takes a server in WSL and Node and Chrome on Windows. Use before saying a UI change works, after any layout or style change, before a push the owner wants tested, or when a suite fails in a way that looks like the environment rather than the app.
---

# Browser suites

`tests/run.mjs` runs every `tests/*.test.mjs` (27 on 2 Oct 2026), or the ones named:
`node tests/run.mjs transfer journey`. Each suite starts its own headless Chrome on its own
debugging port (9600 upwards), drives the app with real keys, clicks and layout measurements
over the DevTools protocol, and prints one verdict line: `N/M passed`, `all 22 viewports pass`
and the like. The runner fails a suite on a short count, a shortfall line, a non-zero exit, or
any line starting `FAIL`.

The runner reuses a server already on **port 5199**; with none there, it builds and serves one
itself. The owner's dev server is on **3000**: leave it alone.

The suites run **one at a time on purpose**. Half of what they assert is a measurement, and
several headless Chromes at once measure a slower page. Don't run two batches side by side. A
full run takes about 25 minutes, so run it in the background and wait for it to finish.

## Anywhere with Chrome and a working `node_modules`

```bash
pnpm run test:ui                    # all of them
pnpm run test:ui keys signed        # by name prefix
CHROME=/path/to/chrome pnpm run test:ui
```

## On the owner's machine (Claude Code in WSL, repo on the Windows drive)

Neither side can do it alone. `node_modules` was installed by pnpm in WSL, so it is Linux
symlinks that Windows Node can't follow, and WSL has no usable Chrome (Playwright's Chromium
there lacks `libnspr4` and `libnss3`, and installing them needs sudo). So build and serve in WSL,
and run the suites with Windows Node, which finds the server through WSL's localhost forwarding
and launches Windows Chrome from `tests/chrome.mjs`'s default path.

1. **Build in WSL**, from the repo root:
   `node node_modules/vite/bin/vite.js build --logLevel warn`
2. **Serve in WSL, in the background** (a background command, with a long timeout):
   `node node_modules/vite/bin/vite.js preview --port 5199 --strictPort --host 0.0.0.0`
3. **Wait until Windows itself can reach it.** The forwarding lags the server by a moment, and a
   runner that misses it tries to build with Windows Node and dies on the symlinks:
   `until cmd.exe /c "curl -s -o NUL -w %{http_code} http://localhost:5199/" 2>/dev/null | grep -q 200; do sleep 1; done`
4. **Run the suites with Windows Node:**
   `cmd.exe /c "cd /d C:\Users\DRuin\OneDrive\Documents\Ruinan-Ding.github.io && node tests\run.mjs transfer journey" 2>&1 | tr -d '\r'; echo "runner exit: ${PIPESTATUS[0]}"`
   The exit code after a pipe is `tr`'s, so read `PIPESTATUS`, or the verdict lines. The first
   line must be `using the server already on 5199`; `building` means step 3 was skipped.
5. **Stop the server** once the last run is done:
   `kill $(pgrep -f '[v]ite.js preview')`. The bracket keeps the pattern from matching the
   shell running the command; a bare `pkill -f 'vite.js preview'` kills that shell too (exit
   144). **Never force-kill every Windows `node.exe`**: that takes down the owner's own
   processes along with the runner.

To run one suite on its own and see every check, not just the verdict:
`cmd.exe /c "cd /d C:\...\Ruinan-Ding.github.io\tests && node transfer.test.mjs 9811"`, where
the number is a spare debugging port.

## Traps

- **Don't rebuild while a run is going.** `vite preview` serves `dist/` from disk, and a build
  empties it first, so a running suite starts getting 404s. Edit the source if you like; build
  when the run is done.
- **Rebuild before a run that has to prove a change.** The server serves the last build, not the
  source. The bundle's hashed file name in `dist/assets/` shows which build it is.
- **The Windows clipboard returns `\r\n`** for a copied `\n`. A check that reads the clipboard
  normalises it. Better still, stub `navigator.clipboard.writeText` in the page, as the transfer
  suite does, so a run doesn't overwrite the owner's clipboard.
- **`ev()` can't return a DOM node.** `returnByValue` makes CDP answer with an error and no
  `result`, and the suite dies on *"Cannot read properties of undefined (reading 'result')"*.
  Evaluate to a value: `!!(element)`, `element.textContent`, an attribute.
- **A click on a disabled button does nothing and reports nothing.** Assert on `.disabled`, not
  only on what didn't happen.
- **Don't fix widths in a check.** Text widths differ by OS fonts; ChessPlusPlus's CI went red
  for two days on a spec that assumed 1300px. Measure the width the layout actually takes.
- **Downloads.** The transfer suite has no download directory, so a check there that
  downloads would drop a file in the machine's own Downloads folder. Journey sets
  `Browser.setDownloadBehavior` to a temp folder; test real downloads there.

## Writing a check

Follow the suite you're in: `check(name, got, want)` compares as strings, `ok(name, cond,
detail)` for a condition, and every result prints as one `PASS`/`ok` or `FAIL` line before the
verdict. Give each check a name that says what the user would see. Put a new section last when it
leaves something behind that outlives the dialog or the page (a silenced question, a stored
key), so it can't change what earlier sections see.
