# Flash Timer

A minimal, no-bullshit countdown timer. Set a time, hit start, and it counts down. When it hits zero, it keeps going—beeping until you stop it. Built for people who actually use timers: writers, students, anyone who needs to focus for a set amount of time.

## Features

- **Precision countdown** with millisecond accuracy
- **Negative time support** – continues counting and beeping after zero
- **Integrated word counter** – track lines, words, and characters while you write
- **Presets & history** – save your most-used times and quickly reload them
- **Keyboard shortcuts** – spacebar controls everything
- **Silent mode** – toggle sound on/off
- **Fully responsive** – works on desktop, tablet, and mobile
- **State persistence** – everything saves automatically

## Quick Start

1. Set your time using the input fields or preset buttons
2. Press START or hit spacebar
3. Timer counts down. When it hits zero, it keeps going and beeps
4. Press PAUSE to silence the alarm, STOP to reset, or RESET to start over

Everything saves automatically. Close the tab, come back later, your settings are still there.

## Tech Stack

- React 19 with TypeScript
- Tailwind CSS 4
- shadcn/ui components
- Web Audio API for beeping
- LocalStorage for persistence

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm run dev

# Build for production
pnpm run build
```

## Deployment

Automatic deployment to GitHub Pages on push to `main` branch via GitHub Actions.

## License

MIT
