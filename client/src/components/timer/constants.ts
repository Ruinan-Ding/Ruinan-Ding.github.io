import { shrinkClamp } from './responsive';
import type { TimeParts, TimerEntry } from './types';

// Shared by every boxed square icon button: mute, alarm repeat, and the
// sidebar/time-fields/word-counter hide toggles.
export const HEADER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3.5), height: shrinkClamp(2, 5, 5, 3.5) };
export const HEADER_ICON_SIZE = { width: shrinkClamp(1.1, 3, 3, 1.375), height: shrinkClamp(1.1, 3, 3, 1.375) };

// One size for every DotCheckbox, set on the checkbox rather than in em
// off whatever label it sits beside. Sized in em, the confirmations box
// came out 6% smaller than the word counter's, and 6% of 11px is the
// whole gap between the dot and its border.
export const TOGGLE_FONT_SIZE = shrinkClamp(0.65, 1.35, 1.5, 0.85);

// One size for the whole wall clock. Its widest line has to fit the
// digits column (40vw); the floor stops just above where a 0.9em checkbox
// has no room inside its own border for a dot.
export const CLOCK_FONT_SIZE = shrinkClamp(0.55, 1.5, 1.6, 1.35);
// The same clock for the word counter's fullscreen header, where it gets
// whatever the countdown, bar and buttons leave. Then capped again by
// that leftover: the date is 17 monospace characters at 0.6em, so it
// needs ~10.2x its font size, and 9cqi of the box keeps it inside with a
// little spare. cqi is the point, being a percentage of the leftover
// rather than a vw clamp with a rem floor to bottom out on.
const COMPACT_CLOCK_FONT_SIZE = shrinkClamp(0.5, 0.85, 0.95, 0.72);
export const FULLSCREEN_CLOCK_FONT_SIZE = `max(0.5rem, min(${COMPACT_CLOCK_FONT_SIZE}, 9cqi))`;

// Room the floating top-right corner takes: three square buttons, their
// gaps, and the offset it sits at. Built from the button's own clamp
// rather than a vw guess, since that clamp bottoms out on a rem floor and
// a vw reserve wouldn't. The word counter's fullscreen row measures the
// corner directly; this is what the website link sizes against.
export const HEADER_CORNER_RESERVE = `calc(3 * ${HEADER_BUTTON_SIZE.width} + 48px)`;

// One width for every box in the sidebar: each preset, each history entry,
// and the HH:MM:SS input. Boxes that differ by a character or two read as
// ragged, and the widest is a fixed 8 characters that can't shrink anyway.
// Padding is em-based so it keeps pace as the label shrinks.
// Written out rather than through shrinkClamp because the floor is a CSS
// variable: touch devices lift it to 16px, where iOS stops zooming in on a
// focused field. See --list-row-floor in index.css.
export const LIST_ROW_FONT_SIZE = 'clamp(var(--list-row-floor), min(2.2vw, 2.8dvh), 1.75rem)';

// "99:59:59" is 8 glyphs at this font's 0.6em advance plus 0.3em of side
// padding. The +10px is border-4 (8px) plus 2px of slack, since em widths
// land on fractions and an exact fit is no fit at all.
// Off LIST_ROW_FONT_SIZE rather than the element's own em, which is the
// same number until something overrides one box's font-size and that box
// silently becomes a different width from the rest of the column. The
// sidebar reserves this width once, from this same expression.
const LIST_ROW_LABEL_EM = 5.4;
export const LIST_ROW_BOX_WIDTH = `calc(${LIST_ROW_LABEL_EM} * ${LIST_ROW_FONT_SIZE} + 10px)`;
export const LIST_ROW_BUTTON_STYLE = {
  fontFamily: "'IBM Plex Mono', monospace",
  padding: '0.12em 0.3em',
  fontSize: LIST_ROW_FONT_SIZE,
  width: LIST_ROW_BOX_WIDTH,
  boxSizing: 'border-box' as const,
  flexShrink: 0,
};

// Sidebar width, computed rather than fit to content: w-fit resized the
// column every time a history row was appended, shoving the timer beside
// it. This reserves what a row always is, once: [− button] gap [box].
//
// The − button is one glyph plus 0.35em of side padding, so 1.3em of its
// own smaller font. The 34px is every pixel an em width can't carry:
// LIST_ROW_BOX_WIDTH's 10px, the − button's border-2 (4px), the sidebar's
// border-r-4 (4px), and 16px of scrollbar gutter. The gutter is reserved
// once because presets and history share the sidebar's one scrollbar.
export const SIDEBAR_PADDING = shrinkClamp(0.5, 1, 1.1, 1);
const SIDEBAR_ROW_GAP = shrinkClamp(0.25, 0.45, 0.5, 0.5);
export const LIST_ROW_REMOVE_FONT_SIZE = shrinkClamp(0.7, 1.4, 1.6, 1.1);
export const SIDEBAR_WIDTH = `calc(${LIST_ROW_LABEL_EM} * ${LIST_ROW_FONT_SIZE} + 1.3 * ${LIST_ROW_REMOVE_FONT_SIZE} + ${SIDEBAR_ROW_GAP} + 2 * ${SIDEBAR_PADDING} + 34px)`;

