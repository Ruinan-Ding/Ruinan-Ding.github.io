import { shrinkClamp } from './responsive';
import type { TimeParts, TimerEntry } from './types';

// Shared by every boxed square icon button (mute, alarm repeat, the
// sidebar/time-fields/word-counter hide toggles) so they all read as one
// family of controls — same box, same icon size, wherever they appear
export const HEADER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3.5), height: shrinkClamp(2, 5, 5, 3.5) };
export const HEADER_ICON_SIZE = { width: shrinkClamp(1.1, 3, 3, 1.375), height: shrinkClamp(1.1, 3, 3, 1.375) };

// Shared by the preset and history list-row buttons, so they read as the
// same kind of control. These buttons no longer stretch to fill the
// sidebar's own width (see PresetRow/HistoryRow — they hug their own
// label now instead of flexing/stretching to match the widest row), so
// the sidebar itself sizes to whatever the labels actually need instead
// of an arbitrary stretch target.
// The label is the whole point of these buttons, so everything that
// isn't the label is kept as thin as possible and the text takes what's
// left: padding is em-based (a fixed fraction of the label, rather than
// its own rem/vw formula that stayed wide while the text shrank), and
// the size range below is raised again — the old (0.8, 2, 2.2, 1.375)
// range spent most ordinary window heights pinned at its own ceiling
// with the button still narrower than half the sidebar it sat in.
export const LIST_ROW_FONT_SIZE = shrinkClamp(0.9, 2.2, 2.8, 1.75);
export const LIST_ROW_BUTTON_STYLE = { fontFamily: "'IBM Plex Mono', monospace", padding: '0.12em 0.3em', fontSize: LIST_ROW_FONT_SIZE };

// Sidebar geometry. The width is computed rather than fit to content:
// w-fit meant the sidebar resized whenever the content did — every
// started timer appends a history row, and one "99:59:59" among the
// "1:05"s widened the whole column and shoved the timer beside it over.
// So reserve the widest row that can ever appear once, up front, and
// never move again. That row is [− button] gap [8-character label]:
// 8 characters is 4.8em of this monospace font, plus the button's own
// 0.3em side padding, is the 5.4em below (its 4px borders are in the
// 12px, along with the sidebar's own right border); the − button is one
// glyph plus its 0.35em side padding at its own smaller size.
export const SIDEBAR_PADDING = shrinkClamp(0.5, 1, 1.1, 1);
export const SIDEBAR_ROW_GAP = shrinkClamp(0.25, 0.45, 0.5, 0.5);
export const LIST_ROW_REMOVE_FONT_SIZE = shrinkClamp(0.7, 1.4, 1.6, 1.1);
export const SIDEBAR_WIDTH = `calc(5.4 * ${LIST_ROW_FONT_SIZE} + 1.3 * ${LIST_ROW_REMOVE_FONT_SIZE} + ${SIDEBAR_ROW_GAP} + 2 * ${SIDEBAR_PADDING} + 12px)`;

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
