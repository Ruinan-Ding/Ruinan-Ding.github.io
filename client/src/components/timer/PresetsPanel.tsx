import { memo, useRef, useState } from 'react';
import { LIST_ROW_BUTTON_STYLE, MAX_PRESETS } from './constants';
import { formatEntryLabel, parsePresetDigits, presetDigits } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimeParts, TimerEntry } from './types';
import { useDigitEntry } from './useDigitEntry';
import { useEntryFlash } from './useDomFlash';

// matches the font size of the preset list buttons below (LIST_ROW_
// BUTTON_STYLE — reverted back to these same original coefficients for
// the same reason: a wider-elastic-range version reached its own max so
// much later that the actual typed digits read as tiny next to the
// sidebar's now-wider box at ordinary window sizes). This sidebar sits
// in a fixed, overflow-hidden column, so its own controls need to
// shrink first on a short window just like the main column's do —
// nothing here scrolls if it overflows.
const PRESET_INPUT_FONT_SIZE = shrinkClamp(0.75, 1.5, 1.6, 0.875);
// shared by the +/- preset buttons
const PRESET_BUTTON_STYLE = { padding: shrinkClamp(0.25, 0.33, 0.37, 0.375), fontSize: shrinkClamp(0.7, 0.8, 0.87, 0.875), minWidth: shrinkClamp(1.5, 2, 2, 2) };

function PresetRow({ preset, onRemove, onSelect, inserted, loaded }: {
  preset: TimerEntry;
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useEntryFlash(preset.id, inserted, loaded);

  return (
    <div className="flex items-center" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
      <button
        onClick={() => onRemove(preset.id)}
        aria-label={`Remove preset ${formatEntryLabel(preset)}`}
        className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
        style={PRESET_BUTTON_STYLE}
      >
        −
      </button>
      <button
        ref={buttonRef}
        onClick={() => onSelect(preset)}
        className="flex-1 border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 whitespace-nowrap"
        style={LIST_ROW_BUTTON_STYLE}
      >
        {formatEntryLabel(preset)}
      </button>
    </div>
  );
}

interface PresetsPanelProps {
  presets: TimerEntry[];
  onAdd: (parts: TimeParts) => void;
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}

// Digit entry is keydown-driven rather than derived from onChange, since
// onChange alone can't tell a partial entry from a complete one. Track the
// raw typed digits instead, and render them unpadded (same style used
// everywhere else in the app: "1:30", not "00:01:30").
function PresetsPanel({ presets, onAdd, onRemove, onSelect, inserted, loaded }: PresetsPanelProps) {
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
      {/* margin/padding/gap below all sized on shrinkClamp rather than
          fixed mb-4/pb-2/gap-2/mt-2 — those never moved at all regardless
          of window size, same rigidity as the font sizes above before
          their own fix. */}
      <h2
        className="text-white font-bold border-b-2 border-white"
        style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.125), marginBottom: shrinkClamp(0.5, 0.9, 1, 1), paddingBottom: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        PRESETS
      </h2>
      <div className="flex flex-col" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
        {presets.map((preset) => (
          <PresetRow key={preset.id} preset={preset} onRemove={onRemove} onSelect={onSelect} inserted={inserted} loaded={loaded} />
        ))}
        <div className="flex items-center" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5), marginTop: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
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
                padding: shrinkClamp(0.375, 0.65, 0.72, 0.5),
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
