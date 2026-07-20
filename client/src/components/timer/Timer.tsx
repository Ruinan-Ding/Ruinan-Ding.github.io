import { Menu, Repeat, Trash2, X } from 'lucide-react';
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
import { formatEntryLabel, formatTime, toTotalSeconds } from './format';
import type { DialogState, TimeParts, TimerEntry, TimeUnit } from './types';

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
      style={{ width: 'clamp(1.5rem, 3vw, 2rem)', height: 'clamp(1.5rem, 3vw, 2rem)' }}
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

export default function Timer() {
  // Parse persisted state once, before first render, so the persist effect
  // can't save defaults over it. isRunning/isPaused are not restored.
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

  // Remaining time: signed whole seconds plus milliseconds in [0, 1000)
  const [time, setTime] = useState(() => ({
    seconds: savedNumber('seconds', toTotalSeconds(DEFAULT_TIME)),
    milliseconds: 0,
  }));
  const { seconds, milliseconds } = time;
  // mirror for callbacks that need the current time without re-memoizing
  // on every countdown tick
  const timeRef = useRef(time);
  timeRef.current = time;

  const [hours, setHours] = useState(() => savedNumber('hours', DEFAULT_TIME.hours));
  const [minutes, setMinutes] = useState(() => savedNumber('minutes', DEFAULT_TIME.minutes));
  const [timerSeconds, setTimerSeconds] = useState(() => savedNumber('timerSeconds', DEFAULT_TIME.seconds));

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
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
  }, [seconds, isPaused, isRunning, hours, minutes, timerSeconds, history, isSilentMode, presets, volume, hasMutedBefore, isAlarmLooping]);

  useEffect(() => {
    promptShownInStateRef.current = false;
  }, [isRunning, isPaused]);

  // Confirming via Enter closes the dialog without a Radix close event, so
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
  useEffect(() => {
    if (!isOvertime) {
      alarmRungThisOvertimeRef.current = false;
      alarmTickRef.current = 0;
    }
  }, [isOvertime]);

  // Window flash synced to the alarm: isAlarmRinging while the beep
  // interval runs, isBeepFlash pulsing red for each individual beep
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [isBeepFlash, setIsBeepFlash] = useState(false);

  useEffect(() => {
    if (!isAlarmActive) return;
    if (!isAlarmLooping && alarmRungThisOvertimeRef.current) return;
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
      setDialog({ type: 'mute' });
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

  const recordHistory = (parts: TimeParts) => {
    const entry: TimerEntry = { id: uniqueId(), ...parts, timestamp: Date.now() };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
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
      clearAlarmInterval();
      setTime({ seconds: configuredTotalSeconds, milliseconds: 0 });
      recordHistory(configured);
      setIsRunning(true);
      setIsPaused(false);
      restartRunFade();
      return;
    }
    setDialog({ type: 'reset' });
  };

  const handleConfirmReset = () => {
    playTone('reset');
    clearAlarmInterval();
    setTime({ seconds: configuredTotalSeconds, milliseconds: 0 });
    recordHistory(configured);
    setIsRunning(true);
    setIsPaused(false);
    restartRunFade();
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
    // confirm while counting down or paused (even paused in overtime);
    // an actively beeping timer switches straight over
    if (isRunning && (isPaused || timeRef.current.seconds >= 0)) {
      setDialog({ type: 'switch', data: parts, start: true });
      return;
    }
    // a stopped timer showing anything other than its configured time —
    // mid-run or overtime after a reload — still has progress on screen;
    // confirm before discarding it, but confirming only loads the preset
    if (!isRunning && timeRef.current.seconds !== configuredTotalSeconds) {
      setDialog({ type: 'switch', data: parts, start: false });
      return;
    }
    // a beeping timer hands off to the new preset and keeps running;
    // a stopped one just loads it
    applySwitch(parts, isRunning && timeRef.current.seconds < 0);
  }, [isRunning, isPaused, configuredTotalSeconds, loadEntry, isSilentMode, beep]);

  const handleConfirmSwitch = (parts: TimeParts, start: boolean) => {
    applySwitch(parts, start);
    closeDialog();
  };

  const handleAddPreset = useCallback((parts: TimeParts) => {
    setPresets((prev) => (prev.length >= MAX_PRESETS ? prev : [...prev, { id: uniqueId(), ...parts, timestamp: 0 }]));
  }, []);

  const handleRemovePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleClearHistory = useCallback(() => setHistory([]), []);

  const setterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHours : unit === 'minutes' ? setMinutes : setTimerSeconds),
    []
  );

  // Apply a change to one unit of the configured time, shifting the
  // remaining time by the same delta so elapsed progress is kept (changing
  // hours must not reset the minutes/seconds already counted down).
  // Dropping to 0 or below while running/paused zeroes the clock so the
  // alarm kicks in on the next tick.
  const applyAdjustment = useCallback((unit: TimeUnit, value: number, previous: number) => {
    setterFor(unit)(value);
    restartRunFade();
    // a finished (beeping) timer restarts from the new configured time
    // instead of clamping the negative remainder to zero
    if (timeRef.current.seconds < 0) {
      clearAlarmInterval();
      setTime({ seconds: toTotalSeconds({ ...configured, [unit]: value }), milliseconds: 0 });
      setIsPaused(false);
      return;
    }
    const delta = (value - previous) * (unit === 'hours' ? 3600 : unit === 'minutes' ? 60 : 1);
    if (isRunning || isPaused) {
      // at most one tick stale while running, which the countdown absorbs
      if (timeRef.current.seconds + delta <= 0) {
        setTime({ seconds: 0, milliseconds: 0 });
        setIsPaused(false);
      } else {
        setTime((prev) => ({ ...prev, seconds: prev.seconds + delta }));
      }
    } else {
      setTime((prev) => ({ ...prev, seconds: Math.max(0, prev.seconds + delta) }));
    }
  }, [isRunning, isPaused, setterFor, configured]);

  // Changing a field while running/paused asks for confirmation first
  const requestConfiguredChange = useCallback((unit: TimeUnit, value: number) => {
    const previous = configured[unit];
    setterFor(unit)(value);

    if (value === previous) return;

    // no confirmation while beeping — the adjustment restarts the timer
    if ((isRunning || isPaused) && timeRef.current.seconds >= 0 && !promptShownInStateRef.current) {
      setDialog({ type: 'adjust', data: { unit, value, previous } });
      promptShownInStateRef.current = true;
    } else {
      applyAdjustment(unit, value, previous);
    }
  }, [configured, isRunning, isPaused, setterFor, applyAdjustment]);

  const handleHoursChange = useCallback((value: number) => requestConfiguredChange('hours', value), [requestConfiguredChange]);
  const handleMinutesChange = useCallback((value: number) => requestConfiguredChange('minutes', value), [requestConfiguredChange]);
  const handleSecondsChange = useCallback((value: number) => requestConfiguredChange('seconds', value), [requestConfiguredChange]);

  const handleConfirmAdjust = (unit: TimeUnit, value: number, previous: number) => {
    applyAdjustment(unit, value, previous);
    closeDialog();
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

  // Drain bar under the digits: full at the configured time, empty at 0
  // (and through overtime), its left edge receding rightward as time runs
  // out while the hue sweeps green (120) -> red (0)
  const configuredMs = configuredTotalSeconds * 1000;
  const remainingMs = Math.max(0, seconds * 1000 + milliseconds);
  const timeFraction = configuredMs > 0 ? Math.min(1, remainingMs / configuredMs) : 0;

  // a timer that's never run — idle at its configured time — has nothing
  // for STOP or RESET to act on
  const isIdleAtConfigured = !isRunning && seconds >= 0 && seconds === configuredTotalSeconds;

  // The whole window carries the state color: running flashes bright
  // green and fades to a near-black dark green within 5s (runFade);
  // paused flashes yellow; overtime pulses red in sync with the alarm
  // beeps and stays black while silent. The small text sitting directly
  // on the window fades black -> white in step (runFadeText); the digits
  // stay white throughout. The A/B swap keyed on runCycle restarts the
  // fade for a fresh countdown while the window is already green.
  const isWindowGreen = isRunning && !isPaused && seconds >= 0;
  const runFadeClass = runCycle % 2 === 0 ? 'animate-runFadeA' : 'animate-runFadeB';
  const runFadeTextClass = runCycle % 2 === 0 ? 'animate-runFadeTextA' : 'animate-runFadeTextB';

  const status = seconds < 0
    ? (isPaused ? 'PAUSED' : 'FINISHED')
    : isRunning
      ? (isPaused ? 'PAUSED' : 'RUNNING')
      : (seconds === configuredTotalSeconds ? 'READY' : 'STOPPED');

  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)',
    fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)',
    borderColor: color,
    color,
    // black chip so the colored borders stay readable on the colored window
    backgroundColor: '#000000',
    minWidth: 'clamp(5rem, 12vw, 8rem)',
  });

  return (
    <div
      className={`h-screen flex overflow-hidden ${isAlarmRinging ? '' : 'transition-colors duration-200'} ${
        seconds < 0
          ? isPaused
            ? 'animate-pauseFlash'
            // red only while a beep actually sounds — silent overtime
            // (muted, ring-once finished, stopped after a reload) stays
            // black, so the flashing always matches the audio; the color
            // snaps (no transition) to keep the pulses crisp
            : isBeepFlash
              ? 'bg-red-500'
              : 'bg-black'
          : isRunning
            ? isPaused
              ? 'animate-pauseFlash'
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
        <PresetsPanel presets={presets} onAdd={handleAddPreset} onRemove={handleRemovePreset} onSelect={handleSelectEntry} />
        <HistoryPanel history={history} onSelect={handleSelectEntry} onClear={handleClearHistory} />
      </div>

      <div className="flex-1 flex flex-col items-center p-2 sm:p-3 md:p-4 gap-2 overflow-hidden min-h-0 relative">
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-50 flex items-start gap-2">
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="lg:hidden w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border-3 border-white text-white transition-all duration-200 hover:opacity-80"
            style={{ backgroundColor: '#000000' }}
            title={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
            aria-label={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
          >
            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
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
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
              style={{
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
            className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
            style={{
              borderColor: isAlarmLooping ? '#22c55e' : '#ffffff',
              backgroundColor: '#000000',
            }}
            title={isAlarmLooping ? 'Alarm repeats until stopped — click to ring a limited number of times' : 'Alarm rings a limited number of times — click to repeat until stopped'}
            aria-label={isAlarmLooping ? 'Disable alarm repeat' : 'Enable alarm repeat'}
          >
            <Repeat size={22} color={isAlarmLooping ? '#22c55e' : '#ffffff'} />
          </button>
          </div>

        </div>

        {/* Link to my main site */}
        <a
          href="https://ruinan-ding.github.io/Ruinan-Ding/"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-2 sm:top-3 md:top-4 left-1/2 -translate-x-1/2 z-50 text-white underline hover:opacity-80 transition-opacity whitespace-nowrap"
          style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1rem)', fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Check out my website
        </a>

        {/* Reset the whole site to defaults */}
        <button
          onClick={() => setDialog({ type: 'clearCache' })}
          className="absolute top-2 right-2 sm:top-3 sm:right-3 md:top-4 md:right-4 z-50 flex items-center gap-2 border-3 border-red-500 text-red-500 font-bold px-3 h-10 sm:h-12 md:h-14 transition-all duration-200 hover:opacity-80"
          style={{ backgroundColor: '#000000', fontFamily: "'IBM Plex Mono', monospace", fontSize: 'clamp(0.75rem, 1.5vw, 1rem)' }}
          title="Reset the website to defaults"
          aria-label="Reset the website to defaults"
        >
          <Trash2 size={22} />
          RESET
        </button>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-2 w-full min-h-0 flex-1 items-center justify-start lg:justify-between overflow-y-auto lg:overflow-hidden">
          <div className="flex-1 hidden lg:block"></div>

          <div className="flex flex-col items-center justify-center flex-shrink-0 lg:flex-shrink min-w-0 gap-1 w-full lg:w-auto">
            <div
              className="font-bold tracking-wider text-white"
              style={{ fontSize: 'clamp(1rem, 9vw, 6rem)', fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1.5vw, 1rem)' }}
            >
              <div className="flex items-baseline gap-1">
                {remaining.hours && <span style={{ fontSize: '0.5em' }}>{remaining.sign}{remaining.hours}</span>}
                <span>{!remaining.hours && remaining.sign}{remaining.main}</span>
                <span style={{ fontSize: '0.5em' }}>·{remaining.ms}</span>
                {/* configured time, for reference */}
                <span className="opacity-60" style={{ fontSize: 'clamp(0.85rem, 1.6vw, 1.15rem)', letterSpacing: '0.05em', marginLeft: '0.25em' }}>
                  /{configuredLabel}
                </span>
              </div>
              {/* inside the digits box so it matches the digits' width;
                  em units keep its size proportional to the digit size */}
              <div className="flex justify-end border-2 border-white" style={{ height: '0.16em', minHeight: '0.5rem', marginTop: '0.08em' }}>
                <div
                  style={{
                    width: `${timeFraction * 100}%`,
                    height: '100%',
                    backgroundColor: `hsl(${120 * timeFraction}, 75%, 50%)`,
                  }}
                />
              </div>
            </div>

            <div className="flex gap-2">
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
              <div className={`font-bold tracking-wider text-white ${isWindowGreen ? runFadeTextClass : ''}`} style={{ fontSize: 'clamp(0.65rem, 1.5vw, 0.875rem)' }}>
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
                    className={`opacity-75 tracking-wider ${isWindowGreen && !isWordCounterFocused ? runFadeTextClass : ''}`}
                    style={{
                      fontSize: 'clamp(0.75rem, 1.8vw, 1rem)',
                      color: isWordCounterFocused ? '#ef4444' : '#ffffff',
                    }}
                  >
                    {isWordCounterFocused ? `${text} — disabled while typing` : disabled ? `${text} — disabled` : text}
                  </div>
                ));
              })()}
            </div>
          </div>

          <div className="flex-1 hidden lg:block"></div>

          <div className="border-4 border-white bg-black p-2 sm:p-3 md:p-4 flex flex-col gap-2 flex-shrink-0 min-w-0 w-full max-w-sm lg:w-[clamp(12rem,22vw,16rem)] lg:max-w-none">
            <TimeField label="HOURS" placeholder="HH" value={hours} max={MAX_HOURS} onRequestChange={handleHoursChange} />
            <TimeField label="MINUTES" placeholder="MM" value={minutes} max={MAX_MINUTES} onRequestChange={handleMinutesChange} />
            <TimeField label="SECONDS" placeholder="SS" value={timerSeconds} max={MAX_SECONDS} onRequestChange={handleSecondsChange} />
          </div>
        </div>

        <WordCounter onFocusChange={setIsWordCounterFocused} greenFadeTextClass={isWindowGreen ? runFadeTextClass : ''} />
      </div>

      <ConfirmDialog
        dialog={dialog}
        onDismiss={handleDialogDismiss}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
}
