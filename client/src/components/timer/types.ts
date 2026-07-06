/** A configured timer duration, used for both presets and run history. */
export interface TimerEntry {
  id: string;
  /** Optional for backwards compatibility with previously saved data. */
  hours?: number;
  minutes: number;
  seconds: number;
  timestamp: number;
}

export type TimeUnit = 'hours' | 'minutes' | 'seconds';

/** A plain hours/minutes/seconds triple. */
export interface TimeParts {
  hours: number;
  minutes: number;
  seconds: number;
}

/** State for the single confirmation dialog shared by all destructive actions. */
export type DialogState =
  | { type: null }
  | { type: 'stop' }
  | { type: 'reset' }
  | { type: 'switch'; data: TimeParts }
  | { type: 'adjust'; data: { unit: TimeUnit; value: number; previous: number } };
