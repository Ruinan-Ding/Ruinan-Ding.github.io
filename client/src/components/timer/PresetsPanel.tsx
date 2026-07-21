import { memo, useRef, useState } from 'react';
import { MAX_PRESETS } from './constants';
import { formatEntryLabel, parsePresetDigits, presetDigits } from './format';
import { shrinkClamp } from './responsive';
import type { TimeParts, TimerEntry } from './types';
import { useDigitEntry } from './useDigitEntry';

// matches the font size of the preset list buttons below. This sidebar
// sits in a fixed, overflow-hidden column, so its own controls need to
// shrink first on a short window just like the main column's do — nothing
// here scrolls if it overflows.
const PRESET_INPUT_FONT_SIZE = shrinkClamp(0.75, 1.5, 1.6, 0.875);
// shared by the +/- preset buttons
const PRESET_BUTTON_STYLE = { padding: shrinkClamp(0.25, 0.5, 0.55, 0.375), fontSize: shrinkClamp(0.7, 1.2, 1.3, 0.875), minWidth: shrinkClamp(1.5, 3, 3, 2) };

interface PresetsPanelProps {
  presets: TimerEntry[];
  onAdd: (parts: TimeParts) => void;
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
  highlightedId: string | null;
}

// Digit entry is keydown-driven rather than derived from onChange, since
// onChange alone can't tell a partial entry from a complete one. Track the
// raw typed digits instead, and render them unpadded (same style used
// everywhere else in the app: "1:30", not "00:01:30").
function PresetsPanel({ presets, onAdd, onRemove, onSelect, highlightedId }: PresetsPanelProps) {
  const [digits, setDigits] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atCapacity = presets.length >= MAX_PRESETS;

  const displayValue = digits === '' ? '' : formatEntryLabel(parsePresetDigits(digits));
  // the input's real value matches the hint's character count while empty
  // (rendered invisible) purely so the caret lands right after the hint's
  // last "S" instead of in the middle of the empty box
  const inputValue = digits === '' ? 'HH:MM:SS' : displayValue;

  const handleAdd = () => {
    if (atCapacity || digits === '') return;
    onAdd(parsePresetDigits(digits));
    setDigits('');
  };

  const { handleKeyDown, handlePaste, handleSelect, pinCaret } = useDigitEntry(inputRef, inputValue, {
    append: (text) => {
      const typed = presetDigits(text);
      if (typed) setDigits((prev) => (prev + typed).slice(0, 6));
    },
    remove: () => setDigits((prev) => prev.slice(0, -1)),
    onCommit: handleAdd,
  });

  const handleBlur = () => {
    if (digits === '') return;
    const { hours, minutes, seconds } = parsePresetDigits(digits);
    setDigits(`${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`);
  };

  return (
    <div>
      <h2 className="text-white font-bold mb-4 border-b-2 border-white pb-2" style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.125) }}>PRESETS</h2>
      <div className="flex flex-col gap-2">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-2">
            <button
              onClick={() => onRemove(preset.id)}
              aria-label={`Remove preset ${formatEntryLabel(preset)}`}
              className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
              style={PRESET_BUTTON_STYLE}
            >
              −
            </button>
            <button
              onClick={() => onSelect(preset)}
              className={`flex-1 border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 ${preset.id === highlightedId ? 'animate-highlightFade' : ''}`}
              style={{ fontFamily: "'IBM Plex Mono', monospace", padding: shrinkClamp(0.375, 1, 1.1, 0.5), fontSize: shrinkClamp(0.75, 1.5, 1.6, 0.875) }}
            >
              {formatEntryLabel(preset)}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleAdd}
            disabled={atCapacity}
            aria-label="Add preset"
            title={atCapacity ? `Preset limit reached (${MAX_PRESETS})` : 'Add preset'}
            className="border-2 border-green-500 text-green-500 font-bold hover:bg-green-500 hover:text-white transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={PRESET_BUTTON_STYLE}
          >
            +
          </button>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: PRESET_INPUT_FONT_SIZE, color: '#888888', pointerEvents: 'none', zIndex: 0, fontWeight: 'bold', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              {displayValue === '' ? 'HH:MM:SS' : ''}
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              disabled={atCapacity}
              title={atCapacity ? `Preset limit reached (${MAX_PRESETS})` : undefined}
              aria-label="New preset time"
              value={inputValue}
              onChange={() => {}}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              onFocus={(e) => pinCaret(e.target)}
              onSelect={handleSelect}
              className="border-4 border-white font-bold transition-colors duration-0 w-full disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                padding: shrinkClamp(0.375, 1, 1.1, 0.5),
                fontSize: PRESET_INPUT_FONT_SIZE,
                // invisible while showing the hint's character count, so the
                // decorative hint div shows through underneath instead —
                // caretColor is set separately since it inherits from color
                // and would otherwise vanish along with the text
                color: digits === '' ? 'transparent' : '#ffffff',
                caretColor: '#ffffff',
                backgroundColor: 'transparent',
                position: 'relative',
                zIndex: 1,
                letterSpacing: '0.05em',
                minWidth: 0,
                // centered, so the caret naturally lands right after the
                // last typed digit (or the hint's last "S") instead of at
                // the box's outer edge
                textAlign: 'center',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PresetsPanel);
