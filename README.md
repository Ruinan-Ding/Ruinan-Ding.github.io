# Write Timer

A minimal countdown timer. Set a time, hit start, and it counts down. When it hits zero it keeps going into negative time, beeping until you stop it. There's also a word counter scratchpad below the clock for timed writing sessions.

## Features

- Millisecond-precision countdown that keeps counting (and beeping) past zero
- Presets and run history, saved in localStorage; click either to load that time and run it
- A preset that's already in the list isn't added twice — the existing row flashes instead
- Word counter with per-line and total line/word/character counts, optional alphanumeric-only filters, copy/clear, and a full-screen mode that keeps the timer controls in reach
- Wall clock above the digits: any time zone the browser knows, and click the time to switch 12/24-hour
- Drain bar under the digits: hover to preview a point, click to seek there
- Spacebar to start/pause/resume, R to reset, S to stop
- Mute toggle with a volume slider, plus an alarm repeat toggle (ring forever or ring once)
- Light and dark themes
- Confirmations before anything destructive, each with its own "don't ask this again", plus one switch to turn the lot off
- Live favicon and tab title showing timer state

## Usage

Set a time with the input fields or a preset, then press START (or spacebar). PAUSE silences the alarm, STOP resets to the configured time, RESET restarts. Everything persists across page reloads; the bin button in the top-right restores the site to defaults.

Tip: for a stopwatch, turn off the alarm repeat toggle and set the time to 00:00:00 — it rings once, then keeps counting silently.

## Development

```bash
pnpm install
pnpm run dev
pnpm run check   # tsc
pnpm test        # counting and capping self-check
pnpm run build
```

Built with React 19, TypeScript, Tailwind CSS 4, and the Web Audio API. Deploys to GitHub Pages via GitHub Actions on push to `main`.

## License

MIT
