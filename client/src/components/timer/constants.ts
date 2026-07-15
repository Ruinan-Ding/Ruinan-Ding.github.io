import type { TimeParts, TimerEntry } from './types';

// localStorage keys — don't rename, older saves use them
export const STORAGE_KEYS = {
  timerState: 'timerAppState',
  history: 'timerAppHistory',
  wordCounter: 'wordCounterText',
  silentMode: 'timerSilentMode',
  presets: 'timerAppPresets',
  volume: 'timerVolume',
  hasMutedBefore: 'timerHasMutedBefore',
} as const;

// countdown floor: -99:59:59
export const MIN_TOTAL_SECONDS = -359999;

export const TICK_MS = 10;

// alarm pattern: ALARM_TOTAL_BURSTS bursts of ALARM_BURST_COUNT beeps each
// (short ALARM_BURST_GAP_TICKS gap between bursts), then a longer
// ALARM_GROUP_GAP_TICKS pause, then the whole group repeats
export const ALARM_TICK_MS = 250;
export const ALARM_BURST_COUNT = 3;
export const ALARM_BURST_GAP_TICKS = 3;
export const ALARM_TOTAL_BURSTS = 3;
export const ALARM_GROUP_GAP_TICKS = 10;

export const MAX_HOURS = 99;
export const MAX_MINUTES = 59;
export const MAX_SECONDS = 59;
export const MAX_PRESETS = 20;
export const MAX_HISTORY = 20;

// [frequency Hz, duration ms]
export const TONES = {
  start: [600, 150],
  resume: [600, 150],
  pause: [400, 150],
  stop: [800, 100],
  reset: [700, 100],
  silentToggle: [500, 100],
  alarm: [600, 150],
} as const;

export const DEFAULT_TIME: TimeParts = { hours: 0, minutes: 5, seconds: 0 };
export const DEFAULT_VOLUME = 0.5;

export const DEFAULT_PRESETS: TimerEntry[] = [
  { id: 'preset-1', hours: 0, minutes: 5, seconds: 0, timestamp: 0 },
  { id: 'preset-2', hours: 0, minutes: 30, seconds: 0, timestamp: 0 },
  { id: 'preset-3', hours: 1, minutes: 0, seconds: 0, timestamp: 0 },
];
