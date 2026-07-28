// Used for both presets and run history
export interface TimerEntry {
  id: string;
  hours?: number; // optional: older saved data has no hours field
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

// A flash target: which entry to flash, plus a token that bumps on every
// trigger — even a repeat of the same id — so a reselect within the flash
// window replays the animation instead of silently no-op'ing on a
// same-value state update.
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
  | { type: 'switch'; data: TimeParts; mode: 'startFromIdle' | 'switchRunning' | 'loadOnly' }
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
  | { type: 'adjust'; data: { unit: TimeUnit; value: number; previous: number } }
  | { type: 'hideWebsiteLink' }
  | { type: 'clearHistory' }
  | { type: 'removePreset'; data: { id: string; label: string } }
  // an out-of-range preset entry (99:99:99), asked about at commit time
  // rather than corrected while it's still being typed. `add` is whether
  // the commit was an add (Enter / +) or just leaving the field
  | { type: 'correctPreset'; data: { typed: string; corrected: string; digits: string; add: boolean } }
  // turning confirmations OFF asks once, and can't be skipped by the
  // very setting it's turning off; turning them back on never asks
  | { type: 'skipConfirmations' }
  | { type: 'clearWordCounter' };
