import { readJSON } from '@/lib/storage';
import { uniqueId } from '@/lib/utils';
import { DEFAULT_PRESETS, MAX_HOURS, STORAGE_KEYS } from './constants';
import type { TimerEntry } from './types';

// Reading the two saved lists back, and the guards that make a corrupt or
// hand-edited store a bad row rather than a broken app.
//
// Arithmetic on a bad number never throws, so a non-numeric field would
// slip through as NaN: presets fall back to DEFAULT_PRESETS, history drops
// the row. Without this a bad entry renders as "abc:NaN" and, once
// clicked, sets the countdown to NaN, which it never leaves since every
// comparison the tick makes against NaN is false.
const isValidEntry = (p: unknown): p is TimerEntry => {
  if (typeof p !== 'object' || p === null) return false;
  const entry = p as Partial<TimerEntry>;
  return (
    typeof entry.minutes === 'number' && Number.isFinite(entry.minutes) &&
    typeof entry.seconds === 'number' && Number.isFinite(entry.seconds) &&
    (entry.hours === undefined || (typeof entry.hours === 'number' && Number.isFinite(entry.hours)))
  );
};

// 8.64e15 is the far end of what a Date can hold. Finite wasn't enough:
// 1e16 is a finite number and still throws inside Intl, which is the crash
// this line exists to stop.
const MAX_TIMESTAMP = 8.64e15;

// Repaired rather than rejected, because the time is the part worth keeping
// and an older save can be missing the rest. A row with no id keys the same
// as every other row without one, so React reuses the wrong node for a
// flash and one delete takes all of them at once; a timestamp that isn't a
// number throws inside Intl on its way to the screen.
const normalizeEntry = (p: TimerEntry): TimerEntry => ({
  ...p,
  id: typeof p.id === 'string' && p.id !== '' ? p.id : uniqueId(),
  timestamp: typeof p.timestamp === 'number' && Math.abs(p.timestamp) <= MAX_TIMESTAMP ? p.timestamp : 0,
});

// Filtered, not cast: one bad row at a time rather than all-or-nothing,
// since history has no defaults to fall back to.
export const readSavedHistory = (): TimerEntry[] => {
  const saved = readJSON<unknown>(STORAGE_KEYS.history, null);
  return Array.isArray(saved) ? saved.filter(isValidEntry).map(normalizeEntry) : [];
};

// All-or-nothing here, since there is a sensible default to fall back to.
//
// Older saves packed hours into minutes. Capped on the way out, or a save
// holding 6000 minutes migrates to 100 hours — past the range every other
// path in the app holds itself to, and into a countdown the fields can't
// show.
export const readSavedPresets = (): TimerEntry[] => {
  const parsed = readJSON<unknown>(STORAGE_KEYS.presets, null);
  if (!Array.isArray(parsed) || !parsed.every(isValidEntry)) return DEFAULT_PRESETS;
  return parsed.map((p) => ({
    ...normalizeEntry(p),
    hours: Math.min((p.hours ?? 0) + Math.floor(p.minutes / 60), MAX_HOURS),
    minutes: p.minutes % 60,
  }));
};
