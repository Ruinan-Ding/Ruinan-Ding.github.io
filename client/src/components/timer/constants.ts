import { shrinkClamp } from './responsive';
import type { TimeParts, TimerEntry } from './types';

// Shared by every boxed square icon button (mute, alarm repeat, the
// sidebar/time-fields/word-counter hide toggles) so they all read as one
// family of controls — same box, same icon size, wherever they appear
export const HEADER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3.5), height: shrinkClamp(2, 5, 5, 3.5) };
export const HEADER_ICON_SIZE = { width: shrinkClamp(1.1, 3, 3, 1.375), height: shrinkClamp(1.1, 3, 3, 1.375) };

// Shared by the preset and history list-row buttons, so they read as the
// same kind of control. fontSize back to its original coefficients — the
// wider-elastic-range version (1vw/1.05vh) reached its own max so much
// later that the actual digits ("1:05" etc) read as tiny next to the
// sidebar's own now-wider box at ordinary window sizes, even though nothing
// was actually broken. Padding keeps the wider range; that one was never
// the complaint.
export const LIST_ROW_BUTTON_STYLE = { fontFamily: "'IBM Plex Mono', monospace", padding: shrinkClamp(0.375, 0.65, 0.72, 0.5), fontSize: shrinkClamp(0.75, 1.5, 1.6, 0.875) };

// localStorage keys — don't rename, older saves use them
export const STORAGE_KEYS = {
  timerState: 'timerAppState',
  history: 'timerAppHistory',
  wordCounter: 'wordCounterText',
  wordCounterAlnumWordsOnly: 'wordCounterAlnumWordsOnly',
  wordCounterAlnumCharsOnly: 'wordCounterAlnumCharsOnly',
  silentMode: 'timerSilentMode',
  presets: 'timerAppPresets',
  volume: 'timerVolume',
  hasMutedBefore: 'timerHasMutedBefore',
  alarmLoop: 'timerAlarmLoop',
  skipConfirmations: 'timerSkipConfirmations',
  websiteLinkHidden: 'timerWebsiteLinkHidden',
  sidebarHidden: 'timerSidebarHidden',
  timeFieldsHidden: 'timerTimeFieldsHidden',
  wordCounterCollapsed: 'wordCounterCollapsed',
} as const;

// countdown floor: -99:59:59
export const MIN_TOTAL_SECONDS = -359999;

export const TICK_MS = 10;

// looping alarm pattern: ALARM_TOTAL_BURSTS bursts of ALARM_BURST_COUNT
// beeps each (short ALARM_BURST_GAP_TICKS gap between bursts), then a
// longer ALARM_GROUP_GAP_TICKS pause, then the whole group repeats. With
// looping off, the alarm ignores all of this and just rings one single
// ALARM_BURST_COUNT-beep burst before going quiet.
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

export const DEFAULT_TIME: TimeParts = { hours: 0, minutes: 1, seconds: 5 };
export const DEFAULT_VOLUME = 0.5;

export const DEFAULT_PRESETS: TimerEntry[] = [
  { id: 'preset-1', hours: 0, minutes: 1, seconds: 5, timestamp: 0 },
  { id: 'preset-2', hours: 0, minutes: 30, seconds: 35, timestamp: 0 },
  { id: 'preset-3', hours: 0, minutes: 5, seconds: 35, timestamp: 0 },
];
