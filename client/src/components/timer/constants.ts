import type { TimeParts, TimerEntry } from './types';

/** localStorage keys — shared with previous releases; do not rename. */
export const STORAGE_KEYS = {
  timerState: 'timerAppState',
  history: 'timerAppHistory',
  wordCounter: 'wordCounterText',
  silentMode: 'timerSilentMode',
  presets: 'timerAppPresets',
} as const;

/** Countdown floor: -99:59:59 expressed in seconds. */
export const MIN_TOTAL_SECONDS = -359999;

/** Countdown tick resolution in milliseconds. */
export const TICK_MS = 10;

/** The alarm repeats every 500ms: a 200ms beep followed by 300ms of silence. */
export const ALARM_REPEAT_MS = 500;

export const MAX_HOURS = 99;
export const MAX_MINUTES = 59;
export const MAX_SECONDS = 59;
export const MAX_PRESETS = 20;
export const MAX_HISTORY = 20;

/** Beep tones per action: [frequency Hz, duration ms]. */
export const TONES = {
  start: [600, 150],
  resume: [600, 150],
  pause: [400, 150],
  stop: [800, 100],
  reset: [700, 100],
  silentToggle: [500, 100],
  alarm: [600, 200],
} as const;

/** Configured time shown on first visit. */
export const DEFAULT_TIME: TimeParts = { hours: 0, minutes: 1, seconds: 5 };

export const DEFAULT_PRESETS: TimerEntry[] = [
  { id: 'preset-1', hours: 0, minutes: 1, seconds: 5, timestamp: 0 },
  { id: 'preset-2', hours: 0, minutes: 5, seconds: 35, timestamp: 0 },
  { id: 'preset-3', hours: 0, minutes: 30, seconds: 35, timestamp: 0 },
];
