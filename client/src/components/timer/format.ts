import { MAX_TOTAL_SECONDS } from './constants';
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

// A signed time as the three boxes show it: the magnitude split across
// them, plus which one wears the minus sign.
//
// One unit carries it, not all three and not a box of its own — "-01:30"
// reading down the column is one time, where "-01:-30" is nonsense and a
// separate sign box is a fourth control for a thing that is part of the
// number. It goes on the largest unit that has something in it, because
// that's the one you read first; at 00:00:45 that's the seconds, and the
// moment it grows past a minute it moves up on its own.
//
// Nothing is negative at zero, so no unit wears a sign there.
export const signedParts = (total: number) => {
  const magnitude = fromTotalSeconds(Math.abs(total));
  const negative = total < 0;
  const signUnit: keyof TimeParts | null = !negative
    ? null
    : magnitude.hours > 0
      ? 'hours'
      : magnitude.minutes > 0
        ? 'minutes'
        : magnitude.seconds > 0
          ? 'seconds'
          : null;
  return { ...magnitude, negative, signUnit };
};

// The three boxes back into one signed number. Deliberately unclamped:
// this is what turns 61 typed into the seconds box into 1m 01s, and 59
// stepped up into 1m 00s, without either the box or the caller doing
// arithmetic of its own. Whoever holds the result decides what's in range.
export const toSignedTotal = (parts: TimeParts, negative: boolean) =>
  (negative ? -1 : 1) * toTotalSeconds(parts);

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

export const formatEntryLabel = (entry: Pick<TimerEntry, 'hours' | 'minutes' | 'seconds' | 'negative'>) => {
  const hours = entry.hours ?? 0;
  const sign = entry.negative ? '-' : '';
  return hours > 0
    ? `${sign}${hours}:${pad(entry.minutes)}:${pad(entry.seconds)}`
    : `${sign}${entry.minutes}:${pad(entry.seconds)}`;
};

// The same short label, with the sign in front of the whole thing rather
// than buried on one unit: prose reads "-1:30", not "1:-30".
export const formatSignedLabel = (total: number) =>
  formatEntryLabel({ ...fromTotalSeconds(Math.abs(total)), negative: total < 0 });

export const presetDigits = (input: string) => input.replace(/[^0-9]/g, '');

// Digits fill from the right, calculator-style: "130" is 00h 01m 30s.
//
// Carried rather than clamped per unit: "161" is 1m 61s, which is 2m 01s,
// the same arithmetic the three boxes do. Clamping each unit to its own
// max turned that into 1m 59s — a different time from the one typed, and
// silently. Only a total past the end of the range is refused, and it's
// refused rather than corrected down a unit at a time.
export const presetTotalFromDigits = (digits: string) => toTotalSeconds(rawPresetDigits(digits));

export const parsePresetDigits = (digits: string): TimeParts =>
  fromTotalSeconds(Math.min(presetTotalFromDigits(digits), MAX_TOTAL_SECONDS));

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

// Only when the carry has nowhere left to go: 99:99:99 is past 99:59:59
// and there is no hour to carry into. Anything that fits, fits.
export const isPresetOutOfRange = (digits: string) => presetTotalFromDigits(digits) > MAX_TOTAL_SECONDS;
