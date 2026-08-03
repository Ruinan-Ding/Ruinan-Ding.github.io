import { Bell, ChevronsLeft, ChevronsRight, ExternalLink, Moon, Repeat, Sun, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readJSON, writeJSON } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import ClockCluster from './ClockCluster';
import ConfirmDialog from './ConfirmDialog';
import DotCheckbox from './DotCheckbox';
import HeaderToggleButton from './HeaderToggleButton';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_GROUP_GAP_TICKS, ALARM_TICK_MS, ALARM_TOTAL_BURSTS, CLOCK_FONT_SIZE, DEFAULT_PRESETS, DEFAULT_TIME, DEFAULT_TIME_ZONE, DEFAULT_VOLUME, FULLSCREEN_CLOCK_FONT_SIZE, HEADER_BUTTON_SIZE, HEADER_CORNER_RESERVE, HEADER_ICON_SIZE, MAX_HISTORY, MAX_HOURS, MAX_MINUTES, MAX_PRESETS, MAX_SECONDS, MIN_TOTAL_SECONDS, SIDEBAR_PADDING, SIDEBAR_WIDTH, STORAGE_KEYS, TICK_MS, TIME_ZONES, TONES } from './constants';
import { formatEntryLabel, formatTime, fromTotalSeconds, parsePresetDigits, presetDigitsFromParts, rawPresetDigits, toTotalSeconds } from './format';
import { shrinkClamp } from './responsive';
import { isDialogSuppressed, suppressDialog } from './suppressions';
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

// Sound waves grow in as the volume rises; an X when muted.
function SpeakerIcon({ volume, muted, color }: { volume: number; muted: boolean; color: string }) {
  const wave = (threshold: number) => Math.max(0, Math.min(1, (volume - threshold) / 0.25));
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
      {muted ? (
        <>
          <line x1="14" y1="9" x2="20" y2="15" />
          <line x1="20" y1="9" x2="14" y2="15" />
        </>
      ) : (
        <>
          <path d="M12.5 9.5a3.5 3.5 0 0 1 0 5" opacity={wave(0)} />
          <path d="M15 7a7 7 0 0 1 0 10" opacity={wave(0.33)} />
          <path d="M17.5 4.5a10.5 10.5 0 0 1 0 15" opacity={wave(0.66)} />
        </>
      )}
    </svg>
  );
}

const bumpFlash = (prev: FlashTarget, id: string): FlashTarget => ({ id, token: (prev?.token ?? 0) + 1 });

