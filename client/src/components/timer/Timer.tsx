import { Bell, ExternalLink, Menu, Repeat, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import { readJSON, writeJSON } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_FINITE_GROUPS, ALARM_GROUP_GAP_TICKS, ALARM_TICK_MS, ALARM_TOTAL_BURSTS, DEFAULT_PRESETS, DEFAULT_TIME, DEFAULT_VOLUME, MAX_HISTORY, MAX_HOURS, MAX_MINUTES, MAX_PRESETS, MAX_SECONDS, MIN_TOTAL_SECONDS, STORAGE_KEYS, TICK_MS, TONES } from './constants';
import { formatEntryLabel, formatTime, fromTotalSeconds, toTotalSeconds } from './format';
import { shrinkClamp } from './responsive';
import type { DialogState, TimeParts, TimerEntry, TimeUnit } from './types';
import { useFlashOnToken } from './useFlashOnToken';

// Shared by every header icon (menu/mute/repeat/reset/the site link)
const HEADER_ICON_SIZE = { width: shrinkClamp(1.1, 3, 3, 1.375), height: shrinkClamp(1.1, 3, 3, 1.375) };
// Shared by the square icon buttons (mute, repeat); the hamburger uses the
// same floor but a smaller ceiling since it's hidden past the lg breakpoint
const HEADER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3.5), height: shrinkClamp(2, 5, 5, 3.5) };
// The alarm-repeat button's Bell is bigger than a normal header icon,
// filling most of the button, since it's the button's whole identity
// rather than one of several equal icons
const RINGER_BELL_SIZE = { width: shrinkClamp(1.8, 4.2, 4.2, 2.9), height: shrinkClamp(1.8, 4.2, 4.2, 2.9) };
const HAMBURGER_BUTTON_SIZE = { width: shrinkClamp(2, 5, 5, 3), height: shrinkClamp(2, 5, 5, 3) };

// Speaker with sound waves that grow in as the volume rises; an X when muted
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

// A flash target: which entry to flash, plus a token that bumps on every
// trigger — even a repeat of the same id — so useFlashOnToken always sees
// a change and replays the animation instead of silently no-op'ing on a
// same-value state update.
type FlashTarget = { id: string; token: number } | null;
const bumpFlash = (prev: FlashTarget, id: string): FlashTarget => ({ id, token: (prev?.token ?? 0) + 1 });

