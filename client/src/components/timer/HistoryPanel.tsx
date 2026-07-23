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
      className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left"
      style={LIST_ROW_BUTTON_STYLE}
    >
      {formatEntryLabel(entry)}
    </button>
  );
}

function HistoryPanel({ history, onSelect, onClear, inserted, loaded }: HistoryPanelProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex justify-between items-center mb-4 border-b-2 border-white pb-2 flex-shrink-0">
        <h2 className="text-white font-bold" style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.125) }}>HISTORY</h2>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="text-white border border-white px-2 py-1 text-xs hover:bg-white hover:text-black transition-colors"
            style={{ fontSize: shrinkClamp(0.65, 1.2, 1.3, 0.75) }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {history.length === 0 ? (
          <p className="text-white opacity-50" style={{ fontSize: shrinkClamp(0.75, 1.5, 1.6, 0.875) }}>No history yet</p>
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