// Guards both saved lists against corrupt storage. Arithmetic on a bad
// number never throws, so a non-numeric field would slip through as NaN:
// presets fall back to DEFAULT_PRESETS, history drops the row. Without
// this a bad entry renders as "abc:NaN" and, once clicked, sets the
// countdown to NaN, which it never leaves since every comparison the tick
// makes against NaN is false.
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
      history: Array.isArray(savedHistory) ? savedHistory.filter(isValidEntry) : [],
    };
  }, []);
  const savedNumber = (key: string, fallback: number) =>
    typeof initial.saved[key] === 'number' ? (initial.saved[key] as number) : fallback;
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
    // older saves packed hours into minutes
    return parsed.map((p) => ({
      ...p,
      hours: (p.hours ?? 0) + Math.floor(p.minutes / 60),
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
  const handleHourFormatClick = () => {
    setIs24Hour((prev) => !prev);
    setIsHourFormatFlashing(true);
    window.clearTimeout(hourFormatFlashRef.current);
    hourFormatFlashRef.current = window.setTimeout(() => setIsHourFormatFlashing(false), FLASH_DURATION_MS);
  };
  // Abbreviations for every zone, so the picker reads "New York (EDT)"
  // rather than leaving you to work out which of the twelve Americas
  // saying EST is yours. Needs an Intl.DateTimeFormat per zone and 418 of
  // them measured 123ms, so it waits for an idle moment after first paint.
  // Until then the list shows plain city names.
  const [zoneAbbrs, setZoneAbbrs] = useState<Record<string, string>>({});
  useEffect(() => {
    const build = () => {
      const at = Date.now();
      const abbrs: Record<string, string> = {};
      for (const zone of TIME_ZONES) {
        try {
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(at);
          const abbr = parts.find((part) => part.type === 'timeZoneName')?.value;
          if (abbr) abbrs[zone] = abbr;
        } catch {
          // a zone the engine lists but won't format: it just keeps its
          // plain city name, same as before this ran
        }
      }
      setZoneAbbrs(abbrs);
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
  const configuredTotalSeconds = toTotalSeconds(configured);
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
    window.addEventListener('pagehide', flushMilliseconds);
    window.addEventListener('beforeunload', flushMilliseconds);
    return () => {
      window.removeEventListener('pagehide', flushMilliseconds);
      window.removeEventListener('beforeunload', flushMilliseconds);
    };
  }, []);

  // Confirming with Space closes the dialog without a Radix close event,
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

  const isAlarmActive = isRunning && !isPaused && seconds < 0 && !isSilentMode;
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
        beep(...TONES.alarm);
        // Red for exactly as long as the beep sounds.
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

  // Space/S/R mirror the on-screen controls. The ref lets the keydown
  // listener register once instead of rebinding every tick.
  const keyActionRef = useRef<(code: string) => boolean>(() => false);
  keyActionRef.current = (code) => {
    // The dialog owns the keyboard while it's open.
    if (dialog.type !== null) return false;
    if (code === 'Space') {
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
      if (e.code !== 'Space' && e.code !== 'KeyS' && e.code !== 'KeyR') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (keyActionRef.current(e.code)) {
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
      // Unmuting with the slider parked at 0 restores a usable level, and
      // the confirmation tone plays at that level rather than the stale 0.
      beep(...TONES.silentToggle, volume === 0 ? DEFAULT_VOLUME : undefined);
      if (volume === 0) setVolume(DEFAULT_VOLUME);
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

  const handleStopClick = () => {
    // Asks even while ringing. Stopping doesn't only silence the alarm, it
    // throws away how far past zero the timer counted, which is the whole
    // output of a count-up run. Mute and repeat-off cover the urgent case.
    askThenRun({ type: 'stop' }, handleConfirmStop);
  };

  const handleConfirmStop = () => {
    playTone('stop');
    stopToConfigured();
    closeDialog();
  };

  const handleResetClick = () => {
    // Asks even on a finished timer, for the same reason STOP does.
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

  const loadEntry = useCallback((parts: TimeParts) => {
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setTimerSeconds(parts.seconds);
    setTime({ seconds: toTotalSeconds(parts), milliseconds: 0 });
  }, []);

  // The one switch sequence, shared by the direct path and the dialog
  // confirm. start=false loads the preset without running it.
  //
  // Memoized so handleSelectEntry can just depend on it. As a plain
  // function left out of that dependency list it was correct only because
  // the list happened to name its transitive deps, and anything added here
  // that read fresh state would have gone stale silently.
  const applySwitch = useCallback((parts: TimeParts, start: boolean) => {
    clearAlarmInterval();
    loadEntry(parts);
    setIsPaused(false);
    setIsRunning(start);
    if (start) {
      recordHistory(parts);
      restartRunFade();
      if (!isSilentMode) beep(...TONES.start);
    }
  }, [loadEntry, isSilentMode, beep]);

  const handleSelectEntry = useCallback((entry: TimerEntry) => {
    const parts: TimeParts = { hours: entry.hours ?? 0, minutes: entry.minutes, seconds: entry.seconds };
    // Flashed on the click rather than when the switch applies: simpler
    // than threading the id through the dialog, and a cancelled switch
    // leaves a harmless flash. The panels check loaded before inserted, so
    // loading a just-created entry goes green rather than staying yellow.
    setLoadedEntry((prev) => bumpFlash(prev, entry.id));
    // Every branch below runs the picked time. Picking one out of the list
    // is a request to run it, whatever the timer was doing; the only
    // difference is whether there's something to lose first.
    //
    // Already loaded and sitting at it unstarted: nothing to lose.
    if (!isRunning && timeRef.current.seconds === configuredTotalSeconds && toTotalSeconds(parts) === configuredTotalSeconds) {
      applySwitch(parts, true);
      return;
    }
    // Counting down.
    if (isRunning && !isPaused && timeRef.current.seconds >= 0) {
      askThenRun({ type: 'switch', data: parts, mode: 'switchRunning' }, () => applySwitch(parts, true));
      return;
    }
    // Paused, or stopped somewhere other than the configured time after a
    // reload. Either way there's progress on screen to discard.
    if (isPaused || (!isRunning && timeRef.current.seconds !== configuredTotalSeconds)) {
      askThenRun({ type: 'switch', data: parts, mode: 'loadOnly' }, () => applySwitch(parts, true));
      return;
    }
    // Ringing. How far past zero it counted is real elapsed time, and
    // switching discards it as thoroughly as switching mid-countdown
    // discards the time remaining.
    if (isRunning && timeRef.current.seconds < 0) {
      askThenRun({ type: 'switch', data: parts, mode: 'switchRunning' }, () => applySwitch(parts, true));
      return;
    }
    // Idle at a different time: the question is only "this one?".
    askThenRun({ type: 'switch', data: parts, mode: 'startFromIdle' }, () => applySwitch(parts, true));
  }, [isRunning, isPaused, configuredTotalSeconds, applySwitch, askThenRun]);

  const handleConfirmSwitch = (parts: TimeParts, start: boolean) => {
    applySwitch(parts, start);
    closeDialog();
  };

  // A preset list is a set of times, so adding one it already holds adds
  // nothing and flashes the existing row red instead. Returns whether
  // anything went in, so the panel knows whether to clear its input.
  //
  // Matched on the time, not the label: formatEntryLabel drops leading
  // zeroes, so 1:05 and 0:01:05 print the same and are the same preset.
  const handleAddPreset = useCallback((parts: TimeParts): boolean => {
    const existing = presets.find(
      (p) => (p.hours ?? 0) === parts.hours && p.minutes === parts.minutes && p.seconds === parts.seconds
    );
    if (existing) {
      setDuplicatePreset((prev) => bumpFlash(prev, existing.id));
      return false;
    }
    if (presets.length >= MAX_PRESETS) return false;
    const id = uniqueId();
    setPresets((prev) => [...prev, { id, ...parts, timestamp: 0 }]);
    setInsertedPreset((prev) => bumpFlash(prev, id));
    return true;
  }, [presets]);

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

  const setterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHours : unit === 'minutes' ? setMinutes : setTimerSeconds),
    []
  );

  const flashSetterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHoursFlash : unit === 'minutes' ? setMinutesFlash : setSecondsFlash),
    []
  );

  // Applies a change to one unit and restarts the countdown from the new
  // total. A running timer keeps running from the top, a paused one waits
  // there, a ringing one restarts.
  //
  // The only place a field edit lands. Applying it up front and undoing it
  // on dismiss meant the configured total changed underneath the dialog
  // still asking whether to change it. `previous` is passed in because a
  // confirmed call needs the value it changed from to pick the flash
  // direction, after `configured` has moved on.
  const applyAdjustment = useCallback((unit: TimeUnit, value: number, previous: number) => {
    setterFor(unit)(value);
    if (timeRef.current.seconds < 0) setIsPaused(false);
    restartCountdown(toTotalSeconds({ ...configured, [unit]: value }));
    // The hour digit drops out of the display at 0, so there's nothing
    // left to draw attention to.
    if (unit !== 'hours' || value > 0) {
      flashSetterFor(unit)((prev) => ({ token: prev.token + 1, direction: value >= previous ? 'inc' : 'dec' }));
    }
  }, [setterFor, flashSetterFor, configured]);

  // Changing a field asks first, once per timer state, for all three
  // fields together. An unstarted timer asks too: these fields are how the
  // timer is set up, an arrow is one misclick, and a silently changed
  // total is only noticeable if you read the digits before pressing START.
  //
  // Tracked by state kind rather than by transition, because setting a
  // timer up means touching two or three fields in a row, which is one
  // intent; and pausing to nudge a minute, resuming, then pausing to nudge
  // again is still the same question about the same paused timer.
  const requestConfiguredChange = useCallback((unit: TimeUnit, value: number) => {
    const previous = configured[unit];
    if (value === previous) return;

    const state = timerStateKind();
    if (!askedAdjustInStatesRef.current.has(state)) {
      const next: DialogState = { type: 'adjust', data: { unit, value, previous, state } };
      // Marked before asking, not after confirming: a cancelled question
      // was still asked. The dismiss handler clears it again so cancelling
      // doesn't hand the next adjustment a free pass.
      askedAdjustInStatesRef.current.add(state);
      askThenRun(next, () => {
        askedAdjustInStatesRef.current.delete(state);
        applyAdjustment(unit, value, previous);
      });
      return;
    }
    applyAdjustment(unit, value, previous);
  }, [configured, timerStateKind, applyAdjustment, askThenRun]);

  const handleHoursChange = useCallback((value: number) => requestConfiguredChange('hours', value), [requestConfiguredChange]);
  const handleMinutesChange = useCallback((value: number) => requestConfiguredChange('minutes', value), [requestConfiguredChange]);
  const handleSecondsChange = useCallback((value: number) => requestConfiguredChange('seconds', value), [requestConfiguredChange]);

  const handleConfirmAdjust = (unit: TimeUnit, value: number, previous: number) => {
    applyAdjustment(unit, value, previous);
    closeDialog();
  };

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
        // Wipe and reload, so every piece of state re-initialises.
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
        window.location.reload();
        break;
      case 'reset':
        handleConfirmReset();
        break;
      case 'switch':
        // Every mode starts the new time; they differ only in what they
        // warned about first. The skipped-dialog path runs the same
        // applySwitch through askThenRun, and the two have to agree.
        handleConfirmSwitch(dialog.data, true);
        break;
      case 'seek':
        applySeek(dialog.data.targetSeconds);
        closeDialog();
        break;
      case 'adjust':
        handleConfirmAdjust(dialog.data.unit, dialog.data.value, dialog.data.previous);
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
      case 'skipConfirmations':
        setSkipConfirmations(true);
        closeDialog();
        break;
    }
  };

  // Dismissing an 'adjust' has no edit to undo, since nothing was applied,
  // but the once-per-state prompt has to re-arm or the next adjustment in
  // that state would apply silently.
  const handleDialogDismiss = () => {
    if (!justConfirmedRef.current && dialog.type === 'adjust') {
      askedAdjustInStatesRef.current.delete(dialog.data.state);
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
      {/* The animation's background-color wins over the inline hue. Both
          bar animations run out of step with the window's own flash so the
          bar stays visible against it: paused alternates yellow at a
          quarter of the window's rate, and a red bar only flashes while
          actually ringing, or paused mid-overtime with repeat on. */}
      <div
        className={isAlarmRinging || (isPausedOvertime && isAlarmLooping) ? 'animate-alarmFlashBar' : isPaused && !isPausedOvertime ? 'animate-pauseFlashBar' : ''}
        style={{
          width: `${(isBarRedState ? 1 : timeFraction) * 100}%`,
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
    { text: `Press SPACE to ${isRunning ? (isPaused ? 'RESUME' : 'PAUSE') : 'START'} the ${hintSubject}`, disabled: false },
    { text: `Press R to RESET the ${hintSubject}`, disabled: isIdleAtConfigured },
    { text: `Press S to STOP the ${hintSubject}`, disabled: isIdleAtConfigured },
  ];
  // One row of plain text rather than a div per hint. They all share a
  // colour and glow, and three flex items cost 3x the vertical space on a
  // short window, enough to make the column scroll to reach the last one.
  const hintsText = hints
    .map(({ text, disabled }) =>
      isWordCounterFocused ? `${text} — disabled while typing` : disabled ? `${text} — disabled` : text
    )
    .join('   |   ');
  const hintsDisplay = (
    <div
      className={`opacity-75 tracking-wider text-center mt-1 ${isWindowGreen && !isWordCounterFocused ? glowFadeClass : ''}`}
      style={{
        fontSize: shrinkClamp(0.5, 1.1, 1.2, 0.75),
        color: isWordCounterFocused ? '#ef4444' : 'var(--app-ink)',
        ...textGlowStyle,
      }}
    >
      {hintsText}
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

  // Clamped on min(vw, vh) rather than vw alone, so a short window shrinks
  // these instead of the digits. The digits clamp on vw only, which is
  // what gives them priority over everything else in this column.
  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: `${shrinkClamp(0.65, 1.4, 1.5, 1.4)} ${shrinkClamp(1.3, 2.75, 3.1, 2.75)}`,
    fontSize: shrinkClamp(1, 1.95, 2.4, 1.65),
    borderColor: color,
    color,
    // A surface-coloured chip keeps the borders readable on the coloured
    // window behind them.
    backgroundColor: 'var(--app-surface)',
    minWidth: shrinkClamp(7, 16.5, 17.5, 11.25),
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
          borderColor: isSilentMode ? 'var(--app-ink)' : '#22c55e',
          backgroundColor: 'var(--app-surface)',
          fontFamily: "'IBM Plex Mono', monospace",
        }}
        title={isSilentMode ? 'Click to unmute' : 'Click to mute'}
        aria-label={isSilentMode ? 'Unmute' : 'Mute'}
      >
        <SpeakerIcon volume={volume} muted={isSilentMode} color={isSilentMode ? 'var(--app-ink)' : '#22c55e'} />
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
        className="hidden sm:block opacity-75 font-bold text-white text-left"
        style={{ fontSize: shrinkClamp(0.45, 0.95, 1, 0.6), width: 0, minWidth: '100%', lineHeight: 1.25 }}
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
      zoneAbbrs={zoneAbbrs}
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
        href="https://ruinanding.com/"
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
        <TimeField label="HOURS" placeholder="HH" value={hours} max={MAX_HOURS} stacked={isTimeFieldsStacked} onRequestChange={handleHoursChange} />
        <TimeField label="MINUTES" placeholder="MM" value={minutes} max={MAX_MINUTES} stacked={isTimeFieldsStacked} onRequestChange={handleMinutesChange} />
        <TimeField label="SECONDS" placeholder="SS" value={timerSeconds} max={MAX_SECONDS} stacked={isTimeFieldsStacked} onRequestChange={handleSecondsChange} />
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
      className={`h-screen flex overflow-hidden ${isAlarmRinging ? '' : 'transition-colors duration-200'} ${
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
            contents, which is exactly what size containment needs. Gated
            to sm, the only range the panel is rendered in anyway. */}
        <div
          ref={timerRowRef}
          className="flex flex-col sm:flex-row gap-4 sm:gap-2 w-full min-h-0 flex-1 items-center justify-start sm:justify-between overflow-hidden"
          style={isRowLayout
            ? { alignItems: 'safe center', containerType: 'size', containerName: 'timer-row' }
            : { alignItems: 'safe center' }}
        >
          <div className="flex-1 hidden sm:block"></div>

          {/* Never shrinks at any width. Its inner box carries an explicit
              width, so letting the row shrink this column only pushed that
              box past the column's clipped edge, and the overflow
              auto-tucked the panel beside it. The panel changes form on a
              breakpoint instead, which is a third of the width rather than
              a squeezed version of the same one. */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 min-w-0 gap-1 w-full sm:w-auto sm:self-stretch">
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
                against and would collapse the column to a sliver. */}
            <div
              className="flex-1 flex flex-col items-center justify-center min-h-0 gap-1"
              style={isRowLayout ? { containerType: 'size', width: 'clamp(16rem, 40vw, 44rem)' } : undefined}
            >
            <div
              className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
              // Solved from measured layout rather than picked. This block
              // is ~2.8rem plus 1.73x its font-size (only the digit line
              // scales), and its siblings add ~7.9rem, so the container's
              // content is ~10.75rem + 1.73x font-size. Solving that for
              // font-size against 100cqh gives an exact fit.
              //
              // The reserve isn't a constant: the siblings are themselves
              // min(vw, vh) clamps, measuring ~13rem on a tall window and
              // bottoming out near 9.7rem on a short one. A flat figure was
              // wrong in both directions, and since every reserved pixel
              // costs 1.75x its height in font-size, over-reserving pinned
              // the digits at their floor on windows with room to spare.
              // max(floor, vh-scaled) tracks the siblings while they scale
              // and takes over once they stop, leaving ~10px of slack so
              // this column can't be what overflows the row.
              //
              // The second max() is the clock's own reserve, shaped like
              // CLOCK_FONT_SIZE so it tracks the same way.
              style={{
                fontSize: isRowLayout
                  ? 'clamp(1.2rem, min(10.5vw, calc((100cqh - max(10.5rem, 1.5rem + 19.5vh) - max(3rem, min(5vw, 5.4vh))) / 1.75)), 7.5rem)'
                  // No queryable container below sm, so the two
                  // measurements are replaced by estimates: the row gets
                  // about half the viewport height, and ~15rem of that goes
                  // to everything here that isn't the digit line. A vw-only
                  // clamp instead let the digits ignore height entirely and
                  // overflow a row that clips, slicing the buttons in half.
                  // On a tall narrow window the vw term wins anyway, so
                  // this costs nothing where height isn't scarce.
                  : 'clamp(1.2rem, min(10.5vw, calc((50vh - 17.6rem - max(3rem, min(5vw, 5.4vh))) / 1.75)), 7.5rem)',
                fontFamily: "'IBM Plex Mono', monospace",
                padding: shrinkClamp(0.25, 1.2, 1.3, 1),
              }}
            >
              {/* Every child sets its own font-size, since this block's own
                  is the digit size. */}
              <div className="flex justify-center">{renderClockCluster(CLOCK_FONT_SIZE)}</div>
              <div className="opacity-60 text-center" style={{ fontSize: shrinkClamp(1.1, 2.2, 2.4, 1.85), letterSpacing: '0.05em' }}>
                {configuredLabel}
              </div>
              <div
                className={`flex items-baseline justify-center gap-1 ${digitWaveClass}`}
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
              {renderDrainBar('clamp(16rem, 40vw, 44rem)')}
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {renderControlButtons(controlButtonStyle, 'border-4')}
            </div>

            {/* Block, not flex: a flex container picks up index.css's
                `.flex { min-height: 0 }` and, as a flex item of the column
                above, could be shrunk to zero height and vanish rather
                than wrapping once font-size has nothing left to give. */}
            <div className="text-center">
              <div
                className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
                style={{ fontSize: shrinkClamp(0.85, 2.1, 2.2, 1.4), ...textGlowStyle }}
              >
                {status}
              </div>

              {hintsDisplay}
            </div>
            </div>
          </div>

          <div className="flex-1 hidden sm:block"></div>

          {isRowLayout && timeFieldsPanel}
        </div>

        {/* WordCounter renders these six only inside its fullscreen
            branch, so while it's windowed they were built, handed over and
            thrown away. Worse than the wasted work: they're fresh objects
            every render, which is what memo() compares, so it could never
            bail out and the whole word counter reconciled on every tick.
            Null while windowed leaves the props all primitives and stable
            callbacks. Nothing renders differently, since these reach the
            DOM on the same flag either way. */}
        <WordCounter
          onFocusChange={setIsWordCounterFocused}
          onFullscreenChange={setIsWordCounterFullscreen}
          greenFadeTextClass={isWindowGreen ? glowFadeClass : ''}
          speakerButton={isWordCounterFullscreen ? speakerButton : null}
          ringerButton={isWordCounterFullscreen ? ringerButton : null}
          clockCluster={isWordCounterFullscreen ? renderClockCluster(FULLSCREEN_CLOCK_FONT_SIZE) : null}
          headerCornerWidth={headerCornerWidth}
          timerDigits={isWordCounterFullscreen ? wordCounterTimerDigits : null}
          timerBar={isWordCounterFullscreen ? renderDrainBar('clamp(3rem, 8vw, 8rem)', true) : null}
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
