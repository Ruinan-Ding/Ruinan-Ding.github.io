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

// The questions FULL confirm mode adds. Spelled out here rather than
// beside their copy in suppressions.ts so that module can import
// DialogState without the two importing each other.
export type FullAct =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stopRinging'
  | 'resetRinging'
  | 'removeHistory'
  | 'tuckSidebar'
  | 'tuckTimeFields'
  | 'tuckWordCounter'
  | 'fullscreen'
  | 'theme'
  | 'volume'
  | 'alarmLoop'
  | 'typeInWordCounter'
  | 'timeZone'
  | 'hourFormat';

// half asks what this app has always asked. full asks that plus every
// FullAct. none asks nothing but the site RESET, which is never skippable.
export type ConfirmMode = 'half' | 'full' | 'none';

export type DialogState =
  | { type: null }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'clearCache' }
  | { type: 'mute' }
  // Both modes run the picked time and differ only in what's given up to
  // do it. Also the "don't ask again" scope, so silencing one doesn't
  // silence the other. Only reachable where there's a run on the clock to
  // lose, see hasRunToLose, which is why there's no idle mode.
  | { type: 'switch'; data: TimeParts & { negative?: boolean }; mode: 'switchRunning' | 'loadOnly' }
  | { type: 'seek'; data: { targetSeconds: number; mode: 'idle' | 'paused' | 'running' } }
  // The whole resulting time, not one unit's value: a step can carry
  // across units, so "seconds to 60" is not a thing that can be said.
  // `unit` is only which box was touched, for the flash. `state` is which
  // timer state it was asked in, it picks the wording and doubles as the
  // "don't ask again" scope; see dialogKey.
  // `corrected` is set when the edit overshot the end of the range and was
  // clamped to get here, so this dialog can say so itself rather than hand
  // the same click a second dialog to close.
  | { type: 'adjust'; data: { totalSeconds: number; previousTotal: number; unit: TimeUnit; state: TimerStateKind; corrected: { typed: string; corrected: string } | null } }
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
  // Every FULL-mode question in one member. The action travels with it,
  // so confirming needs no case per act and an act that needs data (which
  // history row, which zone) closes over it instead of restating it here.
  | { type: 'full'; act: FullAct; run: () => void }
  // Both steps of the cycle that change what every other click does.
  // Turning confirmations off asks, and so does turning the full set on;
  // the step from off back to half can't ask, since nothing asks there.
  | { type: 'bulkSuppress'; data: { tier: 'half' | 'full'; silence: boolean; count: number } }
  | { type: 'fullConfirmations' }
  | { type: 'skipConfirmations' }
  | { type: 'clearWordCounter' };
