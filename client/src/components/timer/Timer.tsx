import { Menu, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBeep } from '@/hooks/useBeep';
import { useFavicon } from '@/hooks/useFavicon';
import ConfirmDialog from './ConfirmDialog';
import HistoryPanel from './HistoryPanel';
import PresetsPanel from './PresetsPanel';
import TimeField from './TimeField';
import WordCounter from './WordCounter';
import { ALARM_BURST_COUNT, ALARM_BURST_GAP_TICKS, ALARM_TICK_MS, DEFAULT_PRESETS, DEFAULT_TIME, MAX_HISTORY, MAX_HOURS, MAX_MINUTES, MAX_PRESETS, MAX_SECONDS, MIN_TOTAL_SECONDS, STORAGE_KEYS, TICK_MS, TONES } from './constants';
import { formatTime, toTotalSeconds } from './format';
import type { DialogState, TimeParts, TimerEntry, TimeUnit } from './types';

/**
 * Countdown timer with presets, run history, and a word-counter scratchpad.
 *
 * Time is tracked as `seconds` (signed) plus `milliseconds` in [0, 1000):
 * remaining time = seconds + milliseconds / 1000. Once the countdown passes
 * zero, `seconds` goes negative and the alarm sounds until stopped, down to
 * a floor of -99:59:59.
 */
