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

// One size for the whole wall clock — time, date, and the zone and 12/24
// settings sitting under them. The widest of those lines is the settings
// row at ~19 of its own em, and it has the digits column (40vw) to fit
// in; the floor stops just above where a 0.9em checkbox would have no
// room left inside its own 2px border for a dot.
export const CLOCK_FONT_SIZE = shrinkClamp(0.6, 1.2, 1.3, 1.05);
// The same clock, smaller, for the word counter's fullscreen header —
// that row already carries the countdown, the bar and the control buttons
// between two reserved corners, and the clock has to fit in what's left.
// Everything in both pieces is em-based (the zone box's width cap
// included), so this one number scales all of it.
export const COMPACT_CLOCK_FONT_SIZE = shrinkClamp(0.5, 0.85, 0.95, 0.72);
// ...and in that row it's capped again by the room actually left over.
// The clock's widest line is its date, 17 monospace characters at 0.6em
// each, so it needs about 10.2 times its own font size; 9cqi of the box
// holding it keeps it inside that box with a little to spare. (Its
// settings row is the shorter of the two now that the zone box shows an
// abbreviation rather than a city name — see that select in Timer.) cqi is the
// point: it's a percentage of the leftover, so unlike every vw clamp in
// this app it has no rem floor to stop shrinking at — and the floor here
// is only the size below which a 0.9em checkbox has no room for its dot,
// far past where it stops being readable anyway.
export const FULLSCREEN_CLOCK_FONT_SIZE = `max(0.5rem, min(${COMPACT_CLOCK_FONT_SIZE}, 9cqi))`;

// Room the floating top-right header corner takes — theme toggle,
// CONFIRMATIONS and RESET. Anything centered in the same band has to stay
// out of it (the website link) or stop before it (the word counter's
// fullscreen row).
// Added up from the same clamps those three controls are built from
// rather than being its own vw guess: theme button, RESET's icon, the
// CONFIRMATIONS checkbox, and the two labels at 0.6em per character of
// their own fonts (13 for CONFIRMATIONS, 5 for RESET), plus the fixed
// px — borders, paddings, gaps and the corner's offset — that no em can
// carry. A single vw term can't do this job: every one of those controls
// bottoms out on its own rem floor as the window narrows, so a vw reserve
// keeps shrinking while the thing it reserves for doesn't, and whatever
// it was protecting ends up underneath.
export const HEADER_CONFIRM_FONT_SIZE = shrinkClamp(0.55, 1.2, 1.3, 0.8);
export const HEADER_RESET_FONT_SIZE = shrinkClamp(0.65, 1.5, 1.6, 1);
export const HEADER_CORNER_RESERVE = `calc(${HEADER_BUTTON_SIZE.width} + ${HEADER_ICON_SIZE.width} + 0.9 * ${TOGGLE_FONT_SIZE} + 7.8 * ${HEADER_CONFIRM_FONT_SIZE} + 3 * ${HEADER_RESET_FONT_SIZE} + 110px)`;

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
// border-r-4 (4px), and 16px for the scrollbar gutter both lists hold
// open (scrollbar-gutter: stable — see either panel). Miss any of it and
// the rows are clipped by the sidebar's overflow-hidden, or the bar ends
// up sitting on top of the labels rather than beside them.
export const SIDEBAR_PADDING = shrinkClamp(0.5, 1, 1.1, 1);
export const SIDEBAR_ROW_GAP = shrinkClamp(0.25, 0.45, 0.5, 0.5);
export const LIST_ROW_REMOVE_FONT_SIZE = shrinkClamp(0.7, 1.4, 1.6, 1.1);
export const SIDEBAR_WIDTH = `calc(${LIST_ROW_LABEL_EM} * ${LIST_ROW_FONT_SIZE} + 1.3 * ${LIST_ROW_REMOVE_FONT_SIZE} + ${SIDEBAR_ROW_GAP} + 2 * ${SIDEBAR_PADDING} + 34px)`;

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
  wordCounterFullscreen: 'wordCounterFullscreen',
  lightTheme: 'timerLightTheme',
  dontAskAgain: 'timerDontAskAgain',
  clockTimeZone: 'timerClockTimeZone',
  clock24Hour: 'timerClock24Hour',
} as const;

// The wall clock above the digits. Eastern by default (asked for as
// "EST", but the zone id rather than the abbreviation, so the clock
// follows the EST/EDT changeover on its own).
export const DEFAULT_TIME_ZONE = 'America/New_York';
// Every zone the browser itself knows, so there's no bundled list here to
// drift out of date. The typeof check is for an engine old enough not to
// have it (pre-2022): the select is then just the default, which is all
// such a browser can honestly offer, rather than a crash on load.
export const TIME_ZONES: readonly string[] =
  typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [DEFAULT_TIME_ZONE];

// The same list as the zone picker takes it: grouped by region, each entry
// labelled with only the part after that region ("America/New_York" under
// "America", labelled "New York"). Built once at module load; the list it
// comes from never changes.
//
// Deliberately no abbreviations in here. Working out what the browser
// calls each of these zones takes an Intl.DateTimeFormat per zone, and
// 418 of them measured 123ms — real money at startup for a list most
// sessions never open. The box only ever displays the selected zone
// anyway, and that one abbreviation comes free off the clock's own
// formatter (see the select).
export const ZONES_BY_REGION: [string, { zone: string; label: string }[]][] = (() => {
  const groups = new Map<string, { zone: string; label: string }[]>();
  for (const zone of TIME_ZONES) {
    const slash = zone.indexOf('/');
    // a handful of ids (UTC) have no region part at all
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
