import { useEffect, useMemo, useState } from 'react';
import { TIME_ZONES, ZONES_BY_REGION } from './constants';

// The zone picker's own text is transparent (see that select), so its
// options have to say what color they are themselves — the popup is the
// browser's, drawn from these.
const OPTION_STYLE = { color: 'var(--app-ink)', backgroundColor: 'var(--app-surface)' };

interface ClockClusterProps {
  // Sizes the whole cluster. The word counter's fullscreen row needs a
  // smaller copy than the main view does, and everything in here is
  // em-based, so this one number scales the lot.
  fontSize: string;
  // Lifted to Timer rather than held here: both copies of this clock have
  // to agree on them, they persist, and the timer owns the storage. Only
  // the current instant is local — see nowMs below.
  timeZone: string;
  is24Hour: boolean;
  zoneAbbrs: Record<string, string>;
  isHourFormatFlashing: boolean;
  onHourFormatClick: () => void;
  onTimeZoneChange: (zone: string) => void;
}

// The wall clock: time and zone on one line, date under them. Two lines
// rather than three because the 12/24 switch is gone — the time itself is
// the switch now (see onHourFormatClick), which is a control this cluster
// no longer has to find room for.
//
// It lives in its own file for one reason: the second hand. Ticking once
// a second is nothing, but while this state sat in Timer that tick
// re-rendered the entire app every second — including the word counter,
// which draws one row per line of text and never bails out of it (its
// memo() can't, see the props Timer hands it). An idle page with a long
// document was reconciling thousands of nodes a second to move a colon.
// Owning nowMs here means the tick re-renders the clock and nothing else.
export default function ClockCluster({
  fontSize,
  timeZone,
  is24Hour,
  zoneAbbrs,
  isHourFormatFlashing,
  onHourFormatClick,
  onTimeZoneChange,
}: ClockClusterProps) {
  // One tick a second is all a clock showing seconds needs — the
  // countdown's own 10ms loop is separate and unaffected either way.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Separate formatters rather than one so the time leads and the date
  // follows; a single dateStyle/timeStyle formatter puts them the other
  // way round. Rebuilt only when the zone or the 12/24 switch changes,
  // not on every one of those ticks.
  //
  // The time carries no zone name — the box that picks the zone is right
  // underneath it saying "EDT", and saying it twice on one line is width
  // this clock doesn't have to spend. The third formatter here is what
  // that box reads: same job, just not printed alongside the time.
  const clock = useMemo(() => ({
    time: new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: !is24Hour,
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }),
    date: new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
    zone: new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }),
  }), [timeZone, is24Hour]);
  // What the browser calls the selected zone right now — "EDT", "GMT+9" —
  // which follows the daylight-saving changeover on its own because it's
  // formatted live rather than looked up.
  const zoneAbbr = useMemo(
    () => clock.zone.formatToParts(nowMs).find((part) => part.type === 'timeZoneName')?.value ?? '',
    [clock, nowMs],
  );

  // The zone box: what the clock is on, and the picker that changes it.
  const zoneBox = (
    <span className="inline-flex items-center flex-shrink-0" style={{ fontSize: `max(0.5rem, calc(${fontSize} * 0.7))` }}>
      {/* Native select, so the zone list is the browser's own (TIME_ZONES)
          and the picker is whatever the platform already does well —
          400-odd options, type-to-find included, for free — but with its
          own text drawn transparent, and the abbreviation and caret beside
          it drawn here instead.
          That split is what lets the two ends disagree: the closed box
          shows only what the clock is on ("EDT", "GMT+10:30") and is
          exactly as wide as that, while the list keeps every zone's city
          AND its abbreviation in brackets. A plain select can't do both —
          it draws the selected option's own text, so short box and
          informative list are the same string. Ellipsising that string
          was the previous answer, and it's what cut "GMT+10:30" short.
          The value is the full zone id throughout, so nothing about what's
          stored or validated changes. */}
      <span
        className="relative inline-flex items-center gap-1 border-2 font-bold flex-shrink-0 self-center focus-within:ring-1"
        style={{ borderColor: 'currentColor', backgroundColor: 'var(--app-surface)', fontFamily: "'IBM Plex Mono', monospace", padding: '0 0.25em' }}
      >
        <span className="whitespace-nowrap">{zoneAbbr || timeZone}</span>
        <span aria-hidden style={{ lineHeight: 1 }}>▾</span>
        <select
          value={timeZone}
          // same check the saved value gets, for the same reason: a select
          // reports "" when its value matches no option, and "" reaching
          // the formatter is a RangeError on every render from then on —
          // the whole page, not just the clock
          onChange={(e) => { if (TIME_ZONES.includes(e.target.value)) onTimeZoneChange(e.target.value); }}
          className="absolute inset-0 w-full h-full cursor-pointer appearance-none border-0"
          // transparent rather than hidden or opacity-0: the popup this
          // opens is drawn by the browser from these same styles, and it
          // has to stay readable. Colors go back on the options themselves.
          style={{ color: 'transparent', backgroundColor: 'transparent', fontFamily: "'IBM Plex Mono', monospace", fontSize: 'inherit' }}
          title={`Time zone the clock reads in — ${timeZone.replace(/_/g, ' ')}`}
          aria-label="Clock time zone"
        >
          {ZONES_BY_REGION.map(([region, zones]) => (
            <optgroup key={region} label={region} style={OPTION_STYLE}>
              {zones.map(({ zone, label }) => (
                <option key={zone} value={zone} style={OPTION_STYLE}>
                  {zoneAbbrs[zone] ? `${label} (${zoneAbbrs[zone]})` : label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </span>
    </span>
  );

  // The time keeps a minimum width of its own so that dropping from a
  // ten-character "3:56:55 PM" to an eight-character "15:56:55" doesn't
  // drag the zone box beside it back and forth.
  return (
    <div className="flex flex-col items-center gap-0.5 flex-shrink-0" style={{ fontSize }}>
      <span className="flex items-center gap-1 leading-tight">
        {/* Boxed like the zone beside it, because it does the same kind of
            thing: the two read as a pair of controls rather than a label
            that happens to be clickable. */}
        <button
          onClick={onHourFormatClick}
          aria-pressed={is24Hour}
          className="relative border-2 whitespace-nowrap text-center transition-opacity duration-200 hover:opacity-80"
          style={{ borderColor: 'currentColor', backgroundColor: 'var(--app-surface)', letterSpacing: '0.05em', padding: '0 0.25em', minWidth: '6.9em' }}
          title={is24Hour ? 'Clock is on 24-hour time — click for 12-hour with AM/PM' : 'Clock is on 12-hour time — click for 24-hour'}
          aria-label={is24Hour ? 'Show the clock as 12-hour time' : 'Show the clock as 24-hour time'}
        >
          {clock.time.format(nowMs)}
          {/* over the time rather than instead of it, on the same surface
              colour, so fading this away is the time coming back — see
              hourFormatFizz in index.css. Yellow while it does: the app's
              "something just changed" colour everywhere else (the pause
              flash, a counter nearing its limit), and it reads as the
              answer to the click rather than as part of the clock. */}
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
        {/* half a rem is the floor for anything in this cluster: below it
            the caret and three capitals stop being shapes at all */}
        {zoneBox}
      </span>
      <span className="opacity-80 whitespace-nowrap leading-tight" style={{ letterSpacing: '0.05em' }}>
        {clock.date.format(nowMs)}
      </span>
    </div>
  );
}
