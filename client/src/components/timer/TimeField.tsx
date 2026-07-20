import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { pad } from './format';
import { shrinkClamp } from './responsive';
import { useDigitEntry } from './useDigitEntry';

interface TimeFieldProps {
  label: string;
  placeholder: string;
  value: number;
  max: number;
  onRequestChange: (value: number) => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
// This panel sits beside the digits column in the same row, so it
// shrinks first on a short window like every other non-digit control
const chevronButtonStyle = { padding: shrinkClamp(0.25, 0.5, 0.55, 0.375) };
const FIELD_FONT_SIZE = shrinkClamp(1, 1.8, 2, 1.5);
const CHEVRON_ICON_SIZE = { width: shrinkClamp(0.9, 1.4, 1.5, 1.25), height: shrinkClamp(0.9, 1.4, 1.5, 1.25) };

// Two-digit time input; digits enter from the right, calculator-style, and
// nothing is clamped or applied until the edit commits (blur or Enter).
// Caret behavior mirrors the custom preset input: text stays centered, and
// the caret always sits at the end of the typed digits (or the
// placeholder's length while empty), never drifting to the box's left edge.
function TimeField({ label, placeholder, value, max, onRequestChange }: TimeFieldProps) {
  const clamp = (next: number) => Math.max(0, Math.min(max, next));
  // shared by the chevrons and arrow-key stepping — the only difference is
  // which base value they step from and how the result is applied
  const step = (base: number, direction: number) => clamp(base + direction);

  // null = not editing; '' = editing but untouched (placeholder shown)
  const [digits, setDigits] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = digits !== null;

  // while editing and empty, the real value matches the placeholder's
  // character count (rendered invisible) purely so the caret lands right
  // after it instead of in the middle of the empty box
  const inputValue = isEditing ? (digits === '' ? placeholder : digits) : pad(value);

  const appendDigits = (text: string) => {
    const typed = text.replace(/\D/g, '');
    // blocks further digits once at 2, rather than shifting the window
    if (typed) setDigits((prev) => ((prev ?? '') + typed).slice(0, 2));
  };

  const { handleKeyDown, handlePaste, handleSelect } = useDigitEntry(inputRef, inputValue, {
    append: appendDigits,
    remove: () => setDigits((prev) => (prev ?? '').slice(0, -1)),
    // committing is just blurring — handleBlur applies the digits
    onCommit: () => inputRef.current?.blur(),
    onCancel: () => {
      cancelledRef.current = true;
      inputRef.current?.blur();
    },
    // arrows step the pending entry — or the committed value, when nothing
    // has been typed yet; the result commits on blur/Enter like typing
    onStep: (direction) => {
      setDigits((prev) => {
        const base = prev === null || prev === '' ? value : clamp(parseInt(prev, 10));
        return pad(step(base, direction));
      });
    },
  });

  const handleBlur = () => {
    const wasCancelled = cancelledRef.current;
    cancelledRef.current = false;
    const finished = digits;
    setDigits(null);
    if (wasCancelled || finished === null || finished === '') return;
    const next = clamp(parseInt(finished, 10));
    if (next !== value) onRequestChange(next);
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
      <label
        className="text-white font-bold whitespace-nowrap"
        style={{ fontSize: shrinkClamp(0.8, 1.6, 1.8, 1.1), fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}
      >
        {label}:
      </label>
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <div className="relative flex-shrink-0" style={{ width: 'clamp(2.5rem, 6vw, 4rem)' }}>
          {digits === '' && (
            <div
              className="absolute inset-0 flex items-center justify-center font-bold pointer-events-none"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: FIELD_FONT_SIZE, color: 'rgba(255, 255, 255, 0.4)' }}
            >
              {placeholder}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder={placeholder}
            aria-label={label}
            value={inputValue}
            onFocus={() => setDigits('')}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onSelect={handleSelect}
            onChange={() => {}}
            className="bg-black border-4 border-white font-bold text-center outline-none w-full"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: FIELD_FONT_SIZE,
              padding: shrinkClamp(0.25, 0.5, 0.55, 0.375),
              color: digits === '' ? 'transparent' : '#ffffff',
              caretColor: '#ffffff',
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onRequestChange(step(value, 1))}
            disabled={value >= max}
            aria-label={`Increase ${label.toLowerCase()}`}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronUp style={CHEVRON_ICON_SIZE} />
          </button>
          <button
            onClick={() => onRequestChange(step(value, -1))}
            disabled={value <= 0}
            aria-label={`Decrease ${label.toLowerCase()}`}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronDown style={CHEVRON_ICON_SIZE} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(TimeField);
