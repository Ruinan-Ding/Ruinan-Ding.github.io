import { MAX_HOURS, MAX_MINUTES, MAX_SECONDS } from './constants';
import type { TimeParts, TimerEntry } from './types';

export const pad = (value: number) => String(value).padStart(2, '0');

// Intl's shortOffset reads "GMT-4", "GMT+5:30", or bare "GMT" at zero.
// The sign and the number are the whole point here, so the prefix goes and
// zero gets written out rather than left blank.
export const offsetLabel = (shortOffset: string) => {
  const offset = shortOffset.replace('GMT', '');
  return offset === '' ? '+0' : offset;
};

// dd/mm/yyyy, assembled from parts rather than trusted to a locale's own
// ordering: en-US would put the month first and the app formats everything
// else in en-US. The weekday stays in front of it.
export const formatDateParts = (formatter: Intl.DateTimeFormat, at: number) => {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.day}/${parts.month}/${parts.year}`;
  return parts.weekday ? `${parts.weekday}, ${date}` : date;
};

export const toTotalSeconds = ({ hours, minutes, seconds }: TimeParts) =>
  hours * 3600 + minutes * 60 + seconds;

export const fromTotalSeconds = (total: number): TimeParts => ({
  hours: Math.floor(total / 3600),
  minutes: Math.floor((total % 3600) / 60),
  seconds: total % 60,
});

// Combined into one signed value before formatting, or the two parts
// double-count around the zero crossing.
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
    minutes: pad(mins),
    seconds: pad(secs),
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

// Digits fill from the right, calculator-style: "130" is 00h 01m 30s.
export const parsePresetDigits = (digits: string): TimeParts => {
  const padded = digits.padStart(6, '0');
  return {
    hours: Math.min(parseInt(padded.slice(0, 2), 10), MAX_HOURS),
    minutes: Math.min(parseInt(padded.slice(2, 4), 10), MAX_MINUTES),
    seconds: Math.min(parseInt(padded.slice(4, 6), 10), MAX_SECONDS),
  };
};

// The same split with no clamping: literally what was typed. Digits fill
// from the right, so every digit of "990000" passes through the seconds
// and minutes fields on its way to the hours. Clamping the display meant
// typing 99 hours showed "0:59", then "9:59", then "59:59", rewriting
// every keystroke. Nothing is corrected until commit, and then by asking.
export const rawPresetDigits = (digits: string): TimeParts => {
  const padded = digits.padStart(6, '0');
  return {
    hours: parseInt(padded.slice(0, 2), 10),
    minutes: parseInt(padded.slice(2, 4), 10),
    seconds: parseInt(padded.slice(4, 6), 10),
  };
};

// Leading zeroes stripped, since this feeds the typed-digit string and the
// field takes six. Padded, 1:05 came back as "000105", which is already
// six, and every keystroke after that was dropped on the floor: leaving
// the field and coming back left it looking editable and jammed. One digit
// always survives, so 0:00 stays something rather than an empty box.
export const presetDigitsFromParts = ({ hours, minutes, seconds }: TimeParts) =>
  `${pad(hours)}${pad(minutes)}${pad(seconds)}`.replace(/^0+(?=\d)/, '');

export const isPresetOutOfRange = (digits: string) => {
  const raw = rawPresetDigits(digits);
  return raw.hours > MAX_HOURS || raw.minutes > MAX_MINUTES || raw.seconds > MAX_SECONDS;
};
