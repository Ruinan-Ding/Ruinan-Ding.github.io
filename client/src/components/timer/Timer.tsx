import { Bell, ChevronsLeft, ChevronsRight, ExternalLink, Moon, Repeat, Sun, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readJSON, wipeStorage, writeJSON } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import ClockCluster from './ClockCluster';
import ConfirmDialog from './ConfirmDialog';
import DotCheckbox from './DotCheckbox';
import HeaderToggleButton from './HeaderToggleButton';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_GROUP_GAP_TICKS, ALARM_TICK_MS, ALARM_TOTAL_BURSTS, CLOCK_FONT_SIZE, DEFAULT_PRESETS, DEFAULT_TIME, DEFAULT_TIME_ZONE, DEFAULT_VOLUME, FULLSCREEN_CLOCK_FONT_SIZE, HEADER_BUTTON_SIZE, HEADER_CORNER_RESERVE, HEADER_ICON_SIZE, MAX_HISTORY, MAX_HOURS, MAX_PRESETS, MIN_TOTAL_SECONDS, SIDEBAR_PADDING, SIDEBAR_WIDTH, STORAGE_KEYS, TICK_MS, TIME_ZONES, TONES, TYPES_INTO } from './constants';
import { formatDateParts, formatEntryLabel, formatTime, fromTotalSeconds, offsetLabel, parsePresetDigits, presetDigitsFromParts, rawPresetDigits, signedParts, toSignedTotal, toTotalSeconds } from './format';
import { boxClamp, fitClamp, shrinkClamp } from './responsive';
import { isAcknowledgement, isDialogSuppressed, suppressDialog } from './suppressions';
import type { DialogState, FlashTarget, TimeParts, TimerEntry, TimerStateKind, TimeUnit } from './types';
import { FLASH_DURATION_MS, useFlashOnToken } from './useFlashOnToken';

// Bigger than a normal header icon, filling most of the button, since the
// bell is that button's whole identity.
const RINGER_BELL_SIZE = { width: shrinkClamp(1.8, 4.2, 4.2, 2.9), height: shrinkClamp(1.8, 4.2, 4.2, 2.9) };

// Drops the HOURS/MINUTES/SECONDS panel clear of the buttons in the same
// corner. Both start at the content column's padding edge, so the gap is
// one header button tall. Derived from that button rather than a fixed
// margin, which wouldn't shrink with it and cost a third of the panel's
// footprint on a short window.
const TIME_FIELDS_TOP_MARGIN = { marginTop: `calc(${HEADER_BUTTON_SIZE.height} + 0.5rem)` };

// Sound waves grow in as the volume rises. Two ways to be silent, and they
// don't draw the same, because they aren't the same thing and the fix for
// one isn't the fix for the other: muted is a switch, and clicking the
// button undoes it; 0% is a level, and only the slider moves it. Muted
// gets a red slash straight through the whole icon — a "no" sign, readable
// at a glance and at the smallest size this shrinks to. A silent slider
// keeps the small grey X beside the speaker: same speaker, no waves left.
function SpeakerIcon({ volume, muted, color }: { volume: number; muted: boolean; color: string }) {
  const wave = (threshold: number) => Math.max(0, Math.min(1, (volume - threshold) / 0.25));
  const silentSlider = !muted && volume === 0;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: shrinkClamp(1.1, 3, 3, 2), height: shrinkClamp(1.1, 3, 3, 2) }}
    >
      <polygon points="9 5 4 9 1 9 1 15 4 15 9 19 9 5" fill={color} />
      {!muted && (
        <>
          <path d="M12.5 9.5a3.5 3.5 0 0 1 0 5" opacity={wave(0)} />
          <path d="M15 7a7 7 0 0 1 0 10" opacity={wave(0.33)} />
          <path d="M17.5 4.5a10.5 10.5 0 0 1 0 15" opacity={wave(0.66)} />
        </>
      )}
      {silentSlider && (
        <>
          <line x1="14" y1="9" x2="20" y2="15" />
          <line x1="20" y1="9" x2="14" y2="15" />
        </>
      )}
      {/* Drawn last and in its own red, so it reads over the speaker
          rather than beside it, and stays the one red thing in the corner
          whatever colour the button itself is wearing. */}
      {muted && <line x1="3" y1="3" x2="21" y2="21" stroke="#ef4444" strokeWidth={2.5} />}
    </svg>
  );
}

const bumpFlash = (prev: FlashTarget, id: string): FlashTarget => ({ id, token: (prev?.token ?? 0) + 1 });

// The widest time the three boxes can say, either side of zero. Stepping or
// typing past it stops there rather than wrapping: 99:59:59 is the end of
// the range, not a point on a circle.
const MAX_TOTAL_SECONDS = MAX_HOURS * 3600 + 59 * 60 + 59;
const clampTotal = (total: number) => Math.max(-MAX_TOTAL_SECONDS, Math.min(MAX_TOTAL_SECONDS, Math.round(total)));

// Guards both saved lists against corrupt storage. Arithmetic on a bad
// number never throws, so a non-numeric field would slip through as NaN:
// presets fall back to DEFAULT_PRESETS, history drops the row. Without
// this a bad entry renders as "abc:NaN" and, once clicked, sets the
// countdown to NaN, which it never leaves since every comparison the tick
// makes against NaN is false.
// Repaired rather than rejected, because the time is the part worth
// keeping and an older save can be missing the rest. A row with no id
// keys the same as every other row without one, so React reuses the wrong
// node for a flash and one delete takes all of them at once; a timestamp
// that isn't a number throws inside Intl on its way to the screen.
// 8.64e15 is the far end of what a Date can hold. Finite wasn't enough:
// 1e16 is a finite number and still throws inside Intl, which is the
// crash this line exists to stop.
const MAX_TIMESTAMP = 8.64e15;
const normalizeEntry = (p: TimerEntry): TimerEntry => ({
  ...p,
  id: typeof p.id === 'string' && p.id !== '' ? p.id : uniqueId(),
  timestamp: typeof p.timestamp === 'number' && Math.abs(p.timestamp) <= MAX_TIMESTAMP ? p.timestamp : 0,
});

// Which controls own a keystroke, by kind of key. See the window listener.
// TYPES_INTO lives in constants because the word counter needs the same
// list; ENTER additionally belongs to anything it would press.
const ENTER_ACTIVATES = `${TYPES_INTO}, button, a, [role="button"]`;

const isValidEntry = (p: unknown): p is TimerEntry => {
  if (typeof p !== 'object' || p === null) return false;
  const entry = p as Partial<TimerEntry>;
  return (
    typeof entry.minutes === 'number' && Number.isFinite(entry.minutes) &&
    typeof entry.seconds === 'number' && Number.isFinite(entry.seconds) &&
    (entry.hours === undefined || (typeof entry.hours === 'number' && Number.isFinite(entry.hours)))
  );
};

