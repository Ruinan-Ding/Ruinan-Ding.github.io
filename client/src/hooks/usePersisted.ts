import { useEffect } from 'react';
import { writeJSON } from '@/lib/storage';

// Writes one key back to localStorage whenever its own value changes, and
// only then. The reads stay where they are — each piece of state validates
// its saved value differently (a zone is checked against the browser's
// list, volume is clamped, presets are migrated), so there's nothing
// shared to lift on that side.
//
// One key per call rather than one effect writing all of them: sharing an
// effect means sharing its dependency list, so the timer's `seconds` —
// which changes once a second while running — was re-serializing the
// presets, the history, the theme, the zone and nine other untouched
// values every second, through an API that blocks the main thread.
export function usePersisted(key: string, value: unknown) {
  useEffect(() => {
    writeJSON(key, value);
  }, [key, value]);
}