export default function Timer() {
  // Remaining time
  const [seconds, setSeconds] = useState(toTotalSeconds(DEFAULT_TIME));
  const [milliseconds, setMilliseconds] = useState(0);

  // Configured time (independent, doesn't change while counting down)
  const [hours, setHours] = useState(DEFAULT_TIME.hours);
  const [minutes, setMinutes] = useState(DEFAULT_TIME.minutes);
  const [timerSeconds, setTimerSeconds] = useState(DEFAULT_TIME.seconds);

  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSilentMode, setIsSilentMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.silentMode);
    return saved ? JSON.parse(saved) : false;
  });

  const [history, setHistory] = useState<TimerEntry[]>([]);
  const [presets, setPresets] = useState<TimerEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.presets);
    if (!saved) return DEFAULT_PRESETS;
    try {
      const parsed: TimerEntry[] = JSON.parse(saved);
      // Older saves packed hours into minutes (hh * 60 + mm); unpack them
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
  // Below `lg`, the sidebar becomes a toggleable overlay instead of a
  // permanent column, so the clock and the time inputs get the full width
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Adjusting the configured time while running asks for confirmation, but
  // only once per running/paused state
  const promptShownInStateRef = useRef(false);
  // Radix fires both a button's own onClick AND onOpenChange for the same
  // click, and React batches both within the same event before dialog state
  // itself updates — a ref (synchronous, unlike state) is what lets the
  // dismiss handler below tell "just confirmed" apart from "cancelled".
  const justConfirmedRef = useRef(false);

  const { beep } = useBeep();

  // Memoized so it only gets a new identity when the configured time actually
  // changes, not on every countdown tick — everything below that depends on
  // it (and gets handed to a memoized child component) stays stable too.
  const configured: TimeParts = useMemo(
    () => ({ hours, minutes, seconds: timerSeconds }),
    [hours, minutes, timerSeconds]
  );
  const configuredTotalSeconds = toTotalSeconds(configured);

  const closeDialog = () => setDialog({ type: null });

  // Load persisted state on mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEYS.timerState);
    const savedHistory = localStorage.getItem(STORAGE_KEYS.history);

    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        if (typeof parsed.seconds === 'number') setSeconds(parsed.seconds);
        if (typeof parsed.hours === 'number') setHours(parsed.hours);
        if (typeof parsed.minutes === 'number') setMinutes(parsed.minutes);
        if (typeof parsed.timerSeconds === 'number') setTimerSeconds(parsed.timerSeconds);
        // Always load paused and not running with fresh milliseconds;
        // the user must press START to resume
        setMilliseconds(0);
      } catch (e) {
        console.error('Failed to load timer state:', e);
      }
    }

    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
  }, []);

  // Persist state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.timerState, JSON.stringify({ seconds, isPaused, isRunning, hours, minutes, timerSeconds }));
    localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
    localStorage.setItem(STORAGE_KEYS.silentMode, JSON.stringify(isSilentMode));
    localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(presets));
  }, [seconds, isPaused, isRunning, hours, minutes, timerSeconds, history, isSilentMode, presets]);

  // Allow one confirmation prompt per running/paused state
  useEffect(() => {
    promptShownInStateRef.current = false;
  }, [isRunning, isPaused]);

  // Show the remaining time (not the configured time) in the tab title/favicon
  const remainingWholeSeconds = Math.floor(Math.abs(seconds * 1000 + milliseconds) / 1000);
  useFavicon(
    isRunning,
    isPaused,
    seconds < 0,
    Math.floor((remainingWholeSeconds % 3600) / 60),
    remainingWholeSeconds % 60,
    Math.floor(remainingWholeSeconds / 3600)
  );

  // Countdown: decrement by elapsed wall-clock time, wrapping milliseconds
  // into seconds; continues into negative time until the floor
  useEffect(() => {
    if (!isRunning || isPaused) return;

    let lastTime = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTime;
      lastTime = now;

      setMilliseconds((prev) => {
        const newMs = prev - elapsed;
        if (newMs < 0) {
          setSeconds((prevSecs) => Math.max(prevSecs - 1, MIN_TOTAL_SECONDS));
          return newMs + 1000;
        }
        return newMs;
      });
    }, TICK_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused]);

  // Freeze the clock once it hits the -99:59:59 floor (the alarm keeps sounding)
  useEffect(() => {
    if (seconds <= MIN_TOTAL_SECONDS) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setMilliseconds(0);
    }
  }, [seconds]);

  // Alarm while in negative time: bursts of quick beeps with a longer
  // silence between bursts (see the ALARM_* constants for the pattern)
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

  // Spacebar mirrors the on-screen controls: START when idle, PAUSE/RESUME
  // otherwise (including the alarm). The listener is registered once; a ref
  // carries the latest action so it doesn't need to be torn down and
  // re-added on every countdown tick (Timer re-renders every TICK_MS while
  // running).
  const spacebarActionRef = useRef<() => void>(() => {});
  spacebarActionRef.current = () => {
    if (isRunning) {
      togglePause();
    } else {
      handleStart();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      // Don't intercept spacebar while typing in a text field
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      e.preventDefault();
      spacebarActionRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Escape closes the mobile sidebar drawer (ConfirmDialog gets this for
  // free from Radix; this plain overlay needs it wired up manually)
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
    const entry: TimerEntry = { id: Date.now().toString(), ...parts, timestamp: Date.now() };
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
    if (seconds <= 0) {
      setSeconds(configuredTotalSeconds);
    }

    recordHistory(configured);
    setMilliseconds(0);
    setIsRunning(true);
    setIsPaused(false);
    playTone('start');
  };

  const stopToConfigured = () => {
    // Clear intervals before touching state
    clearAlarmInterval();
    clearCountdownInterval();
    setSeconds(configuredTotalSeconds);
    setMilliseconds(0);
    setIsRunning(false);
    setIsPaused(false);
  };

  const handleStopClick = () => {
    // Only an actively-beeping alarm stops without confirmation;
    // a paused alarm asks first, like any other stop
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
      setSeconds(configuredTotalSeconds);
      setMilliseconds(0);
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

  /** Apply a preset/history entry as the configured time. */
  const loadEntry = useCallback((parts: TimeParts) => {
    setHours(parts.hours);
    setMinutes(parts.minutes);
    setTimerSeconds(parts.seconds);
    setSeconds(toTotalSeconds(parts));
    setMilliseconds(0);
    setIsSidebarOpen(false);
  }, []);

  // Stable so PresetsPanel/HistoryPanel (React.memo'd) can skip re-rendering
  // on every countdown tick
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
    setPresets((prev) => (prev.length >= MAX_PRESETS ? prev : [...prev, { id: `preset-${Date.now()}`, ...parts, timestamp: 0 }]));
  }, []);

  const handleRemovePreset = useCallback((id: string) => {
    setPresets((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleClearHistory = useCallback(() => setHistory([]), []);

  // setHours/setMinutes/setTimerSeconds are React state setters, guaranteed
  // stable, so this never needs to change identity
  const setterFor = useCallback(
    (unit: TimeUnit) => (unit === 'hours' ? setHours : unit === 'minutes' ? setMinutes : setTimerSeconds),
    []
  );

  const totalWith = useCallback(
    (unit: TimeUnit, value: number) => toTotalSeconds({ ...configured, [unit]: value }),
    [configured]
  );

  /**
   * Change one unit of the configured time. While the timer is running or
   * paused this asks for confirmation (once per state) before also updating
   * the remaining time; otherwise the remaining time follows immediately.
   */
  const requestConfiguredChange = useCallback((unit: TimeUnit, value: number) => {
    const previous = configured[unit];
    setterFor(unit)(value);

    // The hours field historically ignores no-op edits (e.g. typing a digit
    // that clamps back to the current value) instead of prompting
    if (unit === 'hours' && value === previous) return;

    if (isRunning || isPaused) {
      if (!promptShownInStateRef.current) {
        setDialog({ type: 'adjust', data: { unit, value, previous } });
        promptShownInStateRef.current = true;
      } else {
        setSeconds(totalWith(unit, value));
      }
    } else {
      setSeconds(totalWith(unit, value));
    }
  }, [configured, isRunning, isPaused, setterFor, totalWith]);

  // One stable callback per field so TimeField (React.memo'd) can skip
  // re-rendering on every countdown tick
  const handleHoursChange = useCallback((value: number) => requestConfiguredChange('hours', value), [requestConfiguredChange]);
  const handleMinutesChange = useCallback((value: number) => requestConfiguredChange('minutes', value), [requestConfiguredChange]);
  const handleSecondsChange = useCallback((value: number) => requestConfiguredChange('seconds', value), [requestConfiguredChange]);

  const handleConfirmAdjust = (unit: TimeUnit, value: number) => {
    setterFor(unit)(value);
    const newTotalSeconds = totalWith(unit, value);
    setSeconds(newTotalSeconds);

    // If the adjustment lands on 0, trigger the alarm immediately: keep the
    // timer running (resumed) so it crosses into negative time on the next tick
    if (newTotalSeconds <= 0 && (isRunning || isPaused)) {
      setMilliseconds(0);
      setIsPaused(false);
    }
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

  /**
   * Fired when the dialog goes away without confirming: Cancel button,
   * Escape, or overlay click. An 'adjust' dialog eagerly applied its field
   * edit before asking for confirmation (see requestConfiguredChange above),
   * so dismissing without confirming must revert it — otherwise the field
   * stays changed while the actual countdown doesn't, and the next stop/reset
   * would silently apply a value the user never confirmed.
   */
  const handleDialogDismiss = () => {
    if (!justConfirmedRef.current && dialog.type === 'adjust') {
      setterFor(dialog.data.unit)(dialog.data.previous);
      // Cancelling re-arms the prompt; confirming keeps it suppressed so
      // further adjustments in this running/paused state apply directly
      promptShownInStateRef.current = false;
    }
    justConfirmedRef.current = false;
    closeDialog();
  };

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
      {/* Backdrop for the mobile sidebar drawer */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar: a permanent column at lg+, a toggled overlay drawer below it */}
      <div
        className={`${isSidebarOpen ? 'flex' : 'hidden'} lg:flex fixed lg:relative inset-y-0 left-0 z-40 lg:z-auto w-64 lg:w-48 bg-black border-r-4 border-white p-4 flex-col gap-4 overflow-hidden`}
      >
        <PresetsPanel presets={presets} onAdd={handleAddPreset} onRemove={handleRemovePreset} onSelect={handleSelectEntry} />
        <HistoryPanel history={history} onSelect={handleSelectEntry} onClear={handleClearHistory} />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center p-2 sm:p-3 md:p-4 gap-2 overflow-hidden min-h-0 relative">
        {/* Top-left controls: sidebar toggle (below lg) + silent mode toggle.
            z-50 keeps both clickable above the drawer (z-40) and its backdrop (z-30). */}
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
        </div>

        {/* justify-start (not center) below lg: centering a flex container whose
            content overflows clips it symmetrically top-and-bottom instead of
            just extending down, which would hide the top of the clock */}
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-2 w-full min-h-0 flex-1 items-center justify-start lg:justify-between overflow-y-auto lg:overflow-hidden">
          {/* Left spacer - only needed once the row layout kicks in at lg */}
          <div className="flex-1 hidden lg:block"></div>

          {/* Timer display and controls - center */}
          <div className="flex flex-col items-center justify-center flex-shrink-0 lg:flex-shrink min-w-0 gap-1 w-full lg:w-auto">
            {/* Label showing the configured timer */}
            <div className="text-white opacity-75" style={{ fontSize: 'clamp(0.65rem, 1.2vw, 0.875rem)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em' }}>
              {formatTime(configuredTotalSeconds).main}
            </div>

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
                <span>{formatTime(seconds, milliseconds).main}</span>
                <span style={{ fontSize: '0.5em' }}>·{formatTime(seconds, milliseconds).ms}</span>
              </div>
            </div>

            {/* Control buttons */}
            <div className="flex gap-2">
              {/* Not running can also mean negative time restored from a
                  refresh mid-alarm; START still applies (it restarts from
                  the configured time, same as the spacebar path) */}
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

            {/* Status indicator and spacebar hint */}
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

          {/* Right spacer - only needed once the row layout kicks in at lg */}
          <div className="flex-1 hidden lg:block"></div>

          {/* Configured time inputs - full-width block below the clock until lg, then a fixed column to its right */}
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
