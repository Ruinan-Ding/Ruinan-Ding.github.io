import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readJSON } from '@/lib/storage';
import { DEFAULT_TIME_ZONE, STORAGE_KEYS, TIME_ZONES } from './constants';
import type { FullAct } from './types';
import { FLASH_DURATION_MS } from './useFlashOnToken';
import { useZoneOffsets } from './useZoneOffsets';

// Everything the two clocks are drawn from: the theme they sit in, the
// zone and 12/24 setting they show, and the label that fades off the time
// to announce a change to that setting.
//
// One hook rather than four clusters in Timer, and it takes askFull for a
// reason: the two handlers at the bottom used to live four hundred lines
// from the state they drive, with a comment saying they were down there
// because askFull wasn't in scope where that state was declared. Passing
// it in is what lets them sit beside it.
export function useClockSettings(askFull: (act: FullAct, run: () => void) => void) {
  // The whole theme is one attribute on <html>: index.css swaps
  // --app-surface and --app-ink off it and every colour resolves through
  // that pair. Layout effect so the attribute and its paint land together.
  const [isLightTheme, setIsLightTheme] = useState(() => readBoolean(STORAGE_KEYS.lightTheme, false));
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = isLightTheme ? 'light' : 'dark';
    // The browser's own chrome, told what colour the page went. Read back
    // off the variable rather than written out again here: index.css owns
    // the pair, and a third copy of #141414 is a third place to change it.
    // Created on the fly because it has nothing to say until this runs,
    // and a tag in index.html could only ever name the dark default.
    const surface = getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim();
    if (surface) {
      const tag = document.querySelector('meta[name="theme-color"]')
        ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
      tag.setAttribute('content', surface);
    }
  }, [isLightTheme]);

  // Checked against the list the browser knows before it's trusted: Intl
  // throws on an unknown zone, and on every format call, so a hand-edited
  // value takes the page down rather than showing the wrong time.
  const [timeZone, setTimeZone] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.clockTimeZone, null);
    return typeof saved === 'string' && TIME_ZONES.includes(saved) ? saved : DEFAULT_TIME_ZONE;
  });
  const [is24Hour, setIs24Hour] = useState(() => readBoolean(STORAGE_KEYS.clock24Hour, false));

  // Clicking the time switches 12/24, and "24H" or "12H" fades off it to
  // say so (hourFormatFizz in index.css). Set straight from the click
  // rather than through useFlashOnToken, which turns on a tick later and
  // would show a frame of the new time before the label announcing it.
  //
  // Here rather than in ClockCluster: both copies of the clock have to
  // agree, and it persists. The tick itself lives down there.
  const [isHourFormatFlashing, setIsHourFormatFlashing] = useState(false);
  const [hourFormatFlashToken, setHourFormatFlashToken] = useState(0);
  const hourFormatFlashRef = useRef(0);
  useEffect(() => () => window.clearTimeout(hourFormatFlashRef.current), []);
  // useCallback: this is what the clock hangs its memo on, and a new
  // function every tick means memo() can never bail out.
  const runHourFormatChange = useCallback(() => {
    setIs24Hour((prev) => !prev);
    setIsHourFormatFlashing(true);
    setHourFormatFlashToken((n) => n + 1);
    window.clearTimeout(hourFormatFlashRef.current);
    hourFormatFlashRef.current = window.setTimeout(() => setIsHourFormatFlashing(false), FLASH_DURATION_MS);
  }, []);

  // The clock's two settings, each behind a full-mode question. Memoized
  // because the clock hangs its memo() on both.
  const handleHourFormatClick = useCallback(
    () => askFull('hourFormat', runHourFormatChange),
    [askFull, runHourFormatChange]
  );
  const handleTimeZoneChange = useCallback(
    (zone: string) => askFull('timeZone', () => setTimeZone(zone)),
    [askFull]
  );

  const zoneOffsets = useZoneOffsets();

  usePersisted(STORAGE_KEYS.lightTheme, isLightTheme);
  usePersisted(STORAGE_KEYS.clockTimeZone, timeZone);
  usePersisted(STORAGE_KEYS.clock24Hour, is24Hour);

  return {
    isLightTheme,
    setIsLightTheme,
    timeZone,
    is24Hour,
    isHourFormatFlashing,
    hourFormatFlashToken,
    handleHourFormatClick,
    handleTimeZoneChange,
    zoneOffsets,
  };
}
