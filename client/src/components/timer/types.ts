// Used for both presets and run history
export interface TimerEntry {
  id: string;
  hours?: number; // optional: older saved data has no hours field
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

// The four situations the timer can be in when something asks about it.
// 'ringing' is a running timer past zero (counting up with the alarm
// going); 'unstarted' covers both a never-run timer and a stopped one.
export type TimerStateKind = 'unstarted' | 'running' | 'paused' | 'ringing';

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
  // every mode runs the picked time; they differ in what's being given up
  // to do it, which is what the question has to say. It's also the "don't
  // ask again" scope, so silencing the harmless one (startFromIdle, with
  // nothing on the clock to lose) doesn't silence the two that discard a
  // run in progress.
  | { type: 'switch'; data: TimeParts; mode: 'startFromIdle' | 'switchRunning' | 'loadOnly' }
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
  // state: which timer state the adjustment was asked in. Doubles as the
  // wording switch (anything but 'unstarted' has a run to restart) and
  // as the "don't ask again" scope — see dialogKey in suppressions.ts.
  | { type: 'adjust'; data: { unit: TimeUnit; value: number; previous: number; state: TimerStateKind } }
  | { type: 'hideWebsiteLink' }
  | { type: 'clearHistory' }
  | { type: 'clearPresets' }
  | { type: 'removePreset'; data: { id: string; label: string } }
  // an out-of-range preset entry (99:99:99), asked about at commit time
  // rather than corrected while it's still being typed. `add` is whether
  // the commit was an add (Enter / +) or just leaving the field
  | { type: 'correctPreset'; data: { typed: string; corrected: string; digits: string; add: boolean } }
  // turning confirmations OFF asks once, and can't be skipped by the
  // very setting it's turning off; turning them back on never asks
  | { type: 'skipConfirmations' }
  | { type: 'clearWordCounter' };
