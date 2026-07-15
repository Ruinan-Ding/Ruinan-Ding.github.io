import { MAX_HOURS, MAX_MINUTES, MAX_SECONDS } from './constants';
import type { TimeParts, TimerEntry } from './types';

export const pad = (value: number) => String(value).padStart(2, '0');

export const toTotalSeconds = ({ hours, minutes, seconds }: TimeParts) =>
  hours * 3600 + minutes * 60 + seconds;

// Combine seconds + ms into one signed value before formatting, otherwise
// the two parts double-count around the zero crossing
export const formatTime = (totalSeconds: number, ms: number = 0) => {
  const totalMs = totalSeconds * 1000 + ms;
  const absMs = Math.abs(totalMs);
  const absTotalSeconds = Math.floor(absMs / 1000);
  const hrs = Math.floor(absTotalSeconds / 3600);
  const mins = Math.floor((absTotalSeconds % 3600) / 60);
  const secs = absTotalSeconds % 60;
  const sign = totalMs < 0 ? '-' : '';

  return {
    sign,
    hours: hrs > 0 ? pad(hrs) : '',
    main: `${pad(mins)}:${pad(secs)}`,
    ms: pad(Math.floor((absMs % 1000) / 10)),
  };
};

export const formatEntryLabel = (entry: Pick<TimerEntry, 'hours' | 'minutes' | 'seconds'>) => {
  const hours = entry.hours ?? 0;
  return hours > 0
    ? `${hours}:${pad(entry.minutes)}:${pad(entry.seconds)}`
    : `${entry.minutes}:${pad(entry.seconds)}`;
};

export const presetDigits = (input: string) => input.replace(/[^0-9]/g, '');

// Digits fill from the right, calculator-style: "130" -> 00h 01m 30s
export const parsePresetDigits = (digits: string): TimeParts => {
  const padded = digits.padStart(6, '0');
  return {
    hours: Math.min(parseInt(padded.slice(0, 2), 10), MAX_HOURS),
    minutes: Math.min(parseInt(padded.slice(2, 4), 10), MAX_MINUTES),
    seconds: Math.min(parseInt(padded.slice(4, 6), 10), MAX_SECONDS),
  };
};
