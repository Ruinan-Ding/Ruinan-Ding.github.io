import { memo, useRef } from 'react';
import { formatEntryLabel } from './format';
import { shrinkClamp } from './responsive';
import type { TimerEntry } from './types';
import { useDomFlash } from './useDomFlash';

const HISTORY_BUTTON_STYLE = { fontFamily: "'IBM Plex Mono', monospace", padding: shrinkClamp(0.375, 1, 1.1, 0.5), fontSize: shrinkClamp(0.75, 1.5, 1.6, 0.875) };

type FlashTarget = { id: string; token: number } | null;

interface HistoryPanelProps {
  history: TimerEntry[];
  onSelect: (entry: TimerEntry) => void;
  onClear: () => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}

// Load wins over insert when both target the same id (e.g. loading a
// history entry within 1.2s of it being recorded) — the flash class is
// applied directly to the DOM (see useDomFlash) rather than through
// React's className, so a reselect of the same entry still replays the
// animation instead of silently no-op'ing on an unchanged class string.
function HistoryRow({ entry, onSelect, inserted, loaded }: {
  entry: TimerEntry;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const flash = loaded?.id === entry.id
    ? { key: `load:${loaded.token}`, className: 'animate-loadFlash' }
    : inserted?.id === entry.id
      ? { key: `insert:${inserted.token}`, className: 'animate-insertFlash' }
      : { key: null, className: '' };
  useDomFlash(buttonRef, flash.key, flash.className);

  return (
    <button
      ref={buttonRef}
      onClick={() => onSelect(entry)}
      className="border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 text-left"
      style={HISTORY_BUTTON_STYLE}
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
