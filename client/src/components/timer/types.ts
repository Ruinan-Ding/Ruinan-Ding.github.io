// Used for both presets and run history
export interface TimerEntry {
  id: string;
  hours?: number; // optional: older saved data has no hours field
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

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
  | { type: 'switch'; data: TimeParts; start: boolean }
  | { type: 'seek'; data: { targetSeconds: number } }
  | { type: 'adjust'; data: { unit: TimeUnit; value: number; previous: number } };