export default function Timer() {
  // Parse persisted state once, before first render, so the persist effect
  // can't save defaults over it. A timer that was running or paused comes
  // back paused rather than resuming the countdown blind (the elapsed
  // wall-clock time while the page was gone is unknown/unwanted) — but it
  // no longer drops to the unstarted look either.
  const initial = useMemo(() => {
    const savedState = readJSON<unknown>(STORAGE_KEYS.timerState, null);
    const savedHistory = readJSON<unknown>(STORAGE_KEYS.history, null);
    return {
      saved: (savedState && typeof savedState === 'object' ? savedState : {}) as Record<string, unknown>,
      history: Array.isArray(savedHistory) ? (savedHistory as TimerEntry[]) : [],
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
  const [isSilentMode, setIsSilentMode] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.silentMode, null);
    return typeof saved === 'boolean' ? saved : false;
  });
  const [volume, setVolume] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.volume, null);
    return typeof saved === 'number' && Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : DEFAULT_VOLUME;
  });
  // gates the one-time "are you sure?" the first time this browser mutes
  const [hasMutedBefore, setHasMutedBefore] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.hasMutedBefore, null);
    return typeof saved === 'boolean' ? saved : false;
  });
  // on = alarm groups repeat forever; off = ring ALARM_FINITE_GROUPS groups then go quiet
  const [isAlarmLooping, setIsAlarmLooping] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.alarmLoop, null);
    return typeof saved === 'boolean' ? saved : true;
  });
  // skips every confirmation dialog except the site-wide RESET, which is
  // destructive enough to always ask
  const [skipConfirmations, setSkipConfirmations] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.skipConfirmations, null);
    return typeof saved === 'boolean' ? saved : false;
  });

  // the most recently created/loaded preset or history entry, so their
  // cards can play a one-shot flash (yellow for a fresh insert, green for
  // loading an existing one) — never restored from storage, so a reload
  // never replays it
  const [insertedPreset, setInsertedPreset] = useState<FlashTarget>(null);
  const [insertedHistory, setInsertedHistory] = useState<FlashTarget>(null);
  const [loadedEntry, setLoadedEntry] = useState<FlashTarget>(null);
  // bumped (with the direction of the change) per-field whenever that
  // field's own adjustment actually applies, so each HOURS/MINUTES/SECONDS
  // digit on the countdown itself can flash green/red independently
  const [hoursFlash, setHoursFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [minutesFlash, setMinutesFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });
  const [secondsFlash, setSecondsFlash] = useState<{ token: number; direction: 'inc' | 'dec' }>({ token: 0, direction: 'inc' });

  const [history, setHistory] = useState<TimerEntry[]>(initial.history);
  const [presets, setPresets] = useState<TimerEntry[]>(() => {
    const parsed = readJSON<unknown>(STORAGE_KEYS.presets, null);
    if (!Array.isArray(parsed)) return DEFAULT_PRESETS;
    try {
      // older saves packed hours into minutes
      return (parsed as TimerEntry[]).map((p) => ({
        ...p,
        hours: (p.hours ?? 0) + Math.floor(p.minutes / 60),
        minutes: p.minutes % 60,
      }));
    } catch {
      return DEFAULT_PRESETS;
    }
  });

  const [dialog, setDialog] = useState<DialogState>({ type: null });
  const [isWordCounterFocused, setIsWordCounterFocused] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // bumps when a fresh countdown starts so the green fade replays even if
  // the window never left the running state (see runFadeClass below)
  const [runCycle, setRunCycle] = useState(0);
  const restartRunFade = () => setRunCycle((c) => c + 1);

  // hover preview over the drain bar: x offset within the track and the
  // time that point corresponds to
  const [barHover, setBarHover] = useState<{ x: number; seconds: number } | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  // only prompt for time adjustments once per running/paused state
  const promptShownInStateRef = useRef(false);
  // Radix fires both onClick and onOpenChange for the same click, so the
  // dismiss handler needs a ref to tell "just confirmed" from "cancelled"
  const justConfirmedRef = useRef(false);

  const { beep } = useBeep(volume);
  // cancels the in-flight preview burst so a new one overrides it
  const previewCleanupRef = useRef<(() => void) | null>(null);

  const configured: TimeParts = useMemo(
    () => ({ hours, minutes, seconds: timerSeconds }),
    [hours, minutes, timerSeconds]
  );
  const configuredTotalSeconds = toTotalSeconds(configured);

  const closeDialog = () => setDialog({ type: null });

  // Persist state; each key writes independently so one failing write
  // (e.g. quota exceeded on the large history value) can't drop the rest
  useEffect(() => {
    writeJSON(STORAGE_KEYS.timerState, { seconds, isPaused, isRunning, hours, minutes, timerSeconds });
    writeJSON(STORAGE_KEYS.history, history);
    writeJSON(STORAGE_KEYS.silentMode, isSilentMode);
    writeJSON(STORAGE_KEYS.presets, presets);
    writeJSON(STORAGE_KEYS.volume, volume);
    writeJSON(STORAGE_KEYS.hasMutedBefore, hasMutedBefore);
    writeJSON(STORAGE_KEYS.alarmLoop, isAlarmLooping);
    writeJSON(STORAGE_KEYS.skipConfirmations, skipConfirmations);
  }, [seconds, isPaused, isRunning, hours, minutes, timerSeconds, history, isSilentMode, presets, volume, hasMutedBefore, isAlarmLooping, skipConfirmations]);

  // The regular persist effect above only fires on whole-second changes
  // (re-running it every 10ms tick to catch milliseconds would hammer
  // localStorage), so it can't capture where within the current second a
  // reload lands. Flush milliseconds separately right before the page
  // actually goes away, reading through a ref so this listener registers
  // once instead of rebinding every tick.
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

  useEffect(() => {
    promptShownInStateRef.current = false;
  }, [isRunning, isPaused]);

  // Confirming via Space closes the dialog without a Radix close event, so
  // the flag isn't consumed by onOpenChange; clear it as each dialog opens
  useEffect(() => {
    if (dialog.type !== null) justConfirmedRef.current = false;
  }, [dialog.type]);

  // Tab title/favicon shows the remaining time
  const remainingWholeSeconds = Math.floor(Math.abs(seconds * 1000 + milliseconds) / 1000);
  useFavicon(
    isRunning,
    isPaused,
    seconds < 0,
    Math.floor((remainingWholeSeconds % 3600) / 60),
    remainingWholeSeconds % 60,
    Math.floor(remainingWholeSeconds / 3600)
  );

  // Countdown: subtract elapsed wall-clock time; keeps going negative until
  // the -99:59:59 floor
  useEffect(() => {
    if (!isRunning || isPaused) return;

    let lastTime = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      // a backwards clock step (NTP/manual adjustment) must not add time
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

  // Alarm while in negative time: ALARM_TOTAL_BURSTS bursts of
  // ALARM_BURST_COUNT beeps, then a longer pause, then the whole group
  // repeats for as long as the alarm stays active
  const isAlarmActive = isRunning && !isPaused && seconds < 0 && !isSilentMode;
  // With repeat off, the alarm gets one finite ring per overtime period.
  // The allowance is consumed the moment ringing starts — so pause/resume
  // or mute toggles can't squeeze out extra groups, and toggling repeat
  // off mid-ring mutes immediately — and it resets once the timer leaves
  // negative time.
  const isOvertime = seconds < 0;
  const alarmRungThisOvertimeRef = useRef(false);
  // the pattern position also lives in a ref so effect re-runs (repeat
  // toggles, pause/resume) continue the ring where it left off instead of
  // restarting it at the first burst
  const alarmTickRef = useRef(0);
  // With repeat off, once the finite ring finishes on its own the digits
  // fade red as a persistent "you missed this" cue — cleared by turning
  // repeat back on, or by leaving overtime (a fresh countdown shouldn't
  // start pre-tinted).
  const [hasRungOut, setHasRungOut] = useState(false);
  useEffect(() => {
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
  // yellow/black a fixed 3 times (animate-pauseFlashLimited below)
  // instead of forever, then the digits wave yellow once that settles —
  // cleared by resuming or turning repeat back on, so the next pause
  // replays the same 3-flash cue fresh. Not used once negative — that
  // case shows the red wave immediately instead of waiting on this. The
  // drain bar's own pause flash is untouched by any of this.
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
  // interval runs, isBeepFlash pulsing red for each individual beep
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [isBeepFlash, setIsBeepFlash] = useState(false);

  useEffect(() => {
    if (!isAlarmActive) return;
    if (!isAlarmLooping && alarmRungThisOvertimeRef.current) {
      // repeat got turned off mid-ring, which mutes it immediately rather
      // than letting it finish its pattern — treat that the same as the
      // ring completing on its own, so the digits still fade red
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
      if (!isAlarmLooping && alarmTickRef.current >= pattern.length * ALARM_FINITE_GROUPS) {
        if (beepIntervalRef.current) clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
        setIsAlarmRinging(false);
        setHasRungOut(true);
        return;
      }
      if (pattern[alarmTickRef.current % pattern.length]) {
        beep(...TONES.alarm);
        // flash red for exactly as long as the beep sounds
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

  // Space/S/R mirror the on-screen controls; the ref lets the keydown
  // listener stay registered once instead of rebinding every tick
  const keyActionRef = useRef<(code: string) => boolean>(() => false);
  keyActionRef.current = (code) => {
    // let the dialog own the keyboard while open
    if (dialog.type !== null) return false;
    if (code === 'Space') {
      if (isRunning) {
        togglePause();
      } else {
        handleStart();
      }
      return true;
    }
    // a timer that's never run — idle at its configured time — has
    // nothing for STOP or RESET to act on
    const isIdleAtConfigured = !isRunning && seconds >= 0 && seconds === configuredTotalSeconds;
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

  // Escape closes the mobile sidebar drawer
  useEffect(() => {
    if (!isSidebarOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isSidebarOpen]);

  const playTone = (tone: keyof typeof TONES) => {
    if (!isSilentMode) {
      beep(...TONES[tone]);
    }
  };

  // Muting is silent — no confirmation tone — except the very first time
  // this browser has ever muted, which asks for confirmation first
  const handleMuteToggle = () => {
    if (isSilentMode) {
      // unmuting with the slider parked at 0 restores a usable level; the
      // confirmation tone plays at the restored level, not the stale 0
      beep(...TONES.silentToggle, volume === 0 ? DEFAULT_VOLUME : undefined);
      if (volume === 0) setVolume(DEFAULT_VOLUME);
      setIsSilentMode(false);
      return;
    }
    if (!hasMutedBefore) {
      if (skipConfirmations) {
        handleConfirmMute();
      } else {
        setDialog({ type: 'mute' });
      }
      return;
    }
    setIsSilentMode(true);
  };

  const handleConfirmMute = () => {
    setIsSilentMode(true);
    setHasMutedBefore(true);
    closeDialog();
  };

  // Dragging the slider to 0 mutes; dragging back off 0 unmutes
  const handleVolumeChange = (value: number) => {
    setVolume(value);
    if (value === 0) {
      setIsSilentMode(true);
      // sliding to 0 is already an explicit mute — the button's one-time
      // "are you sure?" would be redundant after this
      setHasMutedBefore(true);
    } else if (isSilentMode) {
      setIsSilentMode(false);
    }
  };

  // On release, preview the chosen level with one alarm burst
  // (ALARM_BURST_COUNT beeps); a re-release cancels the previous burst
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

  // Shared by every path that restarts the countdown from a fresh total
  // (adjusting a field, resetting, auto-restarting after finishing): stop
  // any ringing alarm, snap the clock to the new total, and replay the
  // green fade.
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
    // the beep is a side effect, so it stays out of the state updater
    const nextIsPaused = !isPaused;
    if (!isSilentMode) {
      beep(...(nextIsPaused ? TONES.pause : TONES.resume));
    }
    setIsPaused(nextIsPaused);
  };

  const handleStart = () => {
    // If the timer is at 0 or in negative time, restart from the configured time
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
    // an actively beeping alarm stops without confirmation
    if (seconds < 0 && isRunning && !isPaused) {
      playTone('stop');
      stopToConfigured();
      return;
    }
    if (skipConfirmations) {
      handleConfirmStop();
      return;
    }
    setDialog({ type: 'stop' });
  };

  const handleConfirmStop = () => {
    playTone('stop');
    stopToConfigured();
    closeDialog();
  };

  const handleResetClick = () => {
    // If finished, auto-restart without confirmation
    if (seconds < 0) {
      restartCountdown(configuredTotalSeconds);
      recordHistory(configured);
      setIsRunning(true);
      setIsPaused(false);
      return;
    }
    if (skipConfirmations) {
      handleConfirmReset();
      return;
    }
    setDialog({ type: 'reset' });
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
    setIsSidebarOpen(false);
  }, []);

  // the one switch sequence, shared by the direct path and the dialog
  // confirm; start=false only loads the preset without running it
  const applySwitch = (parts: TimeParts, start: boolean) => {
    clearAlarmInterval();
    loadEntry(parts);
    setIsPaused(false);
    setIsRunning(start);
    if (start) {
      recordHistory(parts);
      restartRunFade();
      playTone('start');
    }
  };

  const handleSelectEntry = useCallback((entry: TimerEntry) => {
    const parts: TimeParts = { hours: entry.hours ?? 0, minutes: entry.minutes, seconds: entry.seconds };
    // flashes on the click itself rather than once the switch actually
    // applies — simpler than threading the entry id through the confirm
    // dialog, and a cancelled switch still leaves a harmless flash. The
    // panels check loadedId before insertedId, so loading a just-created
    // entry shows green immediately instead of staying yellow until the
    // insert flash's own timing runs out.
    setLoadedEntry((prev) => bumpFlash(prev, entry.id));
    // actively counting down (not paused): confirm, then start the new
    // preset immediately
    if (isRunning && !isPaused && timeRef.current.seconds >= 0) {
      if (skipConfirmations) {
        applySwitch(parts, true);
      } else {
        setDialog({ type: 'switch', data: parts, start: true });
      }
      return;
    }
    // paused (even paused in overtime), or a stopped timer showing
    // anything other than its configured time — mid-run or overtime
    // after a reload — still has progress on screen; confirm before
    // discarding it, but confirming only loads the preset without
    // starting it
    if (isPaused || (!isRunning && timeRef.current.seconds !== configuredTotalSeconds)) {
      if (skipConfirmations) {
        applySwitch(parts, false);
      } else {
        setDialog({ type: 'switch', data: parts, start: false });
      }
      return;
    }
    // a beeping timer hands off to the new preset and keeps running;
    // a stopped one just loads it
    applySwitch(parts, isRunning && timeRef.current.seconds < 0);
  }, [isRunning, isPaused, configuredTotalSeconds, loadEntry, isSilentMode, beep, skipConfirmations]);

  const handleConfirmSwitch = (parts: TimeParts, start: boolean) => {
    applySwitch(parts, start);
    closeDialog();
  };

  const handleAddPreset = useCallback((parts: TimeParts) => {
    const id = uniqueId();
    setPresets((prev) => (prev.length >= MAX_PRESETS ? prev : [...prev, { id, ...parts, timestamp: 0 }]));
    setInsertedPreset((prev) => bumpFlash(prev, id));
  }, []);

  const handleRemovePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleClearHistory = useCallback(() => {
    setHistory([]);
    setInsertedHistory(null);
  }, []);

  const setterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHours : unit === 'minutes' ? setMinutes : setTimerSeconds),
    []
  );

  const flashSetterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHoursFlash : unit === 'minutes' ? setMinutesFlash : setSecondsFlash),
    []
  );

  // Apply a change to one unit of the configured time and restart the
  // countdown from the new configured total, refilling the drain bar. A
  // running timer keeps running from the top, a paused one waits there,
  // and a finished (beeping) one restarts running. previous is passed in
  // explicitly rather than read off `configured`, since by the time a
  // dialog-confirmed call reaches here `configured` already reflects the
  // eagerly-applied field edit, not the value being changed from.
  const applyAdjustment = useCallback((unit: TimeUnit, value: number, previous: number) => {
    setterFor(unit)(value);
    if (timeRef.current.seconds < 0) setIsPaused(false);
    restartCountdown(toTotalSeconds({ ...configured, [unit]: value }));
    // the hour digit drops out of the countdown display once hours hits 0,
    // so there's nothing there to draw attention to
    if (unit !== 'hours' || value > 0) {
      flashSetterFor(unit)((prev) => ({ token: prev.token + 1, direction: value >= previous ? 'inc' : 'dec' }));
    }
  }, [setterFor, flashSetterFor, configured]);

  // Changing a field while running/paused asks for confirmation first
  const requestConfiguredChange = useCallback((unit: TimeUnit, value: number) => {
    const previous = configured[unit];
    setterFor(unit)(value);

    if (value === previous) return;

    // no confirmation while beeping — the adjustment restarts the timer
    if (!skipConfirmations && (isRunning || isPaused) && timeRef.current.seconds >= 0 && !promptShownInStateRef.current) {
      setDialog({ type: 'adjust', data: { unit, value, previous } });
      promptShownInStateRef.current = true;
    } else {
      applyAdjustment(unit, value, previous);
    }
  }, [configured, isRunning, isPaused, setterFor, applyAdjustment, skipConfirmations]);

  const handleHoursChange = useCallback((value: number) => requestConfiguredChange('hours', value), [requestConfiguredChange]);
  const handleMinutesChange = useCallback((value: number) => requestConfiguredChange('minutes', value), [requestConfiguredChange]);
  const handleSecondsChange = useCallback((value: number) => requestConfiguredChange('seconds', value), [requestConfiguredChange]);

  const handleConfirmAdjust = (unit: TimeUnit, value: number, previous: number) => {
    applyAdjustment(unit, value, previous);
    closeDialog();
  };

  // Seeking via the drain bar moves only the remaining time; the
  // configured time stays as it is. A timer that wasn't running wakes up
  // paused at the chosen point.
  const applySeek = (targetSeconds: number) => {
    if (!isRunning) {
      setIsRunning(true);
      setIsPaused(true);
    }
    setTime({ seconds: targetSeconds, milliseconds: 0 });
    restartRunFade();
  };

  const requestSeek = (targetSeconds: number) => {
    if (skipConfirmations) {
      applySeek(targetSeconds);
      return;
    }
    // every seek confirms — a never-run timer included, since its first
    // click would otherwise apply silently while later ones (the seek
    // leaves it paused) would ask. willPause mirrors applySeek's own
    // condition for leaving the timer paused: never-run, or already paused.
    setDialog({ type: 'seek', data: { targetSeconds, willPause: !isRunning || isPaused } });
  };

  // maps a mouse position on the track to its time: the bar drains left
  // to right, so the track's left end is the configured time, right is 0
  const barPointSeconds = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
    return { x, seconds: Math.round((1 - x / rect.width) * configuredTotalSeconds) };
  };

  const handleDialogConfirm = () => {
    justConfirmedRef.current = true;
    switch (dialog.type) {
      case 'stop':
        handleConfirmStop();
        break;
      case 'mute':
        handleConfirmMute();
        break;
      case 'clearCache':
        // wipe saved state and reload so every piece of state re-initializes
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
        window.location.reload();
        break;
      case 'reset':
        handleConfirmReset();
        break;
      case 'switch':
        handleConfirmSwitch(dialog.data, dialog.start);
        break;
      case 'seek':
        applySeek(dialog.data.targetSeconds);
        closeDialog();
        break;
      case 'adjust':
        handleConfirmAdjust(dialog.data.unit, dialog.data.value, dialog.data.previous);
        break;
    }
  };

  // Dismissing an 'adjust' dialog reverts the eagerly-applied field edit
  const handleDialogDismiss = () => {
    if (!justConfirmedRef.current && dialog.type === 'adjust') {
      setterFor(dialog.data.unit)(dialog.data.previous);
      promptShownInStateRef.current = false;
    }
    justConfirmedRef.current = false;
    closeDialog();
  };

  const remaining = formatTime(seconds, milliseconds);
  // same label style as the presets/history lists ("1:30", not "01:30:00")
  const configuredLabel = formatEntryLabel(configured);

  // one-shot flash on the countdown's own HH/MM/SS segment — green for an
  // increase, red for a decrease — tied to the same tokens that gate
  // applyAdjustment's flash (so it fires only when that field's own edit
  // actually applies, not on every render)
  const isHoursFlashing = useFlashOnToken(hoursFlash.token);
  const isMinutesFlashing = useFlashOnToken(minutesFlash.token);
  const isSecondsFlashing = useFlashOnToken(secondsFlash.token);
  const flashTextClass = (isFlashing: boolean, direction: 'inc' | 'dec') =>
    isFlashing ? (direction === 'inc' ? 'animate-increaseFlashText' : 'animate-decreaseFlashText') : '';

  // Window's own pause flash: pausing mid-overtime always stays plain
  // black regardless of repeat, since the digits below take over that
  // cue immediately (redWave) rather than waiting on this to settle.
  // Above zero it's the original behavior: infinite yellow with repeat
  // on, a fixed 3 cycles with it off (see the hasPausedSettled effect
  // above). The drain bar's pauseFlashBar is separate and always infinite.
  const pauseFlashClass = seconds < 0 ? 'bg-black' : isAlarmLooping ? 'animate-pauseFlash' : 'animate-pauseFlashLimited';

  // Drain bar under the digits: full at the configured time, empty at 0
  // (and through overtime), its left edge receding rightward as time runs
  // out while the hue sweeps green (120) -> red (0)
  const configuredMs = configuredTotalSeconds * 1000;
  const remainingMs = Math.max(0, seconds * 1000 + milliseconds);
  const timeFraction = configuredMs > 0 ? Math.min(1, remainingMs / configuredMs) : 0;
  // pausing mid-overtime would otherwise leave the bar at 0% (invisible) —
  // same trigger as the window/digit overtime cues above, so pausing while
  // ringing keeps the bar full and flashing red instead of disappearing
  const isPausedOvertime = isPaused && seconds < 0;
  // ringing red wins over the hue (the animate-alarmFlashBar class then
  // wins over this, alternating it with black); gray while never started
  const barFillColor = isAlarmRinging || isPausedOvertime ? '#ef4444' : isRunning ? `hsl(${120 * timeFraction}, 75%, 50%)` : '#6b7280';

  // a timer that's never run — idle at its configured time — has nothing
  // for STOP or RESET to act on
  const isIdleAtConfigured = !isRunning && seconds >= 0 && seconds === configuredTotalSeconds;

  // The whole window carries the state color: running flashes bright
  // green and fades to black within 5s (runFade), after which the text
  // glows to that same green (glowFade); paused flashes yellow; overtime
  // pulses red in sync with the alarm beeps and stays black while silent.
  // The small text sitting directly on the window fades black -> white
  // during the window fade before glowing green (it sets --glow-from:
  // black); the digits hold white through it (no override, so the
  // keyframes' white fallback applies) before glowing the same green. The
  // A/B swap keyed on runCycle restarts both fades for a fresh countdown
  // while the window is already green.
  const isWindowGreen = isRunning && !isPaused && seconds >= 0;
  const fadeSuffix = runCycle % 2 === 0 ? 'A' : 'B';
  const runFadeClass = `animate-runFade${fadeSuffix}`;
  const glowFadeClass = `animate-glowFade${fadeSuffix}`;
  const textGlowStyle = { '--glow-from': '#000000' } as React.CSSProperties;

  // Which of the digits' color states currently applies. Pausing while
  // negative (overtime) shows the red wave immediately — no waiting on
  // the window's own flash to settle, unlike the yellow wave above zero,
  // and it wins regardless of whether the ring itself ever finished.
  // green/white/either wave all animate themselves (green via the
  // ancestor's own glow fade, the waves via their own CSS class, white
  // via just having no override), so only solid 'red' (the ring
  // finishing while still running, not paused) needs a driven fade.
  const digitColorCategory: 'green' | 'yellowWave' | 'redWave' | 'red' | 'white' =
    isPaused && seconds < 0 ? 'redWave'
      : isPaused && hasPausedSettled ? 'yellowWave'
      : hasRungOut ? 'red'
      : isWindowGreen ? 'green'
      : 'white';
  const digitWaveClass = digitColorCategory === 'yellowWave' ? 'animate-waveYellowText' : digitColorCategory === 'redWave' ? 'animate-waveRedText' : '';
  // Routes a switch into solid red through an instant white first, so a
  // fade never cross-blends directly from green — white or either wave
  // already read as neutral, so those can fade straight into red.
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
      setDigitColorStyle({ color: '#ffffff', transition: 'color 0s' });
      const id = setTimeout(() => setDigitColorStyle({ color: '#ef4444', transition: 'color 2.5s ease' }), 0);
      return () => clearTimeout(id);
    }
  }, [digitColorCategory]);

  const status = seconds < 0
    ? (isPaused ? 'PAUSED' : 'FINISHED')
    : isRunning
      ? (isPaused ? 'PAUSED' : 'RUNNING')
      : (seconds === configuredTotalSeconds ? 'READY' : 'STOPPED');

  // Every size here clamps on min(vw, vh) rather than vw alone, so a short
  // window shrinks these controls instead of the digits: the digits'
  // own font-size (see the clock below) clamps on vw only, so a short
  // window never touches it — the digits keep priority over everything
  // else in this column.
  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: `${shrinkClamp(0.65, 1.4, 1.5, 1.4)} ${shrinkClamp(1.3, 2.75, 3.1, 2.75)}`,
    fontSize: shrinkClamp(1, 1.95, 2.4, 1.65),
    borderColor: color,
    color,
    // black chip so the colored borders stay readable on the colored window
    backgroundColor: '#000000',
    minWidth: shrinkClamp(7, 16.5, 17.5, 11.25),
  });

  return (
    <div
      ref={windowRef}
      className={`h-screen flex overflow-hidden ${isAlarmRinging ? '' : 'transition-colors duration-200'} ${
        seconds < 0
          ? isPaused
            ? pauseFlashClass
            // red only while a beep actually sounds — silent overtime
            // (muted, ring-once finished, stopped after a reload) stays
            // black, so the flashing always matches the audio; the color
            // snaps (no transition) to keep the pulses crisp
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
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar: permanent column at lg+, overlay drawer below */}
      <div
        className={`${isSidebarOpen ? 'flex' : 'hidden'} lg:flex fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto w-64 lg:w-48 bg-black border-r-4 border-white p-4 flex-col gap-4 overflow-hidden`}
      >
        <PresetsPanel
          presets={presets}
          onAdd={handleAddPreset}
          onRemove={handleRemovePreset}
          onSelect={handleSelectEntry}
          inserted={insertedPreset}
          loaded={loadedEntry}
        />
        <HistoryPanel
          history={history}
          onSelect={handleSelectEntry}
          onClear={handleClearHistory}
          inserted={insertedHistory}
          loaded={loadedEntry}
        />
      </div>

      <div className="flex-1 flex flex-col items-center p-2 sm:p-3 md:p-4 gap-2 overflow-hidden min-h-0 relative">
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-50 flex items-start gap-2">
          {/* Every header control below sizes on min(vw, vh), like the
              digits column, so a short window shrinks these too instead
              of competing with the digits for space */}
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="lg:hidden flex items-center justify-center border-3 border-white text-white transition-all duration-200 hover:opacity-80"
            style={{ ...HAMBURGER_BUTTON_SIZE, backgroundColor: '#000000' }}
            title={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
            aria-label={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
          >
            {isSidebarOpen ? <X style={HEADER_ICON_SIZE} /> : <Menu style={HEADER_ICON_SIZE} />}
          </button>

          <div className="flex flex-col gap-2">
          <div className="relative group">
            <button
              onClick={(e) => {
                // touch devices have no hover — focus keeps the volume
                // popup open (group-focus-within) so a tap can reach it
                e.currentTarget.focus();
                handleMuteToggle();
              }}
              className="flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
              style={{
                ...HEADER_BUTTON_SIZE,
                borderColor: isSilentMode ? '#ffffff' : '#22c55e',
                backgroundColor: '#000000',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              title={`${isSilentMode ? 'Click to unmute' : 'Click to mute'} — Tip: for a count-up timer (stopwatch), mute this and set the time to 00:00:00`}
              aria-label={isSilentMode ? 'Unmute' : 'Mute'}
            >
              <SpeakerIcon volume={volume} muted={isSilentMode} color={isSilentMode ? '#ffffff' : '#22c55e'} />
            </button>

            {/* Volume slider: revealed on hover/focus; releasing it previews
                the chosen level with a single alarm burst. The gap next to
                the button is padding (not margin) so the pointer can cross
                it without leaving the hover group. */}
            <div className="absolute left-full top-0 h-full pl-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 z-50 flex items-center">
              <div className="border-3 border-white bg-black p-2 flex items-center h-full">
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
                  style={{ width: '6rem', accentColor: isSilentMode ? '#ffffff' : '#22c55e' }}
                  aria-label="Volume"
                  title={`Volume: ${Math.round(volume * 100)}%`}
                />
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsAlarmLooping((prev: boolean) => !prev)}
            className="relative flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
            style={{
              ...HEADER_BUTTON_SIZE,
              borderColor: isAlarmLooping ? '#22c55e' : '#ffffff',
              backgroundColor: '#000000',
            }}
            title={isAlarmLooping ? 'Alarm repeats until stopped — click to ring a limited number of times' : 'Alarm rings a limited number of times — click to repeat until stopped'}
            aria-label={isAlarmLooping ? 'Disable alarm repeat' : 'Enable alarm repeat'}
          >
            {/* Bell is the main icon — this button is fundamentally about
                the alarm, not a generic loop toggle — sized to fill most
                of the button; Repeat sits centered inside the bell's own
                body as a badge for the repeat setting specifically */}
            <Bell
              color={isAlarmLooping ? '#22c55e' : '#ffffff'}
              style={RINGER_BELL_SIZE}
            />
            <Repeat
              aria-hidden
              color={isAlarmLooping ? '#22c55e' : '#ffffff'}
              fill="#000000"
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
          </div>

        </div>

        <div className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-50 flex items-center gap-2">
          {/* skip-confirmations toggle; the site RESET next to it is
              destructive enough that it always asks */}
          <button
            onClick={() => setSkipConfirmations((prev: boolean) => !prev)}
            aria-pressed={!skipConfirmations}
            className="flex items-center gap-2 border-3 font-bold px-3 transition-all duration-200 hover:opacity-80"
            style={{
              height: HEADER_BUTTON_SIZE.height,
              borderColor: skipConfirmations ? '#6b7280' : '#ffffff',
              color: skipConfirmations ? '#6b7280' : '#ffffff',
              backgroundColor: '#000000',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: shrinkClamp(0.65, 1.5, 1.6, 1),
            }}
            title={skipConfirmations
              ? 'Confirmation dialogs are off — actions apply immediately (the RESET button still always asks). Click to turn confirmations back on'
              : 'Confirmation dialogs are on — actions ask before applying (the RESET button always asks either way). Click to skip them'}
            aria-label={skipConfirmations ? 'Turn confirmation dialogs back on' : 'Turn confirmation dialogs off'}
          >
            <span
              aria-hidden
              className="inline-flex items-center justify-center border-2 flex-shrink-0"
              style={{ width: '0.9em', height: '0.9em', borderColor: 'currentColor' }}
            >
              <span style={{ width: '0.45em', height: '0.45em', backgroundColor: !skipConfirmations ? 'currentColor' : 'transparent' }} />
            </span>
            <span className="hidden sm:inline">CONFIRMATIONS</span>
          </button>

          {/* Reset the whole site to defaults */}
          <button
            onClick={() => setDialog({ type: 'clearCache' })}
            className="flex items-center gap-2 border-3 border-red-500 text-red-500 font-bold px-3 transition-all duration-200 hover:opacity-80"
            style={{
              height: HEADER_BUTTON_SIZE.height,
              backgroundColor: '#000000',
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: shrinkClamp(0.65, 1.5, 1.6, 1),
            }}
            title="Reset the website to defaults"
            aria-label="Reset the website to defaults"
          >
            <Trash2 style={HEADER_ICON_SIZE} />
            RESET
          </button>
        </div>

        {/* items-center centers the row's children in the cross axis
            (horizontally at mobile, vertically at lg — keeping the
            HOURS/MINUTES/SECONDS panel vertically centered there). The
            inline alignItems: 'safe center' falls back to start-alignment
            instead of clipping an overflowing item in a way scrolling
            can't reach (set via inline style since Tailwind's
            arbitrary-value class for it didn't generate real CSS here).
            Keep the items-center class too: an invalid inline value is
            dropped rather than resolving to blank, so this class is the
            fallback for browsers that reject the "safe" keyword, not dead
            weight. lg:self-start on the digits column below overrides
            just that one child to sit at the top instead, so the link
            living at its top always lands at the true top of the page —
            no "safe" fallback needed there since start-alignment can't
            clip content off the top the way center can. lg:self-stretch
            (rather than self-start) gives it the row's full height so the
            inner flex-1 wrapper around the digits/controls below can
            still center THAT content in the leftover space, instead of
            everything bunching up under the link. */}
        <div
          className="flex flex-col lg:flex-row gap-4 lg:gap-2 w-full min-h-0 flex-1 items-center justify-start lg:justify-between overflow-y-auto"
          style={{ alignItems: 'safe center' }}
        >
          <div className="flex-1 hidden lg:block"></div>

          <div className="flex flex-col items-center justify-center flex-shrink-0 lg:flex-shrink min-w-0 gap-1 w-full lg:w-auto lg:self-stretch">
            {/* Link to my main site: living in this column (rather than
                the absolute-positioned header strip) means it's centered
                by the same items-center that centers the digits below it,
                at every window size, without fighting the header icons
                for space. Its font-size clamps on min(vw, vh) rather than
                vw alone, so on a short-but-wide window the vh term takes
                over and shrinks it — yielding vertical room to the digits
                (sized purely by vw, so a short window never shrinks them)
                and the START/RESET/STOP row below. Pink instead of a timer
                state color so it never blends into the window's own green
                run-start flash; the glow is suppressed during pause/alarm
                so it doesn't compete with those higher-priority signals */}
            <a
              href="https://ruinanding.com/"
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 font-bold text-black bg-[#FF80BF] border-3 border-white px-2.5 py-0.5 sm:px-3 sm:py-1 whitespace-nowrap hover:scale-105 hover:opacity-90 transition-all duration-200 ${!isPaused && !isAlarmRinging ? 'animate-linkGlow' : ''}`}
              style={{ fontSize: shrinkClamp(0.7, 1.6, 2.2, 1.1), fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {/* shrinks at the same min(vw, vh) rate as this link's own
                  text (not the header icons' rate), so it never grows
                  disproportionate to the label it sits beside */}
              <ExternalLink style={{ width: shrinkClamp(0.9, 1.6, 2.2, 1.25), height: shrinkClamp(0.9, 1.6, 2.2, 1.25) }} />
              Check Out My Website!
            </a>

            {/* Everything below the link centers itself in whatever
                vertical space is left under it (flex-1 + justify-center),
                rather than being pulled up flush against the link now
                that the column above sits at the top instead of being
                vertically centered as a whole */}
            <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-1 w-full">
            <div
              className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
              // the digits' own font-size clamps on vw only (not
              // shrinkClamp) — the one size in this column a short window
              // never shrinks; the padding around them is chrome, so it
              // yields like everything else
              style={{ fontSize: 'clamp(1.2rem, 10.5vw, 7.5rem)', fontFamily: "'IBM Plex Mono', monospace", padding: shrinkClamp(0.25, 1.2, 1.3, 1) }}
            >
              {/* configured time, for reference */}
              <div className="opacity-60 text-center" style={{ fontSize: shrinkClamp(1.1, 2.2, 2.4, 1.85), letterSpacing: '0.05em' }}>
                {configuredLabel}
              </div>
              <div
                className={`flex items-baseline justify-center gap-1 ${digitWaveClass}`}
                style={digitColorStyle}
              >
                {remaining.hours && (
                  <span style={{ fontSize: '0.5em' }} className={flashTextClass(isHoursFlashing, hoursFlash.direction)}>
                    {remaining.sign}{remaining.hours}
                  </span>
                )}
                {/* minutes/seconds share one flex wrapper (no gap) so they
                    still sit flush as "MM:SS" — the outer gap-1 only
                    needs to separate this whole group from the hours and
                    ms segments beside it */}
                <span className="flex items-baseline">
                  <span className={flashTextClass(isMinutesFlashing, minutesFlash.direction)}>{!remaining.hours && remaining.sign}{remaining.minutes}</span>
                  <span>:</span>
                  <span className={flashTextClass(isSecondsFlashing, secondsFlash.direction)}>{remaining.seconds}</span>
                </span>
                <span style={{ fontSize: '0.5em' }}>·{remaining.ms}</span>
              </div>
              {/* the track: em height keeps it proportional to the digit
                  size, while the vw width scales with the window instead
                  of the digits. Grayed out until the timer has started.
                  Hovering previews the time at that point on the track;
                  clicking seeks the remaining time there */}
              <div
                className={`relative flex justify-end border-2 mx-auto ${configuredTotalSeconds > 0 ? 'cursor-pointer' : ''}`}
                style={{
                  height: '0.16em',
                  minHeight: '0.5rem',
                  marginTop: '0.08em',
                  width: 'clamp(16rem, 40vw, 44rem)',
                  borderColor: isRunning ? '#ffffff' : '#6b7280',
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
                      bottom: '100%',
                      transform: 'translate(-50%, -0.25rem)',
                      fontSize: 'clamp(0.65rem, 1.2vw, 0.8rem)',
                      letterSpacing: '0.05em',
                      padding: '0.125rem 0.375rem',
                    }}
                  >
                    {formatEntryLabel(fromTotalSeconds(barHover.seconds))}
                  </div>
                )}
                {/* the animation's background-color wins over the inline
                    hue, and both bar animations run out of step with the
                    window's flash so the bar stays visible against it:
                    paused alternates yellow/black at a quarter of the
                    window's rate; ringing (or paused mid-overtime, which
                    would otherwise sit at 0% width) fills the track and
                    rapidly alternates red/black, for exactly as long as the
                    beeps sound while actually ringing (with repeat off,
                    isAlarmRinging ends with the finite ring) */}
                <div
                  className={isAlarmRinging || isPausedOvertime ? 'animate-alarmFlashBar' : isPaused ? 'animate-pauseFlashBar' : ''}
                  style={{
                    width: `${(isAlarmRinging || isPausedOvertime ? 1 : timeFraction) * 100}%`,
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
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {!isRunning && (
                <button
                  onClick={handleStart}
                  className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={controlButtonStyle('#22c55e')}
                >
                  START
                </button>
              )}

              {isRunning && (
                <button
                  onClick={togglePause}
                  className="border-4 font-bold hover:opacity-80 transition-all duration-200"
                  style={controlButtonStyle(isPaused ? '#22c55e' : '#eab308')}
                >
                  {isPaused ? 'RESUME' : 'PAUSE'}
                </button>
              )}

              <button
                onClick={handleResetClick}
                disabled={isIdleAtConfigured}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={controlButtonStyle('#eab308')}
              >
                RESET
              </button>

              <button
                onClick={handleStopClick}
                disabled={isIdleAtConfigured}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={controlButtonStyle('#ef4444')}
              >
                STOP
              </button>
            </div>

            <div className="flex flex-col items-center gap-1 mt-2">
              <div
                className={`font-bold tracking-wider text-white ${isWindowGreen ? glowFadeClass : ''}`}
                style={{ fontSize: shrinkClamp(1, 2.1, 2.2, 1.5), ...textGlowStyle }}
              >
                {status}
              </div>

              {(() => {
                // a reloaded overtime timer isn't ringing — the keys act on the timer
                const subject = isRunning && seconds < 0 ? 'alarm' : 'timer';
                const hints = [
                  { key: 'SPACE', text: `Press SPACE to ${isRunning ? (isPaused ? 'RESUME' : 'PAUSE') : 'START'} the ${subject}`, disabled: false },
                  { key: 'R', text: `Press R to RESET the ${subject}`, disabled: isIdleAtConfigured },
                  { key: 'S', text: `Press S to STOP the ${subject}`, disabled: isIdleAtConfigured },
                ];
                return hints.map(({ key, text, disabled }) => (
                  <div
                    key={key}
                    className={`opacity-75 tracking-wider ${isWindowGreen && !isWordCounterFocused ? glowFadeClass : ''}`}
                    style={{
                      fontSize: shrinkClamp(0.65, 1.5, 1.6, 1),
                      color: isWordCounterFocused ? '#ef4444' : '#ffffff',
                      ...textGlowStyle,
                    }}
                  >
                    {isWordCounterFocused ? `${text} — disabled while typing` : disabled ? `${text} — disabled` : text}
                  </div>
                ));
              })()}
            </div>
            </div>
          </div>

          <div className="flex-1 hidden lg:block"></div>

          <div className="border-4 border-white bg-black p-2 sm:p-3 md:p-4 flex flex-col gap-2 flex-shrink-0 min-w-0 w-full max-w-sm lg:w-[clamp(12rem,22vw,16rem)] lg:max-w-none">
            <TimeField label="HOURS" placeholder="HH" value={hours} max={MAX_HOURS} onRequestChange={handleHoursChange} />
            <TimeField label="MINUTES" placeholder="MM" value={minutes} max={MAX_MINUTES} onRequestChange={handleMinutesChange} />
            <TimeField label="SECONDS" placeholder="SS" value={timerSeconds} max={MAX_SECONDS} onRequestChange={handleSecondsChange} />
          </div>
        </div>

        <WordCounter onFocusChange={setIsWordCounterFocused} greenFadeTextClass={isWindowGreen ? glowFadeClass : ''} />
      </div>

      <ConfirmDialog
        dialog={dialog}
        onDismiss={handleDialogDismiss}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
}
