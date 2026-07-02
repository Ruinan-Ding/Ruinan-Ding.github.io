import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ChevronUp, ChevronDown } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFavicon } from '@/hooks/useFavicon';
import { useBeep } from '@/hooks/useBeep';

interface HistoryEntry {
  id: string;
  minutes: number;
  seconds: number;
  timestamp: number;
}

const DEFAULT_PRESETS: HistoryEntry[] = [
  { id: 'preset-1', minutes: 1, seconds: 5, timestamp: 0 },
  { id: 'preset-2', minutes: 5, seconds: 35, timestamp: 0 },
  { id: 'preset-3', minutes: 30, seconds: 35, timestamp: 0 },
];

const STORAGE_KEY = 'timerAppState';
const HISTORY_STORAGE_KEY = 'timerAppHistory';
const WORD_COUNTER_KEY = 'wordCounterText';
const SILENT_MODE_KEY = 'timerSilentMode';
const PRESETS_STORAGE_KEY = 'timerAppPresets';

export default function Timer() {
  const [seconds, setSeconds] = useState(1 * 60 + 5);
  const [milliseconds, setMilliseconds] = useState(1000);  // Start at 1000 for decrement logic
  
  // Configured time (independent, doesn't change with countdown)
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(1);
  const [timerSeconds, setTimerSeconds] = useState(5);
  const [wordText, setWordText] = useState(() => {
    const saved = localStorage.getItem(WORD_COUNTER_KEY);
    return saved || '';
  });
  const [isWordCounterFocused, setIsWordCounterFocused] = useState(false);
  const [isSilentMode, setIsSilentMode] = useState(() => {
    const saved = localStorage.getItem(SILENT_MODE_KEY);
    return saved ? JSON.parse(saved) : false;
  });
  const [presets, setPresets] = useState<HistoryEntry[]>(() => {
    const saved = localStorage.getItem(PRESETS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_PRESETS;
  });
  const [newPresetInput, setNewPresetInput] = useState('');
  
  // Calculate word counts and character counts - single pass through text
  const getWordStats = () => {
    const lines = wordText.split('\n');
    const lineStats = lines.map((line) => {
      const trimmed = line.trim();
      const wordCount = trimmed === '' ? 0 : trimmed.split(/\s+/).length;
      const charCount = (line.match(/[a-zA-Z0-9]/g) || []).length;
      return { wordCount, charCount };
    });
    
    const totalWords = lineStats.reduce((sum, stat) => sum + stat.wordCount, 0);
    const totalChars = (wordText.match(/[a-zA-Z0-9]/g) || []).length;
    
    return { lineStats, totalLines: lines.length, totalWords, totalChars };
  };
  const { lineStats, totalLines, totalWords, totalChars } = getWordStats();
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const [showGreenFlash, setShowGreenFlash] = useState(false);
  
  // Unified dialog state
  interface DialogState {
    type: 'stop' | 'reset' | 'switch' | 'timeAdjust' | 'hourAdjust' | null;
    data?: any;
  }
  const [dialog, setDialog] = useState<DialogState>({ type: null });
  
  const closeDialog = () => setDialog({ type: null });
  const openDialog = (type: DialogState['type'], data?: any) => {
    setDialog({ type, data });
  };
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const beepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const greenFlashTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const historyRecordedRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineCounterRef = useRef<HTMLDivElement | null>(null);

  const lastIsRunningRef = useRef(isRunning);
  const lastIsPausedRef = useRef(isPaused);
  const promptShownInStateRef = useRef(false); // Track if prompt was shown in current running/paused state
  const initialTotalSeconds = 1 * 60 + 5; // 1 minute 5 seconds

  // Load state from localStorage on mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
    
    if (savedState) {
      try {
        const { seconds: savedSeconds, isPaused: wasPaused } = JSON.parse(savedState);
        setSeconds(savedSeconds);
        if (wasPaused || (savedSeconds > 0 && savedSeconds !== initialTotalSeconds)) {
          setIsPaused(true);
          setIsRunning(true);
        }
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

  // Save all state to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ seconds, isPaused, isRunning }));
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    localStorage.setItem(WORD_COUNTER_KEY, wordText);
    localStorage.setItem(SILENT_MODE_KEY, JSON.stringify(isSilentMode));
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
  }, [seconds, isPaused, isRunning, history, wordText, isSilentMode, presets]);

  // Reset confirmation flag when running/paused state changes
  useEffect(() => {
    if (isRunning !== lastIsRunningRef.current || isPaused !== lastIsPausedRef.current) {

      promptShownInStateRef.current = false; // Reset prompt flag on state change
      lastIsRunningRef.current = isRunning;
      lastIsPausedRef.current = isPaused;
    }
  }, [isRunning, isPaused]);

  useFavicon(isRunning, isPaused, seconds < 0, minutes, timerSeconds, hours);
  const { beep: beepRaw } = useBeep();
  
  // Memoize beep function to prevent unnecessary effect re-runs
  const beep = useCallback((frequency: number = 800, duration: number = 200) => {
    beepRaw(frequency, duration);
  }, [beepRaw]);

  // Timer countdown logic - handles both normal countdown and negative time
  useEffect(() => {
    if (!isRunning || isPaused) return;

    let lastTime = Date.now();
    intervalRef.current = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTime;
      lastTime = now;

      setMilliseconds((prev) => {
        const newMs = prev - elapsed;  // DECREMENT elapsed time
        if (newMs < 0) {  // Only when milliseconds go BELOW 0, not equal to 0
          setSeconds((prevSecs) => {
            // Decrement seconds when milliseconds wrap
            const nextSecs = prevSecs - 1;
            // Stop at -99:59:59 (which is -359999 seconds)
            if (nextSecs <= -359999) {
              if (intervalRef.current) clearInterval(intervalRef.current);
              return -359999;
            }
            return nextSecs;
          });
          // When milliseconds go negative, add 1000 to wrap to next second
          return newMs + 1000;
        }
        return newMs;
      });
    }, 10);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isRunning, isPaused]);


  // Beeping when timer reaches 0 and counts into negative time
  useEffect(() => {
    // Only beep if: timer is running, not paused, seconds < 0 (negative time), and not in silent mode
    const shouldBeep = isRunning && !isPaused && seconds < 0 && !isSilentMode;
    
    if (shouldBeep) {
      if (!beepIntervalRef.current) {
        beepIntervalRef.current = setInterval(() => {
          beep();
        }, 200);
      }
      
      // Record history only once when first reaching 0
      if (!historyRecordedRef.current && seconds === 0) {
        const entry: HistoryEntry = {
          id: Date.now().toString(),
          minutes,
          seconds: timerSeconds,
          timestamp: Date.now(),
        };
        setHistory((prev) => [entry, ...prev].slice(0, 20));
        historyRecordedRef.current = true;
      }
    } else {
      // Stop beeping if conditions are not met
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    }
    
    return () => {
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
        beepIntervalRef.current = null;
      }
    };
  }, [isRunning, isPaused, seconds, isSilentMode]);

  const triggerGreenFlash = () => {
    setShowGreenFlash(true);
    if (greenFlashTimeoutRef.current) {
      clearTimeout(greenFlashTimeoutRef.current);
    }
    greenFlashTimeoutRef.current = setTimeout(() => {
      setShowGreenFlash(false);
    }, 600);
  };



  // Spacebar controls for start/pause/resume/stop-during-beep
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        // Don't intercept spacebar if typing in textarea
        if (e.target instanceof HTMLTextAreaElement) {
          return;
        }
        e.preventDefault();

        // If beeping (finished), pause/resume the alarm
        if (seconds < 0) {
          setIsPaused((prev) => {
            const nextIsPaused = !prev;
            // Play different beeps for pause vs resume
            if (!isSilentMode) {
              if (nextIsPaused) {
                // Pause: lower frequency (400Hz)
                beep(400, 150);
              } else {
                // Resume: higher frequency (600Hz)
                beep(600, 150);
              }
            }
            if (!nextIsPaused) {
              triggerGreenFlash();
            }
            return nextIsPaused;
          });
          return;
        }

        // If running, pause/resume
        if (isRunning) {
          setIsPaused((prev) => {
            const nextIsPaused = !prev;
            // Play different beeps for pause vs resume
            if (!isSilentMode) {
              if (nextIsPaused) {
                // Pause: lower frequency (400Hz)
                beep(400, 150);
              } else {
                // Resume: higher frequency (600Hz)
                beep(600, 150);
              }
            }
            if (!nextIsPaused) {
              triggerGreenFlash();
            }
            return nextIsPaused;
          });
          return;
        }

        // If not running, start
        setIsRunning(true);
        setIsPaused(false);
        historyRecordedRef.current = false;
        triggerGreenFlash();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isRunning, isPaused, seconds, initialTotalSeconds]);

  const formatTime = (totalSeconds: number, ms: number = 0) => {
    // Show negative sign if seconds < 0 (we're in negative time)
    const isNegative = totalSeconds < 0;
    const absTotalSeconds = Math.abs(totalSeconds);
    const hrs = Math.floor(absTotalSeconds / 3600);
    const mins = Math.floor((absTotalSeconds % 3600) / 60);
    const secs = absTotalSeconds % 60;
    
    // Handle milliseconds: ensure they're in range 0-999
    let normalizedMs = ms;
    if (normalizedMs < 0) {
      normalizedMs = 1000 + normalizedMs;  // Wrap negative ms to positive
    }
    if (normalizedMs >= 1000) {
      normalizedMs = normalizedMs % 1000;  // Wrap large ms values
    }
    
    const displayMs = Math.floor(normalizedMs / 10); // Convert to centiseconds (0-99)
    const negativePrefix = isNegative ? '-' : '';

    if (hrs > 0) {
      return {
        main: `${negativePrefix}${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
        ms: `${String(displayMs).padStart(2, '0')}`
      };
    }
    return {
      main: `${negativePrefix}${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      ms: `${String(displayMs).padStart(2, '0')}`
    };
  };

  const handleStart = () => {
    let totalToStart = seconds;
    // If seconds is 0 or less, reset to the configured time
    if (totalToStart <= 0) {
      totalToStart = hours * 3600 + minutes * 60 + timerSeconds;
      setSeconds(totalToStart);
    }
    
    // Allow starting even with 0 seconds
    // Record to history when timer starts
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      minutes,
      seconds: timerSeconds,
      timestamp: Date.now(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));

    setMilliseconds(0);
    setIsRunning(true);
    setIsPaused(false);

    historyRecordedRef.current = false;
    triggerGreenFlash();
    
    // Play start sound
    if (!isSilentMode) {
      beep(600, 150);
    }
  };

  const handleStopClick = () => {
    if (seconds < 0) {
      // If beeping, stop immediately without confirmation
      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
      }
      const newTotalSeconds = minutes * 60 + timerSeconds;
      setSeconds(newTotalSeconds);
      setIsRunning(false);
  
      setIsPaused(false);
      historyRecordedRef.current = false;
      return;
    }
    // Otherwise, show confirmation
    openDialog('stop');
  };

  const handleConfirmStop = () => {
    if (!isSilentMode) {
      beep(800, 100); // Different tone for stop confirmation
    }
    if (beepIntervalRef.current) {
      clearInterval(beepIntervalRef.current);
    }
    // Reset to configured hours, minutes, and seconds
    const newTotalSeconds = hours * 3600 + minutes * 60 + timerSeconds;
    setSeconds(newTotalSeconds);
    setMilliseconds(0);
    setIsRunning(false);
    setIsPaused(false);

    historyRecordedRef.current = false;
    closeDialog();
  };

  const handleResetClick = () => {
    // If finished, auto-restart without confirmation
    if (seconds < 0) {

      if (beepIntervalRef.current) {
        clearInterval(beepIntervalRef.current);
      }
      const newTotalSeconds = hours * 3600 + minutes * 60 + timerSeconds;
      setSeconds(newTotalSeconds);
      setMilliseconds(0);
  
      historyRecordedRef.current = false;
      
      // Record to history when resetting from finished state
      const entry: HistoryEntry = {
        id: Date.now().toString(),
        minutes,
        seconds: timerSeconds,
        timestamp: Date.now(),
      };
      setHistory((prev) => [entry, ...prev].slice(0, 20));
      
      setIsRunning(true);
      setIsPaused(false);
      triggerGreenFlash();
      return;
    }
    // Otherwise, show confirmation
    openDialog('reset');
  };

  const handleConfirmReset = () => {
    beep(700, 100); // Different tone for reset confirmation
    const newTotalSeconds = hours * 3600 + minutes * 60 + timerSeconds;
    setSeconds(newTotalSeconds);
    setMilliseconds(0);

    setIsRunning(false);
    setIsPaused(false);
    historyRecordedRef.current = false;
    
    // Record to history when resetting from running state
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      minutes,
      seconds: timerSeconds,
      timestamp: Date.now(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    
    closeDialog();
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(e.target.value) || 0;
    // Prevent negative values and enforce max 59
    const clampedMinutes = Math.max(0, Math.min(59, value));
    setMinutes(clampedMinutes);
    if (isPaused || isRunning) {
      // Show confirmation only once per state
      if (!promptShownInStateRef.current) {
        openDialog('timeAdjust', { type: 'minutes', value: clampedMinutes });
        promptShownInStateRef.current = true;
      } else {
        const newTotalSeconds = hours * 3600 + clampedMinutes * 60 + timerSeconds;
        setSeconds(newTotalSeconds);
      }
    } else if (!isRunning) {
      const newTotalSeconds = hours * 3600 + clampedMinutes * 60 + timerSeconds;
      setSeconds(newTotalSeconds);
    }
  };

  const handleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = parseInt(e.target.value) || 0;
    // Prevent negative values and enforce max 59
    const clampedSeconds = Math.max(0, Math.min(59, value));
    setTimerSeconds(clampedSeconds);
    if (isPaused || isRunning) {
      // Show confirmation only once per state
      if (!promptShownInStateRef.current) {
        openDialog('timeAdjust', { type: 'seconds', value: clampedSeconds });
        promptShownInStateRef.current = true;
      } else {
        const newTotalSeconds = hours * 3600 + minutes * 60 + clampedSeconds;
        setSeconds(newTotalSeconds);
      }
    } else if (!isRunning) {
      const newTotalSeconds = hours * 3600 + minutes * 60 + clampedSeconds;
      setSeconds(newTotalSeconds);
    }
  };

  const handleConfirmTimeAdjust = () => {
    if (!dialog.data) return;
    
    let newTotalSeconds = 0;
    if (dialog.data?.type === 'minutes') {
      setMinutes(dialog.data.value);
      newTotalSeconds = hours * 3600 + dialog.data.value * 60 + timerSeconds;
    } else {
      setTimerSeconds(dialog.data?.value);
      newTotalSeconds = hours * 3600 + minutes * 60 + dialog.data?.value;
    }
    
    setSeconds(newTotalSeconds);
    
    // If adjustment resulted in 0 or negative, trigger alarm immediately
    if (newTotalSeconds <= 0 && (isRunning || isPaused)) {
      setIsRunning(false);
    }
    
    closeDialog();

  };

  const handleConfirmHourAdjust = () => {
    if (dialog.data === null || dialog.data === undefined) return;
    setHours(dialog.data);
    
    const newTotalSeconds = dialog.data * 3600 + minutes * 60 + timerSeconds;
    setSeconds(newTotalSeconds);
    
    // If adjustment resulted in 0 or negative, trigger alarm immediately
    if (newTotalSeconds <= 0 && (isRunning || isPaused)) {
      setIsRunning(false);
    }
    
    closeDialog();

  };

  const handleHistoryClick = (entry: HistoryEntry) => {
    // If timer is running, ask for confirmation
    if (isRunning) {
      openDialog('switch', { minutes: entry.minutes, seconds: entry.seconds });
      return;
    }
    
    setMinutes(entry.minutes);
    setTimerSeconds(entry.seconds);
    const newTotalSeconds = entry.minutes * 60 + entry.seconds;
    setSeconds(newTotalSeconds);

    setIsPaused(false);
    historyRecordedRef.current = false;
  };

  const handleRemovePreset = (id: string) => {
    setPresets(presets.filter(p => p.id !== id));
  };

  const handleAddPreset = () => {
    if (!newPresetInput || newPresetInput === '') return;
    
    // Apply validation before adding
    const digitsOnly = newPresetInput.replace(/[^0-9]/g, '');
    const padded = digitsOnly.padEnd(6, '0');
    let hhVal = parseInt(padded.slice(0, 2), 10);
    let mmVal = parseInt(padded.slice(2, 4), 10);
    let ssVal = parseInt(padded.slice(4, 6), 10);
    
    // Auto-correct MM and SS to 59 if exceeded
    mmVal = Math.min(mmVal, 59);
    ssVal = Math.min(ssVal, 59);
    
    const totalMinutes = hhVal * 60 + mmVal;
    const newPreset: HistoryEntry = {
      id: `preset-${Date.now()}`,
      minutes: totalMinutes,
      seconds: ssVal,
      timestamp: 0,
    };

    setPresets([...presets, newPreset]);
    setNewPresetInput('');
  };

  const formatPresetInput = (input: string): string => {
    const digitsOnly = input.replace(/[^0-9]/g, '');
    if (digitsOnly.length === 0) return 'HH:MM:SS';
    if (digitsOnly.length > 6) return '';
    const padded = digitsOnly.padEnd(6, '0');
    return padded.slice(0, 2) + ':' + padded.slice(2, 4) + ':' + padded.slice(4, 6);
  };

  const handlePresetInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPresetInput(e.target.value);
    if (formatted !== '') setNewPresetInput(formatted);
  };

  const handlePresetInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const digitsOnly = newPresetInput.replace(/[^0-9]/g, '');
      if (digitsOnly.length > 0) {
        const newDigits = digitsOnly.slice(0, -1);
        setNewPresetInput(formatPresetInput(newDigits));
      }
    }
  };
  
  const handlePresetInputClick = () => {
    // No cursor positioning - let browser handle it naturally
  };
  
  const validateAndCorrectPreset = () => {
    const digitsOnly = newPresetInput.replace(/[^0-9]/g, '');
    if (digitsOnly.length === 0) {
      setNewPresetInput('HH:MM:SS');
      return;
    }
    
    const padded = digitsOnly.padEnd(6, '0');
    let hh = parseInt(padded.slice(0, 2), 10);
    let mm = parseInt(padded.slice(2, 4), 10);
    let ss = parseInt(padded.slice(4, 6), 10);
    
    hh = Math.min(99, hh);
    mm = Math.min(59, mm);
    ss = Math.min(59, ss);
    
    const corrected = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    setNewPresetInput(corrected);
  };

  const handleConfirmSwitch = () => {
    if (!dialog.data) return;
    
    setMinutes(dialog.data.minutes);
    setTimerSeconds(dialog.data.seconds);
    const newTotalSeconds = dialog.data.minutes * 60 + dialog.data.seconds;
    setSeconds(newTotalSeconds);

    setIsPaused(false);
    setIsRunning(false);
    historyRecordedRef.current = false;
    
    // Record to history
    const entry: HistoryEntry = {
      id: Date.now().toString(),
      minutes: dialog.data.minutes,
      seconds: dialog.data.seconds,
      timestamp: Date.now(),
    };
    setHistory((prev) => [entry, ...prev].slice(0, 20));
    
    closeDialog();
  };

  const getFlashAnimation = () => {
    if (showGreenFlash) return 'startFlash';
    if (isPaused) return 'pauseFlash';
    if (seconds < 0) return 'finishFlash';
    return 'none';
  };


  // Utility to adjust time value (minutes or seconds)
  const adjustTimeValue = (type: 'minutes' | 'seconds', delta: number) => {
    let newValue: number;
    let newTotalSeconds: number;
    
    if (type === 'minutes') {
      newValue = Math.max(0, Math.min(59, minutes + delta));
      setMinutes(newValue);
      newTotalSeconds = hours * 3600 + newValue * 60 + timerSeconds;
    } else {
      newValue = Math.max(0, Math.min(59, timerSeconds + delta));
      setTimerSeconds(newValue);
      newTotalSeconds = hours * 3600 + minutes * 60 + newValue;
    }
    
    if (isPaused || isRunning) {
      if (!promptShownInStateRef.current) {
        openDialog('timeAdjust', { type, value: newValue });
        promptShownInStateRef.current = true;
      } else {
        setSeconds(newTotalSeconds);
      }
    } else {
      setSeconds(newTotalSeconds);
    }
  };

  const incrementMinutes = () => adjustTimeValue('minutes', 1);
  const decrementMinutes = () => adjustTimeValue('minutes', -1);
  const incrementSeconds = () => adjustTimeValue('seconds', 1);
  const decrementSeconds = () => adjustTimeValue('seconds', -1);

  return (
    <div className="h-screen bg-black flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-48 border-r-4 border-white p-4 flex flex-col gap-4 overflow-hidden">
        {/* Presets */}
        <div>
          <h2 className="text-white font-bold mb-4 border-b-2 border-white pb-2" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>PRESETS</h2>
          <div className="flex flex-col gap-2">
            {presets.map((preset) => (
              <div key={preset.id} className="flex items-center gap-2">
                <button
                  onClick={() => handleRemovePreset(preset.id)}
                  className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
                  style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)', fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)', minWidth: 'clamp(1.5rem, 3vw, 2rem)' }}
                >
                  −
                </button>
                <button
                  onClick={() => handleHistoryClick(preset)}
                  className="flex-1 border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.375rem, 1vw, 0.5rem)', fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}
                >
                  {preset.minutes}:{String(preset.seconds).padStart(2, '0')}
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={handleAddPreset}
                className="border-2 border-green-500 text-green-500 font-bold hover:bg-green-500 hover:text-white transition-colors flex-shrink-0"
                style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)', fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)', minWidth: 'clamp(1.5rem, 3vw, 2rem)' }}
              >
                +
              </button>
              <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <div style={{ position: 'absolute', left: 'clamp(0.375rem, 1vw, 0.5rem)', fontFamily: "'IBM Plex Mono', monospace", fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)', color: '#888888', pointerEvents: 'none', zIndex: 0, fontWeight: 'bold', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {newPresetInput === '' ? 'HH:MM:SS' : ''}
                </div>
                <input
                  type="text"
                  value={newPresetInput}
                  onChange={handlePresetInputChange}
                  onKeyDown={handlePresetInputKeyDown}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddPreset()}
                  onFocus={() => {
                    if (newPresetInput === '') {
                      setNewPresetInput('00:00:00');
                    }
                  }}
                  onBlur={() => {
                    if (newPresetInput && newPresetInput !== '') {
                      const digitsOnly = newPresetInput.replace(/[^0-9]/g, '');
                      const padded = digitsOnly.padEnd(6, '0');
                      const hhVal = parseInt(padded.slice(0, 2), 10);
                      let mmVal = parseInt(padded.slice(2, 4), 10);
                      let ssVal = parseInt(padded.slice(4, 6), 10);
                      
                      mmVal = Math.min(mmVal, 59);
                      ssVal = Math.min(ssVal, 59);
                      
                      const correctedHh = String(hhVal).padStart(2, '0');
                      const correctedMm = String(mmVal).padStart(2, '0');
                      const correctedSs = String(ssVal).padStart(2, '0');
                      const correctedDisplay = correctedHh + ':' + correctedMm + ':' + correctedSs;
                      setNewPresetInput(correctedDisplay);
                    }
                  }}
                  onClick={handlePresetInputClick}
                  placeholder=""
                  className="border-4 border-white font-bold transition-colors duration-0 w-full preset-input"
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    padding: 'clamp(0.375rem, 1vw, 0.5rem)',
                    fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)',
                    color: '#ffffff',
                    backgroundColor: 'transparent',
                    position: 'relative',
                    zIndex: 1,
                    letterSpacing: '0.05em',
                    minWidth: 0
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* History */}
        <div className="flex flex-col min-h-0 flex-1">
          <div className="flex justify-between items-center mb-4 border-b-2 border-white pb-2 flex-shrink-0">
            <h2 className="text-white font-bold" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>HISTORY</h2>
            {history.length > 0 && (
              <button
                onClick={() => setHistory([])}
                className="text-white border border-white px-2 py-1 text-xs hover:bg-white hover:text-black transition-colors"
                style={{ fontSize: 'clamp(0.65rem, 1.2vw, 0.75rem)' }}
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-col gap-2 overflow-y-auto flex-1">
            {history.length === 0 ? (
              <p className="text-white opacity-50" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>No history yet</p>
            ) : (
              history.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => handleHistoryClick(entry)}
                  className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.375rem, 1vw, 0.5rem)', fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}
                >
                  {entry.minutes}:{String(entry.seconds).padStart(2, '0')}
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Config Box */}
      <div className="flex-1 flex flex-col items-center p-2 sm:p-3 md:p-4 gap-2 overflow-hidden min-h-0 relative">
        {/* Speaker Button - Top Left */}
        <button
          onClick={() => {
            if (isSilentMode) {
              // Playing two beeps to confirm unmuting (turning sound back ON)
              setTimeout(() => beep(600, 150), 0);
              setTimeout(() => beep(600, 150), 250);
            }
            setIsSilentMode(!isSilentMode);
          }}
          className="absolute top-2 left-2 sm:top-3 sm:left-3 md:top-4 md:left-4 w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center border-3 transition-all duration-200 hover:opacity-80"
          style={{
            borderColor: isSilentMode ? '#ffffff' : '#22c55e',
            backgroundColor: 'transparent',
            fontFamily: "'IBM Plex Mono', monospace",
          }}
          title={isSilentMode ? 'Click to unmute' : 'Click to mute'}
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

        <div className="flex gap-2 w-full min-h-0 flex-1 items-center justify-between overflow-hidden">
          {/* Left Spacer - Hidden on small screens */}
          <div className="flex-1 hidden md:block"></div>

          {/* Timer Display and Buttons - Center */}
          <div className="flex flex-col items-center justify-center flex-shrink min-w-0 gap-1">
            {/* Label showing the configured timer */}
            <div className="text-white opacity-75" style={{ fontSize: 'clamp(0.65rem, 1.2vw, 0.875rem)', fontFamily: "'IBM Plex Mono', monospace", letterSpacing: '0.05em' }}>
              {formatTime(initialTotalSeconds).main}
            </div>
            
            <div
              className={`font-bold tracking-wider transition-all duration-200 ${isRunning && !isPaused ? 'text-black bg-green-500 animate-none' : 'text-white'} ${isRunning && isPaused ? 'animate-pauseFlash' : seconds < 0 ? 'animate-finishFlash' : ''}`}
              style={{ fontSize: 'clamp(2.5rem, 12vw, 6rem)', fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1.5vw, 1rem)' }}
            >
              <div className="flex items-baseline gap-1">
                <span>{formatTime(seconds, milliseconds).main}</span>
                <span style={{ fontSize: '0.5em' }}>·{formatTime(seconds, milliseconds).ms}</span>
              </div>
            </div>

            {/* Control Buttons Below Timer */}
            <div className="flex gap-2">
              {!isRunning && seconds >= 0 ? (
                <button
                  onClick={handleStart}
                  disabled={false}
                  className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)', fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)', borderColor: '#22c55e', color: '#22c55e', backgroundColor: 'transparent', minWidth: 'clamp(5rem, 12vw, 8rem)' }}
                >
                  START
                </button>
              ) : null}

              {isRunning && (
                <button
                  onClick={() => {
                    setIsPaused((prev) => {
                      const nextIsPaused = !prev;
                      // Play different beeps for pause vs resume
                      if (!isSilentMode) {
                        if (nextIsPaused) {
                          // Pause: lower frequency (400Hz)
                          beep(400, 150);
                        } else {
                          // Resume: higher frequency (600Hz)
                          beep(600, 150);
                        }
                      }
                      return nextIsPaused;
                    });
                  }}
                  className="border-4 font-bold hover:opacity-80 transition-all duration-200"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)', fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)', borderColor: isPaused ? '#22c55e' : '#eab308', color: isPaused ? '#22c55e' : '#eab308', backgroundColor: 'transparent', minWidth: 'clamp(5rem, 12vw, 8rem)' }}
                >
                  {isPaused ? 'RESUME' : 'PAUSE'}
                </button>
              )}

              <button
                onClick={handleStopClick}
                disabled={!isRunning && seconds >= 0 && seconds === initialTotalSeconds}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)', fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)', borderColor: '#ef4444', color: '#ef4444', backgroundColor: 'transparent', minWidth: 'clamp(5rem, 12vw, 8rem)' }}
              >
                STOP
              </button>

              <button
                onClick={handleResetClick}
                className="border-4 font-bold hover:opacity-80 transition-all duration-200"
                style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.5rem, 1vw, 1rem) clamp(1rem, 2vw, 2rem)', fontSize: 'clamp(0.75rem, 1.5vw, 1.25rem)', borderColor: '#eab308', color: '#eab308', backgroundColor: 'transparent', minWidth: 'clamp(5rem, 12vw, 8rem)' }}
              >
                RESET
              </button>
            </div>

            {/* Status Indicator and Spacebar Hint */}
            <div className="flex flex-col items-center gap-1 mt-2">
              {/* Status Indicator */}
              <div className="font-bold tracking-wider" style={{ fontSize: 'clamp(0.65rem, 1.5vw, 0.875rem)', color: isRunning && !isPaused ? '#22c55e' : isRunning && isPaused ? '#eab308' : seconds < 0 ? '#ef4444' : '#ffffff' }}>
                {!isRunning && seconds === initialTotalSeconds && seconds >= 0 && 'READY'}
                {isRunning && !isPaused && seconds >= 0 && 'RUNNING'}
                {isRunning && isPaused && 'PAUSED'}
                {!isRunning && seconds !== initialTotalSeconds && seconds > 0 && 'STOPPED'}
                {seconds < 0 && 'FINISHED'}
              </div>

              {/* Spacebar Hint */}
              {isWordCounterFocused && (
                <div className="text-red-500 opacity-75 tracking-wider" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1rem)' }}>
                  Spacebar disabled for timer
                </div>
              )}
              {(isRunning || seconds < 0) && !isWordCounterFocused && (
                <div className="text-white opacity-75 tracking-wider" style={{ fontSize: 'clamp(0.75rem, 1.8vw, 1rem)' }}>
                  Press SPACE to {seconds < 0 ? 'STOP the alarm' : isPaused ? 'RESUME the timer' : 'PAUSE the timer'}
                </div>
              )}
            </div>
          </div>

          {/* Right Spacer - Hidden on small screens */}
          <div className="flex-1 hidden md:block"></div>

          {/* Input Controls - Far Right - NEVER SHRINK */}
          <div className="border-4 border-white p-2 sm:p-3 md:p-4 flex flex-col gap-2 flex-shrink-0 min-w-0" style={{ width: 'clamp(12rem, 22vw, 16rem)' }}>
            {/* Hours - First Row */}
            <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
              <label className="text-white font-bold whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.1rem)', fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}>HOURS:</label>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <input
                  type="number"
                  value={hours}
                  onChange={(e) => {
                    let value = parseInt(e.target.value) || 0;
                    // Prevent negative values and enforce max 99
                    value = Math.max(0, Math.min(99, value));
                    setHours(value);
                    if (value !== hours) {
                      // Only show confirmation dialog if timer is running or paused
                      if (isRunning || isPaused) {
                        // Show confirmation only once per state
                        if (!promptShownInStateRef.current) {
                          openDialog('hourAdjust', value);
                          promptShownInStateRef.current = true;
                        } else {
                          const newTotalSeconds = value * 3600 + minutes * 60 + timerSeconds;
                          setSeconds(newTotalSeconds);
                        }
                      } else {
                        // If timer is stopped, change directly
                        const newTotalSeconds = value * 3600 + minutes * 60 + timerSeconds;
                        setSeconds(newTotalSeconds);
                      }
                    }
                  }}
                  onBlur={(e) => {
                    // If dialog is not showing and value is different, show it only if running/paused
                    let value = parseInt(e.target.value) || 0;
                    // Prevent negative values and enforce max 99
                    value = Math.max(0, Math.min(99, value));
                    setHours(value);
                    if (dialog.type !== 'hourAdjust' && value !== hours) {
                      if (isRunning || isPaused) {
                        // Show confirmation only once per state
                        if (!promptShownInStateRef.current) {
                          openDialog('hourAdjust', value);
                          promptShownInStateRef.current = true;
                        } else {
                          const newTotalSeconds = value * 3600 + minutes * 60 + timerSeconds;
                          setSeconds(newTotalSeconds);
                        }
                      } else {
                        const newTotalSeconds = value * 3600 + minutes * 60 + timerSeconds;
                        setSeconds(newTotalSeconds);
                      }
                    }
                  }}
                  className="bg-black border-4 border-white text-white font-bold text-center outline-none flex-shrink-0"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.5rem, 6vw, 4rem)', fontSize: 'clamp(1rem, 1.8vw, 1.5rem)', padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => {
                      const newHours = hours + 1;
                      setHours(newHours);
                      if (isPaused || isRunning) {
                        if (!promptShownInStateRef.current) {
                          openDialog('hourAdjust', newHours);
                          promptShownInStateRef.current = true;
                        } else {
                          const newTotalSeconds = newHours * 3600 + minutes * 60 + timerSeconds;
                          setSeconds(newTotalSeconds);
                        }
                      } else {
                        const newTotalSeconds = newHours * 3600 + minutes * 60 + timerSeconds;
                        setSeconds(newTotalSeconds);
                      }
                    }}
                    disabled={hours >= 99}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronUp size={clamp(16, 20, 24)} />
                  </button>
                  <button
                    onClick={() => {
                      const newHours = Math.max(0, hours - 1);
                      setHours(newHours);
                      if (isPaused || isRunning) {
                        if (!promptShownInStateRef.current) {
                          openDialog('hourAdjust', newHours);
                          promptShownInStateRef.current = true;
                        } else {
                          const newTotalSeconds = newHours * 3600 + minutes * 60 + timerSeconds;
                          setSeconds(newTotalSeconds);
                        }
                      } else {
                        const newTotalSeconds = newHours * 3600 + minutes * 60 + timerSeconds;
                        setSeconds(newTotalSeconds);
                      }
                    }}
                    disabled={hours <= 0}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronDown size={clamp(16, 20, 24)} />
                  </button>
                </div>
              </div>
            </div>

            {/* Minutes - Second Row */}
            <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
              <label className="text-white font-bold whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.1rem)', fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}>MINUTES:</label>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <input
                  type="number"
                  value={minutes}
                  onChange={handleMinutesChange}
                  className="bg-black border-4 border-white text-white font-bold text-center outline-none flex-shrink-0"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.5rem, 6vw, 4rem)', fontSize: 'clamp(1rem, 1.8vw, 1.5rem)', padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={incrementMinutes}
                    disabled={minutes >= 59}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronUp size={clamp(16, 20, 24)} />
                  </button>
                  <button
                    onClick={decrementMinutes}
                    disabled={minutes <= 0}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronDown size={clamp(16, 20, 24)} />
                  </button>
                </div>
              </div>
            </div>

            {/* Seconds - Third Row */}
            <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
              <label className="text-white font-bold whitespace-nowrap" style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.1rem)', fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}>SECONDS:</label>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <input
                  type="number"
                  value={timerSeconds}
                  onChange={handleSecondsChange}
                  className="bg-black border-4 border-white text-white font-bold text-center outline-none flex-shrink-0"
                  style={{ fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.5rem, 6vw, 4rem)', fontSize: 'clamp(1rem, 1.8vw, 1.5rem)', padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                />
                <div className="flex flex-col gap-1">
                  <button
                    onClick={incrementSeconds}
                    disabled={timerSeconds >= 59}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronUp size={clamp(16, 20, 24)} />
                  </button>
                  <button
                    onClick={decrementSeconds}
                    disabled={timerSeconds <= 0}
                    className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
                  >
                    <ChevronDown size={clamp(16, 20, 24)} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 w-full flex-1 overflow-hidden min-h-0">
          <label className={`font-bold text-left ${isWordCounterFocused ? 'text-green-500' : 'text-red-500'}`} style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.5rem)' }}>WORD COUNTER</label>

          {/* Word Counter */}
          <div className={`flex flex-col gap-3 border-4 transition-colors duration-200 w-full flex-1 ${isWordCounterFocused ? 'border-green-500 bg-black' : 'border-red-500 bg-black'}`} style={{ minHeight: '0' }}>
                <div className="flex justify-between items-center px-3 pt-3">
              <div className="text-white font-bold flex gap-1" style={{ fontSize: 'clamp(0.55rem, 1.3vw, 0.75rem)' }}>
                <div className="flex-1 border-2 border-white text-center px-1 py-1">L</div>
                <div className="flex-1 border-2 border-white text-center px-1 py-1">W</div>
                <div className="flex-1 border-2 border-white text-center px-1 py-1">C</div>
              </div>
              {isWordCounterFocused && (
                <span className="text-green-500 opacity-75" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.25rem)' }}>Spacebar disabled for timer</span>
              )}
            </div>
            <div className="flex flex-col gap-2 px-3 pb-3 flex-1 overflow-hidden min-h-0">
              <div className="flex gap-2 flex-1 overflow-hidden min-h-0">
                <div className="flex flex-col flex-shrink-0" style={{ minWidth: 'clamp(6rem, 12vw, 8rem)' }}>
                  <div ref={lineCounterRef} className="overflow-auto flex-1" onScroll={() => {
                    if (textareaRef.current && lineCounterRef.current) {
                      textareaRef.current.scrollTop = lineCounterRef.current.scrollTop;
                    }
                  }}>
                    <table className="border-collapse text-white font-bold w-full" style={{ fontSize: 'clamp(0.55rem, 1.3vw, 0.75rem)', lineHeight: '1.6', borderSpacing: '0' }}>
                      <tbody>
                        {lineStats.map((stat, idx) => (
                        <tr key={idx} className={`border-2 ${isWordCounterFocused ? 'border-green-500' : 'border-white'}`} style={{ height: '1.6em', padding: '0', margin: '0' }}>
                          <td className={`border-2 px-1 text-center ${isWordCounterFocused ? 'border-green-500' : 'border-white'}`} style={{ padding: '0 0.25rem', lineHeight: '1.6', margin: '0', verticalAlign: 'middle' }}>{idx + 1}</td>
                          <td className={`border-2 px-1 text-center ${isWordCounterFocused ? 'border-green-500' : 'border-white'}`} style={{ padding: '0 0.25rem', lineHeight: '1.6', margin: '0', verticalAlign: 'middle' }}>{stat.wordCount}</td>
                          <td className={`border-2 px-1 text-center ${isWordCounterFocused ? 'border-green-500' : 'border-white'}`} style={{ padding: '0 0.25rem', lineHeight: '1.6', margin: '0', verticalAlign: 'middle' }}>{stat.charCount}</td>
                        </tr>
                      ))}

                      </tbody>
                    </table>
                  </div>

                </div>
                <textarea
                  ref={textareaRef}
                  value={wordText}
                  onChange={(e) => setWordText(e.target.value)}
                  onFocus={() => setIsWordCounterFocused(true)}
                  onBlur={() => setIsWordCounterFocused(false)}
                  onScroll={() => {
                    if (textareaRef.current && lineCounterRef.current) {
                      lineCounterRef.current.scrollTop = textareaRef.current.scrollTop;
                      lineCounterRef.current.scrollLeft = textareaRef.current.scrollLeft;
                    }
                  }}
                  placeholder="Enter text here..."
                  className={`flex-1 bg-black border-4 text-white font-bold outline-none overflow-auto ${isWordCounterFocused ? 'border-green-500' : 'border-white'}`}
                  style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 'clamp(0.55rem, 1.3vw, 0.75rem)', padding: 'clamp(0.5rem, 1vw, 0.75rem)', lineHeight: '1.6', whiteSpace: 'pre', overflowWrap: 'normal' }}
                />
              </div>
            </div>
            <div className="flex justify-between items-start px-2 py-1 gap-4" style={{ fontSize: 'clamp(0.5rem, 1vw, 0.65rem)' }}>
              <div className={`text-white font-bold flex flex-col gap-0`} style={{ fontSize: 'clamp(0.35rem, 0.8vw, 0.55rem)' }}>
                <div className="text-white mb-0.5">TOTAL</div>
                <div className="flex gap-0.5">
                  <div className="border border-white text-center px-0.5 py-0.5 bg-black w-6">{lineStats.length}</div>
                  <div className="border border-white text-center px-0.5 py-0.5 bg-black w-6">{totalWords}</div>
                  <div className="border border-white text-center px-0.5 py-0.5 bg-black w-6">{totalChars}</div>
                </div>
              </div>
              <div className={`text-xs flex flex-col justify-center items-center text-center ${isWordCounterFocused ? 'text-green-500' : 'text-gray-400'}`}>
                <p><strong>L:</strong> Line number</p>
                <p><strong>W:</strong> Words on that line</p>
                <p><strong>C:</strong> Alphanumeric chars (a-z, A-Z, 0-9)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Unified Confirmation Dialog */}
      <AlertDialog open={dialog.type !== null} onOpenChange={closeDialog}>
        <AlertDialogContent className="bg-black border-4 border-white">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white text-2xl font-bold">
              {dialog.type === 'stop' && 'CONFIRM STOP'}
              {dialog.type === 'reset' && 'CONFIRM RESET'}
              {dialog.type === 'switch' && 'SWITCH TIMER'}
              {dialog.type === 'timeAdjust' && 'ADJUST TIME'}
              {dialog.type === 'hourAdjust' && 'CONFIRM CHANGE'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-white text-lg">
              {dialog.type === 'stop' && 'Are you sure you want to stop the timer? This will reset it to the initial time.'}
              {dialog.type === 'reset' && 'Are you sure you want to reset the timer? It will restart from the beginning.'}
              {dialog.type === 'switch' && `A timer is currently running. Do you want to switch to ${dialog.data?.minutes}:${String(dialog.data?.seconds).padStart(2, '0')}?`}
              {dialog.type === 'timeAdjust' && (
                dialog.data?.type === 'minutes' 
                  ? `Change minutes to ${dialog.data.value}?`
                  : `Change seconds to ${String(dialog.data?.value).padStart(2, '0')}?`
              )}
              {dialog.type === 'hourAdjust' && `Change hours to ${String(dialog.data).padStart(2, '0')}?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-4 justify-end">
            <AlertDialogCancel 
              onClick={() => {
                promptShownInStateRef.current = false;
              }}
              className="border-4 border-white text-white font-bold px-6 py-3 hover:bg-white hover:text-black"
            >
              CANCEL
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (dialog.type === 'stop') handleConfirmStop();
                else if (dialog.type === 'reset') handleConfirmReset();
                else if (dialog.type === 'switch') handleConfirmSwitch();
                else if (dialog.type === 'timeAdjust') handleConfirmTimeAdjust();
                else if (dialog.type === 'hourAdjust') handleConfirmHourAdjust();
              }}
              className="border-4 border-white bg-white text-black font-bold px-6 py-3 hover:bg-black hover:text-white hover:border-white"
            >
              {dialog.type === 'stop' && 'CONFIRM'}
              {dialog.type === 'reset' && 'CONFIRM'}
              {dialog.type === 'switch' && 'SWITCH'}
              {dialog.type === 'timeAdjust' && 'CONFIRM'}
              {dialog.type === 'hourAdjust' && 'CONFIRM'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Helper function for clamp
function clamp(min: number, mid: number, max: number): number {
  return Math.max(min, Math.min(max, mid));
}
