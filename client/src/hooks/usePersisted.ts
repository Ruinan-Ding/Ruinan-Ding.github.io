import { useEffect } from 'react';
import { writeJSON } from '@/lib/storage';

// Writes one key back to localStorage when its own value changes.
//
// One key per call, not one effect for all of them: a shared effect means
// a shared dependency list, so the timer's `seconds` dragged the presets,
// the history and every setting through JSON.stringify once a second.
//
// Read-side stays at each call site, where the validation differs (zones
// are checked against the browser's list, volume is clamped, presets are
// migrated).
export function usePersisted(key: string, value: unknown) {
  useEffect(() => {
    writeJSON(key, value);
  }, [key, value]);
}