export default function Timer() {
  // Parsed once before first render, so the persist effect can't save
  // defaults over it. A timer that was running comes back paused rather
  // than resuming blind: the wall-clock time while the page was gone is
  // unknown, and it shouldn't count.
  const initial = useMemo(() => {
    const savedState = readJSON<unknown>(STORAGE_KEYS.timerState, null);
    const savedHistory = readJSON<unknown>(STORAGE_KEYS.history, null);
    return {
      saved: (savedState && typeof savedState === 'object' ? savedState : {}) as Record<string, unknown>,
      // Filtered, not cast: one bad row at a time rather than
      // all-or-nothing, since history has no defaults to fall back to.
      history: Array.isArray(savedHistory) ? savedHistory.filter(isValidEntry).map(normalizeEntry) : [],
    };
  }, []);
  // isFinite, not typeof: JSON.parse turns an overflowing literal into
  // Infinity, which is a number and which every guard downstream compares
  // false against, so the countdown would sit on it and never move.
  const savedNumber = (key: string, fallback: number) =>
    Number.isFinite(initial.saved[key]) ? (initial.saved[key] as number) : fallback;
  const wasActive = initial.saved.isRunning === true;

  // Remaining time: signed whole seconds plus milliseconds in [0, 1000)
  const [time, setTime] = useState(() => ({
    seconds: savedNumber('seconds', toTotalSeconds(DEFAULT_TIME)),
    milliseconds: savedNumber('milliseconds', 0),
  }));
  const { seconds, milliseconds } = time;
  // mirror for callbacks that need the current time without re-memoizing
  // on every countdown tick
  const timeRef = useRef(time);
  timeRef.current = time;

  const [hours, setHours] = useState(() => savedNumber('hours', DEFAULT_TIME.hours));
  const [minutes, setMinutes] = useState(() => savedNumber('minutes', DEFAULT_TIME.minutes));
  const [timerSeconds, setTimerSeconds] = useState(() => savedNumber('timerSeconds', DEFAULT_TIME.seconds));

  const [isRunning, setIsRunning] = useState(wasActive);
  const [isPaused, setIsPaused] = useState(wasActive);
  // The configured time's sign. Kept beside the three magnitudes rather
  // than folded into them, so every existing save still reads back and a
  // negative setup is one extra boolean rather than a new number format.
  const [isConfiguredNegative, setIsConfiguredNegative] = useState(() => readBoolean(STORAGE_KEYS.configuredNegative, false));
  const [isSilentMode, setIsSilentMode] = useState(() => readBoolean(STORAGE_KEYS.silentMode, false));
  const [volume, setVolume] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.volume, null);
    return typeof saved === 'number' && Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : DEFAULT_VOLUME;
  });
  // Gates the one-time "are you sure?" the first time this browser mutes.
  const [hasMutedBefore, setHasMutedBefore] = useState(() => readBoolean(STORAGE_KEYS.hasMutedBefore, false));
  // On, the alarm repeats until stopped; off, it rings one burst and goes
  // quiet. Off by default, which is also what makes 00:00:00 usable as a
  // count-up stopwatch.
  const [isAlarmLooping, setIsAlarmLooping] = useState(() => readBoolean(STORAGE_KEYS.alarmLoop, false));
  // Skips every confirmation except the site RESET, which always asks.
  const [skipConfirmations, setSkipConfirmations] = useState(() => readBoolean(STORAGE_KEYS.skipConfirmations, false));

  // Targets for the list rows' one-shot flashes: yellow for a fresh
  // insert, green for a load, red for a refused duplicate. Never restored
  // from storage, so a reload doesn't replay them.
  const [insertedPreset, setInsertedPreset] = useState<FlashTarget>(null);
  const [duplicatePreset, setDuplicatePreset] = useState<FlashTarget>(null);
  const [insertedHistory, setInsertedHistory] = useState<FlashTarget>(null);
  const [loadedEntry, setLoadedEntry] = useState<FlashTarget>(null);
  // Bumped with the direction of the change when a field's adjustment
  // applies, so each digit on the countdown flashes green or red on its
  // own.
  const [hoursFlash, setHoursFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [minutesFlash, setMinutesFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [secondsFlash, setSecondsFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });

  const [history, setHistory] = useState<TimerEntry[]>(initial.history);
  const [presets, setPresets] = useState<TimerEntry[]>(() => {
    const parsed = readJSON<unknown>(STORAGE_KEYS.presets, null);
    if (!Array.isArray(parsed) || !parsed.every(isValidEntry)) return DEFAULT_PRESETS;
    // older saves packed hours into minutes. Capped on the way out, or a
    // save holding 6000 minutes migrates to 100 hours — past the range
    // every other path in the app holds itself to, and into a countdown
    // the fields can't show.
    return parsed.map((p) => ({
      ...normalizeEntry(p),
      hours: Math.min((p.hours ?? 0) + Math.floor(p.minutes / 60), MAX_HOURS),
      minutes: p.minutes % 60,
    }));
  });

  const [dialog, setDialog] = useState<DialogState>({ type: null });
  const [isWordCounterFocused, setIsWordCounterFocused] = useState(false);
  const [isWordCounterFullscreen, setIsWordCounterFullscreen] = useState(false);
  // Manual hide toggles, all persisted, so a tucked-in panel stays tucked
  // in across a reload. Only the site RESET brings them back.
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => readBoolean(STORAGE_KEYS.sidebarHidden, false));
  const [isTimeFieldsHidden, setIsTimeFieldsHidden] = useState(() => readBoolean(STORAGE_KEYS.timeFieldsHidden, false));
  // True only when the auto-tuck below forced it. Its "Show" arrow hides
  // itself while this is set, since clicking would bounce straight back on
  // the next check().
  const [isTimeFieldsAutoTucked, setIsTimeFieldsAutoTucked] = useState(false);
  const [isWebsiteLinkHidden, setIsWebsiteLinkHidden] = useState(() => readBoolean(STORAGE_KEYS.websiteLinkHidden, false));
  // The whole theme switch is one attribute on <html>: index.css swaps
  // --app-surface and --app-ink off it and every colour resolves through
  // that pair. In a layout effect so the attribute and the paint it
  // causes land together.
  const [isLightTheme, setIsLightTheme] = useState(() => readBoolean(STORAGE_KEYS.lightTheme, false));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = isLightTheme ? 'light' : 'dark';
  }, [isLightTheme]);
  // A saved zone is checked against the list the browser knows before it's
  // trusted. Intl throws on an unknown zone, and it throws on every format
  // call, so a hand-edited value would take the page down rather than just
  // show the wrong time.
  const [timeZone, setTimeZone] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.clockTimeZone, null);
    return typeof saved === 'string' && TIME_ZONES.includes(saved) ? saved : DEFAULT_TIME_ZONE;
  });
  const [is24Hour, setIs24Hour] = useState(() => readBoolean(STORAGE_KEYS.clock24Hour, false));
  // Held here rather than in ClockCluster because both copies of the clock
  // have to agree, and it persists. The tick itself lives down there.
  //
  // Clicking the time is the 12/24 switch. What makes that discoverable
  // rather than a hidden gesture is that the click answers: "24H" or "12H"
  // sits over the time and fades off it (hourFormatFizz in index.css).
  // Held for the animation's own 1.2s, and set straight from the click
  // rather than via useFlashOnToken, which turns on a tick later and would
  // show a frame of the new time before the label announcing it.
  const [isHourFormatFlashing, setIsHourFormatFlashing] = useState(false);
  const hourFormatFlashRef = useRef(0);
  useEffect(() => () => window.clearTimeout(hourFormatFlashRef.current), []);
  // useCallback because this is what the clock hangs its memo on. As a
  // plain arrow it was a new function every tick, which meant a new prop,
  // which meant memo() could never bail out.
  const handleHourFormatClick = useCallback(() => {
    setIs24Hour((prev) => !prev);
    setIsHourFormatFlashing(true);
    window.clearTimeout(hourFormatFlashRef.current);
    hourFormatFlashRef.current = window.setTimeout(() => setIsHourFormatFlashing(false), FLASH_DURATION_MS);
  }, [setIs24Hour]);
  // The offset for every zone, so the picker reads "New York (-4)" rather
  // than leaving you to work out which of the twelve Americas is yours
  // from a city name alone. Needs an Intl.DateTimeFormat per zone and 418
  // of them measured 123ms, so it waits for an idle moment after first
  // paint. Until then the list shows plain city names.
  const [zoneOffsets, setZoneOffsets] = useState<Record<string, string>>({});
  useEffect(() => {
    const build = () => {
      const at = Date.now();
      const offsets: Record<string, string> = {};
      for (const zone of TIME_ZONES) {
        try {
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at);
          const raw = parts.find((part) => part.type === 'timeZoneName')?.value;
          if (raw) offsets[zone] = offsetLabel(raw);
        } catch {
          // a zone the engine lists but won't format: it just keeps its
          // plain city name, same as before this ran
        }
      }
      setZoneOffsets(offsets);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(build);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(build, 0);
    return () => window.clearTimeout(id);
  }, []);
  // How much room the floating top-right corner takes, measured rather
  // than derived. The word counter's fullscreen row has to stop before it,
  // and HEADER_CORNER_RESERVE is only a formula; measuring can't be wrong.
  const headerCornerRef = useRef<HTMLDivElement>(null);
  const [headerCornerWidth, setHeaderCornerWidth] = useState(0);
  useEffect(() => {
    const el = headerCornerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeaderCornerWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // Tailwind's sm. At and above it the timer row is horizontal, the panel
  // sits beside the digits, and the digits column gets sm:self-stretch,
  // which is what gives their cqh sizing a height to query.
  const [isRowLayout, setIsRowLayout] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  // Tailwind's lg. Not whether the panel shows, but which form it takes:
  // inline above, stacked below.
  const [isWideLayout, setIsWideLayout] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const rowQuery = window.matchMedia('(min-width: 640px)');
    const wideQuery = window.matchMedia('(min-width: 1024px)');
    const handleChange = () => {
      setIsRowLayout(rowQuery.matches);
      setIsWideLayout(wideQuery.matches);
    };
    rowQuery.addEventListener('change', handleChange);
    wideQuery.addEventListener('change', handleChange);
    return () => {
      rowQuery.removeEventListener('change', handleChange);
      wideQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // The row holding the website link, the digits and, at sm+, the
  // HOURS/MINUTES/SECONDS panel. Measured directly so the auto-tuck below
  // reacts to what actually doesn't fit rather than an assumed size.
  const timerRowRef = useRef<HTMLDivElement | null>(null);
  // The panel itself, so the height check can ask whether this is what
  // overflows the row rather than reading the row's own scrollHeight.
  const timeFieldsRef = useRef<HTMLDivElement | null>(null);

  // What the row NEEDED to keep the panel, measured with the panel still
  // in it, or null when it isn't auto-tucked. Once hidden the panel is out
  // of the DOM and can't be re-measured, so this is the proxy for "there's
  // room again".
  //
  // Deliberately not the row's size at that moment: hiding the panel
  // doesn't change that size, so "grown back to what it was" is already
  // true the instant it tucks, and the panel bounces in and out forever.
  const tuckedNeedsRef = useRef<{ w: number; h: number } | null>(null);
  // check() reads state through refs. Window resize, the ResizeObserver
  // and the deferred fonts.ready callback can all fire the same closure
  // from an effect run whose state has since gone stale: check() flips
  // isTimeFieldsHidden, and fonts.ready, registered in that same call, can
  // still fire against the pre-flip closure before React re-renders.
  const isTimeFieldsHiddenRef = useRef(isTimeFieldsHidden);
  isTimeFieldsHiddenRef.current = isTimeFieldsHidden;
  const isTimeFieldsAutoTuckedRef = useRef(isTimeFieldsAutoTucked);
  isTimeFieldsAutoTuckedRef.current = isTimeFieldsAutoTucked;
  // Stacked is the narrow form but also the taller one, so a window that's
  // both narrow and short can't have it. This overrides the breakpoint
  // back to inline in that case rather than tucking the panel away. It
  // holds the height the stacked form needed, for the same reason
  // tuckedNeedsRef does: comparing against the row's size at that moment
  // would flip back on the first pixel of growth and immediately flip out.
  const [isTimeFieldsInlinedByHeight, setIsTimeFieldsInlinedByHeight] = useState(false);
  const inlinedByHeightNeedsRef = useRef<number | null>(null);
  const isTimeFieldsInlinedByHeightRef = useRef(isTimeFieldsInlinedByHeight);
  isTimeFieldsInlinedByHeightRef.current = isTimeFieldsInlinedByHeight;
  // Stacked: label above the digit box. Inline: label beside it.
  const isTimeFieldsStacked = !isWideLayout && !isTimeFieldsInlinedByHeight;
  const isTimeFieldsStackedRef = useRef(isTimeFieldsStacked);
  isTimeFieldsStackedRef.current = isTimeFieldsStacked;
  const isRowLayoutRef = useRef(isRowLayout);
  isRowLayoutRef.current = isRowLayout;

  // Tucks the panel away once the row is genuinely too cramped for it,
  // and reverses once the row grows back past what the panel needed. That
  // reversal only ever undoes its own hide: a manual hide leaves
  // tuckedNeedsRef null and is never fought.
  //
  // Tucking is the last rung of a ladder, not the first response. In
  // order: inline, stacked (a third of the width), 3-across if the row is
  // too short for the stack (.time-fields-box in index.css), inline again,
  // tucked. Narrower or shorter always beats disappearing.
  //
  // Below sm the panel isn't rendered at all: the row is a column there,
  // and under the digits this reads as part of the countdown rather than a
  // control for it. tuckedNeedsRef stays null, and the isRowLayout
  // dependency re-fires when the breakpoint is crossed back so the panel
  // gets one fresh look.
  useEffect(() => {
    const el = timerRowRef.current;
    if (!el) return;
    const check = () => {
      if (!isRowLayoutRef.current) {
        tuckedNeedsRef.current = null;
        // A manual hide is left alone here. Only a hide that isn't an
        // auto-tuck persists, so relabelling one as an auto-tuck let a
        // single visit on a narrow window erase the preference.
        if (isTimeFieldsHiddenRef.current && !isTimeFieldsAutoTuckedRef.current) return;
        if (!isTimeFieldsHiddenRef.current || !isTimeFieldsAutoTuckedRef.current) {
          setIsTimeFieldsHidden(true);
          setIsTimeFieldsAutoTucked(true);
        }
        return;
      }
      if (isTimeFieldsHiddenRef.current && isTimeFieldsAutoTuckedRef.current && !tuckedNeedsRef.current) {
        setIsTimeFieldsHidden(false);
        setIsTimeFieldsAutoTucked(false);
        return;
      }
      // A few px of tolerance throughout: sub-pixel rounding from
      // fractional clamp() results and font metrics is enough to trip a
      // bare `>` and tuck the panel over an overflow nobody can see.
      const tooWide = el.scrollWidth > el.clientWidth + 4;
      // The panel's own box against the row's, not the row's scrollHeight.
      // The digits column is by far the tallest thing here, so on a short
      // window it is what overflows, and tucking the panel for that frees
      // no vertical space at all. getBoundingClientRect because the
      // panel's offsetParent is the column wrapper, not the row.
      const panel = timeFieldsRef.current;
      let tooTall = false;
      let neededHeight = 0;
      if (panel) {
        const rowRect = el.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        neededHeight = panelRect.bottom - rowRect.top;
        tooTall = neededHeight > el.clientHeight + 4;
      }

      // A row that's short rather than narrow is better served by going
      // back to inline than by losing the panel. Only once inline also
      // doesn't fit does this fall through to the tuck below.
      if (!isTimeFieldsHiddenRef.current && tooTall && isTimeFieldsStackedRef.current) {
        inlinedByHeightNeedsRef.current = neededHeight;
        setIsTimeFieldsInlinedByHeight(true);
        return;
      }

      // `panel &&`: only something rendered can be tucked. Once it is, the
      // row's remaining overflow belongs to the digits column and must not
      // re-record a need this can no longer measure, nor turn a manual
      // hide into an auto-tuck that the branch above would then undo.
      if (panel && (tooWide || tooTall)) {
        // Recorded while the panel is still measurable, and as what it
        // needed rather than what the row had.
        tuckedNeedsRef.current = { w: el.scrollWidth, h: neededHeight };
        setIsTimeFieldsHidden(true);
        setIsTimeFieldsAutoTucked(true);
        return;
      }

      // >= is honest here only because tuckedNeedsRef holds what the
      // panel NEEDED rather than what the row had: the need is by
      // construction more than the row could give, so this can't be true
      // at the moment of tucking the way a recorded row size was.
      if (
        tuckedNeedsRef.current &&
        el.clientWidth >= tuckedNeedsRef.current.w &&
        el.clientHeight >= tuckedNeedsRef.current.h
      ) {
        tuckedNeedsRef.current = null;
        setIsTimeFieldsHidden(false);
        setIsTimeFieldsAutoTucked(false);
        return;
      }

      // The row has the height the stacked form wanted, so hand the
      // decision back to the breakpoint.
      if (
        isTimeFieldsInlinedByHeightRef.current &&
        (!inlinedByHeightNeedsRef.current || el.clientHeight >= inlinedByHeightNeedsRef.current)
      ) {
        inlinedByHeightNeedsRef.current = null;
        setIsTimeFieldsInlinedByHeight(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(el);
    // The first check can land before the monospace font swaps in,
    // measuring the narrower fallback and missing an overflow that only
    // appears once the real font's wider digits load.
    document.fonts?.ready.then(check);
    return () => {
      window.removeEventListener('resize', check);
      resizeObserver.disconnect();
    };
  }, [isTimeFieldsHidden, isTimeFieldsAutoTucked, isTimeFieldsInlinedByHeight, isRowLayout, isWideLayout]);

  // Bumped when a fresh countdown starts, so the green fade replays even
  // if the window never left the running state.
  const [runCycle, setRunCycle] = useState(0);
  const restartRunFade = () => setRunCycle((c) => c + 1);

  // Drain bar hover preview: x within the track, and the time it maps to.
  const [barHover, setBarHover] = useState<{ x: number; seconds: number } | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  // States an adjustment has already been asked about, so the three fields
  // share one prompt per state. In memory on purpose: this means "you
  // answered that a moment ago", which shouldn't outlive the session. The
  // dialog's "don't ask again" is what makes an answer permanent.
  const askedAdjustInStatesRef = useRef(new Set<TimerStateKind>());
  // Radix fires onClick and onOpenChange for the same click, so the
  // dismiss handler needs this to tell a confirm from a cancel.
  const justConfirmedRef = useRef(false);

  const { beep } = useBeep(volume);
  // Cancels an in-flight preview burst so a new one overrides it.
  const previewCleanupRef = useRef<(() => void) | null>(null);

  const configured: TimeParts = useMemo(
    () => ({ hours, minutes, seconds: timerSeconds }),
    [hours, minutes, timerSeconds]
  );
  const configuredTotalSeconds = toSignedTotal(configured, isConfiguredNegative);
  // Read by the field callbacks, which must not re-memoise on every tick.
  const configuredTotalRef = useRef(configuredTotalSeconds);
  configuredTotalRef.current = configuredTotalSeconds;
  // A timer sitting idle at its configured time has nothing for STOP or
  // RESET to act on.
  const isIdleAtConfigured = !isRunning && seconds >= 0 && seconds === configuredTotalSeconds;

  const closeDialog = () => setDialog({ type: null });

  // Every "are you sure?" goes through here, so the two ways a question
  // can already be answered are checked in one place rather than a dozen
  // call sites: confirmations turned off globally, or this question
  // silenced by its own "don't ask again". Either way the action runs.
  //
  // The site RESET is the one dialog that calls setDialog directly, since
  // letting anything skip it would be self-defeating.
  const askThenRun = useCallback((next: DialogState, run: () => void) => {
    if (skipConfirmations || isDialogSuppressed(next)) {
      run();
      return;
    }
    setDialog(next);
  }, [skipConfirmations]);

  // Read off timeRef rather than `seconds` so a caller mid-click sees the
  // live value, like every other check here.
  const timerStateKind = useCallback((): TimerStateKind => {
    if (timeRef.current.seconds < 0) return 'ringing';
    if (isPaused) return 'paused';
    if (isRunning) return 'running';
    return 'unstarted';
  }, [isRunning, isPaused]);

  // Two different questions, and folding them together was a bug.
  //
  // hasRunToLose is about confirmations: which states are worth a dialog
  // between you and what you just clicked. A ringing timer is one you're
  // trying to deal with and an unstarted one has nothing at stake, so
  // neither asks.
  //
  // isLiveRun is about what the time fields MEAN: any started timer,
  // whichever side of zero it's on. Reading the confirmation question here
  // instead made the fields snap from 00:00:00 back to the configured
  // total the instant the countdown crossed zero, because a ringing timer
  // has no run to lose but very much has a run.
  const hasRunToLose = useCallback(() => {
    const state = timerStateKind();
    return state === 'running' || state === 'paused';
  }, [timerStateKind]);
  const isLiveRun = isRunning || isPaused;
  // Mirrored, because applyAdjustment is reached from a dialog confirm as
  // well as directly, and between opening that dialog and answering it the
  // countdown can cross zero. Read off state, the branch taken at confirm
  // could be the opposite of the one the dialog described.
  const isLiveRunRef = useRef(isLiveRun);
  isLiveRunRef.current = isLiveRun;

  // One key per hook, so each writes only when its own value changes. A
  // single effect for all fourteen means a single dependency list, and
  // `seconds` is in it: a running timer re-serialised the presets, the
  // history and every setting once a second.
  //
  // timerState keeps an effect of its own because it bundles six values
  // into an object literal, which is a new identity every render and would
  // write on every 10ms tick through usePersisted.
  useEffect(() => {
    writeJSON(STORAGE_KEYS.timerState, { seconds, isPaused, isRunning, hours, minutes, timerSeconds });
  }, [seconds, isPaused, isRunning, hours, minutes, timerSeconds]);
  usePersisted(STORAGE_KEYS.history, history);
  usePersisted(STORAGE_KEYS.configuredNegative, isConfiguredNegative);
  usePersisted(STORAGE_KEYS.silentMode, isSilentMode);
  usePersisted(STORAGE_KEYS.presets, presets);
  usePersisted(STORAGE_KEYS.volume, volume);
  usePersisted(STORAGE_KEYS.hasMutedBefore, hasMutedBefore);
  usePersisted(STORAGE_KEYS.alarmLoop, isAlarmLooping);
  usePersisted(STORAGE_KEYS.skipConfirmations, skipConfirmations);
  usePersisted(STORAGE_KEYS.websiteLinkHidden, isWebsiteLinkHidden);
  usePersisted(STORAGE_KEYS.sidebarHidden, isSidebarHidden);
  usePersisted(STORAGE_KEYS.lightTheme, isLightTheme);
  usePersisted(STORAGE_KEYS.clockTimeZone, timeZone);
  usePersisted(STORAGE_KEYS.clock24Hour, is24Hour);
  // Only a manual hide persists. An auto-tuck is a reaction to one window
  // size, and the check that reverses it needs tuckedNeedsRef, which is in
  // memory and gone on reload, so saving one would hide the panel for good
  // at every later size.
  usePersisted(STORAGE_KEYS.timeFieldsHidden, isTimeFieldsHidden && !isTimeFieldsAutoTucked);

  // timerState only writes on whole-second changes, so it can't capture
  // where inside the current second a reload lands. Flushed separately as
  // the page goes away, through a ref so the listener registers once
  // rather than rebinding every tick.
  const persistedTimeRef = useRef(time);
  persistedTimeRef.current = time;
  useEffect(() => {
    const flushMilliseconds = () => {
      const saved = readJSON<Record<string, unknown>>(STORAGE_KEYS.timerState, {});
      writeJSON(STORAGE_KEYS.timerState, { ...saved, milliseconds: persistedTimeRef.current.milliseconds });
    };
    // pagehide rather than beforeunload: it fires on every navigation away,
    // bfcache included, where beforeunload saved nothing and cost the page
    // its bfcache eligibility in Safari — going back reloaded the app cold.
    // The leave-confirmation further down does use beforeunload, because
    // nothing else can stop an unload, but only while a timer is live.
    //
    // visibilitychange beside it because pagehide never fires for a tab the
    // phone discards while it sits in the background, which is how a mobile
    // session usually ends. Hiding is the last moment there is.
    const flushOnHide = () => { if (document.visibilityState === 'hidden') flushMilliseconds(); };
    window.addEventListener('pagehide', flushMilliseconds);
    document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      window.removeEventListener('pagehide', flushMilliseconds);
      document.removeEventListener('visibilitychange', flushOnHide);
    };
  }, []);

  // Confirming with Enter closes the dialog without a Radix close event,
  // so onOpenChange never consumes the flag. Cleared as each one opens.
  useEffect(() => {
    if (dialog.type !== null) justConfirmedRef.current = false;
  }, [dialog.type]);

  // Tab title and favicon show the remaining time.
  const remainingWholeSeconds = Math.floor(Math.abs(seconds * 1000 + milliseconds) / 1000);
  useFavicon(
    isRunning,
    isPaused,
    seconds < 0,
    Math.floor((remainingWholeSeconds % 3600) / 60),
    remainingWholeSeconds % 60,
    Math.floor(remainingWholeSeconds / 3600)
  );

  // Subtracts elapsed wall-clock time, and keeps going negative down to
  // the -99:59:59 floor.
  useEffect(() => {
    if (!isRunning || isPaused) return;

    let lastTime = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      // A backwards clock step from NTP or a manual change must not add
      // time back.
      const elapsed = Math.max(0, now - lastTime);
      lastTime = now;

      setTime((prev) => {
        if (prev.seconds <= MIN_TOTAL_SECONDS) return prev;
        const totalMs = prev.seconds * 1000 + prev.milliseconds - elapsed;
        if (totalMs <= MIN_TOTAL_SECONDS * 1000) return { seconds: MIN_TOTAL_SECONDS, milliseconds: 0 };
        const nextSeconds = Math.floor(totalMs / 1000);
        return { seconds: nextSeconds, milliseconds: totalMs - nextSeconds * 1000 };
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused]);

  // Not gated on mute. Muting silences the alarm; it doesn't mean the
  // timer didn't run out. The window flash and the red digits are the
  // whole of what a muted alarm has left to say, and without them a
  // finished timer looked identical to one still counting.
  const isAlarmActive = isRunning && !isPaused && seconds < 0;
  // Read through a ref inside the pattern below rather than as a
  // dependency: toggling mute mid-ring should stop the sound where it is,
  // not tear down and restart the flashing that goes with it.
  const isSilentModeRef = useRef(isSilentMode);
  isSilentModeRef.current = isSilentMode;
  // With repeat off the alarm gets one finite ring per overtime period,
  // and the allowance is spent the moment ringing starts. Pause/resume and
  // mute can't squeeze out extra groups, turning repeat off mid-ring mutes
  // at once, and it resets when the timer leaves negative time.
  const isOvertime = seconds < 0;
  const alarmRungThisOvertimeRef = useRef(false);
  // The pattern position lives in a ref too, so effect re-runs from repeat
  // or pause toggles continue the ring instead of restarting it.
  const alarmTickRef = useRef(0);
  // With repeat off, a ring that finishes on its own leaves the digits
  // faded red as a "you missed this" cue. Cleared by turning repeat back
  // on or leaving overtime.
  const [hasRungOut, setHasRungOut] = useState(false);
  // Layout effect, not effect: this can fire in the same commit as seconds
  // going non-negative, and running after paint gives a one-frame flash of
  // solid red digits on an otherwise fresh countdown.
  useLayoutEffect(() => {
    if (!isOvertime) {
      alarmRungThisOvertimeRef.current = false;
      alarmTickRef.current = 0;
      setHasRungOut(false);
    }
  }, [isOvertime]);
  useEffect(() => {
    if (isAlarmLooping) setHasRungOut(false);
  }, [isAlarmLooping]);

  // With repeat off and still above zero, pausing flashes the window
  // yellow three times rather than forever, and the digits wave yellow
  // once that settles. Cleared on resume so the next pause replays it.
  // Unused below zero, where the red wave shows immediately instead.
  const [hasPausedSettled, setHasPausedSettled] = useState(false);
  useEffect(() => {
    if (!isPaused || isAlarmLooping) setHasPausedSettled(false);
  }, [isPaused, isAlarmLooping]);
  useEffect(() => {
    const el = windowRef.current;
    if (!el) return;
    const onAnimationEnd = (e: AnimationEvent) => {
      if (e.animationName === 'pauseFlash' && isPaused && !isAlarmLooping) setHasPausedSettled(true);
    };
    el.addEventListener('animationend', onAnimationEnd);
    return () => el.removeEventListener('animationend', onAnimationEnd);
  }, [isPaused, isAlarmLooping]);

  // Window flash synced to the alarm: isAlarmRinging while the beep
  // interval runs, isBeepFlash pulsing red on each individual beep.
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [isBeepFlash, setIsBeepFlash] = useState(false);

  useEffect(() => {
    if (!isAlarmActive) return;
    if (!isAlarmLooping && alarmRungThisOvertimeRef.current) {
      // Repeat turned off mid-ring mutes immediately rather than finishing
      // the pattern. Treated the same as the ring completing, so the
      // digits still fade red.
      setHasRungOut(true);
      return;
    }
    // Spent by the overtime period, not by whether anyone heard it: a
    // muted ring still counts as the one ring repeat-off allows, so
    // unmuting part-way through doesn't start another. Unmuting mid-ring
    // does pick up the beeps from the next tick, since playTick reads mute
    // through a ref, but it won't replay what it already flashed.
    alarmRungThisOvertimeRef.current = true;

    const pattern: boolean[] = [];
    for (let burst = 0; burst < ALARM_TOTAL_BURSTS; burst++) {
      for (let i = 0; i < ALARM_BURST_COUNT; i++) pattern.push(true);
      const gapTicks = burst === ALARM_TOTAL_BURSTS - 1 ? ALARM_GROUP_GAP_TICKS : ALARM_BURST_GAP_TICKS;
      for (let i = 0; i < gapTicks; i++) pattern.push(false);
    }

    const playTick = () => {
      // With repeat off the ring is one full pass through the pattern,
      // every burst of it, not just the first.
      if (!isAlarmLooping && alarmTickRef.current >= pattern.length) {
        if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
        setIsAlarmRinging(false);
        setHasRungOut(true);
        return;
      }
      if (pattern[alarmTickRef.current % pattern.length]) {
        if (!isSilentModeRef.current) beep(...TONES.alarm);
        // Red for exactly as long as the beep sounds — or would have.
        setIsBeepFlash(true);
        window.setTimeout(() => setIsBeepFlash(false), TONES.alarm[1]);
      }
      alarmTickRef.current++;
    };
    setIsAlarmRinging(true);
    playTick();
    beepIntervalRef.current = setInterval(playTick, ALARM_TICK_MS);

    return () => {
      if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
      setIsAlarmRinging(false);
      setIsBeepFlash(false);
    };
  }, [isAlarmActive, isAlarmLooping, beep]);

  // Leaving mid-run throws the run away, so it asks first. The browser
  // owns this one: its own wording, no styling, and it stays quiet until
  // the page has been interacted with. Nothing this app can draw holds up
  // an unload, so beforeunload is the whole of what's available.
  //
  // Registered only while there's a run to lose, which is what keeps the
  // trade above intact — an idle page carries no beforeunload listener and
  // keeps the bfcache eligibility a permanent one would cost it. Once
  // overtime starts isRunning stays true, so a counting-up stopwatch and a
  // finished-but-unacknowledged alarm both still ask.
  //
  // Deliberately not gated on skipConfirmations. That switch is for
  // actions this app takes on your behalf; closing the tab is one the
  // browser takes, and it's the one with nothing to undo it.
  const isSelfReloadingRef = useRef(false);
  useEffect(() => {
    if (!isRunning && !isPaused && !isAlarmRinging) return;
    const confirmLeave = (e: BeforeUnloadEvent) => {
      // A reload the app asked for itself has already been confirmed once.
      if (isSelfReloadingRef.current) return;
      e.preventDefault();
      // Chrome and Edge before 119 ignore preventDefault on its own.
      e.returnValue = true;
    };
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [isRunning, isPaused, isAlarmRinging]);

  // Enter/S/R mirror the on-screen controls. The ref lets the keydown
  // listener register once instead of rebinding every tick.
  const keyActionRef = useRef<(code: string) => boolean>(() => false);
  keyActionRef.current = (code) => {
    // The dialog owns the keyboard while it's open.
    if (dialog.type !== null) return false;
    if (code === 'Enter') {
      if (isRunning) {
        togglePause();
      } else {
        handleStart();
      }
      return true;
    }
    if (code === 'KeyS') {
      if (isIdleAtConfigured) return false;
      handleStopClick();
      return true;
    }
    if (code === 'KeyR') {
      if (isIdleAtConfigured) return false;
      handleResetClick();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // key, not code, for Enter: the numpad's own Enter reports
      // NumpadEnter and is the same key to anyone pressing it.
      const action = e.key === 'Enter' ? 'Enter' : e.code === 'KeyS' || e.code === 'KeyR' ? e.code : null;
      if (!action) return;
      // Autorepeat is not three hundred presses. Held down, Enter fired
      // ~30 pause/resume toggles a second — each with its own oscillator —
      // and left the timer running or paused on the parity of how long the
      // key was down.
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Anything focused that wants the key itself keeps it, and which
      // controls those are depends on the key. ENTER presses whatever is
      // focused, so every activatable control claims it. A letter only
      // gets typed — into a field, or into a <select>'s type-ahead — and
      // buttons do nothing with one, so blocking S and R on buttons too
      // killed both shortcuts for anyone who had just clicked something,
      // which is everyone: click START and R stopped resetting.
      if ((e.target as HTMLElement | null)?.closest?.(action === 'Enter' ? ENTER_ACTIVATES : TYPES_INTO)) return;
      if (keyActionRef.current(action)) {
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const playTone = (tone: keyof typeof TONES) => {
    if (!isSilentMode) {
      beep(...TONES[tone]);
    }
  };

  // Muting makes no sound of its own, except the first time this browser
  // ever mutes, which asks first.
  const handleMuteToggle = () => {
    if (isSilentMode) {
      // The slider keeps whatever level it was left at, 0 included.
      // Unmuting used to jump it to the default from there, which threw
      // away a setting that had been made deliberately — and the toggle
      // tone plays at the real level, so at 0 there's nothing to hear,
      // which is what 0 means.
      beep(...TONES.silentToggle);
      setIsSilentMode(false);
      return;
    }
    if (!hasMutedBefore) {
      askThenRun({ type: 'mute' }, handleConfirmMute);
      return;
    }
    setIsSilentMode(true);
  };

  const handleConfirmMute = () => {
    setIsSilentMode(true);
    setHasMutedBefore(true);
    closeDialog();
  };

  // Dragging the slider to 0 mutes; dragging back off 0 unmutes.
  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (value === 0) {
      setIsSilentMode(true);
      // Sliding to 0 is already an explicit mute, so the button's one-time
      // "are you sure?" would be redundant after it.
      setHasMutedBefore(true);
    } else if (isSilentMode) {
      setIsSilentMode(false);
    }
  };

  // On release, previews the chosen level with one alarm burst. Releasing
  // again cancels the burst still in flight.
  const playVolumePreview = (value: number) => {
    previewCleanupRef.current?.();
    if (value === 0) return;

    const stops: Array<() => void> = [];
    const timeouts: number[] = [];
    for (let i = 0; i < ALARM_BURST_COUNT; i++) {
      timeouts.push(window.setTimeout(() => {
        stops.push(beep(...TONES.alarm, value));
      }, i * ALARM_TICK_MS));
    }
    previewCleanupRef.current = () => {
      timeouts.forEach(clearTimeout);
      stops.forEach((stop) => stop());
      previewCleanupRef.current = null;
    };
  };

  const clearAlarmInterval = () => {
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
      beepIntervalRef.current = null;
    }
  };

  const clearCountdownInterval = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  // Shared by every path that restarts from a fresh total: stop any
  // ringing alarm, snap to the new total, replay the green fade.
  const restartCountdown = (totalSeconds: number) => {
    clearAlarmInterval();
    setTime({ seconds: totalSeconds, milliseconds: 0 });
    restartRunFade();
  };

  const recordHistory = (parts: TimeParts) => {
    const entry: TimerEntry = { id: uniqueId(), ...parts, timestamp: Date.now() };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
    setInsertedHistory((prev) => bumpFlash(prev, entry.id));
  };

  const togglePause = () => {
    // The beep is a side effect, so it stays out of the state updater.
    const nextIsPaused = !isPaused;
    if (!isSilentMode) {
      beep(...(nextIsPaused ? TONES.pause : TONES.resume));
    }
    setIsPaused(nextIsPaused);
  };

  const handleStart = () => {
    // At or past zero, start again from the configured time.
    setTime((prev) => ({
      seconds: prev.seconds <= 0 ? configuredTotalSeconds : prev.seconds,
      milliseconds: 0,
    }));

    recordHistory(configured);
    setIsRunning(true);
    setIsPaused(false);
    restartRunFade();
    playTone('start');
  };

  const stopToConfigured = () => {
    clearAlarmInterval();
    clearCountdownInterval();
    setTime({ seconds: configuredTotalSeconds, milliseconds: 0 });
    setIsRunning(false);
    setIsPaused(false);
  };

  // An alarm actually going off goes straight through: it's something
  // you're trying to make stop, and a dialog between the button and the
  // silence is the wrong thing to meet there. Paused mid-overtime is not
  // that — it's silent, there's nothing to escape, and the count-up
  // reading on screen is real elapsed time that one stray click would
  // take. A reloaded run comes back paused, so that's the state a
  // finished stopwatch is usually sitting in.
  const isRingingNow = isOvertime && !isPaused;
  const handleStopClick = () => {
    if (isRingingNow) {
      handleConfirmStop();
      return;
    }
    askThenRun({ type: 'stop' }, handleConfirmStop);
  };

  const handleConfirmStop = () => {
    playTone('stop');
    stopToConfigured();
    closeDialog();
  };

  const handleResetClick = () => {
    if (isRingingNow) {
      handleConfirmReset();
      return;
    }
    askThenRun({ type: 'reset' }, handleConfirmReset);
  };

  const handleConfirmReset = () => {
    playTone('reset');
    restartCountdown(configuredTotalSeconds);
    recordHistory(configured);
    setIsRunning(true);
    setIsPaused(false);
    closeDialog();
  };

  const loadEntry = useCallback((parts: TimeParts, negative = false) => {
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setTimerSeconds(parts.seconds);
    setIsConfiguredNegative(negative);
    setTime({ seconds: toSignedTotal(parts, negative), milliseconds: 0 });
  }, []);

  // The one switch sequence. start=false loads the preset without running
  // it.
  //
  // Memoized so handleSelectEntry can just depend on it. As a plain
  // function left out of that dependency list it was correct only because
  // the list happened to name its transitive deps, and anything added here
  // that read fresh state would have gone stale silently.
  const applySwitch = useCallback((parts: TimeParts, start: boolean, negative = false) => {
    clearAlarmInterval();
    loadEntry(parts, negative);
    setIsPaused(false);
    setIsRunning(start);
    if (start) {
      recordHistory(parts);
      restartRunFade();
      if (!isSilentMode) beep(...TONES.start);
    }
  }, [loadEntry, isSilentMode, beep]);

  // Running a picked time, from the list or from the add box. Both entry
  // points promise the same words and the same "don't ask again" scope, so
  // they share the one gate rather than each carrying a copy of it —
  // duplicated, the next change to it lands in one place and the two
  // silently diverge.
  //
  // It asks only where there's a run on the clock to lose: counting down,
  // or paused mid-count. A ringing timer and an unstarted one go straight
  // through. Paused keeps its own wording, since what it discards is the
  // remaining time rather than progress in flight.
  const switchToEntry = useCallback((parts: TimeParts, negative = false) => {
    const signed = { ...parts, negative };
    if (!hasRunToLose()) {
      applySwitch(parts, true, negative);
      return;
    }
    const mode = isPaused ? 'loadOnly' : 'switchRunning';
    askThenRun({ type: 'switch', data: signed, mode }, () => applySwitch(parts, true, negative));
  }, [hasRunToLose, isPaused, applySwitch, askThenRun]);

  const handleSelectEntry = useCallback((entry: TimerEntry) => {
    const parts: TimeParts = { hours: entry.hours ?? 0, minutes: entry.minutes, seconds: entry.seconds };
    // Flashed on the click rather than when the switch applies: simpler
    // than threading the id through the dialog, and a cancelled switch
    // leaves a harmless flash. The panels check loaded before inserted, so
    // loading a just-created entry goes green rather than staying yellow.
    setLoadedEntry((prev) => bumpFlash(prev, entry.id));
    switchToEntry(parts, entry.negative === true);
  }, [switchToEntry]);

  const handleConfirmSwitch = (parts: TimeParts, start: boolean, negative = false) => {
    applySwitch(parts, start, negative);
    closeDialog();
  };

  // A preset list is a set of times, so adding one it already holds adds
  // nothing and says so instead, then flashes the existing row red to point
  // at it. Returns whether anything went in, so the panel knows whether to
  // clear its input.
  //
  // Matched on the time, not the label: formatEntryLabel drops leading
  // zeroes, so 1:05 and 0:01:05 print the same and are the same preset.
  const handleAddPreset = useCallback((parts: TimeParts & { negative?: boolean }): boolean => {
    const negative = parts.negative === true;
    // The sign is part of the time: -1:05 and 1:05 are different presets,
    // and matching without it would refuse the second as a duplicate of
    // the first.
    const existing = presets.find(
      (p) => (p.hours ?? 0) === parts.hours && p.minutes === parts.minutes && p.seconds === parts.seconds
        && (p.negative === true) === negative
    );
    if (existing) {
      // The flash comes after the notice rather than under it, where the
      // dialog would cover the row it's meant to be pointing at. Silence the
      // notice and the flash alone is left to say it.
      askThenRun(
        { type: 'duplicatePreset', data: { id: existing.id, label: formatEntryLabel(existing) } },
        () => setDuplicatePreset((prev) => bumpFlash(prev, existing.id))
      );
      return false;
    }
    if (presets.length >= MAX_PRESETS) return false;
    const id = uniqueId();
    setPresets((prev) => [...prev, { id, ...parts, negative, timestamp: 0 }]);
    setInsertedPreset((prev) => bumpFlash(prev, id));
    // Adding a time is a request to use it, so it runs, through the same
    // gate as clicking the row afterwards.
    // An out-of-range entry never reaches here: the panel sends it to the
    // correction dialog first, and only a corrected time is added.
    switchToEntry(parts, negative);
    return true;
  }, [presets, switchToEntry]);

  // Two steps, so the delete animation plays after the question is
  // answered rather than before. Only a confirmed removal sets this, which
  // is what tells the row to fizz out; dropping it from the array happens
  // last, when the row calls back. Cancelling leaves a row that never
  // animated at all rather than one that has to be put back.
  const [removingPresetId, setRemovingPresetId] = useState<string | null>(null);

  const handleRequestRemovePreset = useCallback((id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (!preset) return;
    askThenRun({ type: 'removePreset', data: { id, label: formatEntryLabel(preset) } }, () => setRemovingPresetId(id));
  }, [presets, askThenRun]);

  const handleRemovePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
    setRemovingPresetId((current) => (current === id ? null : current));
  }, []);

  // Same two-step shape as the removal above: the panel asks, the dialog
  // answers, and the answer travels back down for the panel to apply,
  // since the typed digits live down there.
  const [presetCorrection, setPresetCorrection] = useState<{ digits: string; add: boolean } | null>(null);

  const handleRequestPresetCorrection = useCallback((digits: string, add: boolean) => {
    const corrected = parsePresetDigits(digits);
    const correction = { digits: presetDigitsFromParts(corrected), add };
    askThenRun({
      type: 'correctPreset',
      data: {
        typed: formatEntryLabel(rawPresetDigits(digits)),
        corrected: formatEntryLabel(corrected),
        ...correction,
      },
    }, () => setPresetCorrection(correction));
  }, [askThenRun]);

  const handlePresetCorrectionApplied = useCallback(() => setPresetCorrection(null), []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    setInsertedHistory(null);
  }, []);

  // Empties the list outright rather than fizzing each row out the way a
  // single − does. A hundred rows animating at once is a mess, and the
  // dialog has already made the point.
  const handleClearPresets = useCallback(() => {
    setPresets([]);
    setInsertedPreset(null);
  }, []);

  const handleRemoveHistoryEntry = useCallback((id: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  // When each history entry was recorded, read in the clock's own zone and
  // 12/24 setting so the list re-reads whenever either changes. Memoized
  // on exactly those two, which keeps the identity stable for the panel's
  // memo() and rebuilds the formatters only when they actually move.
  //
  // recordHistory always stamps Date.now(), so a real run can't produce 0.
  // The guard is for storage that's been corrupted or hand-edited, which
  // would otherwise render as 01/01/1970.
  const formatHistoryStamp = useMemo(() => {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: !is24Hour,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    const date = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
    // Returned in two pieces rather than one string: the panel puts them
    // on their own lines, and the line it breaks at should be chosen here
    // rather than left to wherever the text happens to wrap.
    return (timestamp: number) =>
      timestamp > 0 ? { time: time.format(timestamp), date: formatDateParts(date, timestamp) } : null;
  }, [timeZone, is24Hour]);

  // Memoized rather than written inline at the panels below. An inline
  // arrow is a new identity every render, and these were the last unstable
  // props either panel took: one is enough to stop memo() ever bailing
  // out, which had every countdown tick reconciling every row in both
  // lists. Survivable at twenty rows, not at a thousand.
  const handleRequestClearPresets = useCallback(
    () => askThenRun({ type: 'clearPresets' }, handleClearPresets),
    [askThenRun, handleClearPresets]
  );
  const handleRequestClearHistory = useCallback(
    () => askThenRun({ type: 'clearHistory' }, handleClearHistory),
    [askThenRun, handleClearHistory]
  );

  const flashSetterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHoursFlash : unit === 'minutes' ? setMinutesFlash : setSecondsFlash),
    []
  );

  // The whole time the three boxes are showing, as one signed number, and
  // the one place it is written back. Everything the boxes can do — typing
  // 61 into seconds, stepping 59 up, stepping 00:00:00 down, pressing "-" —
  // is a new value for this, and the carries and borrows come out of the
  // arithmetic rather than out of rules per unit.
  //
  // Which number it is depends on the same isLiveRun split as before:
  // idle these boxes are the timer's setup, running or paused they are the
  // time left and the configured total is untouched.
  const shownTotal = useCallback(
    () => (isLiveRunRef.current ? timeRef.current.seconds : configuredTotalRef.current),
    []
  );

  const applyAdjustment = useCallback((total: number, unit: TimeUnit, previousTotal: number) => {
    const next = clampTotal(total);
    if (isLiveRunRef.current) {
      clearAlarmInterval();
      setTime({ seconds: next, milliseconds: 0 });
    } else {
      const magnitude = fromTotalSeconds(Math.abs(next));
      setHours(magnitude.hours);
      setMinutes(magnitude.minutes);
      setTimerSeconds(magnitude.seconds);
      setIsConfiguredNegative(next < 0);
      restartCountdown(next);
    }
    // The unit the click was on, flashed in the direction the whole time
    // moved. A carry changes two boxes and the one you touched is the one
    // worth pointing at; the hour digit drops out of the display at 0, so
    // there is nothing there to draw attention to.
    if (unit !== 'hours' || Math.abs(next) >= 3600) {
      flashSetterFor(unit)((prev) => ({ token: prev.token + 1, direction: next >= previousTotal ? 'inc' : 'dec' }));
    }
  }, [flashSetterFor]);

  // Asks first, once per timer state, for all three boxes together — but
  // only while there's a run to restart. Setting a timer up is what these
  // boxes are for, and a ringing one has nothing left to lose, so neither
  // of those meets a dialog.
  //
  // Tracked by state kind rather than by transition, because setting a
  // timer up means touching two or three boxes in a row, which is one
  // intent; and pausing to nudge a minute, resuming, then pausing to nudge
  // again is still the same question about the same paused timer.
  const requestTotalChange = useCallback((total: number, unit: TimeUnit) => {
    const previousTotal = shownTotal();
    const next = clampTotal(total);
    if (next === previousTotal) return;

    const state = timerStateKind();
    if (hasRunToLose() && !askedAdjustInStatesRef.current.has(state)) {
      const dialog: DialogState = { type: 'adjust', data: { totalSeconds: next, previousTotal, unit, state } };
      // Marked before asking, not after confirming: a cancelled question
      // was still asked. The dismiss handler clears it again so cancelling
      // doesn't hand the next adjustment a free pass.
      askedAdjustInStatesRef.current.add(state);
      askThenRun(dialog, () => {
        askedAdjustInStatesRef.current.delete(state);
        applyAdjustment(next, unit, previousTotal);
      });
      return;
    }
    applyAdjustment(next, unit, previousTotal);
  }, [shownTotal, timerStateKind, hasRunToLose, applyAdjustment, askThenRun]);

  // A typed commit replaces one unit's magnitude and keeps the sign. 61
  // arrives here as 61 and toSignedTotal turns the whole thing into 1m 01s.
  const changeUnit = useCallback((unit: TimeUnit, value: number) => {
    const shown = signedParts(shownTotal());
    requestTotalChange(toSignedTotal({ ...shown, [unit]: value }, shown.negative), unit);
  }, [shownTotal, requestTotalChange]);

  const handleHoursChange = useCallback((value: number) => changeUnit('hours', value), [changeUnit]);
  const handleMinutesChange = useCallback((value: number) => changeUnit('minutes', value), [changeUnit]);
  const handleSecondsChange = useCallback((value: number) => changeUnit('seconds', value), [changeUnit]);

  // A chevron moves the whole time, which is what makes stepping up out of
  // overtime the way back to a running countdown.
  const handleStepTotal = useCallback((deltaSeconds: number) => {
    const unit: TimeUnit = Math.abs(deltaSeconds) >= 3600 ? 'hours' : Math.abs(deltaSeconds) >= 60 ? 'minutes' : 'seconds';
    requestTotalChange(shownTotal() + deltaSeconds, unit);
  }, [shownTotal, requestTotalChange]);

  // "-" flips the sign of the whole time from whichever box it was typed
  // in; the display decides which one wears it.
  const handleToggleSign = useCallback(() => {
    const total = shownTotal();
    if (total === 0) return;
    requestTotalChange(-total, signedParts(total).signUnit ?? 'seconds');
  }, [shownTotal, requestTotalChange]);

const handleHideWebsiteLinkClick = () => {
    askThenRun({ type: 'hideWebsiteLink' }, () => setIsWebsiteLinkHidden(true));
  };

  // While the timer is running or paused, seeking moves only the remaining
  // time and leaves the configured time alone. An idle timer has nothing
  // to resume into, so seeking sets a new configured time at that point
  // instead, exactly as typing it into the fields would.
  const applySeek = (targetSeconds: number) => {
    if (!isRunning) {
      const parts = fromTotalSeconds(targetSeconds);
      setHours(parts.hours);
      setMinutes(parts.minutes);
      setTimerSeconds(parts.seconds);
      setTime({ seconds: targetSeconds, milliseconds: 0 });
      return;
    }
    clearAlarmInterval();
    setTime({ seconds: targetSeconds, milliseconds: 0 });
    restartRunFade();
  };

  // Always asks. The track is 8px tall and sits right under the digits,
  // and on an idle timer a seek rewrites the configured time outright, so
  // a stray click is expensive in every state — including the two that
  // skip the question elsewhere.
  const requestSeek = (targetSeconds: number) => {
    const mode = !isRunning ? 'idle' : isPaused ? 'paused' : 'running';
    askThenRun({ type: 'seek', data: { targetSeconds, mode } }, () => applySeek(targetSeconds));
  };

  // The bar drains left to right, so the track's left end is the
  // configured time and its right end is zero.
  const barPointSeconds = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    return { x, seconds: Math.round((1 - x / rect.width) * configuredTotalSeconds) };
  };

  const handleDialogConfirm = (dontAskAgain: boolean) => {
    justConfirmedRef.current = true;
    // Recorded before the switch runs, since some of these actions clear
    // the dialog state they close over.
    if (dontAskAgain) suppressDialog(dialog);
    switch (dialog.type) {
      case 'stop':
        handleConfirmStop();
        break;
      case 'mute':
        handleConfirmMute();
        break;
      case 'clearCache':
        // Wipe and reload, so every piece of state re-initialises. The
        // leave guard stands down first: this reload is the thing that was
        // just confirmed, and challenging it would leave the storage
        // emptied behind a page that never went anywhere.
        isSelfReloadingRef.current = true;
        wipeStorage(Object.values(STORAGE_KEYS));
        window.location.reload();
        break;
      case 'reset':
        handleConfirmReset();
        break;
      case 'switch':
        // Every mode starts the new time; they differ only in what they
        // warned about first. The skipped-dialog path runs the same
        // applySwitch through askThenRun, and the two have to agree.
        handleConfirmSwitch(dialog.data, true, dialog.data.negative === true);
        break;
      case 'seek':
        applySeek(dialog.data.targetSeconds);
        closeDialog();
        break;
      case 'adjust':
        applyAdjustment(dialog.data.totalSeconds, dialog.data.unit, dialog.data.previousTotal);
        closeDialog();
        break;
      case 'hideWebsiteLink':
        setIsWebsiteLinkHidden(true);
        closeDialog();
        break;
      case 'clearHistory':
        handleClearHistory();
        closeDialog();
        break;
      case 'clearPresets':
        handleClearPresets();
        closeDialog();
        break;
      case 'removePreset':
        // Hands off to the row's fizz; the removal happens when that
        // animation ends.
        setRemovingPresetId(dialog.data.id);
        closeDialog();
        break;
      case 'correctPreset':
        setPresetCorrection({ digits: dialog.data.digits, add: dialog.data.add });
        closeDialog();
        break;
      case 'duplicatePreset':
        setDuplicatePreset((prev) => bumpFlash(prev, dialog.data.id));
        closeDialog();
        break;
      case 'skipConfirmations':
        setSkipConfirmations(true);
        closeDialog();
        break;
    }
  };

  // Dismissing an 'adjust' has no edit to undo, since nothing was applied,
  // but the once-per-state prompt has to re-arm or the next adjustment in
  // that state would apply silently.
  const handleDialogDismiss = (dontAskAgain = false) => {
    if (!justConfirmedRef.current && dialog.type === 'adjust') {
      askedAdjustInStatesRef.current.delete(dialog.data.state);
    }
    // An acknowledgement states what happened, so ESC has to leave the same
    // result behind as OK — the ticked box included. Anything else and the
    // text would be a lie for whoever dismissed it that way, and the
    // preference they just set would go with it.
    if (!justConfirmedRef.current && isAcknowledgement(dialog)) {
      handleDialogConfirm(dontAskAgain);
      return;
    }
    justConfirmedRef.current = false;
    closeDialog();
  };

  const remaining = formatTime(seconds, milliseconds);
  // Same label style as the sidebar lists: "1:30", not "01:30:00".
  const configuredLabel = formatEntryLabel(configured);

  // One-shot flash on a countdown segment, green for an increase and red
  // for a decrease. Tied to the tokens applyAdjustment bumps, so it fires
  // only when that field's edit applies rather than on every render.
  const isHoursFlashing = useFlashOnToken(hoursFlash.token);
  const isMinutesFlashing = useFlashOnToken(minutesFlash.token);
  const isSecondsFlashing = useFlashOnToken(secondsFlash.token);
  const flashTextClass = (isFlashing: boolean, direction: 'inc' | 'dec') =>
    isFlashing ? (direction === 'inc' ? 'animate-increaseFlashText' : 'animate-decreaseFlashText') : '';

  // Pausing mid-overtime stays plain black whatever repeat says, since the
  // digits take that cue over immediately with redWave. Above zero it's
  // infinite yellow with repeat on, three cycles with it off.
  const pauseFlashClass = seconds < 0 ? 'bg-black' : isAlarmLooping ? 'animate-pauseFlash' : 'animate-pauseFlashLimited';

  // Full at the configured time, empty at zero and through overtime, its
  // left edge receding as the hue sweeps green (120) to red (0).
  const configuredMs = configuredTotalSeconds * 1000;
  const remainingMs = Math.max(0, seconds * 1000 + milliseconds);
  const timeFraction = configuredMs > 0 ? Math.min(1, remainingMs / configuredMs) : 0;
  // What the HOURS/MINUTES/SECONDS fields show: the time left while a run
  // is on the clock, the configured time otherwise. Clamped at zero rather
  // than following the count-up, since these three boxes are unsigned and
  // the digits above already carry the overtime.
  const fieldParts = signedParts(isLiveRun ? seconds : configuredTotalSeconds);
  // Remaining past the end of the bar, which an edit to those fields can
  // do now that they move the run without moving its total. There's no
  // honest fill for "more than full", so the track waves green until the
  // countdown comes back into range and the drain picks up from there.
  const isOverBar = configuredMs > 0 && remainingMs > configuredMs;
  // Pausing mid-overtime would otherwise leave the bar at 0% and
  // invisible, so it stays full and red instead.
  const isPausedOvertime = isPaused && seconds < 0;
  // Full red whenever the digits are in a red state: ringing, paused
  // mid-overtime, or a finished finite ring while still running. That last
  // one has no timeFraction left to show and would sit at 0% while the
  // digits beside it were solid red.
  const isBarRedState = isAlarmRinging || hasRungOut || isPausedOvertime;
  // Red wins over the hue; animate-alarmFlashBar then alternates it with
  // black. Grey while never started.
  const barFillColor = isBarRedState ? '#ef4444' : isRunning ? `hsl(${120 * timeFraction}, 75%, 50%)` : '#6b7280';

  // Shared by the main column's bar and the compact copy in the word
  // counter's fullscreen row. Same hover and seek behaviour; the copy sits
  // near the top of the screen, so its tooltip goes below the track.
  // The digits are held back by width, not height — they run out of column
  // long before they run out of room above and below, so what the column
  // is worth is the whole question.
  //
  // It used to be guessed at from the viewport, one vw clamp for a window
  // with the sidebar and the panel showing and a wider one for a window
  // with neither. Both were guesses about room the row already knew, and
  // both were low: the column grows into the row's leftover now, so the
  // sidebar and the panel take their share first and the digits get every
  // pixel neither one is using, at any width and in any tuck state. This
  // is the only cap left, and it's here so an ultrawide gets a readout
  // rather than a billboard.
  //
  // The digits' width limit is that column rather than a slice of the
  // window: the widest readout, "-99:59:58·00", measures 5.5x its own
  // font-size, and the block's padding takes another 16px at the narrow
  // end, so what fits is (100cqi - 16px) / 5.5. That comes to 17.2cqi on
  // the narrowest window and 17.9 on the widest, since the 16px is a
  // fixed cost against a growing column; 17 is the flat figure that holds
  // at both ends. The vw guesses it replaces were set to the narrowest
  // window's ratio and so never bound anywhere else, which left the height
  // term free to size digits wider than the column they sit in.
  const timerColumnMaxWidth = '80rem';
  const digitWidthLimit = '17cqi';
  const digitCeiling = '20rem';

  // Height is a slice of the digit size, so the bar tracks the digits
  // rather than the window. Letting it absorb the column's leftover height
  // instead just traded a gap for an empty panel.
  const renderDrainBar = (width: string, tooltipBelow: boolean = false) => (
    <div
      className={`relative flex justify-end border-2 flex-shrink-0 ${tooltipBelow ? '' : 'mx-auto'} ${configuredTotalSeconds > 0 ? 'cursor-pointer' : ''}`}
      style={{
        height: '0.16em',
        minHeight: '0.5rem',
        marginTop: tooltipBelow ? 0 : '0.08em',
        width,
        borderColor: isRunning ? 'var(--app-ink)' : '#6b7280',
      }}
      onMouseMove={(e) => {
        if (configuredTotalSeconds > 0) setBarHover(barPointSeconds(e));
      }}
      onMouseLeave={() => setBarHover(null)}
      onClick={(e) => {
        if (configuredTotalSeconds > 0) requestSeek(barPointSeconds(e).seconds);
      }}
    >
      {barHover !== null && (
        <div
          className="absolute bg-black border-2 border-white text-white font-bold pointer-events-none whitespace-nowrap z-10"
          style={{
            left: `${barHover.x}px`,
            ...(tooltipBelow
              ? { top: '100%', transform: 'translate(-50%, 0.25rem)' }
              : { bottom: '100%', transform: 'translate(-50%, -0.25rem)' }),
            fontSize: 'clamp(0.65rem, 1.2vw, 0.8rem)',
            letterSpacing: '0.05em',
            padding: '0.125rem 0.375rem',
          }}
        >
          {formatEntryLabel(fromTotalSeconds(barHover.seconds))}
        </div>
      )}
      {/* The animation's background-color wins over the inline hue. Every
          bar animation runs out of step with the window's own flash so the
          bar stays visible against it: paused alternates yellow at a
          quarter of the window's rate, a red bar only flashes while
          actually ringing or paused mid-overtime with repeat on, and the
          over-range wave is a green sweep along a full track — a fill that
          can't say how full it is, saying that instead. */}
      <div
        className={
          isOverBar ? 'animate-waveGreenBar'
            : isAlarmRinging || (isPausedOvertime && isAlarmLooping) ? 'animate-alarmFlashBar'
              : isPaused && !isPausedOvertime ? 'animate-pauseFlashBar'
                : ''
        }
        style={{
          width: `${(isBarRedState || isOverBar ? 1 : timeFraction) * 100}%`,
          height: '100%',
          backgroundColor: barFillColor,
        }}
      />
      {barHover !== null && (
        <div
          className="absolute bg-white pointer-events-none z-10"
          style={{
            left: `${barHover.x}px`,
            top: 0,
            bottom: 0,
            width: '2px',
            transform: 'translateX(-50%)',
          }}
        />
      )}
    </div>
  );

  // The window carries the state colour: running flashes green and fades
  // to black over 5s, after which the text glows that same green; paused
  // flashes yellow; overtime pulses red with the beeps and stays black
  // while silent. Text sitting on the window sets --glow-from so it fades
  // black to white in step, while the digits hold white through it. The
  // A/B swap on runCycle restarts both fades when a fresh countdown starts
  // on an already-green window.
  const isWindowGreen = isRunning && !isPaused && seconds >= 0;
  const fadeSuffix = runCycle % 2 === 0 ? 'A' : 'B';
  const runFadeClass = `animate-runFade${fadeSuffix}`;
  const glowFadeClass = `animate-glowFade${fadeSuffix}`;
  const textGlowStyle = { '--glow-from': 'var(--app-surface)' } as React.CSSProperties;

  // A reloaded overtime timer isn't ringing; the keys act on the timer.
  const hintSubject = isRunning && seconds < 0 ? 'alarm' : 'timer';
  const hints = [
    { text: `Press ENTER to ${isRunning ? (isPaused ? 'RESUME' : 'PAUSE') : 'START'} the ${hintSubject}`, disabled: false },
    { text: `Press R to RESET the ${hintSubject}`, disabled: isIdleAtConfigured },
    { text: `Press S to STOP the ${hintSubject}`, disabled: isIdleAtConfigured },
  ];
  // A line each. Joined onto one row they wrapped wherever the width ran
  // out, which put a key and its description on different lines and left
  // the separators marking nothing. Blocks, not flex items, so the three
  // stack with no gap between them and cost only their own line boxes.
  const hintLines = hints.map(({ text, disabled }) =>
    isWordCounterFocused ? `${text} — disabled while typing` : disabled ? `${text} — disabled` : text
  );
  const hintsDisplay = (
    <div
      className={`opacity-75 tracking-wider text-center mt-1 ${isWindowGreen && !isWordCounterFocused ? glowFadeClass : ''}`}
      style={{
        // Smaller than it was, since it's three lines now rather than one
        // wrapping row, and all three of them come off the digits.
        fontSize: shrinkClamp(0.45, 0.85, 0.95, 0.6),
        color: isWordCounterFocused ? '#ef4444' : 'var(--app-ink)',
        ...textGlowStyle,
      }}
    >
      {hintLines.map((line, i) => (
        <div key={i} className="whitespace-nowrap leading-tight">{line}</div>
      ))}
    </div>
  );

  // Which digit colour applies. Pausing in overtime shows the red wave at
  // once, without waiting for the window flash to settle the way the
  // yellow wave does, and it wins whether or not the ring ever finished.
  // Green, white and both waves animate themselves, so only solid red
  // needs the driven fade below.
  const digitColorCategory: 'green' | 'yellowWave' | 'redWave' | 'red' | 'white' =
    isPaused && seconds < 0 ? 'redWave'
      : isPaused && hasPausedSettled ? 'yellowWave'
      : hasRungOut ? 'red'
      : isWindowGreen ? 'green'
      : 'white';
  const digitWaveClass = digitColorCategory === 'yellowWave' ? 'animate-waveYellowText' : digitColorCategory === 'redWave' ? 'animate-waveRedText' : '';
  // Routes a switch into solid red through an instant white, so the fade
  // never cross-blends out of green. White and both waves already read as
  // neutral and can fade straight to red.
  const [digitColorStyle, setDigitColorStyle] = useState<{ color?: string; transition: string }>({ transition: 'color 0s' });
  const prevDigitColorCategoryRef = useRef(digitColorCategory);
  useEffect(() => {
    if (digitColorCategory === prevDigitColorCategoryRef.current) return;
    const prevCategory = prevDigitColorCategoryRef.current;
    prevDigitColorCategoryRef.current = digitColorCategory;

    if (digitColorCategory !== 'red') {
      setDigitColorStyle({ transition: 'color 0s' });
      return;
    }

    if (prevCategory === 'white' || prevCategory === 'yellowWave' || prevCategory === 'redWave') {
      setDigitColorStyle({ color: '#ef4444', transition: 'color 2.5s ease' });
    } else {
      setDigitColorStyle({ color: 'var(--app-ink)', transition: 'color 0s' });
      const id = setTimeout(() => setDigitColorStyle({ color: '#ef4444', transition: 'color 2.5s ease' }), 0);
      return () => clearTimeout(id);
    }
  }, [digitColorCategory]);

  const status = seconds < 0
    ? (isPaused ? 'PAUSED' : 'FINISHED')
    : isRunning
      ? (isPaused ? 'PAUSED' : 'RUNNING')
      : (seconds === configuredTotalSeconds ? 'READY' : 'STOPPED');

  // Sized against the digits column they sit in (fitClamp, so cqi) rather
  // than the viewport. On min(vw, vh) the vh term binds on any landscape
  // window, so narrowing it left these three at a fixed size until the
  // window was narrower than it was tall, and then dropped them straight
  // onto their floor. Against the column they give way steadily as it
  // does.
  //
  // The coefficients give way faster than the digits do, so these read as
  // controls beside the readout rather than competing with it: a fifth of
  // the digit size on a roomy window where they were closer to a quarter.
  // Three of them plus two gaps have to fit 100cqi, which 13 x 3 leaves
  // room to spare on, and the floors are what stop the shrinking — at the
  // narrow end the widest label, RESUME, still sits in a box ~38px tall,
  // which is a thumb's worth.
  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: `${boxClamp(0.3, 1.5, 3.7, 0.85)} ${fitClamp(0.45, 2.8, 1.7)}`,
    fontSize: boxClamp(0.7, 2.2, 5.5, 1.4),
    borderColor: color,
    color,
    // A surface-coloured chip keeps the borders readable on the coloured
    // window behind them.
    backgroundColor: 'var(--app-surface)',
    // width, not minWidth: with a minimum, RESUME — the one six-letter
    // label — outgrew it and came out wider than the four beside it, and
    // the row shifted as START became it. A fixed width makes every button
    // the same box whatever it says. Solved against the widest label
    // rather than picked: RESUME is 3.6em of this monospace, and the box
    // has to hold that plus both paddings and the 8px border at the size
    // each of them tops out at.
    width: fitClamp(5.25, 18, 9.25),
  });
  // The same buttons scaled to a single header row, for the word counter's
  // fullscreen view, which covers the real ones.
  const compactControlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    height: HEADER_BUTTON_SIZE.height,
    padding: `0 ${shrinkClamp(0.5, 1, 1.1, 0.75)}`,
    fontSize: shrinkClamp(0.6, 1.3, 1.4, 0.9),
    borderColor: color,
    color,
    backgroundColor: 'var(--app-surface)',
  });
  // Mute and alarm-repeat, shared between their floating spot in the
  // top-left corner and the word counter's fullscreen row, which needs
  // them inline because it covers that corner.
  const speakerButton = (
    <div className="relative group">
      <button
        onClick={(e) => {
          // Touch devices have no hover, so focus is what keeps the volume
          // popup open (group-focus-within) long enough to reach it.
          e.currentTarget.focus();
          handleMuteToggle();
        }}
        className="flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
        style={{
          ...HEADER_BUTTON_SIZE,
          // Red for muted, matching the slash inside; grey for a slider at
          // 0, which is silent but not switched off; green otherwise.
          borderColor: isSilentMode ? '#ef4444' : volume === 0 ? 'var(--app-ink)' : '#22c55e',
          backgroundColor: 'var(--app-surface)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}
        // A slider at 0 says so, and says which control moves it: the
        // button can't, so offering "click to unmute" there would be a
        // button promising something it doesn't do.
        title={isSilentMode
          ? 'Muted — click to unmute'
          : volume === 0
            ? 'Volume is 0% — raise the slider to hear the alarm'
            : 'Click to mute'}
        aria-label={isSilentMode ? 'Unmute' : 'Mute'}
      >
        <SpeakerIcon volume={volume} muted={isSilentMode} color={isSilentMode ? '#ef4444' : volume === 0 ? 'var(--app-ink)' : '#22c55e'} />
      </button>

      {/* Volume slider: revealed on hover/focus; releasing it previews
          the chosen level with a single alarm burst. The gap next to
          the button is padding (not margin) so the pointer can cross
          it without leaving the hover group. */}
      <div className="absolute left-full top-0 h-full pl-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 z-50 flex items-center">
        <div className="border-3 border-white bg-black p-2 flex items-center gap-2 h-full">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            onPointerUp={(e) => playVolumePreview(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => {
              if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key === 'PageUp' || e.key === 'PageDown') {
                playVolumePreview(Number((e.target as HTMLInputElement).value));
              }
            }}
            className="block"
            style={{ width: '6rem', accentColor: isSilentMode ? 'var(--app-ink)' : '#22c55e' }}
            aria-label="Volume"
            title={`Volume: ${Math.round(volume * 100)}%`}
          />
          {/* The title above says this on hover, but a tooltip over a
              control you're already hovering is easy to miss. */}
          <span
            className="text-white font-bold flex-shrink-0"
            style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: shrinkClamp(0.6, 1, 1.1, 0.75), minWidth: '2.75em', textAlign: 'right' }}
          >
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
  const ringerButton = (
    <button
      onClick={() => setIsAlarmLooping((prev: boolean) => !prev)}
      className="relative flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80 flex-shrink-0"
      style={{
        ...HEADER_BUTTON_SIZE,
        borderColor: isAlarmLooping ? '#22c55e' : 'var(--app-ink)',
        backgroundColor: 'var(--app-surface)',
      }}
      title={isAlarmLooping ? 'Alarm repeats until stopped — click to ring a single burst instead' : 'Alarm rings a single burst then stays quiet — click to repeat until stopped'}
      aria-label={isAlarmLooping ? 'Disable alarm repeat' : 'Enable alarm repeat'}
    >
      {/* The bell is the main icon, since this is about the alarm rather
          than being a generic loop toggle. Repeat sits inside the bell's
          body as a badge for the setting itself. */}
      <Bell
        color={isAlarmLooping ? '#22c55e' : 'var(--app-ink)'}
        style={RINGER_BELL_SIZE}
      />
      <Repeat
        aria-hidden
        color={isAlarmLooping ? '#22c55e' : 'var(--app-ink)'}
        fill="var(--app-surface)"
        className="absolute"
        style={{
          width: shrinkClamp(0.7, 1.6, 1.6, 1.1),
          height: shrinkClamp(0.7, 1.6, 1.6, 1.1),
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </button>
  );
  // The tip only rides along in the buttons' normal spot; the word
  // counter's fullscreen row is too crowded to explain its controls as
  // well as show them.
  const ringerAndSpeakerCluster = (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        {ringerButton}
        {speakerButton}
      </div>
      {/* A visible label rather than another tooltip, so the stopwatch
          trick is discoverable without hovering the right button first.
          Drops out below sm, where this row is the least essential thing
          on a cramped window and never wraps.
          width 0 + minWidth 100% makes this exactly as wide as the buttons
          above without contributing to how the fit-content parent measures
          itself; a plain width: 100% would size that parent to this
          paragraph instead. */}
      <p
        className="alarm-tip hidden sm:block opacity-75 font-bold text-white text-left"
        style={{ fontSize: shrinkClamp(0.4, 0.8, 0.85, 0.5), width: 0, minWidth: '100%', lineHeight: 1.25 }}
      >
        Tip: mute the volume or turn off repeat to silence the alarm — OFF + start at 00:00:00 = count-up stopwatch
      </p>
    </div>
  );
  // The wall clock, in two sizes: full above the digits, compact in the
  // word counter's fullscreen row. Everything inside it is em-based, so
  // the font size is the only thing that differs. See ClockCluster.tsx.
  const renderClockCluster = (fontSize: string) => (
    <ClockCluster
      fontSize={fontSize}
      timeZone={timeZone}
      is24Hour={is24Hour}
      zoneOffsets={zoneOffsets}
      isHourFormatFlashing={isHourFormatFlashing}
      onHourFormatClick={handleHourFormatClick}
      onTimeZoneChange={setTimeZone}
    />
  );
  const websiteLinkButton = (
    // Centred in a band whose two ends are the floating header corners,
    // so the gap closes from both sides as the window narrows, and the
    // corners stop shrinking first because their controls bottom out on
    // rem floors. This stays on one line throughout: it gets narrower
    // instead, and below md it drops out entirely rather than wrapping.
    // The gap between two HEADER_CORNER_RESERVEs at their floors is about
    // 7rem there, which is this label at its smallest legible size.
    <div className="relative z-[70] hidden md:flex items-center gap-1.5 flex-shrink-0">
      <button
        onClick={handleHideWebsiteLinkClick}
        className="flex items-center justify-center border-3 border-white text-white hover:opacity-80 transition-all duration-200 flex-shrink-0"
        style={{ width: shrinkClamp(1.4, 2, 2.2, 1.8), height: shrinkClamp(1.4, 2, 2.2, 1.8), backgroundColor: 'var(--app-surface)' }}
        title="Hide this link — stays hidden until you reset the website to defaults"
        aria-label="Hide website link"
      >
        <X style={{ width: shrinkClamp(0.8, 1.3, 1.4, 1.1), height: shrinkClamp(0.8, 1.3, 1.4, 1.1) }} />
      </button>
      <a
        href="https://ruinan-ding.com/"
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 font-bold text-black bg-[#FF80BF] border-3 border-white px-2.5 py-0.5 sm:px-3 sm:py-1 whitespace-nowrap hover:scale-105 hover:opacity-90 transition-all duration-200 ${!isPaused && !isAlarmRinging ? 'animate-linkGlow' : ''}`}
        // Whichever is smaller: the size it wants, or the size that fits
        // between the two header corners. The label plus its icon and
        // padding runs about 15 characters of this monospace font, i.e.
        // ~9em, so that's what the gap has to divide by.
        style={{
          fontSize: `min(${shrinkClamp(0.7, 1.6, 2.2, 1.1)}, calc((100vw - 2 * ${HEADER_CORNER_RESERVE}) / 9))`,
          fontFamily: "'IBM Plex Mono', monospace",
        }}
      >
        {/* em, so it shrinks with the label. Its own clamp would have kept
            the icon full size while the text shrank around it. */}
        <ExternalLink style={{ width: '1em', height: '1em' }} />
        Check Out My Website!
      </a>
    </div>
  );
  // "remaining / total" for the word counter's fullscreen header, which
  // covers the real digits. Built from the same formatTime output, so
  // hours and milliseconds show exactly as they do there; the shorter
  // configuredLabel style would hide real precision on a ticking value.
  const wordCounterTimerDigits = (
    <span
      className="font-bold flex-shrink-0"
      style={{
        fontFamily: "'IBM Plex Mono', monospace",
        fontSize: shrinkClamp(0.7, 1.5, 1.6, 1),
        color: seconds < 0 ? '#ef4444' : 'var(--app-ink)',
      }}
    >
      {remaining.sign}{remaining.hours && `${remaining.hours}:`}{remaining.minutes}:{remaining.seconds}·{remaining.ms}
      {' '}<span className="opacity-60">/ {configuredLabel}</span>
    </span>
  );
  // The HOURS/MINUTES/SECONDS panel, or the arrow that brings it back.
  // Hoisted out of the JSX to keep the row's markup readable; it has
  // exactly one slot, in that row.
  const timeFieldsPanel = isTimeFieldsHidden ? (
    // No arrow while auto-tucked: there's still no room, so it would
    // bounce straight back on the next check() and read as a dead button.
    // It returns on its own when the panel does.
    !isTimeFieldsAutoTucked && (
      <HeaderToggleButton
        onClick={() => {
          tuckedNeedsRef.current = null;
          setIsTimeFieldsAutoTucked(false);
          setIsTimeFieldsHidden(false);
        }}
        className="sm:self-start"
        style={isRowLayout ? TIME_FIELDS_TOP_MARGIN : undefined}
        icon={<ChevronsLeft style={HEADER_ICON_SIZE} />}
        label="Show hours/minutes/seconds"
      />
    )
  ) : (
    // items-start puts the hide button flush against the box's top-left
    // corner rather than centred on its height, and the top margin pins
    // that corner below the header buttons so toggling never shifts it.
    //
    // min-w-min rather than flex-shrink-0: the 3-across form needs ~526px
    // where the panel gets ~349 at 1024, and only fits because the box can
    // shrink until its grid tracks reach min-content and each field wraps.
    // min-w-min specifically, because index.css's blanket
    // `.flex { min-width: 0 }` overrides the automatic minimum and would
    // let it crush past min-content instead of wrapping.
    <div
      ref={timeFieldsRef}
      className="flex items-start min-w-min sm:self-start"
      style={isRowLayout ? TIME_FIELDS_TOP_MARGIN : undefined}
    >
      <HeaderToggleButton
        onClick={() => {
          tuckedNeedsRef.current = null;
          setIsTimeFieldsAutoTucked(false);
          setIsTimeFieldsHidden(true);
        }}
        icon={<ChevronsRight style={HEADER_ICON_SIZE} />}
        label="Hide hours/minutes/seconds"
      />
      {/* Padding and gap on shrinkClamp rather than Tailwind's sm:/md:
          steps, which jump at fixed breakpoints and leave most of this
          box's footprint rigid until the auto-tuck gives up on it.
          time-fields-box is the hook for the 3-across form: the container
          query in index.css turns this flex-col into a 3-column grid once
          the row is too short for a vertical stack. */}
      <div
        className="border-4 border-white bg-black flex flex-col w-fit time-fields-box"
        style={{ padding: shrinkClamp(0.25, 0.7, 0.8, 0.75), gap: shrinkClamp(0.25, 0.5, 0.55, 0.5) }}
      >
        <TimeField label="HOURS" placeholder="HH" value={fieldParts.hours} negative={fieldParts.signUnit === 'hours'} unitSeconds={3600} stacked={isTimeFieldsStacked} onRequestChange={handleHoursChange} onStepTotal={handleStepTotal} onToggleSign={handleToggleSign} />
        <TimeField label="MINUTES" placeholder="MM" value={fieldParts.minutes} negative={fieldParts.signUnit === 'minutes'} unitSeconds={60} stacked={isTimeFieldsStacked} onRequestChange={handleMinutesChange} onStepTotal={handleStepTotal} onToggleSign={handleToggleSign} />
        <TimeField label="SECONDS" placeholder="SS" value={fieldParts.seconds} negative={fieldParts.signUnit === 'seconds'} unitSeconds={1} stacked={isTimeFieldsStacked} onRequestChange={handleSecondsChange} onStepTotal={handleStepTotal} onToggleSign={handleToggleSign} />
      </div>
    </div>
  );

  // Shared by the in-column button row and the compact fullscreen copy.
  // Same logic either way, different size and border weight.
  const renderControlButtons = (buttonStyle: (color: string) => React.CSSProperties, borderClass: string) => (
    <>
      {!isRunning && (
        <button
          onClick={handleStart}
          className={`${borderClass} font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
          style={buttonStyle('#22c55e')}
        >
          START
        </button>
      )}

      {isRunning && (
        <button
          onClick={togglePause}
          className={`${borderClass} font-bold hover:opacity-80 transition-all duration-200`}
          style={buttonStyle(isPaused ? '#22c55e' : '#eab308')}
        >
          {isPaused ? 'RESUME' : 'PAUSE'}
        </button>
      )}

      <button
        onClick={handleResetClick}
        disabled={isIdleAtConfigured}
        className={`${borderClass} font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        style={buttonStyle('#eab308')}
      >
        RESET
      </button>

      <button
        onClick={handleStopClick}
        disabled={isIdleAtConfigured}
        className={`${borderClass} font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed`}
        style={buttonStyle('#ef4444')}
      >
        STOP
      </button>
    </>
  );

  return (
    <div
      ref={windowRef}
      className={`h-dvh flex overflow-hidden ${isAlarmRinging ? '' : 'transition-colors duration-200'} ${
        seconds < 0
          ? isPaused
            ? pauseFlashClass
            // Red only while a beep is actually sounding, so silent
            // overtime stays black and the flashing always matches the
            // audio. The colour snaps, with no transition, to keep the
            // pulses crisp.
            : isBeepFlash
              ? 'bg-red-500'
              : 'bg-black'
          : isRunning
            ? isPaused
              ? pauseFlashClass
              : runFadeClass
            : 'bg-black'
      }`}
    >
      {/* sm+ only, with no mobile drawer, so it never pops up over the
          timer on a narrow window. The word counter's fullscreen view
          (z-[60], nothing here) covers it deliberately. */}
      {!isSidebarHidden && (
        // A computed width rather than w-fit: the content changes
        // constantly, since every started timer appends a history row, and
        // one long entry among the short ones resized this column and
        // shifted the timer beside it mid-use. SIDEBAR_WIDTH fits the
        // longest row that can ever appear, so the labels still set the
        // size, once, instead of on every list change.
        //
        // One scroll region for both panels, not one each. Scrolling
        // separately meant sizing separately: history took the leftover
        // height and presets got what was left, which put a handful of
        // presets in a two-row box with its own bar. Out here each list is
        // simply as tall as it is, and the gutter SIDEBAR_WIDTH budgets
        // for is held open once.
        <div
          className="hidden sm:flex bg-black border-r-4 border-white flex-col overflow-y-auto overflow-x-hidden flex-shrink-0"
          style={{ width: SIDEBAR_WIDTH, padding: SIDEBAR_PADDING, gap: SIDEBAR_PADDING, scrollbarGutter: 'stable' }}
        >
          <PresetsPanel
            presets={presets}
            onAdd={handleAddPreset}
            onRequestRemove={handleRequestRemovePreset}
            onRemove={handleRemovePreset}
            removingId={removingPresetId}
            onRequestCorrect={handleRequestPresetCorrection}
            onClear={handleRequestClearPresets}
            correction={presetCorrection}
            onCorrectionApplied={handlePresetCorrectionApplied}
            onSelect={handleSelectEntry}
            inserted={insertedPreset}
            loaded={loadedEntry}
            duplicate={duplicatePreset}
          />
          <HistoryPanel
            history={history}
            onSelect={handleSelectEntry}
            onRemove={handleRemoveHistoryEntry}
            onClear={handleRequestClearHistory}
            inserted={insertedHistory}
            loaded={loadedEntry}
            formatStamp={formatHistoryStamp}

          />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center p-2 sm:p-3 md:p-4 gap-2 overflow-hidden min-h-0 relative">
        {/* Hidden during word counter fullscreen, which carries its own
            copies of these controls inline, so they relocate rather than
            being duplicated.
            z-[80], one above the right-hand strip and the website link:
            the volume popup swings right out of the speaker into the
            link's space, and on a tie the link won by being later in the
            DOM. Nothing here overlaps the right strip. */}
        {!isWordCounterFullscreen && (
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-[80] flex items-start gap-2">
          {/* The sidebar is force-hidden below sm whatever isSidebarHidden
              says, so this toggle matches its breakpoint and only appears
              when there's a panel for it to control. */}
          <HeaderToggleButton
            onClick={() => setIsSidebarHidden((prev) => !prev)}
            icon={isSidebarHidden ? <ChevronsRight style={HEADER_ICON_SIZE} /> : <ChevronsLeft style={HEADER_ICON_SIZE} />}
            label={isSidebarHidden ? 'Show presets & history' : 'Hide presets & history'}
            className="hidden sm:flex"
          />
          {ringerAndSpeakerCluster}
        </div>
        )}

        {/* Measured rather than estimated; see headerCornerRef. */}
        <div ref={headerCornerRef} className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-[70] flex items-center gap-2">

          {/* Sun while dark, showing what clicking gets you. */}
          <HeaderToggleButton
            onClick={() => setIsLightTheme((prev) => !prev)}
            icon={isLightTheme ? <Moon style={HEADER_ICON_SIZE} /> : <Sun style={HEADER_ICON_SIZE} />}
            label={isLightTheme ? 'Switch to the dark theme' : 'Switch to the light theme'}
          />

          <button
            // Turning confirmations off is the one switch that changes
            // what every other click does, so it asks. Through askThenRun
            // like the rest, so its own "don't ask this again" is
            // honoured. Not circular: askThenRun's skipConfirmations check
            // can't fire here, since this branch only runs while they're
            // still on. Turning them back on never asks.
            onClick={() => {
              if (skipConfirmations) {
                setSkipConfirmations(false);
              } else {
                askThenRun({ type: 'skipConfirmations' }, () => setSkipConfirmations(true));
              }
            }}
            aria-pressed={!skipConfirmations}
            // Wordless, like the rest of this corner: a label here made it
            // the widest control by a distance, and this corner is what
            // the website link and the fullscreen row keep clear of. The
            // tooltip says what it means, the box says whether it's on.
            className="flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80 flex-shrink-0"
            style={{
              ...HEADER_BUTTON_SIZE,
              borderColor: skipConfirmations ? '#6b7280' : 'var(--app-ink)',
              color: skipConfirmations ? '#6b7280' : 'var(--app-ink)',
              backgroundColor: 'var(--app-surface)',
            }}
            title={skipConfirmations
              ? 'Confirmation dialogs are off — actions apply immediately (the RESET button still always asks). Click to turn confirmations back on'
              : 'Confirmation dialogs are on — actions ask before applying (the RESET button always asks either way). Click to skip them'}
            aria-label={skipConfirmations ? 'Turn confirmation dialogs back on' : 'Turn confirmation dialogs off'}
          >
            <DotCheckbox checked={!skipConfirmations} fontSize={HEADER_ICON_SIZE.width} />
          </button>

          {/* Resets the whole site. Asks even with confirmations off. */}
          <button
            onClick={() => setDialog({ type: 'clearCache' })}
            className="flex items-center justify-center border-3 border-red-500 text-red-500 transition-all duration-200 hover:opacity-80 flex-shrink-0"
            style={{ ...HEADER_BUTTON_SIZE, backgroundColor: 'var(--app-surface)' }}
            title="Reset the website to defaults"
            aria-label="Reset the website to defaults"
          >
            <Trash2 style={HEADER_ICON_SIZE} />
          </button>
        </div>

        {/* alignItems: 'safe center' falls back to start-alignment rather
            than clipping an overflowing item somewhere scrolling can't
            reach. Inline, because Tailwind's arbitrary-value class for it
            didn't generate real CSS here; the items-center class stays as
            the fallback for browsers that reject the "safe" keyword, since
            an invalid inline value is dropped rather than blanking it. */}
        {/* container-type: size makes this row queryable by height, which
            is what lets the panel inside switch to its 3-across form with
            no state, no observer, and no risk of the switch moving its own
            trigger: the row is flex-1 in both axes with an explicit
            w-full, so its box comes from its parent rather than its
            contents, which is exactly what size containment needs.
            Ungated, because that reason holds at every width, and below sm
            this is the nearest size container the digits have: their own
            box isn't one there, and what they were sizing against instead
            was a guess at half the viewport — less than half the truth
            once the word counter tucks away. */}
        <div
          ref={timerRowRef}
          className="flex flex-col sm:flex-row gap-4 sm:gap-6 w-full min-h-0 flex-1 items-center justify-start sm:justify-between overflow-hidden"
          style={{ alignItems: 'safe center', containerType: 'size', containerName: 'timer-row' }}
        >
          {/* sm:flex-1, and no spacers either side of it: the row used to
              hold two empty flex-1 divs to centre this, which at 1920 put
              180px into each while the digits were capped at a width that
              couldn't reach it. Growing into the leftover instead lands the
              column in exactly the same place — with equal spacers its
              centre is (row - panel) / 2, and taking the whole leftover
              puts it there too — while giving the digits every pixel the
              panel isn't using.
              sm-scoped because flex-1 below sm would grow this down the
              cross axis of a column row and fight max-sm:my-auto for the
              same space. */}
          {/* max-sm:my-auto rather than justify-center on the row: an auto
              margin only ever eats space that exists, so it centres this
              while there's room and collapses to 0 when there isn't,
              leaving the row's justify-start to top-align an overflow.
              Centring outright would clip the clock off the top instead,
              where nothing can scroll to it. At sm+ it would fight
              self-stretch for the same axis, hence the scope. */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 min-w-0 gap-1 w-full max-sm:my-auto sm:w-auto sm:flex-1 sm:self-stretch">
            {/* In this column rather than the absolute header strip, so
                the same items-center that centres the digits centres it,
                without fighting the header icons for space. Its font-size
                clamps on min(vw, vh), so a short window shrinks it and
                yields height to the digits, which clamp on vw alone. Pink
                so it never blends into the window's green run flash, and
                the glow is suppressed during pause and alarm so it doesn't
                compete with those. */}
            {!isWebsiteLinkHidden && !isWordCounterFullscreen && websiteLinkButton}

            {/* container-type: size turns this box's resolved height, the
                real leftover after the word counter and the link take
                their share, into a cqh unit for the digits below. vh can't
                see any of that sharing, which let the digits overflow into
                the link or force the row to scroll on short windows.
                Removing the link frees height the digits grow back into
                with no extra wiring.
                sm+ only: below it this column loses sm:self-stretch and
                takes fit-content height, so a size container would have
                nothing but its own contained (~0) content to measure
                against and would collapse the column to a sliver. The row
                above is parent-sized at every width and answers the query
                there instead. */}
            <div
              className="flex-1 flex flex-col items-center justify-center min-h-0 gap-1"
              style={isRowLayout ? { containerType: 'size', width: '100%', maxWidth: timerColumnMaxWidth } : undefined}
            >
            <div
              className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
              // Solved from measured layout rather than picked. Two pieces
              // scale with this: the digit line, whose box is exactly 1x
              // its font-size under leading-none, and the drain bar below,
              // which takes its height and its margin from the digit size
              // and measures another 0.24x. So the content is the reserve
              // below plus 1.24x font-size, and 1.29 is the margin on that.
              // Every 0.01 of margin here is ~5px of dead space above the
              // clock and below the hints on a 1080-tall window, which is
              // what it buys back.
              // Reserving 1x flat was what let the digits overflow the row
              // on a window with the sidebar and the panel both tucked,
              // where nothing else was capping them.
              //
              // The reserve isn't a constant: the siblings are themselves
              // min(vw, vh) clamps, measuring ~12.5rem on a tall window and
              // bottoming out near 8.6rem on a short one. A flat figure was
              // wrong in both directions, and since every reserved pixel
              // costs its own height in font-size, over-reserving pinned
              // the digits at their floor on windows with room to spare.
              // max(floor, vh-scaled) tracks the siblings while they scale
              // and takes over once they stop.
              //
              // The second max() is the clock's own reserve, shaped like
              // CLOCK_FONT_SIZE so it tracks the same way.
              //
              // One formula, two containers. At sm+ the nearest one is the
              // box above, which has already given the website link its
              // share; below sm that box isn't a container and the row is,
              // which comes to the same measurement, since the link is
              // hidden below md and the column holds nothing else. Same
              // siblings either way, so the same reserve covers both.
              style={{
                fontSize: `clamp(1.2rem, min(${digitWidthLimit}, calc((100cqh - max(9rem, 1.5rem + 15.9dvh) - max(2.6rem, min(4.5vw, 4.9dvh))) / 1.29)), ${digitCeiling})`,
                fontFamily: "'IBM Plex Mono', monospace",
                // Vertical and horizontal on separate clamps. They were one
                // figure, and the horizontal one is the useful one — it
                // keeps the widest readout off the column's edges, and the
                // digit width limit is set against it. Vertically the same
                // figure was 14px of nothing above the clock, on top of the
                // gap that already separates this from the website link.
                padding: `${shrinkClamp(0.1, 0.35, 0.4, 0.3)} ${shrinkClamp(0.25, 1.2, 1.3, 1)}`,
              }}
            >
              {/* Every child sets its own font-size, since this block's own
                  is the digit size. */}
              <div className="flex justify-center">{renderClockCluster(CLOCK_FONT_SIZE)}</div>
              {/* leading-none on both, here and on the digits below: the
                  gap between the configured time and the running one was
                  half-leading on two line boxes, ~0.5em of each font, and
                  at the digit size that reads as a hole rather than a
                  space. Neither line has a descender to lose — the labels
                  are digits, colons and h/m/s. */}
              <div className="opacity-60 text-center leading-none" style={{ fontSize: shrinkClamp(0.95, 2.8, 3, 2.5), letterSpacing: '0.05em' }}>
                {configuredLabel}
              </div>
              <div
                className={`flex items-baseline justify-center gap-1 leading-none ${digitWaveClass}`}
                style={digitColorStyle}
              >
                {remaining.hours && (
                  // An em margin rather than the outer gap-1, which is a
                  // flat 0.25rem however large the digits get and reads as
                  // no gap at all at the sizes this scales to.
                  <span style={{ fontSize: '0.5em', marginRight: '0.3em' }} className={flashTextClass(isHoursFlashing, hoursFlash.direction)}>
                    {remaining.sign}{remaining.hours}
                  </span>
                )}
                {/* Minutes and seconds share a gapless wrapper so they sit
                    flush as "MM:SS"; the outer gap only separates that
                    group from the hours and ms segments. */}
                <span className="flex items-baseline">
                  <span className={flashTextClass(isMinutesFlashing, minutesFlash.direction)}>{!remaining.hours && remaining.sign}{remaining.minutes}</span>
                  <span>:</span>
                  <span className={flashTextClass(isSecondsFlashing, secondsFlash.direction)}>{remaining.seconds}</span>
                </span>
                <span style={{ fontSize: '0.5em' }}>·{remaining.ms}</span>
              </div>
              {renderDrainBar('100%')}
            </div>

            {/* Gap on the column's own measure rather than a flat 8px: the
                buttons shrank onto the digits' scale, and a fixed gap at
                that size reads as three boxes stuck together. */}
            <div className="flex flex-shrink-0" style={{ gap: fitClamp(0.5, 2.5, 1.75) }}>
              {renderControlButtons(controlButtonStyle, 'border-4')}
            </div>

            {/* Block, not flex: a flex container picks up index.css's
                `.flex { min-height: 0 }` and, as a flex item of the column
                above, could be shrunk to zero height and vanish rather
                than wrapping once font-size has nothing left to give. */}
            <div className="text-center">
              <div
                className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
                style={{ fontSize: shrinkClamp(0.7, 1.9, 2, 1.25), ...textGlowStyle }}
              >
                {status}
              </div>

              {hintsDisplay}
            </div>
            </div>
          </div>

          {isRowLayout && timeFieldsPanel}
        </div>

        {/* WordCounter renders these six only inside its fullscreen
            branch, so while it's windowed they were built, handed over and
            thrown away. Worse than the wasted work: they're fresh objects
            every render, which is what memo() compares, so it could never
            bail out and the whole word counter reconciled on every tick.
            Null while windowed leaves the props all primitives and stable
            callbacks. Nothing renders differently, since these reach the
            DOM on the same flag either way.
            The clock and the bar also stay behind below sm. That row never
            wraps and reserves ~168px for the floating corner, which on a
            390px phone is 43% of the screen before it carries mute,
            repeat, the countdown, the bar, three buttons and a clock: it
            wanted 459px of content in 374px and clipped, taking STOP and
            the clock with it. The countdown and the controls are what
            fullscreen exists to keep in reach; the time of day and a
            progress bar aren't. The clock's flex-1 box stays either way,
            so the timer still sits on the row's midpoint. */}
        <WordCounter
          onFocusChange={setIsWordCounterFocused}
          onFullscreenChange={setIsWordCounterFullscreen}
          greenFadeTextClass={isWindowGreen ? glowFadeClass : ''}
          speakerButton={isWordCounterFullscreen ? speakerButton : null}
          ringerButton={isWordCounterFullscreen ? ringerButton : null}
          clockCluster={isWordCounterFullscreen && isRowLayout ? renderClockCluster(FULLSCREEN_CLOCK_FONT_SIZE) : null}
          headerCornerWidth={headerCornerWidth}
          timerDigits={isWordCounterFullscreen ? wordCounterTimerDigits : null}
          timerBar={isWordCounterFullscreen && isRowLayout ? renderDrainBar('clamp(3rem, 8vw, 8rem)', true) : null}
          timerControls={
            isWordCounterFullscreen ? (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {renderControlButtons(compactControlButtonStyle, 'border-2')}
              </div>
            ) : null
          }
        />
      </div>

      <ConfirmDialog
        dialog={dialog}
        onDismiss={handleDialogDismiss}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
}
