import { memo, useCallback } from 'react';
import { LIST_ROW_BUTTON_STYLE, LIST_ROW_REMOVE_BUTTON_STYLE } from './constants';
import { formatEntryLabel } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimerEntry } from './types';
import { useEntryFlash, useFizzRemove } from './useDomFlash';

interface HistoryPanelProps {
  history: TimerEntry[];
  onSelect: (entry: TimerEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
  // When the run was recorded, already rendered in the clock's zone and
  // 12/24 setting. Returns '' for entries with no usable timestamp.
  formatStamp: (timestamp: number) => string;
}

// Deliberately the same shape as PresetRow: a history entry is the same
// kind of thing as a preset, a time you can load, so it gets the same box
// and the same − beside it. What it has that a preset doesn't is a when,
// which sits above the row.
function HistoryRow({ entry, onSelect, onRemove, inserted, loaded, formatStamp }: {
  entry: TimerEntry;
  onSelect: (entry: TimerEntry) => void;
  onRemove: (id: string) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
  formatStamp: (timestamp: number) => string;
}) {
  const buttonRef = useEntryFlash(entry.id, inserted, loaded);
  const fizz = useFizzRemove(useCallback(() => onRemove(entry.id), [onRemove, entry.id]));
  const stamp = formatStamp(entry.timestamp);

  return (
    <div className="flex flex-col flex-shrink-0">
      {/* One line, never wrapped: it's a fixed 19-21 characters and the
          sidebar is sized to hold an 8-character box, so it's clamped small
          enough to fit that width and clipped rather than reflowed if a
          zone's offset makes it longer still. */}
      {stamp && (
        <div
          className="text-white opacity-60 font-bold whitespace-nowrap overflow-hidden"
          style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: shrinkClamp(0.4, 0.62, 0.68, 0.62) }}
        >
          {stamp}
        </div>
      )}
      {/* items-stretch so the − takes its height from the box beside it
          rather than its own smaller font. */}
      <div className="flex items-stretch" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
      <button
        onClick={fizz.start}
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

function HistoryPanel({ history, onSelect, onRemove, onClear, inserted, loaded, formatStamp }: HistoryPanelProps) {
  return (
    // flex-shrink-0 like the presets panel: neither list gives up height to
    // the other. As flex-auto this claimed the leftover space, which is
    // what squeezed the presets into a box with a second scrollbar.
    <div className="flex flex-col flex-shrink-0">
      {/* Spacing on shrinkClamp rather than fixed Tailwind steps. */}
      <div
        className="flex justify-between items-center border-b-2 border-white flex-shrink-0"
        style={{ marginBottom: shrinkClamp(0.5, 0.9, 1, 1), paddingBottom: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        <h2 className="text-white font-bold" style={{ fontSize: shrinkClamp(0.875, 1.3, 1.4, 1.25) }}>HISTORY</h2>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="text-white border border-white hover:bg-white hover:text-black transition-colors"
            style={{ fontSize: shrinkClamp(0.65, 0.85, 0.92, 0.75), padding: shrinkClamp(0.25, 0.4, 0.45, 0.375) }}
          >
            Clear
          </button>
        )}
      </div>
      {/* The sidebar owns the scrolling and the overflow-x-hidden that
          stops a row a fraction of a pixel too wide from giving the column
          a horizontal bar to slide along. */}
      <div
        className="flex flex-col"
        style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        {history.length === 0 ? (
          <p className="text-white opacity-50" style={{ fontSize: shrinkClamp(0.75, 1, 1.05, 0.875) }}>No history yet</p>
        ) : (
          history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} onSelect={onSelect} onRemove={onRemove} inserted={inserted} loaded={loaded} formatStamp={formatStamp} />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(HistoryPanel);
