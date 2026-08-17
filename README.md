# Write Timer

A minimal countdown timer. Set a time, hit start, and it counts down. When it hits zero it keeps going into negative time, beeping until you stop it. There's also a word counter scratchpad below the clock for timed writing sessions.

## Features

- Millisecond-precision countdown that keeps counting (and beeping) past zero
- Presets and run history, saved in localStorage; click either to load that time and run it. Both can hold a negative time, so a count-up is something you can save and come back to
- A preset that's already in the list isn't added twice — the existing row flashes instead
- Word counter with per-line and total line/word/character counts, optional alphanumeric-only filters, copy/clear, and a full-screen mode that keeps the timer controls in reach
- Wall clock above the digits: any time zone the browser knows, and click the time to switch 12/24-hour
- Drain bar under the digits: hover to preview a point, click to seek there
- Enter to start/pause/resume, R to reset, S to stop; Esc leaves the word counter or the field you're typing in
- Arrow keys move the whole time by one of that box's units, the same as the chevrons beside it; the preset box takes them too
- Mute toggle with a volume slider, plus an alarm repeat toggle (ring forever or ring once)
- Light and dark themes
- Confirmations before anything destructive, each with its own "don't ask this again", plus one switch to turn the lot off. Loading a preset or setting the time asks only while a run is on the clock to lose; stopping an alarm that's already going off never does
- Live favicon and tab title showing timer state

## Usage

Set a time with the input fields or a preset, then press START (or Enter). Once it's running those fields become the time left, ticking down — editing one moves the run without changing the total, so STOP still returns to what you configured. The three boxes are one signed time: 61 in the seconds carries to 1:01, stepping 59 up carries too, stepping 00:00:00 down goes to -00:00:01, and "-" flips the sign onto the largest unit that has a number. Past zero, stepping back up is the way out of overtime. The chevrons and the arrow keys both move the whole time rather than the one box, so at -1:30 stepping the seconds up reaches -1:29. Typing is the other way round: it sets that unit's own value and carries on commit. The preset box works the same way, "-" and arrows included. PAUSE silences the alarm, STOP resets to the configured time, RESET restarts. Confirmation dialogs take Enter for yes and Esc for no. Everything persists across page reloads; the bin button in the top-right restores the site to defaults.

Tip: for a stopwatch, turn off the alarm repeat toggle and set the time to 00:00:00 — it rings once, then keeps counting silently.

## Development

```bash
pnpm install
pnpm run dev
pnpm run check   # tsc
pnpm test        # counting and capping self-check
pnpm run test:ui # the browser suites in tests/ — needs Chrome
pnpm run build
```

`pnpm run test:ui` drives a real headless Chrome through the DevTools
protocol: keyboard shortcuts, confirmation dialogs, signed-time entry,
preset and history rows, and a layout sweep over 22 viewports. It uses a
dev server if one is already on port 5199 and otherwise builds and serves
one itself. Pass suite names to run a few (`pnpm run test:ui keys signed`),
and set `CHROME` if the browser isn't where `tests/chrome.mjs` looks.

Built with React 19, TypeScript, Tailwind CSS 4, and the Web Audio API. Deploys to GitHub Pages via GitHub Actions on push to `main`.

## License

MIT
