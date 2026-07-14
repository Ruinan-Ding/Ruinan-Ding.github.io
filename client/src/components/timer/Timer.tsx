import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import { uniqueId } from '@/lib/utils';
import ConfirmDialog from './ConfirmDialog';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_TICK_MS, DEFAULT_PRESETS, DEFAULT_TIME, DEFAULT_VOLUME, MAX_HISTORY, MAX_HOURS, MAX_MINUTES, MAX_PRESETS, MAX_SECONDS, MIN_TOTAL_SECONDS, STORAGE_KEYS, TICK_MS, TONES } from './constants';
import { formatTime, toTotalSeconds } from './format';
import type { DialogState, TimeParts, TimerEntry, TimeUnit } from './types';

export default function Timer() {
  // Parse persisted state once, before first render, so the persist effect
  // can't save defaults over it. isRunning/isPaused are not restored.
  const initial = useMemo(() => {
    let saved: Record<string, unknown> = {};
    let history: TimerEntry[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.timerState) ?? 'null');
      if (parsed && typeof parsed === 'object') saved = parsed;
    } catch (e) {
      console.error('Failed to load timer state:', e);
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.history) ?? 'null');
      if (Array.isArray(parsed)) history = parsed;
    } catch (e) {
      console.error('Failed to load history:', e);
    }
    return { saved, history };
  }, []);
  const savedNumber = (key: string, fallback: number) =>
    typeof initial.saved[key] === 'number' ? (initial.saved[key] as number) : fallback;

  // Remaining time: signed whole seconds plus milliseconds in [0, 1000)
  const [time, setTime] = useState(() => ({
    seconds: savedNumber('seconds', toTotalSeconds(DEFAULT_TIME)),
    milliseconds: 0,
  }));
  const { seconds, milliseconds } = time;

  const [hours, setHours] = useState(() => savedNumber('hours', DEFAULT_TIME.hours));
  const [minutes, setMinutes] = useState(() => savedNumber('minutes', DEFAULT_TIME.minutes));
  const [timerSeconds, setTimerSeconds] = useState(() => savedNumber('timerSeconds', DEFAULT_TIME.seconds));

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSilentMode, setIsSilentMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.silentMode);
    return saved ? JSON.parse(saved) : false;
  });
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.volume);
    return saved ? JSON.parse(saved) : DEFAULT_VOLUME;
  });

  const [history, setHistory] = useState<TimerEntry[]>(initial.history);
  const [presets, setPresets] = useState<TimerEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.presets);
    if (!saved) return DEFAULT_PRESETS;
    try {
      const parsed: TimerEntry[] = JSON.parse(saved);
      // older saves packed hours into minutes
      return parsed.map((p) => ({
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

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // only prompt for time adjustments once per running/paused state
  const promptShownInStateRef = useRef(false);
  // Radix fires both onClick and onOpenChange for the same click, so the
  // dismiss handler needs a ref to tell "just confirmed" from "cancelled"
  const justConfirmedRef = useRef(false);

  const { beep } = useBeep(volume);
  const lastVolumePreviewRef = useRef(0);

  const configured: TimeParts = useMemo(
    () => ({ hours, minutes, seconds: timerSeconds }),
    [hours, minutes, timerSeconds]
  );
  const configuredTotalSeconds = toTotalSeconds(configured);

  const closeDialog = () => setDialog({ type: null });

  // Persist state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.timerState, JSON.stringify({ seconds, isPaused, isRunning, hours, minutes, timerSeconds }));
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    localStorage.setItem(STORAGE_KEYS.silentMode, JSON.stringify(isSilentMode));
    localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
    localStorage.setItem(STORAGE_KEYS.volume, JSON.stringify(volume));
  }, [seconds, isPaused, isRunning, hours, minutes, timerSeconds, history, isSilentMode, presets, volume]);

  useEffect(() => {
    promptShownInStateRef.current = false;
  }, [isRunning, isPaused]);

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
      const elapsed = now - lastTime;
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

  // Alarm while in negative time: bursts of beeps with gaps between them
  const isAlarmActive = isRunning && !isPaused && seconds < 0 && !isSilentMode;
  useEffect(() => {
    if (!isAlarmActive) return;

    let tick = 0;
    const playTick = () => {
      if (tick % (ALARM_BURST_COUNT + ALARM_BURST_GAP_TICKS) < ALARM_BURST_COUNT) {
        beep(...TONES.alarm);
      }
      tick++;
    };
    playTick();
    const id = setInterval(playTick, ALARM_TICK_MS);
    beepIntervalRef.current = id;

    return () => {
      clearInterval(id);
      beepIntervalRef.current = null;
    };
  }, [isAlarmActive, beep]);

  // Spacebar mirrors the on-screen controls; the ref lets the keydown
  // listener stay registered once instead of rebinding every tick
  const spacebarActionRef = useRef<() => boolean>(() => false);
  spacebarActionRef.current = () => {
    // let the dialog own the keyboard while open
    if (dialog.type !== null) return false;
    if (isRunning) {
      togglePause();
    } else {
      handleStart();
    }
    return true;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if (spacebarActionRef.current()) {
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

  // Preview the dragged level with a single alarm burst; throttled to the
  // tone's own duration so fast dragging doesn't stack overlapping beeps
  const handleVolumeChange = (value: number) => {
    setVolume(value);
    const now = Date.now();
    if (now - lastVolumePreviewRef.current >= ALARM_TICK_MS) {
      lastVolumePreviewRef.current = now;
      beep(...TONES.alarm, value);
    }
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
    setIsPaused((prev) => {
      const nextIsPaused = !prev;
      if (!isSilentMode) {
        beep(...(nextIsPaused ? TONES.pause : TONES.resume));
      }
      return nextIsPaused;
    });
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
      return;
    }
    setDialog({ type: 'reset' });
  };

  const handleConfirmReset = () => {
    playTone('reset');
    stopToConfigured();
    recordHistory(configured);
    closeDialog();
  };

  const loadEntry = useCallback((parts: TimeParts) => {
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setTimerSeconds(parts.seconds);
    setTime({ seconds: toTotalSeconds(parts), milliseconds: 0 });
    setIsSidebarOpen(false);
  }, []);

  const handleSelectEntry = useCallback((entry: TimerEntry) => {
    const parts: TimeParts = { hours: entry.hours ?? 0, minutes: entry.minutes, seconds: entry.seconds };
    if (isRunning) {
      setDialog({ type: 'switch', data: parts });
      return;
    }
    loadEntry(parts);
    setIsPaused(false);
  }, [isRunning, loadEntry]);

  const handleConfirmSwitch = (parts: TimeParts) => {
    loadEntry(parts);
    setIsPaused(false);
    setIsRunning(false);
    recordHistory(parts);
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

  const totalWith = useCallback(
    (unit: TimeUnit, value: number) => toTotalSeconds({ ...configured, [unit]: value }),
    [configured]
  );

  // Apply a change to one unit of the configured time; landing on 0 while
  // running/paused zeroes the clock so the alarm kicks in on the next tick
  const applyAdjustment = useCallback((unit: TimeUnit, value: number) => {
    setterFor(unit)(value);
    const newTotalSeconds = totalWith(unit, value);
    if (newTotalSeconds <= 0 && (isRunning || isPaused)) {
      setTime({ seconds: 0, milliseconds: 0 });
      setIsPaused(false);
    } else {
      setTime((prev) => ({ ...prev, seconds: newTotalSeconds }));
    }
  }, [isRunning, isPaused, setterFor, totalWith]);

  // Changing a field while running/paused asks for confirmation first
  const requestConfiguredChange = useCallback((unit: TimeUnit, value: number) => {
    const previous = configured[unit];
    setterFor(unit)(value);

    if (unit === 'hours' && value === previous) return;

    if ((isRunning || isPaused) && !promptShownInStateRef.current) {
      setDialog({ type: 'adjust', data: { unit, value, previous } });
      promptShownInStateRef.current = true;
    } else {
      applyAdjustment(unit, value);
    }
  }, [configured, isRunning, isPaused, setterFor, applyAdjustment]);

  const handleHoursChange = useCallback((value: number) => requestConfiguredChange('hours', value), [requestConfiguredChange]);
  const handleMinutesChange = useCallback((value: number) => requestConfiguredChange('minutes', value), [requestConfiguredChange]);
  const handleSecondsChange = useCallback((value: number) => requestConfiguredChange('seconds', value), [requestConfiguredChange]);

  const handleConfirmAdjust = (unit: TimeUnit, value: number) => {
    applyAdjustment(unit, value);
    closeDialog();
  };

  const handleDialogConfirm = () => {
    justConfirmedRef.current = true;
    switch (dialog.type) {
      case 'stop':
        handleConfirmStop();
        break;
      case 'reset':
        handleConfirmReset();
        break;
      case 'switch':
        handleConfirmSwitch(dialog.data);
        break;
      case 'adjust':
        handleConfirmAdjust(dialog.data.unit, dialog.data.value);
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
  const configuredDisplay = formatTime(configuredTotalSeconds);

  const status = seconds < 0
    ? (isPaused ? 'PAUSED' : 'FINISHED')
    : isRunning
      ? (isPaused ? 'PAUSED' : 'RUNNING')
      : (seconds === configuredTotalSeconds ? 'READY' : 'STOPPED');

  const statusColor = seconds < 0
    ? (isPaused ? '#eab308' : '#ef4444')
    : isRunning
      ? (isPaused ? '#eab308' : '#22c55e')
      : '#ffffff';

  const controlButtonStyle = (color: string) => ({
    fontFamily: "'IBM Plex Mono', monospace",
    padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)',
    fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)',
    borderColor: color,
    color,
    backgroundColor: 'transparent',
    minWidth: 'clamp(5rem, 12vw, 8rem)',
  });

  return (
    <div className="h-screen bg-black flex overflow-hidden">
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
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 z-50 flex items-center gap-2">
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            className="lg:hidden w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center border-3 border-white text-white transition-all duration-200 hover:opacity-80"
            style={{ backgroundColor: 'transparent' }}
            title={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
            aria-label={isSidebarOpen ? 'Close presets & history' : 'Open presets & history'}
          >
            {isSidebarOpen ? <X size={22} /> : <Menu size={22} />}
          </button>

          <div className="relative group">
            <button
              onClick={() => {
                beep(...TONES.silentToggle);
                setIsSilentMode(!isSilentMode);
              }}
              className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
              style={{
                borderColor: isSilentMode ? '#ffffff' : '#22c55e',
                backgroundColor: 'transparent',
                fontFamily: "'IBM Plex Mono', monospace",
              }}
              title={`${isSilentMode ? 'Click to unmute' : 'Click to mute'} — Tip: for a count-up timer (stopwatch), mute this and set the time to 00:00:00`}
              aria-label={isSilentMode ? 'Unmute' : 'Mute'}
            >
              <span style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', color: isSilentMode ? '#ffffff' : '#22c55e', lineHeight: '1' }}>
                {isSilentMode ? '🔇' : '🔊'}
              </span>
              {isSilentMode && (
                <div
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '3px',
                    backgroundColor: '#ffffff',
                    transform: 'rotate(45deg)',
                  }}
                />
              )}
            </button>

            {/* Volume slider: revealed on hover/focus; dragging previews the
                level with a single (throttled) alarm burst */}
            <div className="absolute left-0 top-full mt-2 invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 transition-opacity duration-150 border-3 border-white bg-black p-2 z-50">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="block"
                style={{ width: '6rem', accentColor: isSilentMode ? '#ffffff' : '#22c55e' }}
                aria-label="Volume"
                title={`Volume: ${Math.round(volume * 100)}%`}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:gap-2 w-full min-h-0 flex-1 items-center justify-start lg:justify-between overflow-y-auto lg:overflow-hidden">
          <div className="flex-1 hidden lg:block"></div>

          <div className="flex flex-col items-center justify-center flex-shrink-0 lg:flex-shrink min-w-0 gap-1 w-full lg:w-auto">
            <div
              className={`font-bold tracking-wider transition-all duration-200 ${
                seconds < 0
                  ? `text-white ${isPaused ? 'animate-pauseFlash' : 'animate-finishFlash'}`
                  : isRunning && !isPaused
                    ? 'text-black bg-green-500 animate-none'
                    : `text-white ${isRunning && isPaused ? 'animate-pauseFlash' : ''}`
              }`}
              style={{ fontSize: 'clamp(2.5rem, 12vw, 6rem)', fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1.5vw, 1rem)' }}
            >
              <div className="flex items-baseline gap-1">
                {remaining.hours && <span style={{ fontSize: '0.5em' }}>{remaining.sign}{remaining.hours}</span>}
                <span>{!remaining.hours && remaining.sign}{remaining.main}</span>
                <span style={{ fontSize: '0.5em' }}>·{remaining.ms}</span>
                {/* configured time, for reference */}
                <span className="opacity-60" style={{ fontSize: 'clamp(0.85rem, 1.6vw, 1.15rem)', letterSpacing: '0.05em', marginLeft: '0.25em' }}>
                  /{configuredDisplay.hours && `${configuredDisplay.hours}:`}{configuredDisplay.main}
                </span>
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
                onClick={handleStopClick}
                disabled={!isRunning && seconds >= 0 && seconds === configuredTotalSeconds}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={controlButtonStyle('#ef4444')}
              >
                STOP
              </button>

              <button
                onClick={handleResetClick}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200"
                style={controlButtonStyle('#eab308')}
              >
                RESET
              </button>
            </div>

            <div className="flex flex-col items-center gap-1 mt-2">
              <div className="font-bold tracking-wider" style={{ fontSize: 'clamp(0.65rem, 1.5vw, 0.875rem)', color: statusColor }}>
                {status}
              </div>

              {isWordCounterFocused && (
                <div className="text-red-500 opacity-75 tracking-wider" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1rem)' }}>
                  Spacebar disabled for timer
                </div>
              )}
              {isRunning && !isWordCounterFocused && (
                <div className="text-white opacity-75 tracking-wider" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1rem)' }}>
                  Press SPACE to {isPaused ? 'RESUME' : 'PAUSE'} the {seconds < 0 ? 'alarm' : 'timer'}
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 hidden lg:block"></div>

          <div className="border-4 border-white p-2 sm:p-3 md:p-4 flex flex-col gap-2 flex-shrink-0 min-w-0 w-full max-w-sm lg:w-[clamp(12rem,22vw,16rem)] lg:max-w-none">
            <TimeField label="HOURS" placeholder="HH" value={hours} max={MAX_HOURS} onRequestChange={handleHoursChange} />
            <TimeField label="MINUTES" placeholder="MM" value={minutes} max={MAX_MINUTES} onRequestChange={handleMinutesChange} />
            <TimeField label="SECONDS" placeholder="SS" value={timerSeconds} max={MAX_SECONDS} onRequestChange={handleSecondsChange} />
          </div>
        </div>

        <WordCounter onFocusChange={setIsWordCounterFocused} />
      </div>

      <ConfirmDialog
        dialog={dialog}
        onDismiss={handleDialogDismiss}
        onConfirm={handleDialogConfirm}
      />
    </div>
  );
}
