import { memo } from 'react';
import { LIST_ROW_BUTTON_STYLE } from './constants';
import { formatEntryLabel } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimerEntry } from './types';
import { useEntryFlash } from './useDomFlash';

interface HistoryPanelProps {
  history: TimerEntry[];
  onSelect: (entry: TimerEntry) => void;
  onClear: () => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}

function HistoryRow({ entry, onSelect, inserted, loaded }: {
  entry: TimerEntry;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useEntryFlash(entry.id, inserted, loaded);

  return (
    <button
      ref={buttonRef}
      onClick={() => onSelect(entry)}
      className="self-start border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left whitespace-nowrap"
      style={LIST_ROW_BUTTON_STYLE}
    >
      {formatEntryLabel(entry)}
    </button>
  );
}

function HistoryPanel({ history, onSelect, onClear, inserted, loaded }: HistoryPanelProps) {
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
            <HistoryRow key={entry.id} entry={entry} onSelect={onSelect} inserted={inserted} loaded={loaded} />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(HistoryPanel);
