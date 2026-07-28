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
}

// Same shape as PresetRow, deliberately: a history entry is the same
// kind of thing as a preset — a time you can load — so it gets the same
// box at the same width and the same − beside it. Clear is still there
// for emptying the whole list; this is for picking one off.
function HistoryRow({ entry, onSelect, onRemove, inserted, loaded }: {
  entry: TimerEntry;
  onSelect: (entry: TimerEntry) => void;
  onRemove: (id: string) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useEntryFlash(entry.id, inserted, loaded);
  const fizz = useFizzRemove(useCallback(() => onRemove(entry.id), [onRemove, entry.id]));

  return (
    // items-stretch, so the − button takes its height from the box
    // beside it rather than from its own smaller font
    <div className="flex items-stretch flex-shrink-0" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
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
        // border-4 like a preset's box, not the lighter border-2 it used
        // to carry: LIST_ROW_BOX_WIDTH is a border-box width that budgets
        // 8px of border, so a thinner border here would leave these boxes
        // the same width but 4px shorter and 4px roomier inside than the
        // ones above them.
        className={`border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left whitespace-nowrap overflow-hidden ${fizz.isRemoving ? 'animate-removeFizz' : ''}`}
        style={LIST_ROW_BUTTON_STYLE}
      >
        {formatEntryLabel(entry)}
      </button>
    </div>
  );
}

function HistoryPanel({ history, onSelect, onRemove, onClear, inserted, loaded }: HistoryPanelProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      {/* margin/padding below on shrinkClamp rather than fixed
          mb-4/pb-2/px-2/py-1 — same rigidity fix as PresetsPanel's own
          spacing. */}
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
      <div className="flex flex-col overflow-y-auto flex-1" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
        {history.length === 0 ? (
          <p className="text-white opacity-50" style={{ fontSize: shrinkClamp(0.75, 1, 1.05, 0.875) }}>No history yet</p>
        ) : (
          history.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} onSelect={onSelect} onRemove={onRemove} inserted={inserted} loaded={loaded} />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(HistoryPanel);
