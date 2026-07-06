import { MAX_HOURS, MAX_MINUTES, MAX_SECONDS } from './constants';
import type { TimeParts, TimerEntry } from './types';

export const pad = (value: number) => String(value).padStart(2, '0');

export const toTotalSeconds = ({ hours, minutes, seconds }: TimeParts) =>
  hours * 3600 + minutes * 60 + seconds;

/**
 * Format a remaining time for display as MM:SS (or HH:MM:SS) plus centiseconds.
 *
 * Seconds and milliseconds are combined into one signed value first: internally
 * the remaining time is totalSeconds + ms/1000 with ms always in [0, 1000), so
 * formatting the two parts independently would double-count around the zero
 * crossing (e.g. seconds=-1, ms=990 is 10ms overdue, not "-00:01.99").
 */
export const formatTime = (totalSeconds: number, ms: number = 0) => {
  const totalMs = totalSeconds * 1000 + ms;
  const absMs = Math.abs(totalMs);
  const absTotalSeconds = Math.floor(absMs / 1000);
  const hrs = Math.floor(absTotalSeconds / 3600);
  const mins = Math.floor((absTotalSeconds % 3600) / 60);
  const secs = absTotalSeconds % 60;
  const sign = totalMs < 0 ? '-' : '';

  return {
    main: hrs > 0
      ? `${sign}${pad(hrs)}:${pad(mins)}:${pad(secs)}`
      : `${sign}${pad(mins)}:${pad(secs)}`,
    ms: pad(Math.floor((absMs % 1000) / 10)),
  };
};

/** Label for a preset/history entry: "M:SS", or "H:MM:SS" when hours are set. */
export const formatEntryLabel = (entry: Pick<TimerEntry, 'hours' | 'minutes' | 'seconds'>) => {
  const hours = entry.hours ?? 0;
  return hours > 0
    ? `${hours}:${pad(entry.minutes)}:${pad(entry.seconds)}`
    : `${entry.minutes}:${pad(entry.seconds)}`;
};

/** Strip a preset input string down to its digits (HHMMSS order). */
export const presetDigits = (input: string) => input.replace(/[^0-9]/g, '');

/** Render preset digits as HH:MM:SS, zero-padding the missing tail. */
export const formatPresetDisplay = (digits: string) => {
  const padded = digits.padEnd(6, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2, 4)}:${padded.slice(4, 6)}`;
};

/** Parse preset digits into clamped time parts. */
export const parsePresetDigits = (digits: string): TimeParts => {
  const padded = digits.padEnd(6, '0');
  return {
    hours: Math.min(parseInt(padded.slice(0, 2), 10), MAX_HOURS),
    minutes: Math.min(parseInt(padded.slice(2, 4), 10), MAX_MINUTES),
    seconds: Math.min(parseInt(padded.slice(4, 6), 10), MAX_SECONDS),
  };
};