// Shared by every − / + button beside those boxes. alignSelf: stretch
// rather than a height of its own, so it matches whatever the box beside
// it works out to at the current font size.
export const LIST_ROW_REMOVE_BUTTON_STYLE = {
  padding: '0 0.35em',
  fontSize: LIST_ROW_REMOVE_FONT_SIZE,
  alignSelf: 'stretch' as const,
  display: 'flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  flexShrink: 0,
};

// Controls that own a keystroke because they're being typed into. Shared,
// because both keyboard owners in the app have to agree on the same list:
// the window's timer shortcuts skip these, and the word counter's
// fullscreen refocus has to leave the same ones alone.
export const TYPES_INTO = 'input, textarea, select, [contenteditable]';

// localStorage keys. Don't rename, older saves use them. lightTheme is
// also spelled out literally in client/index.html, which reads it before
// React mounts to avoid a flash of the wrong theme, so renaming that one
// means editing both.
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
  wordCounterCollapsedAt: 'wordCounterCollapsedAt',
  wordCounterFullscreen: 'wordCounterFullscreen',
  lightTheme: 'timerLightTheme',
  dontAskAgain: 'timerDontAskAgain',
  clockTimeZone: 'timerClockTimeZone',
  clock24Hour: 'timerClock24Hour',
} as const;

// The zone id rather than the abbreviation, so the clock follows the
// EST/EDT changeover on its own.
export const DEFAULT_TIME_ZONE = 'America/New_York';
// Every zone the browser knows, so there's no bundled list to go stale.
// The typeof check covers engines older than 2022, which get the default
// alone rather than a crash on load.
export const TIME_ZONES: readonly string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIME_ZONE];

// The same list grouped for the picker: "America/New_York" under
// "America", labelled "New York". Built once at module load.
//
// No abbreviations in here on purpose. Resolving them takes an
// Intl.DateTimeFormat per zone, and 418 of those measured 123ms at
// startup for a list most sessions never open. The picker fills them in
// later (see Timer), and the closed box gets its one abbreviation free
// off the clock's own formatter.
export const ZONES_BY_REGION: [string, { zone: string; label: string }[]][] = (() => {
  const groups = new Map<string, { zone: string; label: string }[]>();
  for (const zone of TIME_ZONES) {
    const slash = zone.indexOf('/');
    // A handful of ids (UTC) have no region part.
    const region = slash === -1 ? 'Other' : zone.slice(0, slash);
    const label = (slash === -1 ? zone : zone.slice(slash + 1)).replace(/_/g, ' ');
    const group = groups.get(region);
    if (group) group.push({ zone, label });
    else groups.set(region, [{ zone, label }]);
  }
  return Array.from(groups);
})();

// countdown floor: -99:59:59
export const MIN_TOTAL_SECONDS = -359999;

export const TICK_MS = 10;

// Looping alarm: ALARM_TOTAL_BURSTS bursts of ALARM_BURST_COUNT beeps,
// separated by ALARM_BURST_GAP_TICKS, then an ALARM_GROUP_GAP_TICKS pause
// before the group repeats. With looping off it rings one group and stops.
export const ALARM_TICK_MS = 250;
export const ALARM_BURST_COUNT = 3;
export const ALARM_BURST_GAP_TICKS = 3;
export const ALARM_TOTAL_BURSTS = 3;
export const ALARM_GROUP_GAP_TICKS = 10;

export const MAX_HOURS = 99;
export const MAX_MINUTES = 59;
export const MAX_SECONDS = 59;
// Both lists share the sidebar's one scrollbar, so a long list costs
// scrollable height rather than squeezing the other one.
export const MAX_PRESETS = 100;
export const MAX_HISTORY = 1000;
// Where each list's x/max counter starts warning. Yellow from here up to
// one below the ceiling, red at it: for presets that's the point nothing
// more goes in, for history the point each new row costs the oldest one
// its place.
export const PRESETS_WARN = 95;
export const HISTORY_WARN = 950;

// The same yellow-then-red pair the counters and the alarm use elsewhere.
// undefined leaves the counter its inherited colour.
export const countColor = (count: number, warn: number, max: number) =>
  count >= max ? '#ef4444' : count >= warn ? '#eab308' : undefined;

// One size for both sidebar headings. They were on different vw/vh
// coefficients, so HISTORY rendered smaller than PRESETS at most sizes.
export const SIDEBAR_HEADING_FONT_SIZE = shrinkClamp(0.875, 2, 2.2, 1.25);
// The x/max counter beside them, a step down so it reads as an annotation.
// Two steps down at the narrow end: "1000/1000" beside HISTORY and Clear is
// what runs the heading row out of width first, and an annotation is the
// right thing to give way.
export const SIDEBAR_COUNT_FONT_SIZE = shrinkClamp(0.5, 0.95, 1.05, 0.65);

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
