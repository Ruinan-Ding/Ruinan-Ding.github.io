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

// Two-digit time input; digits enter from the right, calculator-style, and
// nothing is clamped or applied until the edit commits (blur or Enter)
function TimeField({ label, placeholder, value, max, onRequestChange }: TimeFieldProps) {
  const clamp = (next: number) => Math.max(0, Math.min(max, next));

  // null = not editing; '' = editing but untouched (placeholder visible)
  const [draft, setDraft] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // park the caret at the left edge; typing is intercepted below anyway
  useEffect(() => {
    if (draft !== null) inputRef.current?.setSelectionRange(0, 0);
  }, [draft]);

  const appendDigits = (text: string) => {
    const digits = text.replace(/\D/g, '');
    if (digits) setDraft((prev) => ((prev ?? '') + digits).slice(-2));
  };

  const handleBlur = () => {
    const wasCancelled = cancelledRef.current;
    cancelledRef.current = false;
    const finished = draft;
    setDraft(null);
    if (wasCancelled || finished === null || finished === '') return;
    const next = clamp(parseInt(finished, 10));
    if (next !== value) onRequestChange(next);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      cancelledRef.current = true;
      inputRef.current?.blur();
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault();
      setDraft((prev) => (prev ?? '').slice(0, -1));
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
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft ?? pad(value)}
          placeholder={placeholder}
          onFocus={() => setDraft('')}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onBeforeInput={(e) => {
            // soft keyboards don't always send useful keydown events
            e.preventDefault();
            const native = e.nativeEvent as InputEvent;
            const data = native.data ?? native.dataTransfer?.getData('text') ?? '';
            if (data) appendDigits(data);
          }}
          onChange={() => {}}
          className="bg-black border-4 border-white text-white font-bold text-center outline-none flex-shrink-0 placeholder:text-white placeholder:opacity-40"
          style={{ fontFamily: "'IBM Plex Mono', monospace", width: 'clamp(2.5rem, 6vw, 4rem)', fontSize: 'clamp(1rem, 1.8vw, 1.5rem)', padding: 'clamp(0.25rem, 0.5vw, 0.375rem)' }}
        />
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
