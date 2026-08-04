import { memo, useEffect, useMemo, useState } from 'react';
import { TIME_ZONES, ZONES_BY_REGION } from './constants';
import { formatDateParts, offsetLabel } from './format';

// The select's own text is transparent, so its options carry their colors
// themselves: the popup is the browser's, drawn from these.
const OPTION_STYLE = { color: 'var(--app-ink)', backgroundColor: 'var(--app-surface)' };

// shortOffset is the newest thing in this file, and an engine that doesn't
// know the value throws rather than ignoring it — inside a formatter built
// during render, which takes the whole app down on load rather than the
// clock. Older engines fall back to the short name, which offsetLabel
// turns into the same number for most zones and an abbreviation for the
// rest. Guarded the way the zone list already is in constants.
const zoneFormatter = (timeZone: string) => {
  for (const timeZoneName of ['shortOffset', 'short'] as const) {
    try {
      return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName });
    } catch {
      // engine predates this option value
    }
  }
  return null;
};

interface ClockClusterProps {
  // Everything inside is em-based, so this scales the whole cluster. The
  // word counter's fullscreen row uses a smaller copy than the main view.
  fontSize: string;
  // Held in Timer: both copies of the clock have to agree on these, and
  // they persist. Only the current instant is local.
  timeZone: string;
  is24Hour: boolean;
  // zone id -> offset label, for the picker. Built in Timer because it
  // costs an Intl.DateTimeFormat per zone and both clocks share it.
  zoneOffsets: Record<string, string>;
  isHourFormatFlashing: boolean;
  onHourFormatClick: () => void;
  onTimeZoneChange: (zone: string) => void;
}

// Time and zone on one line, date under them. Clicking the time is the
// 12/24 switch, which saves a control's worth of width.
//
// Separate from Timer so the once-a-second tick re-renders this and
// nothing else. Held in Timer it re-rendered the whole app, word counter
// included, which draws a row per line of text.
//
// memo() at the bottom guards the other direction, which splitting the
// file alone did nothing about: Timer re-renders every TICK_MS while a
// timer runs, and each one reconciled the picker's ~400 <option>s. Every
// prop has to stay stable for that to hold — see handleHourFormatClick.
function ClockCluster({
  fontSize,
  timeZone,
  is24Hour,
  zoneOffsets,
  isHourFormatFlashing,
  onHourFormatClick,
  onTimeZoneChange,
}: ClockClusterProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Three formatters rather than one dateStyle/timeStyle pair, which puts
  // the date first. The time omits the zone because the box below it
  // carries the offset; the third formatter is what that box reads.
  //
  // The date is 2-digit day and month so formatDateParts can lay it out as
  // dd/mm/yyyy, which no en-US pattern gives on its own.
  const clock = useMemo(() => ({
    time: new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: !is24Hour,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
    date: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }),
    zone: zoneFormatter(timeZone),
  }), [timeZone, is24Hour]);
  // "-4", "+9", "+5:30". shortOffset rather than the short name, so this is
  // always a number instead of "EDT" for some zones and "GMT+9" for others,
  // and it's the shortest thing that still identifies the zone. Formatted
  // live rather than looked up, so it follows the daylight-saving
  // changeover on its own.
  // Not memoised: nowMs is in the key and moves every second, so the memo
  // never once bailed out and only added bookkeeping around a call that is
  // cheaper than the bookkeeping.
  const zoneOffset = offsetLabel(clock.zone?.formatToParts(nowMs).find((part) => part.type === 'timeZoneName')?.value ?? '');

  // What the clock is on, plus the picker that changes it.
  const zoneBox = (
    <span className="inline-flex items-center flex-shrink-0 zoom-safe-text" style={{ fontSize: `max(0.5rem, calc(${fontSize} * 0.7))` }}>
      {/* A native select gets 400-odd options and type-to-find for free,
          but draws the selected option's own text, so the closed box and
          the open list would have to read the same. Drawing the select's
          text transparent and painting the offset and caret over it lets
          them differ: just "-4" in a box exactly that wide, city names
          with their offsets in the list. The value is the zone id
          throughout. */}
      <span
        className="relative inline-flex items-center gap-1 border-2 font-bold flex-shrink-0 self-center focus-within:ring-1"
        style={{ borderColor: 'currentColor', backgroundColor: 'var(--app-surface)', fontFamily: "'IBM Plex Mono', monospace", padding: '0 0.25em' }}
      >
        <span className="whitespace-nowrap">{zoneOffset}</span>
        <span aria-hidden style={{ lineHeight: 1 }}>▾</span>
        <select
          value={timeZone}
          // Same check the saved value gets: a select reports "" when its
          // value matches no option, and "" reaching Intl throws a
          // RangeError on every render from then on, taking the page with
          // it rather than just the clock.
          onChange={(e) => { if (TIME_ZONES.includes(e.target.value)) onTimeZoneChange(e.target.value); }}
          className="absolute inset-0 w-full h-full cursor-pointer appearance-none border-0"
          // Transparent, not hidden: the browser draws the popup from
          // these same styles and it has to stay readable. The colors go
          // back on the options.
          style={{ color: 'transparent', backgroundColor: 'transparent', fontFamily: "'IBM Plex Mono', monospace", fontSize: 'inherit' }}
          title={`Time zone the clock reads in — ${timeZone.replace(/_/g, ' ')}`}
          aria-label="Clock time zone"
        >
          {ZONES_BY_REGION.map(([region, zones]) => (
            <optgroup key={region} label={region} style={OPTION_STYLE}>
              {zones.map(({ zone, label }) => (
                <option key={zone} value={zone} style={OPTION_STYLE}>
                  {zoneOffsets[zone] ? `${label} (${zoneOffsets[zone]})` : label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </span>
    </span>
  );

  // minWidth on the time so switching between "3:56:55 PM" and "15:56:55"
  // doesn't drag the zone box back and forth.
  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ fontSize }}>
      <span className="flex items-center gap-1 leading-tight">
        {/* Boxed like the zone beside it, so the two read as a pair of
            controls rather than a label that happens to be clickable. */}
        <button
          onClick={onHourFormatClick}
          aria-pressed={is24Hour}
          className="relative border-2 whitespace-nowrap text-center transition-opacity duration-200 hover:opacity-80"
          style={{ borderColor: 'currentColor', backgroundColor: 'var(--app-surface)', letterSpacing: '0.05em', padding: '0 0.25em', minWidth: '6.9em' }}
          title={is24Hour ? 'Clock is on 24-hour time — click for 12-hour with AM/PM' : 'Clock is on 12-hour time — click for 24-hour'}
          aria-label={is24Hour ? 'Show the clock as 12-hour time' : 'Show the clock as 24-hour time'}
        >
          {clock.time.format(nowMs)}
          {/* Sits over the time on the same surface colour, so fading it
              out is the time coming back (hourFormatFizz in index.css).
              Yellow is this app's "something just changed" everywhere
              else. */}
          {isHourFormatFlashing && (
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center animate-hourFormatFizz"
              style={{ backgroundColor: 'var(--app-surface)', color: '#eab308' }}
            >
              {is24Hour ? '24H' : '12H'}
            </span>
          )}
        </button>
        {zoneBox}
      </span>
      <span className="opacity-80 whitespace-nowrap leading-tight" style={{ letterSpacing: '0.05em' }}>
        {formatDateParts(clock.date, nowMs)}
      </span>
    </div>
  );
}

export default memo(ClockCluster);
