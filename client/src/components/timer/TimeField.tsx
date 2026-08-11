import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useRef, useState } from 'react';
import { pad } from './format';
import { shrinkClamp } from './responsive';
import { useDigitEntry } from './useDigitEntry';

interface TimeFieldProps {
  label: string;
  placeholder: string;
  // The magnitude of this unit. Never negative: the sign belongs to the
  // whole time, and `negative` says whether this box is the one showing it.
  value: number;
  negative: boolean;
  // Seconds this unit is worth, so a chevron can move the whole time by one
  // of them rather than this box by one of itself. That difference is the
  // point past zero: at -01:30, stepping the seconds box up has to reach
  // -01:29, and adding 1 to the magnitude would reach -01:31.
  unitSeconds: number;
  // Label above the digit box rather than beside it: a third of the width
  // at roughly 1.4x the height. Driven from Timer so all three switch
  // together.
  stacked: boolean;
  // A typed commit: this unit's new magnitude, unclamped. 61 arrives as 61
  // and the owner carries it.
  onRequestChange: (value: number) => void;
  // A chevron: move the whole time by this many seconds, sign and all.
  onStepTotal: (deltaSeconds: number) => void;
  // "-" pressed: flip the sign of the whole time.
  onToggleSign: () => void;
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
function TimeField({ label, placeholder, value, negative, unitSeconds, stacked, onRequestChange, onStepTotal, onToggleSign }: TimeFieldProps) {
  // Only the pending digit entry is clamped, and only to what two digits
  // can say. A committed value is left exactly as typed so the owner can
  // carry it: clamping 61 to 59 here would silently eat the minute.
  const clampTyped = (next: number) => Math.max(0, Math.min(99, next));

  // null = not editing; '' = editing but untouched (placeholder shown)
  const [digits, setDigits] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = digits !== null;

  // While editing and empty the value matches the placeholder's character
  // count, drawn invisible, so the caret lands after it rather than in the
  // middle of an empty box.
  // The sign rides in front of whatever the box is showing, typed or not:
  // it belongs to the time rather than to the digits, so backspacing
  // through the number never has to delete it and typing never has to
  // preserve it.
  const shown = isEditing ? (digits === '' ? placeholder : digits) : pad(value);
  const inputValue = negative ? `-${shown}` : shown;

  const { handleChange, handleKeyDown } = useDigitEntry(inputRef, 2, {
    setValue: setDigits,
    onToggleSign,
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
        const base = prev === null || prev === '' ? value : clampTyped(parseInt(prev, 10));
        return pad(clampTyped(base + direction));
      });
    },
  });

  const handleBlur = () => {
    const wasCancelled = cancelledRef.current;
    cancelledRef.current = false;
    const finished = digits;
    setDigits(null);
    if (wasCancelled || finished === null || finished === '') return;
    const next = parseInt(finished, 10);
    if (Number.isFinite(next) && next !== value) onRequestChange(next);
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
        {/* Three glyphs, not two: any of these boxes can be the one wearing
            the minus, and a box that only fits its own digits clips it. */}
        <div className="relative flex-shrink-0" style={{ width: 'clamp(3.1rem, 7.4vw, 5rem)' }}>
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
            // Hands the current value over to be edited rather than
            // blanking the box: with a free caret there is something worth
            // keeping, and clearing it forced a full retype to change one
            // digit.
            onFocus={() => setDigits(pad(value))}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onChange={handleChange}
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
            onClick={() => onStepTotal(unitSeconds)}
            // Never disabled. These move the whole time now, so there is no
            // end to run into: the seconds box at 59 steps up into the next
            // minute, and at 00:00:00 steps down into -00:00:01. The old
            // per-unit limits also flickered once a minute against a live
            // readout, greying an arrow out mid-reach.
            disabled={false}
            aria-label={`Increase ${label.toLowerCase()}`}
            className={chevronButtonClass}
            style={chevronButtonStyle}
          >
            <ChevronUp style={CHEVRON_ICON_SIZE} />
          </button>
          <button
            onClick={() => onStepTotal(-unitSeconds)}
            disabled={false}
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
