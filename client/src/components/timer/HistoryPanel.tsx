import { memo, useCallback, useEffect } from 'react';
import { HISTORY_WARN, MAX_HISTORY, LIST_ROW_BUTTON_STYLE, LIST_ROW_FONT_SIZE, LIST_ROW_REMOVE_BUTTON_STYLE, LIST_ROW_REMOVE_FONT_SIZE, SIDEBAR_ROW_GAP } from './constants';
import { formatEntryLabel } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimerEntry } from './types';
import { useEntryFlash, useFizzRemove } from './useDomFlash';
import SidebarHeading from './SidebarHeading';


// Lines the stamp up with the label box rather than the − beside it. The
// − is 1.3em of its own smaller font plus its border-2, the same model
// SIDEBAR_WIDTH uses to reserve the row, so this tracks it at every size.
const STAMP_INDENT = `calc(1.3 * ${LIST_ROW_REMOVE_FONT_SIZE} + 4px + ${SIDEBAR_ROW_GAP})`;

// The stamp's own size lives in index.css as .history-stamp, since it has
// two of them: one that fits the time and the date, and a larger one for
// once the date has gone. A size set from here would be an inline style
// and would beat the container query that grows it back.

// A stamp sitting flush on its own row made the − button look like it
// reached up into the timestamp. Small enough that the two still read as
// one entry.
const STAMP_GAP = `calc(${LIST_ROW_FONT_SIZE} * 0.18)`;

// Bigger than the presets list uses, because a history row is now two
// pieces: without it the gap between entries was the same 4px as the gap
// inside one, and they ran together.
const HISTORY_ROW_GAP = shrinkClamp(0.75, 1.25, 1.35, 1.2);

interface HistoryPanelProps {
  history: TimerEntry[];
  onSelect: (entry: TimerEntry) => void;
  // Asked first, applied second: the fizz only starts once the question is
  // answered, so cancelling leaves a row that never animated. Same shape
  // as PresetsPanel, for the same reason.
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  // The row currently fizzing out, null the rest of the time.
  removingId: string | null;
  onClear: () => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
  // When the run was recorded, already rendered in the clock's zone and
  // 12/24 setting, split into the two lines it prints on. Null for an
  // entry with no usable timestamp.
  formatStamp: (timestamp: number) => { time: string; date: string } | null;
}

// Deliberately the same shape as PresetRow: a history entry is the same
// kind of thing as a preset, a time you can load, so it gets the same box
// and the same − beside it. What it has that a preset doesn't is a when,
// which sits above the row.
function HistoryRow({ entry, onSelect, onRequestRemove, onRemove, isRemoving, inserted, loaded, formatStamp }: {
  entry: TimerEntry;
  onSelect: (entry: TimerEntry) => void;
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  inserted: FlashTarget;
  loaded: FlashTarget;
  formatStamp: (timestamp: number) => { time: string; date: string } | null;
}) {
  const buttonRef = useEntryFlash(entry.id, inserted, loaded);
  const fizz = useFizzRemove(useCallback(() => onRemove(entry.id), [onRemove, entry.id]));
  // The − no longer starts its own fizz. The panel above says when, once
  // whatever question the click raised has been answered.
  const { start } = fizz;
  useEffect(() => {
    if (isRemoving) start();
  }, [isRemoving, start]);
  const stamp = formatStamp(entry.timestamp);

  return (
    // An inline-size container so the stamp can tell whether both halves
    // fit the row it's indented to.
    <div
      className="flex flex-col flex-shrink-0"
      style={{ gap: stamp ? STAMP_GAP : undefined, containerType: 'inline-size', containerName: 'history-row' }}
    >
      {/* One line, indented to the label box. The date is the half that
          gives when the sidebar can't hold both: a run you can still place
          by its time is more use than one you can place by neither. */}
      {stamp && (
        <div
          className="history-stamp text-white opacity-70 font-bold leading-tight whitespace-nowrap overflow-hidden"
          style={{ fontFamily: "'IBM Plex Mono', monospace", paddingLeft: STAMP_INDENT }}
        >
          {stamp.time}
          <span className="stamp-date">{' '}{stamp.date}</span>
        </div>
      )}
      {/* items-stretch so the − takes its height from the box beside it
          rather than its own smaller font. */}
      <div className="flex items-stretch" style={{ gap: SIDEBAR_ROW_GAP }}>
      <button
        onClick={() => onRequestRemove(entry.id)}
        disabled={fizz.isRemoving}
        aria-label={`Remove history entry ${formatEntryLabel(entry)}`}
        className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors"
        style={LIST_ROW_REMOVE_BUTTON_STYLE}
      >
        −
      </button>
      <button
        ref={buttonRef}
        onClick={() => onSelect(entry)}
        disabled={fizz.isRemoving}
        onAnimationEnd={fizz.onAnimationEnd}
        // border-4 like a preset's box: LIST_ROW_BOX_WIDTH is a border-box
        // width budgeting 8px of border, so a thinner one here would leave
        // these boxes the same width but shorter and roomier inside than
        // the ones above. Label centred for the same reason it is there.
        className={`border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 whitespace-nowrap overflow-hidden ${fizz.isRemoving ? 'animate-removeFizz' : ''}`}
        style={LIST_ROW_BUTTON_STYLE}
      >
        {formatEntryLabel(entry)}
      </button>
      </div>
    </div>
  );
}

function HistoryPanel({ history, onSelect, onRequestRemove, onRemove, removingId, onClear, inserted, loaded, formatStamp }: HistoryPanelProps) {
  return (
    // flex-shrink-0 like the presets panel: neither list gives up height to
    // the other. As flex-auto this claimed the leftover space, which is
    // what squeezed the presets into a box with a second scrollbar.
    <div className="flex flex-col flex-shrink-0">
      <SidebarHeading
        label="HISTORY"
        count={history.length}
        max={MAX_HISTORY}
        warn={HISTORY_WARN}
        countTitle="Full — each new run drops the oldest entry"
        clearTitle="Delete every run — asks first"
        onClear={onClear}
      />
      {/* The sidebar owns the scrolling and the overflow-x-hidden that
          stops a row a fraction of a pixel too wide from giving the column
          a horizontal bar to slide along. */}
      <div
        className="flex flex-col"
        style={{ gap: HISTORY_ROW_GAP }}
      >
        {history.length === 0 ? (
          <p className="text-white opacity-50" style={{ fontSize: shrinkClamp(0.75, 1, 1.05, 0.875) }}>No history yet</p>
        ) : (
          history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} onSelect={onSelect} onRequestRemove={onRequestRemove} onRemove={onRemove} isRemoving={removingId === entry.id} inserted={inserted} loaded={loaded} formatStamp={formatStamp} />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(HistoryPanel);
