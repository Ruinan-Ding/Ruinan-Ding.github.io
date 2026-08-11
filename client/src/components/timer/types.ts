// Used for both presets and run history.
export interface TimerEntry {
  id: string;
  hours?: number; // older saved data has no hours field
  minutes: number;
  seconds: number;
  // A time that starts already past zero, counting up. Optional so every
  // save written before it existed still reads back as positive.
  negative?: boolean;
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
  // Both modes run the picked time and differ only in what's given up to
  // do it. Also the "don't ask again" scope, so silencing one doesn't
  // silence the other. Only reachable where there's a run on the clock to
  // lose — see hasRunToLose — which is why there's no idle mode.
  | { type: 'switch'; data: TimeParts & { negative?: boolean }; mode: 'switchRunning' | 'loadOnly' }
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
  // The whole resulting time, not one unit's value: a step can carry
  // across units, so "seconds to 60" is not a thing that can be said.
  // `unit` is only which box was touched, for the flash. `state` is which
  // timer state it was asked in — it picks the wording and doubles as the
  // "don't ask again" scope; see dialogKey.
  | { type: 'adjust'; data: { totalSeconds: number; previousTotal: number; unit: TimeUnit; state: TimerStateKind } }
  | { type: 'hideWebsiteLink' }
  | { type: 'clearHistory' }
  | { type: 'clearPresets' }
  | { type: 'removePreset'; data: { id: string; label: string } }
  // An out-of-range entry like 99:99:99, reported at commit rather than
  // corrected silently while it's still being typed. `add` is whether the
  // commit was an add or just leaving the field.
  | { type: 'correctPreset'; data: { typed: string; corrected: string; digits: string; add: boolean } }
  // The same report for the HOURS/MINUTES/SECONDS boxes, which can now
  // carry past the end of the range the same way a typed preset can.
  | { type: 'correctTime'; data: { typed: string; corrected: string } }
  // Adding a time the list already holds. Nothing to decide either: it says
  // so and points at the row that time is already in.
  | { type: 'duplicatePreset'; data: { id: string; label: string } }
  // Turning confirmations off asks; turning them back on never does.
  | { type: 'skipConfirmations' }
  | { type: 'clearWordCounter' };
