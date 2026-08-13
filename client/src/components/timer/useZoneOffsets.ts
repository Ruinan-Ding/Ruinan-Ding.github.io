import { useEffect, useState } from 'react';
import { TIME_ZONES } from './constants';
import { offsetLabel } from './format';

// The offset for every zone, so the picker reads "New York (-4)" rather
// than leaving you to work out which of the twelve Americas is yours from a
// city name alone. Needs an Intl.DateTimeFormat per zone and 418 of them
// measured 123ms, so it waits for an idle moment after first paint. Until
// then the list shows plain city names.
export function useZoneOffsets(): Record<string, string> {
  const [zoneOffsets, setZoneOffsets] = useState<Record<string, string>>({});
  useEffect(() => {
    const build = () => {
      const at = Date.now();
      const offsets: Record<string, string> = {};
      for (const zone of TIME_ZONES) {
        try {
          const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(at);
          const raw = parts.find((part) => part.type === 'timeZoneName')?.value;
          if (raw) offsets[zone] = offsetLabel(raw);
        } catch {
          // a zone the engine lists but won't format: it just keeps its
          // plain city name, same as before this ran
        }
      }
      setZoneOffsets(offsets);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(build);
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(build, 0);
    return () => window.clearTimeout(id);
  }, []);
  return zoneOffsets;
}
