import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { pad } from './format';

interface TimeFieldProps {
  label: string;
  placeholder: string;
  value: number;
  max: number;
  onRequestChange: (value: number) => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
const chevronButtonStyle = { padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' };
const FIELD_FONT_SIZE = 'clamp(1rem, 1.8vw, 1.5rem)';

// Two-digit time input; digits enter from the right, calculator-style, and
// nothing is clamped or applied until the edit commits (blur or Enter).
// Caret behavior mirrors the custom preset input: text stays centered, and
// the caret always sits at the end of the typed digits (or the
// placeholder's length while empty), never drifting to the box's left edge.
function TimeField({ label, placeholder, value, max, onRequestChange }: TimeFieldProps) {
  const clamp = (next: number) => Math.max(0, Math.min(max, next));

  // null = not editing; '' = editing but untouched (placeholder shown)
  const [digits, setDigits] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = digits !== null;

  // while editing and empty, the real value matches the placeholder's
  // character count (rendered invisible) purely so the caret lands right
  // after it instead of in the middle of the empty box
  const inputValue = isEditing ? (digits === '' ? placeholder : digits) : pad(value);

  // digits enter from the right, so the caret always belongs at the end;
  // onSelect catches every way it could move (click, drag, arrow keys)
  const pinCaret = (el: HTMLInputElement) => {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  };

  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [inputValue]);

  const appendDigits = (text: string) => {
    const typed = text.replace(/\D/g, '');
    // blocks further digits once at 2, rather than shifting the window
    if (typed) setDigits((prev) => ((prev ?? '') + typed).slice(0, 2));
  };

  const handleBlur = () => {
    const wasCancelled = cancelledRef.current;
    cancelledRef.current = false;
    const finished = digits;
    setDigits(null);
    if (wasCancelled || finished === null || finished === '') return;
    const next = clamp(parseInt(finished, 10));
    if (next !== value) onRequestChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // preventDefault, or the same key press activates the cancel button
      // the confirmation dialog focuses on open, instantly dismissing it
      e.preventDefault();
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      inputRef.current?.blur();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setDigits((prev) => (prev ?? '').slice(0, -1));
    } else if (/^\d$/.test(e.key)) {
      e.preventDefault();
      appendDigits(e.key);
    } else if (e.key.length === 1) {
      e.preventDefault();
    }
  };

  return (
    <div className="flex items-center gap-1 sm:gap-2 md:gap-4 min-w-0 flex-wrap justify-between">
      <label
        className="text-white font-bold whitespace-nowrap"
        style={{ fontSize: 'clamp(0.8rem, 1.6vw, 1.1rem)', fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.2rem, 5.5vw, 3.5rem)' }}
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
            onSelect={(e) => pinCaret(e.target as HTMLInputElement)}
            onBeforeInput={(e) => {
              // soft keyboards don't always send useful keydown events
              e.preventDefault();
              const native = e.nativeEvent as InputEvent;
              const data = native.data ?? native.dataTransfer?.getData('text') ?? '';
              if (data) appendDigits(data);
            }}
            onChange={() => {}}
            className="bg-black border-4 border-white font-bold text-center outline-none w-full"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: FIELD_FONT_SIZE,
              padding: 'clamp(0.25rem, 0.5vw, 0.375rem)',
              color: digits === '' ? 'transparent' : '#ffffff',
              caretColor: '#ffffff',
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onRequestChange(clamp(value + 1))}
            disabled={value >= max}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronUp size={20} />
          </button>
          <button
            onClick={() => onRequestChange(clamp(value - 1))}
            disabled={value <= 0}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronDown size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(TimeField);
