// Used for both presets and run history.
export interface TimerEntry {
  id: string;
  hours?: number; // older saved data has no hours field
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

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
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
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
