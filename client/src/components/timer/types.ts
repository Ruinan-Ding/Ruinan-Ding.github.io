// Used for both presets and run history.
export interface TimerEntry {
  id: string;
  hours?: number; // older saved data has no hours field
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

// 'ringing' is a running timer past zero, counting up with the alarm
// going. 'unstarted' covers both a never-run timer and a stopped one.
export type TimerStateKind = 'unstarted' | 'running' | 'paused' | 'ringing';

// Which entry to flash, plus a token that bumps on every trigger, repeats
// of the same id included, so a reselect inside the flash window replays
// rather than no-opping on a same-value state update.
export type FlashTarget = { id: string; token: number } | null;

export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

export type DialogState =
  | { type: null }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'clearCache' }
  | { type: 'mute' }
  // Every mode runs the picked time and differs only in what's given up to
  // do it. Also the "don't ask again" scope, so silencing the harmless one
  // doesn't silence the two that discard a run in progress.
  | { type: 'switch'; data: TimeParts; mode: 'startFromIdle' | 'switchRunning' | 'loadOnly' }
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
  // `state` is which timer state the adjustment was asked in. It picks the
  // wording and doubles as the "don't ask again" scope; see dialogKey.
  | { type: 'adjust'; data: { unit: TimeUnit; value: number; previous: number; state: TimerStateKind } }
  | { type: 'hideWebsiteLink' }
  | { type: 'clearHistory' }
  | { type: 'clearPresets' }
  | { type: 'removePreset'; data: { id: string; label: string } }
  // An out-of-range entry like 99:99:99, reported at commit rather than
  // corrected silently while it's still being typed. `add` is whether the
  // commit was an add or just leaving the field.
  | { type: 'correctPreset'; data: { typed: string; corrected: string; digits: string; add: boolean } }
  // Adding a time the list already holds. Nothing to decide either: it says
  // so and points at the row that time is already in.
  | { type: 'duplicatePreset'; data: { id: string; label: string } }
  // Turning confirmations off asks; turning them back on never does.
  | { type: 'skipConfirmations' }
  | { type: 'clearWordCounter' };
