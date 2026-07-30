import { shrinkClamp } from './responsive';
import type { TimeParts, TimerEntry } from './types';

// Shared by every boxed square icon button (mute, alarm repeat, the
// sidebar/time-fields/word-counter hide toggles) so they all read as one
// family of controls — same box, same icon size, wherever they appear
export const HEADER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3.5), height: shrinkClamp(2, 5, 5, 3.5) };
export const HEADER_ICON_SIZE = { width: shrinkClamp(1.1, 3, 3, 1.375), height: shrinkClamp(1.1, 3, 3, 1.375) };

// One size for every square-with-a-dot checkbox (see DotCheckbox) and
// for the word counter's own toggle labels, which is where that box's
// proportions were set. It's the checkbox's own font size, not the
// label's it sits beside: sizing it in em off each label meant the
// CONFIRMATIONS one (a notch down from RESET's font, to save width in
// that corner) came out 6% smaller than the word counter's, and 6% of
// 11px is the entire gap between the dot and the border — so that one
// box rendered with the dot crowded against one side while the others
// looked centered.
export const TOGGLE_FONT_SIZE = shrinkClamp(0.65, 1.35, 1.5, 0.85);

// Shared by the preset and history list-row buttons, so they read as the
// same kind of control.
// Every box in this sidebar is one size — each preset, each history
// entry, and the HH:MM:SS input that adds a preset — rather than each
// hugging its own label. A column of boxes that all differ by a
// character or two of content reads as ragged, and the widest thing
// here can't shrink anyway (it's a fixed 8 characters), so the width
// they'd save by hugging is width nothing else can use.
// The label is the whole point of these buttons, so everything that
// isn't the label is kept as thin as possible and the text takes what's
// left: padding is em-based (a fixed fraction of the label, rather than
// its own rem/vw formula that stayed wide while the text shrank), and
// the size range below is raised again — the old (0.8, 2, 2.2, 1.375)
// range spent most ordinary window heights pinned at its own ceiling
// with the button still narrower than half the sidebar it sat in.
export const LIST_ROW_FONT_SIZE = shrinkClamp(0.9, 2.2, 2.8, 1.75);

// A boxed 8-character label ("99:59:59", the longest formatEntryLabel
// can produce) is LIST_ROW_LABEL_EM of its own font size: 8 glyphs at
// this monospace font's 0.6em advance, plus the box's 0.3em side
// padding. The +10px is its border-4 (8px) plus 2px of rounding slack —
// em widths land on fractions, and 8 characters in a box sized to
// exactly 8 characters is a perfect fit and therefore no fit at all.
export const LIST_ROW_LABEL_EM = 5.4;
export const LIST_ROW_BOX_WIDTH = `calc(${LIST_ROW_LABEL_EM}em + 10px)`;
export const LIST_ROW_BUTTON_STYLE = {
  fontFamily: "'IBM Plex Mono', monospace",
  padding: '0.12em 0.3em',
  fontSize: LIST_ROW_FONT_SIZE,
  width: LIST_ROW_BOX_WIDTH,
  boxSizing: 'border-box' as const,
  flexShrink: 0,
};

// Sidebar geometry. The width is computed rather than fit to content:
// w-fit meant the sidebar resized whenever the content did — every
// started timer appends a history row, and one "99:59:59" among the
// "1:05"s widened the whole column and shoved the timer beside it over.
// So reserve the row every row now is, once, up front, and never move
// again: [− button] gap [one LIST_ROW_BOX_WIDTH box].
//
// The − button is one glyph plus its own 0.35em side padding, so 1.3em
// of its (smaller) font size. The 18px is every pixel in that row an em
// width can't carry: LIST_ROW_BOX_WIDTH's own 10px (border-4 plus its
// rounding slack), the − button's border-2 (4px), and the sidebar's own
// border-r-4 (4px). Miss any of it and the rows are clipped by the
// sidebar's overflow-hidden.
export const SIDEBAR_PADDING = shrinkClamp(0.5, 1, 1.1, 1);
export const SIDEBAR_ROW_GAP = shrinkClamp(0.25, 0.45, 0.5, 0.5);
export const LIST_ROW_REMOVE_FONT_SIZE = shrinkClamp(0.7, 1.4, 1.6, 1.1);
export const SIDEBAR_WIDTH = `calc(${LIST_ROW_LABEL_EM} * ${LIST_ROW_FONT_SIZE} + 1.3 * ${LIST_ROW_REMOVE_FONT_SIZE} + ${SIDEBAR_ROW_GAP} + 2 * ${SIDEBAR_PADDING} + 18px)`;

// Shared by every − / + button beside those boxes. alignSelf stretch
// rather than a height of its own: the row's height is whatever the box
// beside it works out to at the current font size, and these have to
// match it exactly at every one of those sizes.
export const LIST_ROW_REMOVE_BUTTON_STYLE = {
  padding: '0 0.35em',
  fontSize: LIST_ROW_REMOVE_FONT_SIZE,
  alignSelf: 'stretch' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexShrink: 0,
};

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
  lightTheme: 'timerLightTheme',
  dontAskAgain: 'timerDontAskAgain',
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
