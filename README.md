# Flash Timer

A minimal countdown timer. Set a time, hit start, and it counts down. When it hits zero it keeps going into negative time, beeping until you stop it. There's also a word counter scratchpad below the clock for timed writing sessions.

## Features

- Millisecond-precision countdown that keeps counting (and beeping) past zero
- Presets and run history, saved in localStorage
- Word counter with per-line and total line/word/character counts
- Spacebar to start/pause/resume
- Silent mode toggle
- Live favicon and tab title showing timer state

## Usage

Set a time with the input fields or a preset, then press START (or spacebar). PAUSE silences the alarm, STOP resets to the configured time, RESET restarts. Everything persists across page reloads.

Tip: for a stopwatch, mute the sound and set the time to 00:00:00.

## Development

```bash
pnpm install
pnpm run dev
pnpm run build
```

Built with React 19, TypeScript, Tailwind CSS 4, and the Web Audio API. Deploys to GitHub Pages via GitHub Actions on push to `main`.

## License

MIT
