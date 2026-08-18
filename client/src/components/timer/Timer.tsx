import { Bell, ChevronsLeft, ChevronsRight, ExternalLink, Moon, Repeat, Sun, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import { useLeaveGuard } from '@/hooks/useLeaveGuard';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readJSON, wipeStorage, writeJSON } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import ClockCluster from './ClockCluster';
import ConfirmDialog from './ConfirmDialog';
import DotCheckbox from './DotCheckbox';
import HeaderToggleButton from './HeaderToggleButton';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import SpeakerIcon from './SpeakerIcon';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_TICK_MS, CLOCK_FONT_SIZE, DEFAULT_TIME, DEFAULT_TIME_ZONE, DEFAULT_VOLUME, FULLSCREEN_CLOCK_FONT_SIZE, FULLSCREEN_CLOCK_FONT_SIZE_SOLO, HEADER_BUTTON_SIZE, HEADER_CORNER_RESERVE, HEADER_ICON_SIZE, MAX_HISTORY, MAX_PRESETS, MAX_TOTAL_SECONDS, MIN_TOTAL_SECONDS, SIDEBAR_PADDING, SIDEBAR_WIDTH, STORAGE_KEYS, TICK_MS, TIME_ZONES, TONES, TYPES_INTO } from './constants';
import { readSavedHistory, readSavedPresets } from './entries';
import { formatDateParts, formatEntryLabel, formatSignedLabel, formatTime, fromTotalSeconds, parsePresetDigits, presetDigitsFromParts, rawPresetDigits, signedParts, toSignedTotal, toTotalSeconds } from './format';
import { boxCap, boxClamp, fitClamp, shrinkClamp } from './responsive';
import { isAcknowledgement, isDialogSuppressed, suppressDialog } from './suppressions';
import type { DialogState, FlashTarget, TimeParts, TimerEntry, TimerStateKind, TimeUnit } from './types';
import { FLASH_DURATION_MS, useFlashOnToken } from './useFlashOnToken';
import { useAlarm } from './useAlarm';
import { useTimeFieldsTuck } from './useTimeFieldsTuck';
import { gapBetween, gapFromLeftEdge, roomInParent, useTightFit } from './useTightFit';
import { useZoneOffsets } from './useZoneOffsets';

const RINGER_BELL_SIZE = { width: shrinkClamp(1.8, 4.2, 4.2, 2.9), height: shrinkClamp(1.8, 4.2, 4.2, 2.9) };

// Clears the header buttons in the same corner. Derived from the button so
// it shrinks with them on a short window.
const TIME_FIELDS_TOP_MARGIN = { marginTop: `calc(${HEADER_BUTTON_SIZE.height} + 0.5rem)` };

const bumpFlash = (prev: FlashTarget, id: string): FlashTarget => ({ id, token: (prev?.token ?? 0) + 1 });

// Stops at the end of the range rather than wrapping. Clamped, not
// rounded: a step off a running clock lands mid-second, and rounding that
// away gives back exactly what the step gained.
const clampTotal = (total: number) => Math.max(MIN_TOTAL_SECONDS, Math.min(MAX_TOTAL_SECONDS, total));

const liveSeconds = ({ seconds, milliseconds }: { seconds: number; milliseconds: number }) =>
  seconds + milliseconds / 1000;

// What the boxes show: truncated toward zero rather than floored, so it
// agrees with formatTime past zero. Floored, -2.38s reads as -3 and a step
// up to -2 floors straight back, leaving the boxes still.
const liveShownSeconds = (time: { seconds: number; milliseconds: number }) => Math.trunc(liveSeconds(time));

// ENTER presses whatever is focused, so every activatable control claims
// it; a letter only ever gets typed. See the window listener.
const ENTER_ACTIVATES = `${TYPES_INTO}, button, a, [role="button"]`;

