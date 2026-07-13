import { memo } from 'react';
import { formatEntryLabel } from './format';
import type { TimerEntry } from './types';

interface HistoryPanelProps {
  history: TimerEntry[];
  onSelect: (entry: TimerEntry) => void;
  onClear: () => void;
}

function HistoryPanel({ history, onSelect, onClear }: HistoryPanelProps) {
  return (
    <div className="flex flex-col min-h-0 flex-1">
      <div className="flex justify-between items-center mb-4 border-b-2 border-white pb-2 flex-shrink-0">
        <h2 className="text-white font-bold" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>HISTORY</h2>
        {history.length > 0 && (
          <button
            onClick={onClear}
            className="text-white border border-white px-2 py-1 text-xs hover:bg-white hover:text-black transition-colors"
            style={{ fontSize: 'clamp(0.65rem, 1.2vw, 0.75rem)' }}
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto flex-1">
        {history.length === 0 ? (
          <p className="text-white opacity-50" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}>No history yet</p>
        ) : (
          history.map((entry) => (
            <button
              key={entry.id}
              onClick={() => onSelect(entry)}
              className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left"
              style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.375rem, 1vw, 0.5rem)', fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}
            >
              {formatEntryLabel(entry)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default memo(HistoryPanel);
