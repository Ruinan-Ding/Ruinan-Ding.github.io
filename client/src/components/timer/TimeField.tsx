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
  // Whether `value` is the ticking remaining time rather than a setting
  // sitting still. Only the chevrons' disabled state cares.
  live: boolean;
  // Label above the digit box rather than beside it: a third of the width
  // at roughly 1.4x the height. Driven from Timer so all three switch
  // together.
  stacked: boolean;
  onRequestChange: (value: number) => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
// Lower floors than the app's other controls: the stacked form is the
// taller one, and this panel competes with the word counter for the same
// leftover height, so it needs room to shrink before it gets tucked away.
const chevronButtonStyle = { padding: shrinkClamp(0.15, 0.4, 0.45, 0.375) };
const FIELD_FONT_SIZE = shrinkClamp(0.75, 1.5, 1.7, 1.5);
const CHEVRON_ICON_SIZE = { width: shrinkClamp(0.7, 1.2, 1.35, 1.25), height: shrinkClamp(0.7, 1.2, 1.35, 1.25) };

// Two-digit time input. Digits enter from the right, calculator-style, and
// nothing is clamped or applied until the edit commits on blur or Enter.
//
// Unlike the preset input, this one doesn't need an onFocus pinCaret:
// focusing always changes the displayed value (blank to placeholder), and
// useDigitEntry's value-change effect re-pins the caret for us.
function TimeField({ label, placeholder, value, max, live, stacked, onRequestChange }: TimeFieldProps) {
  const clamp = (next: number) => Math.max(0, Math.min(max, next));
  const step = (base: number, direction: number) => clamp(base + direction);

  // null = not editing; '' = editing but untouched (placeholder shown)
  const [digits, setDigits] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = digits !== null;

  // While editing and empty the value matches the placeholder's character
  // count, drawn invisible, so the caret lands after it rather than in the
  // middle of an empty box.
  const inputValue = isEditing ? (digits === '' ? placeholder : digits) : pad(value);

  const appendDigits = (text: string) => {
    const typed = text.replace(/\D/g, '');
    // Blocks further digits at 2 rather than shifting the window along.
    if (typed) setDigits((prev) => ((prev ?? '') + typed).slice(0, 2));
  };

  const { handleKeyDown, handlePaste, handleSelect } = useDigitEntry(inputRef, inputValue, {
    append: appendDigits,
    remove: () => setDigits((prev) => (prev ?? '').slice(0, -1)),
    // Committing is blurring; handleBlur applies the digits.
    onCommit: () => inputRef.current?.blur(),
    onCancel: () => {
      cancelledRef.current = true;
      inputRef.current?.blur();
    },
    // Arrows step the pending entry, or the committed value if nothing has
    // been typed yet. Either way it commits on blur/Enter like typing.
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
    // Inline: label beside the digit box, at a fixed 9ch ("SECONDS:", the
    // longest) so the boxes line up across all three fields. Stacked:
    // label above, about a third of the width at ~1.4x the height. The
    // 9ch goes with it, having nothing to align against on its own line.
    //
    // Switched by prop rather than flex-wrap so all three change together.
    // The inline form keeps flex-wrap as a fallback: inside the 3-across
    // grid (.time-fields-box in index.css) the tracks are equal 1fr, so
    // when the row is too narrow they hit min-content and wrap in step.
    // min-w-min because index.css's blanket `.flex { min-width: 0 }` would
    // otherwise crush a field past min-content instead of wrapping it.
    <div
      className={`flex min-w-min ${stacked ? 'flex-col items-start' : 'flex-wrap items-center'}`}
      style={{ gap: shrinkClamp(0.25, 0.5, 0.55, 0.5) }}
    >
      <label
        className="text-white font-bold whitespace-nowrap flex-shrink-0"
        style={{ fontSize: shrinkClamp(0.6, 1.3, 1.5, 1.1), fontFamily: "'IBM Plex Mono', monospace", width: stacked ? undefined : '9ch' }}
      >
        {label}:
      </label>
      <div className="flex items-center flex-shrink-0" style={{ gap: shrinkClamp(0.25, 0.5, 0.55, 0.5) }}>
        <div className="relative flex-shrink-0" style={{ width: 'clamp(2.5rem, 6vw, 4rem)' }}>
          {digits === '' && (
            <div
              className="absolute inset-0 flex items-center justify-center font-bold pointer-events-none zoom-safe-text"
              // Mixed off --app-ink, not a literal white: on the light
              // theme's near-white surface the hint was invisible.
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: FIELD_FONT_SIZE, color: 'color-mix(in oklab, var(--app-ink) 40%, transparent)' }}
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
            className="bg-black border-4 border-white font-bold text-center outline-none w-full zoom-safe-text"
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: FIELD_FONT_SIZE,
              padding: shrinkClamp(0.15, 0.4, 0.45, 0.375),
              color: digits === '' ? 'transparent' : 'var(--app-ink)',
              caretColor: 'var(--app-ink)',
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => onRequestChange(step(value, 1))}
            // Not disabled at the ends of the range while `value` is a
            // live readout: the seconds field passes 0 and 59 once a
            // minute, and greying an arrow out for a second each time —
            // on a field that is otherwise always adjustable — turns a
            // reach for it into a dead click. step() clamps anyway, so the
            // press at the end is a no-op rather than a wrap.
            disabled={!live && value >= max}
            aria-label={`Increase ${label.toLowerCase()}`}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronUp style={CHEVRON_ICON_SIZE} />
          </button>
          <button
            onClick={() => onRequestChange(step(value, -1))}
            disabled={!live && value <= 0}
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