export default function Timer() {
  // Read before first render, so the persist effects can't save defaults
  // over it. A running timer comes back paused: the time the page spent
  // away is unknown and shouldn't count.
  const initial = useMemo(() => {
    const savedState = readJSON<unknown>(STORAGE_KEYS.timerState, null);
    return (savedState && typeof savedState === 'object' ? savedState : {}) as Record<string, unknown>;
  }, []);
  // isFinite, not typeof: JSON.parse turns an overflowing literal into
  // Infinity, which is a number, and every guard downstream compares false
  // against it, so the countdown would sit there and never move.
  const savedNumber = (key: string, fallback: number) =>
    Number.isFinite(initial[key]) ? (initial[key] as number) : fallback;
  const wasActive = initial.isRunning === true;

  // Remaining time: signed whole seconds plus milliseconds in [0, 1000)
  const [time, setTime] = useState(() => ({
    seconds: savedNumber('seconds', toTotalSeconds(DEFAULT_TIME)),
    milliseconds: savedNumber('milliseconds', 0),
  }));
  const { seconds, milliseconds } = time;
  // For callbacks that need the current time without re-memoizing every tick.
  const timeRef = useRef(time);
  timeRef.current = time;

  const [hours, setHours] = useState(() => savedNumber('hours', DEFAULT_TIME.hours));
  const [minutes, setMinutes] = useState(() => savedNumber('minutes', DEFAULT_TIME.minutes));
  const [timerSeconds, setTimerSeconds] = useState(() => savedNumber('timerSeconds', DEFAULT_TIME.seconds));

  const [isRunning, setIsRunning] = useState(wasActive);
  const [isPaused, setIsPaused] = useState(wasActive);
  // Beside the three magnitudes rather than folded into them, so older
  // saves still read back.
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

  // One-shot flashes on the list rows: yellow for a fresh insert, green
  // for a load, red for a refused duplicate. Never persisted, so a reload
  // doesn't replay them.
  const [insertedPreset, setInsertedPreset] = useState<FlashTarget>(null);
  const [duplicatePreset, setDuplicatePreset] = useState<FlashTarget>(null);
  const [insertedHistory, setInsertedHistory] = useState<FlashTarget>(null);
  const [loadedEntry, setLoadedEntry] = useState<FlashTarget>(null);
  // Bumped with a direction when a field's adjustment applies, so each
  // countdown digit flashes green or red on its own.
  const [hoursFlash, setHoursFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [minutesFlash, setMinutesFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [secondsFlash, setSecondsFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });

  // Both read before first render, so the persist effects can't save an
  // empty list over a real one. See entries.ts for what a corrupt store
  // degrades to.
  const [history, setHistory] = useState<TimerEntry[]>(readSavedHistory);
  const [presets, setPresets] = useState<TimerEntry[]>(readSavedPresets);

  const [dialog, setDialog] = useState<DialogState>({ type: null });
  const [isWordCounterFocused, setIsWordCounterFocused] = useState(false);
  const [isWordCounterFullscreen, setIsWordCounterFullscreen] = useState(false);
  // Manual hide toggles, all persisted, so a tucked-in panel stays tucked
  // in across a reload. Only the site RESET brings them back.
  const [isSidebarHidden, setIsSidebarHidden] = useState(() => readBoolean(STORAGE_KEYS.sidebarHidden, false));
  const [isWebsiteLinkHidden, setIsWebsiteLinkHidden] = useState(() => readBoolean(STORAGE_KEYS.websiteLinkHidden, false));
  // The whole theme is one attribute on <html>: index.css swaps
  // --app-surface and --app-ink off it and every colour resolves through
  // that pair. Layout effect so the attribute and its paint land together.
  const [isLightTheme, setIsLightTheme] = useState(() => readBoolean(STORAGE_KEYS.lightTheme, false));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = isLightTheme ? 'light' : 'dark';
  }, [isLightTheme]);
  // Checked against the list the browser knows before it's trusted: Intl
  // throws on an unknown zone, and on every format call, so a hand-edited
  // value takes the page down rather than showing the wrong time.
  const [timeZone, setTimeZone] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.clockTimeZone, null);
    return typeof saved === 'string' && TIME_ZONES.includes(saved) ? saved : DEFAULT_TIME_ZONE;
  });
  const [is24Hour, setIs24Hour] = useState(() => readBoolean(STORAGE_KEYS.clock24Hour, false));
  // Clicking the time switches 12/24, and "24H" or "12H" fades off it to
  // say so (hourFormatFizz in index.css). Set straight from the click
  // rather than through useFlashOnToken, which turns on a tick later and
  // would show a frame of the new time before the label announcing it.
  //
  // Here rather than in ClockCluster: both copies of the clock have to
  // agree, and it persists. The tick itself lives down there.
  const [isHourFormatFlashing, setIsHourFormatFlashing] = useState(false);
  const hourFormatFlashRef = useRef(0);
  useEffect(() => () => window.clearTimeout(hourFormatFlashRef.current), []);
  // useCallback: this is what the clock hangs its memo on, and a new
  // function every tick means memo() can never bail out.
  const handleHourFormatClick = useCallback(() => {
    setIs24Hour((prev) => !prev);
    setIsHourFormatFlashing(true);
    window.clearTimeout(hourFormatFlashRef.current);
    hourFormatFlashRef.current = window.setTimeout(() => setIsHourFormatFlashing(false), FLASH_DURATION_MS);
  }, [setIs24Hour]);
  const zoneOffsets = useZoneOffsets();
  // How much room the floating top-right corner takes. The word counter's
  // fullscreen row has to stop before it, and HEADER_CORNER_RESERVE is
  // only an estimate of the same thing.
  // Three things get dropped when they would touch what's beside them,
  // all measured rather than named as widths. See useTightFit.
  const headerLeftRef = useRef<HTMLDivElement>(null);
  const linkBandRef = useRef<HTMLDivElement>(null);
  const hintsRef = useRef<HTMLDivElement>(null);
  const clockRootRef = useRef<HTMLDivElement>(null);
  const mainClockRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLParagraphElement>(null);
  const headerCornerRef = useRef<HTMLDivElement>(null);
  // The fullscreen row's own two ends of the same question: the controls
  // that finish the countdown block, and the corner they close on.
  const fsControlsRef = useRef<HTMLDivElement>(null);
  const fsCornerRef = useRef<HTMLDivElement>(null);
  // Tailwind's sm. At and above it the timer row is horizontal and the
  // digits column gets sm:self-stretch, which is what gives their cqh
  // sizing a height to query.
  const [isRowLayout, setIsRowLayout] = useState(() => window.matchMedia('(min-width: 640px)').matches);
  // Tailwind's lg. Not whether the panel shows, but which form it takes.
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

  const {
    isHidden: isTimeFieldsHidden,
    isAutoTucked: isTimeFieldsAutoTucked,
    isStacked: isTimeFieldsStacked,
    rowRef: timerRowRef,
    panelRef: timeFieldsRef,
    setHidden: setTimeFieldsHidden,
  } = useTimeFieldsTuck(isRowLayout, isWideLayout);
  const isLinkCrowded = useTightFit(gapBetween(headerLeftRef, linkBandRef), timerRowRef, 8);
  // The hints are centred in a column that starts where the sidebar ends,
  // so the row's own left edge is the sidebar when it's showing and the
  // window's edge when it's tucked. Either way, that's what the "P" of
  // "Press ENTER" runs into.
  const areHintsCrowded = useTightFit(gapFromLeftEdge(hintsRef, timerRowRef), timerRowRef, 8);
  // The alarm tip against the clock. It sits under the top-left buttons
  // while the clock is centred above the digits, so the two close on each
  // other as the window narrows.
  const isTipCrowded = useTightFit(gapBetween(tipRef, mainClockRef), timerRowRef, 8);

  // Bumped when a fresh countdown starts, so the green fade replays even
  // if the window never left the running state.
  const [runCycle, setRunCycle] = useState(0);
  const restartRunFade = () => setRunCycle((c) => c + 1);

  // Drain bar hover preview: x within the track, and the time it maps to.
  const [barHover, setBarHover] = useState<{ x: number; seconds: number } | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  // The fullscreen row's clock, which runs out of room rather than
  // touching anything: the row reserves the corner's width as padding, so
  // the clock's box stops before it and the collision shows up as the
  // cluster overflowing that box.
  //
  // Two rungs. The date is the rightmost piece and goes first; the time
  // and its zone box follow only once the date has gone and the cluster
  // still doesn't fit, which is what the null below says.
  const clockRoom = roomInParent(clockRootRef);
  // The countdown's "/ total" is the half that goes when the block
  // reaches the corner: what is left is the time actually running.
  const isFsTotalTight = useTightFit(gapBetween(fsControlsRef, fsCornerRef), windowRef, 28, isWordCounterFullscreen);
  const isClockDateCrowded = useTightFit(clockRoom, windowRef, 8, isWordCounterFullscreen);
  const isClockTimeCrowded = useTightFit(
    () => (isClockDateCrowded ? clockRoom() : null),
    windowRef,
    8,
    isWordCounterFullscreen
  );
  // States an adjustment has already been asked about, so the three fields
  // share one prompt per state. In memory on purpose: it means "you
  // answered a moment ago", which shouldn't outlive the session. The
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
  // Idle at its configured time, whichever side of zero: nothing for STOP
  // or RESET to act on.
  const isIdleAtConfigured = !isRunning && seconds === configuredTotalSeconds;

  const closeDialog = () => setDialog({ type: null });

  // Every "are you sure?" goes through here, so both ways a question can
  // already be answered are checked in one place: confirmations off
  // globally, or this one silenced by its own "don't ask again".
  //
  // The site RESET is the only dialog that calls setDialog directly, since
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

  // Two different questions, and they must not be folded together.
  //
  // hasRunToLose is about confirmations: which states are worth a dialog
  // between you and what you just clicked. A ringing timer is one you're
  // trying to deal with and an unstarted one has nothing at stake, so
  // neither asks.
  //
  // isLiveRun is about what the time fields mean: any started timer,
  // whichever side of zero. A ringing timer has no run to lose but very
  // much has a run, and reading the wrong one here snaps the fields back
  // to the configured total the moment the countdown crosses zero.
  const hasRunToLose = useCallback(() => {
    const state = timerStateKind();
    return state === 'running' || state === 'paused';
  }, [timerStateKind]);
  const isLiveRun = isRunning || isPaused;
  // Mirrored: applyAdjustment is reached from a dialog confirm as well as
  // directly, and the countdown can cross zero while the dialog is open.
  // Read off state, the branch taken at confirm could be the opposite of
  // the one the dialog described.
  const isLiveRunRef = useRef(isLiveRun);
  isLiveRunRef.current = isLiveRun;

  // One key per hook, so each writes only when its own value changes. One
  // effect for all fourteen would share a dependency list with `seconds`,
  // re-serialising the presets, the history and every setting once a
  // second while a timer runs.
  //
  // timerState keeps its own effect: it bundles six values into an object
  // literal, a new identity every render, which through usePersisted would
  // write on every 10ms tick.
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

  // timerState only writes on whole-second changes, so it can't capture
  // where inside a second a reload lands. Flushed separately as the page
  // goes away, through a ref so the listener registers once instead of
  // rebinding every tick.
  const persistedTimeRef = useRef(time);
  persistedTimeRef.current = time;
  useEffect(() => {
    const flushMilliseconds = () => {
      const saved = readJSON<Record<string, unknown>>(STORAGE_KEYS.timerState, {});
      writeJSON(STORAGE_KEYS.timerState, { ...saved, milliseconds: persistedTimeRef.current.milliseconds });
    };
    // pagehide rather than beforeunload: it fires on every navigation
    // away, bfcache included, and costs no bfcache eligibility. The leave
    // guard does use beforeunload, since nothing else can stop an unload,
    // but only while a timer is live.
    //
    // visibilitychange beside it: pagehide never fires for a tab the phone
    // discards in the background, which is how a mobile session usually
    // ends. Hiding is the last moment there is.
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
      // A backwards clock step, from NTP or by hand, must not add time back.
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

  // Not gated on mute: muting silences the alarm, it doesn't mean the
  // timer didn't run out. The window flash and the red digits are all a
  // muted alarm has left to say with.
  const isOvertime = seconds < 0;
  const { isRinging: isAlarmRinging, isBeepFlash, hasRungOut, clearAlarm: clearAlarmInterval } = useAlarm({
    isActive: isRunning && !isPaused && isOvertime,
    isOvertime,
    isLooping: isAlarmLooping,
    isSilent: isSilentMode,
    beep,
  });

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

  // Armed only while there's a run to lose. isRunning stays true through
  // overtime, so a counting-up stopwatch and an unacknowledged alarm both
  // still ask.
  //
  // Deliberately not gated on skipConfirmations: that switch is for
  // actions this app takes on your behalf, and closing the tab is one the
  // browser takes, with nothing to undo it.
  const isSelfReloadingRef = useLeaveGuard(isRunning || isPaused || isAlarmRinging);

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
      // Autorepeat is not three hundred presses: held down, Enter fires
      // ~30 pause/resume toggles a second, each with its own oscillator.
      if (e.repeat) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Whatever is focused keeps a key it wants itself, and which
      // controls those are depends on the key. Blocking S and R on buttons
      // as well as fields would kill both shortcuts for anyone who had
      // just clicked something: click START, and R stops resetting.
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
      // The slider keeps whatever level it was left at, 0 included, and
      // the toggle tone plays at that level: at 0 there's nothing to hear,
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
      // Sliding to 0 is already a deliberate mute, so the button's
      // one-time "are you sure?" has been answered.
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

  // The sign travels with the parts, or a count-up is written down as the
  // positive time of the same size and its row loads a countdown.
  const recordHistory = (parts: TimeParts, negative = false) => {
    const entry: TimerEntry = { id: uniqueId(), ...parts, negative, timestamp: Date.now() };
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

    recordHistory(configured, isConfiguredNegative);
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
  // silence is the wrong thing to meet. Paused mid-overtime is not that.
  // It's silent, there's nothing to escape, and the count-up on screen is
  // real elapsed time one stray click would take. A reloaded run comes
  // back paused, which is where a finished stopwatch usually sits.
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
    recordHistory(configured, isConfiguredNegative);
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

  // The one switch sequence; start=false loads without running. Memoized
  // so handleSelectEntry can depend on it rather than on its internals.
  const applySwitch = useCallback((parts: TimeParts, start: boolean, negative = false) => {
    clearAlarmInterval();
    loadEntry(parts, negative);
    setIsPaused(false);
    setIsRunning(start);
    if (start) {
      recordHistory(parts, negative);
      restartRunFade();
      if (!isSilentMode) beep(...TONES.start);
    }
  }, [loadEntry, isSilentMode, beep]);

  // Running a picked time, from the list or from the add box. Both entry
  // points share this gate rather than each carrying a copy, so the two
  // can't drift apart on the next change to the wording or the scope.
  //
  // It asks only where there's a run on the clock to lose: counting down,
  // or paused mid-count. Paused gets its own wording, since what it
  // discards is remaining time rather than progress in flight.
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
    // On the click rather than when the switch applies: a cancelled switch
    // leaves a harmless flash, and this saves threading the id through the
    // dialog. The panels check loaded before inserted, so loading a
    // just-created entry goes green rather than staying yellow.
    setLoadedEntry((prev) => bumpFlash(prev, entry.id));
    switchToEntry(parts, entry.negative === true);
  }, [switchToEntry]);

  const handleConfirmSwitch = (parts: TimeParts, start: boolean, negative = false) => {
    applySwitch(parts, start, negative);
    closeDialog();
  };

  // The list is a set of times, so adding one it already holds adds
  // nothing and points at the row instead. Returns whether anything went
  // in, so the panel knows whether to clear its input.
  //
  // Matched on the time rather than the label, since formatEntryLabel
  // drops leading zeroes and 1:05 and 0:01:05 print the same. The sign
  // counts: -1:05 and 1:05 are different presets.
  const handleAddPreset = useCallback((parts: TimeParts & { negative?: boolean }): boolean => {
    const negative = parts.negative === true;
    const existing = presets.find(
      (p) => (p.hours ?? 0) === parts.hours && p.minutes === parts.minutes && p.seconds === parts.seconds
        && (p.negative === true) === negative
    );
    if (existing) {
      // The flash comes after the notice, not under it, where the dialog
      // would cover the row it points at. Silence the notice and the flash
      // is left to say it alone.
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
    // gate as clicking the row would. An out-of-range entry never gets
    // here: the panel sends it to the correction dialog first.
    switchToEntry(parts, negative);
    return true;
  }, [presets, switchToEntry]);

  // Two steps, so the delete animation plays after the question is
  // answered. Setting this fizzes the row out; dropping it from the array
  // happens last, when the row calls back. Cancelling leaves a row that
  // never animated rather than one that has to be put back.
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

  // Empties the list outright rather than fizzing each row the way a
  // single − does: a hundred rows animating at once is a mess.
  const handleClearPresets = useCallback(() => {
    setPresets([]);
    setInsertedPreset(null);
  }, []);

  const handleRemoveHistoryEntry = useCallback((id: string) => {
    setHistory((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  // Stamps read in the clock's own zone and 12/24 setting, so the list
  // re-reads when either changes. Memoized on exactly those two: stable
  // identity for the panel's memo(), formatters rebuilt only on a real
  // change.
  //
  // The zero guard is for a corrupt or hand-edited store; recordHistory
  // always stamps Date.now(), so a real run can't produce one.
  const formatHistoryStamp = useMemo(() => {
    const time = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: !is24Hour,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
    // No weekday here, unlike the wall clock's own date. A history stamp is
    // one line inside a sidebar row, and "Thu, " is five characters of the
    // twenty-six it has to fit: with it the date never fits beside the time
    // at any width the sidebar reaches, so it would always be the half that
    // dropped. Without it both halves fit and the drop stays the exception.
    const date = new Intl.DateTimeFormat('en-US', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
    // Two pieces rather than one string: the panel puts them on their own
    // lines, and where that break falls is a decision, not wherever the
    // text happens to wrap.
    return (timestamp: number) =>
      timestamp > 0 ? { time: time.format(timestamp), date: formatDateParts(date, timestamp) } : null;
  }, [timeZone, is24Hour]);

  // Memoized rather than inline at the panels below: an inline arrow is a
  // new identity every render, and one unstable prop is enough to stop
  // memo() bailing out, which has every tick reconciling every row in both
  // lists.
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

  // The three boxes as one signed number. Everything they can do (61 into
  // seconds, stepping 59 up, stepping 00:00:00 down, pressing "-") is a
  // new value for this, so the carries and borrows fall out of the
  // arithmetic instead of needing a rule per unit.
  //
  // Idle it's the timer's setup; running or paused it's the time left and
  // the configured total stays put.
  //
  // Two readings, and stepping needs the exact one: truncate first and a
  // step on a running clock gives back the part-second the last one added,
  // leaving the boxes still at the zero crossing.
  const exactTotal = useCallback(
    () => (isLiveRunRef.current ? liveSeconds(timeRef.current) : configuredTotalRef.current),
    []
  );
  const shownTotal = useCallback(
    () => (isLiveRunRef.current ? liveShownSeconds(timeRef.current) : configuredTotalRef.current),
    []
  );

  const applyAdjustment = useCallback((total: number, unit: TimeUnit, previousTotal: number) => {
    const next = clampTotal(total);
    if (isLiveRunRef.current) {
      clearAlarmInterval();
      // Stored the way the tick stores it, floored seconds plus a positive
      // remainder, so the countdown carries on from exactly here.
      const totalMs = Math.round(next * 1000);
      const whole = Math.floor(totalMs / 1000);
      setTime({ seconds: whole, milliseconds: totalMs - whole * 1000 });
    } else {
      const magnitude = fromTotalSeconds(Math.abs(Math.trunc(next)));
      setHours(magnitude.hours);
      setMinutes(magnitude.minutes);
      setTimerSeconds(magnitude.seconds);
      setIsConfiguredNegative(next < 0);
      restartCountdown(Math.trunc(next));
    }
    // The unit the click was on, flashed in the direction the whole time
    // moved: a carry changes two boxes and the one you touched is the one
    // worth pointing at. Below an hour the hours digit isn't on screen to
    // flash.
    if (unit !== 'hours' || Math.abs(next) >= 3600) {
      flashSetterFor(unit)((prev) => ({ token: prev.token + 1, direction: next >= previousTotal ? 'inc' : 'dec' }));
    }
  }, [flashSetterFor]);

  // Asks once per timer state, for all three boxes together, and only
  // while there's a run to restart. Setting a timer up is what these boxes
  // are for, and a ringing one has nothing left to lose.
  //
  // By state kind rather than by transition: setting a timer up means
  // touching two or three boxes in a row, which is one intent, and pausing
  // to nudge a minute, resuming, then pausing again is still the same
  // question about the same paused timer.
  const requestTotalChange = useCallback((total: number, unit: TimeUnit) => {
    const previousTotal = shownTotal();
    const next = clampTotal(total);
    // Past the end of the range the boxes say so rather than quietly
    // landing somewhere else, the same report a typed preset gets: the
    // time you end up with isn't the one you asked for.
    const corrected = Math.abs(total) > MAX_TOTAL_SECONDS
      ? { typed: formatSignedLabel(Math.trunc(total)), corrected: formatSignedLabel(Math.trunc(next)) }
      : null;
    // After the correction lands, since it reports what already happened,
    // and through askThenRun so its own "don't ask again" is read as well
    // as written.
    const applyAndReport = () => {
      applyAdjustment(next, unit, previousTotal);
      if (corrected) askThenRun({ type: 'correctTime', data: corrected }, () => {});
    };
    if (next === previousTotal) {
      // Nothing moves, but a refused overshoot is still worth saying: the
      // step you pressed didn't do what it looks like it did.
      if (corrected) askThenRun({ type: 'correctTime', data: corrected }, () => {});
      return;
    }

    const state = timerStateKind();
    if (hasRunToLose() && !askedAdjustInStatesRef.current.has(state)) {
      // An out-of-range edit comes through here too, so a running timer
      // gets the same question before it's discarded.
      //
      // The correction rides in this dialog's copy rather than following
      // it as a second dialog: the click that confirms is also the click
      // that closes, so one opened from the confirm handler is shut by the
      // event that opened it.
      const dialog: DialogState = { type: 'adjust', data: { totalSeconds: Math.trunc(next), previousTotal, unit, state, corrected } };
      // Marked before asking, not after confirming: a cancelled question
      // was still asked. The dismiss handler clears it again so cancelling
      // doesn't hand the next adjustment a free pass.
      askedAdjustInStatesRef.current.add(state);
      askThenRun(dialog, () => {
        askedAdjustInStatesRef.current.delete(state);
        applyAndReport();
      });
      return;
    }
    applyAndReport();
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
    requestTotalChange(exactTotal() + deltaSeconds, unit);
  }, [exactTotal, requestTotalChange]);

  // "-" flips the sign of the whole time from whichever box it was typed
  // in; the display decides which one wears it.
  const handleToggleSign = useCallback(() => {
    const total = exactTotal();
    if (total === 0) return;
    requestTotalChange(-total, signedParts(shownTotal()).signUnit ?? 'seconds');
  }, [exactTotal, shownTotal, requestTotalChange]);

  const handleHideWebsiteLinkClick = () => {
    askThenRun({ type: 'hideWebsiteLink' }, () => setIsWebsiteLinkHidden(true));
  };

  // Running or paused, a seek moves the remaining time and leaves the
  // configured total alone. An idle timer has nothing to resume into, so
  // it sets a new configured time instead, as typing one would.
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

  // Always asks, including in the two states that skip the question
  // elsewhere: the track is 8px tall and sits right under the digits, and
  // on an idle timer a seek rewrites the configured time outright.
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
        // leave guard stands down first: this reload is what was just
        // confirmed, and challenging it would empty the storage behind a
        // page that never went anywhere.
        isSelfReloadingRef.current = true;
        wipeStorage(Object.values(STORAGE_KEYS));
        window.location.reload();
        break;
      case 'reset':
        handleConfirmReset();
        break;
      case 'switch':
        // Every mode starts the new time and differs only in what it
        // warned about. The skipped-dialog path runs the same applySwitch
        // through askThenRun, and the two have to agree.
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
      // Nothing to carry out, since the correction landed before this said
      // so, but it still has to close: ESC routes acknowledgements through
      // here, and a case that falls through leaves the dialog standing.
      case 'correctTime':
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
    // An acknowledgement reports what happened, so ESC has to leave the
    // same result as OK, ticked box included. Anything else and the text
    // is a lie for whoever dismissed it that way.
    if (!justConfirmedRef.current && isAcknowledgement(dialog)) {
      handleDialogConfirm(dontAskAgain);
      return;
    }
    justConfirmedRef.current = false;
    closeDialog();
  };

  const remaining = formatTime(seconds, milliseconds);
  // Same label style as the sidebar lists: "1:30", not "01:30:00".
  // Off the signed total, not the three magnitudes: `configured` carries no
  // sign, so a count-up's label read 1:05 directly above digits reading
  // -1:05.
  const configuredLabel = formatSignedLabel(configuredTotalSeconds);

  // One-shot flash on a countdown segment, green for an increase and red
  // for a decrease. Tied to the tokens applyAdjustment bumps, so it fires
  // only when that field's edit applies rather than on every render.
  const isHoursFlashing = useFlashOnToken(hoursFlash.token);
  const isMinutesFlashing = useFlashOnToken(minutesFlash.token);
  const isSecondsFlashing = useFlashOnToken(secondsFlash.token);
  // The token's parity picks between two names for the same animation, so
  // a second click while the first flash is still running changes the
  // class rather than removing and re-adding it. Same class either side of
  // a frame is no change at all to the browser, and the flash didn't
  // replay; see the pair in index.css.
  const flashTextClass = (isFlashing: boolean, direction: 'inc' | 'dec', token: number) => {
    if (!isFlashing) return '';
    const base = direction === 'inc' ? 'animate-increaseFlashText' : 'animate-decreaseFlashText';
    return token % 2 === 0 ? base : `${base}-alt`;
  };

  // Pausing mid-overtime stays plain black whatever repeat says, since the
  // digits take that cue over immediately with redWave. Above zero it's
  // infinite yellow with repeat on, three cycles with it off.
  const pauseFlashClass = seconds < 0 ? 'bg-black' : isAlarmLooping ? 'animate-pauseFlash' : 'animate-pauseFlashLimited';

  // Full at the configured time, empty at zero and through overtime, its
  // left edge receding as the hue sweeps green (120) to red (0).
  const configuredMs = configuredTotalSeconds * 1000;
  const remainingMs = Math.max(0, seconds * 1000 + milliseconds);
  const timeFraction = configuredMs > 0 ? Math.min(1, remainingMs / configuredMs) : 0;
  // What the three fields show: the time left while a run is on the clock,
  // the configured time otherwise.
  const fieldParts = signedParts(isLiveRun ? liveShownSeconds(time) : configuredTotalSeconds);
  // More time left than the bar was drawn for, which an edit to those
  // fields can do since they move the run without moving its total.
  // There's no honest fill for "more than full", so the track waves green
  // until the countdown comes back into range.
  const isOverBar = configuredMs > 0 && remainingMs > configuredMs;
  // Pausing mid-overtime would otherwise leave the bar at 0% and
  // invisible, so it stays full and red instead.
  const isPausedOvertime = isPaused && seconds < 0;
  // Full red whenever the digits are: ringing, paused mid-overtime, or a
  // finished finite ring still running. That last one has no timeFraction
  // left and would sit at 0% beside solid red digits.
  const isBarRedState = isAlarmRinging || hasRungOut || isPausedOvertime;
  // Red wins over the hue; animate-alarmFlashBar then alternates it with
  // black. Grey while never started.
  const barFillColor = isBarRedState ? '#ef4444' : isRunning ? `hsl(${120 * timeFraction}, 75%, 50%)` : '#6b7280';

  // The digits are held back by width, not height: they run out of column
  // long before they run out of room above and below. The column grows
  // into whatever the sidebar and the panel leave, so the cap below is
  // only there to stop an ultrawide turning the readout into a billboard.
  //
  // The width limit is a share of that column rather than of the window.
  // The widest readout, "-99:59:58·00", measures 5.5x its own font-size,
  // and the block's padding takes another 16px, so what fits is
  // (100cqi - 16px) / 5.5: 17.2cqi on the narrowest window, 17.9 on the
  // widest, since the 16px is fixed against a growing column. 17 holds at
  // both ends.
  const timerColumnMaxWidth = '80rem';
  const digitWidthLimit = '17cqi';
  const digitCeiling = '20rem';

  // Shared by the main column's bar and the compact copy in the word
  // counter's fullscreen row, which sits near the top of the screen and so
  // puts its tooltip below the track. Height is a slice of the digit size,
  // so the bar tracks the digits rather than the window.
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
          over-range wave is a green sweep along a full track, a fill that
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
  // One row, joined on a separator, and never wrapped: three stacked lines
  // cost three line boxes of height that the digits above would rather
  // have. It shrinks with the window and is dropped outright on a short
  // one, which is cheaper than letting it wrap a key away from the thing
  // it does.
  const hintLine = hints
    .map(({ text, disabled }) =>
      isWordCounterFocused ? `${text} — disabled while typing` : disabled ? `${text} — disabled` : text
    )
    .join('   ·   ');
  // Two ways this goes. index.css drops it on a short window, where
  // instructions are the first thing worth losing; areHintsCrowded drops
  // it once the line reaches the sidebar beside it.
  const hintsDisplay = (
    <div
      ref={hintsRef}
      className={`timer-hints opacity-75 tracking-wider text-center mt-1 ${isWindowGreen && !isWordCounterFocused ? glowFadeClass : ''}`}
      style={{
        fontSize: shrinkClamp(0.45, 0.85, 0.95, 0.6),
        color: isWordCounterFocused ? '#ef4444' : 'var(--app-ink)',
        ...textGlowStyle,
      }}
    >
      <div className="whitespace-nowrap leading-tight overflow-hidden">{hintLine}</div>
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
  // than the viewport, so they give way steadily as it does. On min(vw,
  // vh) the vh term binds on any landscape window, which held these three
  // at a fixed size until the window was narrower than it was tall and
  // then dropped them straight onto their floor.
  //
  // They give way faster than the digits, so they read as controls beside
  // the readout rather than competing with it. Three of them plus two gaps
  // have to fit 100cqi, which 13x3 clears; the floors stop the shrinking
  // with RESUME, the widest label, still in a box about 38px tall.
  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: `${boxClamp(0.3, 1.5, 3.7, 0.85)} ${fitClamp(0.45, 2.8, 1.7)}`,
    fontSize: boxClamp(0.7, 2.2, 5.5, 1.4),
    borderColor: color,
    color,
    // A surface-coloured chip keeps the borders readable on the coloured
    // window behind them.
    backgroundColor: 'var(--app-surface)',
    // width, not minWidth: with a minimum, RESUME, the one six-letter
    // label, outgrew it and came out wider than the four beside it, and
    // the row shifted as START became it. A fixed width makes every button
    // the same box whatever it says. Solved against the widest label
    // rather than picked: RESUME is 3.6em of this monospace, and the box
    // has to hold that plus both paddings and the 8px border at the size
    // each of them tops out at.
    width: fitClamp(5.25, 18, 9.25),
  });
  // The same buttons scaled to a single header row, for the word counter's
  // fullscreen view, which covers the real ones. Every size is capped
  // against that row, it holds one line at any width, so what doesn't fit
  // has to come off the size rather than off the line.
  const compactControlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    height: boxCap(HEADER_BUTTON_SIZE.height, 6.8),
    padding: `0 ${boxCap(shrinkClamp(0.5, 1, 1.1, 0.75), 1.4)}`,
    fontSize: boxCap(shrinkClamp(0.6, 1.3, 1.4, 0.9), 1.95),
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
      {/* Named for the fullscreen row's caps in index.css, which have to
          keep the badge smaller than the bell it sits inside. One cap for
          every icon on that row made the two the same size, and the badge
          is opaque: it covered the bell entirely. */}
      <Bell
        className="ringer-bell"
        color={isAlarmLooping ? '#22c55e' : 'var(--app-ink)'}
        style={RINGER_BELL_SIZE}
      />
      <Repeat
        aria-hidden
        color={isAlarmLooping ? '#22c55e' : 'var(--app-ink)'}
        fill="var(--app-surface)"
        className="absolute ringer-badge"
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
      {/* And out entirely once it reaches the clock. Its box is as wide as
          the buttons above it, but the text inside can run past that, and
          on a narrow window it ran under the time box. A tip is the most
          expendable thing on this screen, so it goes rather than being
          read through the clock sitting on top of it. */}
      {!isTipCrowded && (
      <p
        ref={tipRef}
        className="alarm-tip hidden sm:block opacity-75 font-bold text-white text-left"
        style={{ fontSize: shrinkClamp(0.4, 0.8, 0.85, 0.5), width: 0, minWidth: '100%', lineHeight: 1.25 }}
      >
        Tip: mute the volume or turn off repeat to silence the alarm — OFF + start at 00:00:00 = count-up stopwatch
      </p>
      )}
    </div>
  );
  // The wall clock, in two sizes: full above the digits, compact in the
  // word counter's fullscreen row. Everything inside it is em-based, so
  // the font size is the only thing that differs. See ClockCluster.tsx.
  // measured=true for the fullscreen copy, which is the one that shares a
  // row with the floating corner and so has something to run into.
  const renderClockCluster = (fontSize: string, measured = false, rootRef?: React.RefObject<HTMLDivElement | null>) => (
    <ClockCluster
      fontSize={fontSize}
      timeZone={timeZone}
      is24Hour={is24Hour}
      zoneOffsets={zoneOffsets}
      isHourFormatFlashing={isHourFormatFlashing}
      onHourFormatClick={handleHourFormatClick}
      onTimeZoneChange={setTimeZone}
      rootRef={rootRef ?? (measured ? clockRootRef : undefined)}
      hideDate={measured && isClockDateCrowded}
      hideTime={measured && isClockTimeCrowded}
    />
  );
  // The three floating-corner controls. Held as a value because they
  // render in two places: their own corner normally, and inside the word
  // counter's fullscreen row when there is one, so that row can centre
  // what it holds instead of padding around an absolute corner.
  const headerCornerButtons = (
    <>

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
    </>
  );
  const websiteLinkButton = (
    // Centred in a band whose two ends are the floating header corners, so
    // the gap closes from both sides as the window narrows and the corners
    // stop shrinking first, their controls bottoming out on rem floors.
    // One line throughout: it gets narrower instead, then goes.
    //
    // It goes when its X reaches the buttons in the left corner, which is
    // measured rather than named as a width: see useTightFit for why no
    // single width describes that crossing.
    <div ref={linkBandRef} className="relative z-[70] flex items-center gap-1.5 flex-shrink-0">
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
        // Capped against the row, which is a container: "1:02:05·00 /
        // 1:02:05" is ~12em of monospace, and the row can't wrap, so the
        // one thing that can give is the size.
        // A bigger readout once the total has gone, and the whole clamp
        // moves rather than the cap: at these widths the clamp's own floor
        // is what binds, so raising the cap alone changed nothing. The
        // remaining time alone is about two thirds of what it and the
        // total need together, which is the room this spends.
        fontSize: isFsTotalTight
          ? boxCap(shrinkClamp(0.95, 2.1, 2.2, 1.4), 3)
          : boxCap(shrinkClamp(0.7, 1.5, 1.6, 1), 2),
        color: seconds < 0 ? '#ef4444' : 'var(--app-ink)',
      }}
    >
      {remaining.sign}{remaining.hours && `${remaining.hours}:`}{remaining.minutes}:{remaining.seconds}·{remaining.ms}
      {!isFsTotalTight && <>{' '}<span className="opacity-60">/ {configuredLabel}</span></>}
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
        onClick={() => setTimeFieldsHidden(false)}
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
        onClick={() => setTimeFieldsHidden(true)}
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
        // rowGap rather than gap: the shorthand sets both axes, and an
        // inline style beats a stylesheet, so it was silently overriding
        // the column-gap the 3-across form sets in index.css and leaving
        // the three fields 2-8px apart. Stacked there is only one column,
        // so the horizontal axis is index.css's to own.
        style={{ padding: shrinkClamp(0.15, 0.7, 0.8, 0.75), rowGap: shrinkClamp(0.15, 0.5, 0.55, 0.5) }}
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
          timer on a narrow window. */}
      {!isSidebarHidden && (
        // A computed width rather than w-fit: every started timer appends
        // a history row, and one long entry among short ones would resize
        // this column and shift the timer beside it mid-use.
        // SIDEBAR_WIDTH fits the longest row that can ever appear, so the
        // labels set the size once instead of on every list change.
        //
        // One scroll region for both panels. Scrolling separately meant
        // sizing separately, which put a handful of presets in a two-row
        // box with its own bar under a history list that had taken the
        // leftover height.
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
        <div ref={headerLeftRef} className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-[80] flex items-start gap-2">
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

        {/* Measured rather than estimated; see headerCornerRef.

            Only while the word counter is not fullscreen. In fullscreen
            these three move into the counter's own row, where they sit in
            the same band as the icons facing them and the row stops
            reserving a corner it then has to leave empty. */}
        {!isWordCounterFullscreen && (
        <div
          ref={headerCornerRef}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-[70] flex items-center gap-2"
        >
          {headerCornerButtons}
        </div>
        )}

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
            was a guess at half the viewport, less than half the truth
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
              column in exactly the same place, with equal spacers its
              centre is (row - panel) / 2, and taking the whole leftover
              puts it there too, while giving the digits every pixel the
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
            {!isWebsiteLinkHidden && !isWordCounterFullscreen && !isLinkCrowded && websiteLinkButton}

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
              // Solved from the layout rather than picked. Two things
              // scale with this: the digit line, whose box is exactly 1x
              // its font-size under leading-none, and the drain bar, which
              // takes height and margin from the digit size and measures
              // another 0.24x. So the content is the reserve below plus
              // 1.24x, and 1.29 is the margin on that. Every 0.01 of it is
              // ~5px of dead space on a 1080-tall window.
              //
              // The reserve can't be a constant: the siblings are
              // themselves min(vw, vh) clamps, ~12.5rem on a tall window
              // and near 8.6rem on a short one. Every reserved pixel costs
              // its own height in font-size, so over-reserving pins the
              // digits at their floor with room to spare.
              // max(floor, vh-scaled) tracks them while they scale and
              // takes over once they stop; the second max() is the clock's
              // own reserve, shaped like CLOCK_FONT_SIZE for the same reason.
              //
              // Shrinking this reserve does nothing on its own, which was
              // measured rather than assumed: at all 22 viewports the
              // min() picks the width term, so the digits are held by the
              // column's width and never by this. The height the clock and
              // hint rows gave back by going to one line each shows up as
              // slack above and below instead, and spending it means
              // changing how the row and the word counter split the column
              // rather than touching anything here.
              //
              // One formula, two containers: at sm+ the nearest is the box
              // above, below sm it's the row. Same siblings either way,
              // since the website link is hidden below md.
              style={{
                fontSize: `clamp(1.2rem, min(${digitWidthLimit}, calc((100cqh - max(9rem, 1.5rem + 15.9dvh) - max(2.6rem, min(4.5vw, 4.9dvh))) / 1.29)), ${digitCeiling})`,
                fontFamily: "'IBM Plex Mono', monospace",
                // Vertical and horizontal on separate clamps. They were one
                // figure, and the horizontal one is the useful one, it
                // keeps the widest readout off the column's edges, and the
                // digit width limit is set against it. Vertically the same
                // figure was 14px of nothing above the clock, on top of the
                // gap that already separates this from the website link.
                padding: `${shrinkClamp(0.1, 0.35, 0.4, 0.3)} ${shrinkClamp(0.25, 1.2, 1.3, 1)}`,
              }}
            >
              {/* Every child sets its own font-size, since this block's own
                  is the digit size. */}
              <div className="flex justify-center">{renderClockCluster(CLOCK_FONT_SIZE, false, mainClockRef)}</div>
              {/* leading-none on both, here and on the digits below: the
                  gap between the configured time and the running one was
                  half-leading on two line boxes, ~0.5em of each font, and
                  at the digit size that reads as a hole rather than a
                  space. Neither line has a descender to lose, the labels
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
                  <span style={{ fontSize: '0.5em', marginRight: '0.3em' }} className={flashTextClass(isHoursFlashing, hoursFlash.direction, hoursFlash.token)}>
                    {remaining.sign}{remaining.hours}
                  </span>
                )}
                {/* Minutes and seconds share a gapless wrapper so they sit
                    flush as "MM:SS"; the outer gap only separates that
                    group from the hours and ms segments. */}
                <span className="flex items-baseline">
                  <span className={flashTextClass(isMinutesFlashing, minutesFlash.direction, minutesFlash.token)}>{!remaining.hours && remaining.sign}{remaining.minutes}</span>
                  <span>:</span>
                  <span className={flashTextClass(isSecondsFlashing, secondsFlash.direction, secondsFlash.token)}>{remaining.seconds}</span>
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

              {!areHintsCrowded && hintsDisplay}
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
          clockCluster={isWordCounterFullscreen && isRowLayout
            ? renderClockCluster(isClockDateCrowded ? FULLSCREEN_CLOCK_FONT_SIZE_SOLO : FULLSCREEN_CLOCK_FONT_SIZE, true)
            : null}
          cornerButtons={isWordCounterFullscreen ? headerCornerButtons : null}
          cornerRef={fsCornerRef}
          timerDigits={isWordCounterFullscreen ? wordCounterTimerDigits : null}
          timerBar={isWordCounterFullscreen && isRowLayout ? renderDrainBar(boxCap('clamp(3rem, 8vw, 8rem)', 9), true) : null}
          timerControls={
            isWordCounterFullscreen ? (
              <div ref={fsControlsRef} className="flex items-center flex-shrink-0" style={{ gap: boxCap('0.375rem', 1.2) }}>
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
