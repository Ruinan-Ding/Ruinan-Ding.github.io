import { memo, useEffect, useRef, useState } from 'react';
import { MAX_PRESETS } from './constants';
import { formatEntryLabel, parsePresetDigits, presetDigits } from './format';
import type { TimeParts, TimerEntry } from './types';

// Sized so the 8-character HH:MM:SS display spans the input's inner width
// (100cqw minus border/padding, divided across the monospace glyphs)
const PRESET_INPUT_FONT_SIZE = 'clamp(0.75rem, calc((100cqw - 1.6rem) / 5.3), 2.5rem)';

interface PresetsPanelProps {
  presets: TimerEntry[];
  onAdd: (parts: TimeParts) => void;
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
}

// Digit entry is keydown-driven rather than derived from onChange, since
// onChange alone can't tell a partial entry from a complete one. Track the
// raw typed digits instead, and render them unpadded (same style used
// everywhere else in the app: "1:30", not "00:01:30").
function PresetsPanel({ presets, onAdd, onRemove, onSelect }: PresetsPanelProps) {
  const [digits, setDigits] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atCapacity = presets.length >= MAX_PRESETS;

  const displayValue = digits === '' ? '' : formatEntryLabel(parsePresetDigits(digits));

  // keep the caret parked at the far right; digits enter from there
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [displayValue]);

  const handleAdd = () => {
    if (atCapacity || digits === '') return;
    onAdd(parsePresetDigits(digits));
    setDigits('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAdd();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      setDigits((prev) => prev.slice(0, -1));
      return;
    }
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      setDigits((prev) => (prev.length >= 6 ? prev : prev + e.key));
    } else if (e.key.length === 1) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = presetDigits(e.clipboardData.getData('text'));
    setDigits((prev) => (prev + pasted).slice(0, 6));
  };

  const handleBlur = () => {
    if (digits === '') return;
    const { hours, minutes, seconds } = parsePresetDigits(digits);
    setDigits(`${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`);
  };

  // Digits enter from the right, so the caret always belongs after the last
  // one; onSelect catches every way it could move (click, drag, arrow keys)
  const pinCaret = (el: HTMLInputElement) => {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  };

  return (
    <div>
      <h2 className="text-white font-bold mb-4 border-b-2 border-white pb-2" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.125rem)' }}>PRESETS</h2>
      <div className="flex flex-col gap-2">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-2">
            <button
              onClick={() => onRemove(preset.id)}
              className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
              style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)', fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)', minWidth: 'clamp(1.5rem, 3vw, 2rem)' }}
            >
              −
            </button>
            <button
              onClick={() => onSelect(preset)}
              className="flex-1 border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0"
              style={{ fontFamily: "'IBM Plex Mono', monospace", padding: 'clamp(0.375rem, 1vw, 0.5rem)', fontSize: 'clamp(0.75rem, 1.5vw, 0.875rem)' }}
            >
              {formatEntryLabel(preset)}
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleAdd}
            disabled={atCapacity}
            title={atCapacity ? `Preset limit reached (${MAX_PRESETS})` : 'Add preset'}
            className="border-2 border-green-500 text-green-500 font-bold hover:bg-green-500 hover:text-white transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: 'clamp(0.25rem, 0.5vw, 0.375rem)', fontSize: 'clamp(0.7rem, 1.2vw, 0.875rem)', minWidth: 'clamp(1.5rem, 3vw, 2rem)' }}
          >
            +
          </button>
          <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, containerType: 'inline-size' }}>
            <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: PRESET_INPUT_FONT_SIZE, color: '#888888', pointerEvents: 'none', zIndex: 0, fontWeight: 'bold', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
              {displayValue === '' ? 'HH:MM:SS' : ''}
            </div>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              value={displayValue}
              onChange={() => {}}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onBlur={handleBlur}
              onFocus={(e) => pinCaret(e.target)}
              onSelect={(e) => pinCaret(e.target as HTMLInputElement)}
              className="border-4 border-white font-bold transition-colors duration-0 w-full preset-input"
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                padding: 'clamp(0.375rem, 1vw, 0.5rem)',
                fontSize: PRESET_INPUT_FONT_SIZE,
                color: '#ffffff',
                backgroundColor: 'transparent',
                position: 'relative',
                zIndex: 1,
                letterSpacing: '0.05em',
                minWidth: 0,
                // right-aligned so the caret sits at the right edge even
                // while the field is empty
                textAlign: 'right',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(PresetsPanel);
