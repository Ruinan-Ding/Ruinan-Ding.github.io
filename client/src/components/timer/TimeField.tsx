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
  // Seconds this unit is worth, so a chevron or an arrow key can move the
  // whole time by one of them rather than this box by one of itself. That
  // difference is the point past zero: at -01:30, stepping the seconds box
  // up has to reach -01:29, and adding 1 to the magnitude would reach
  // -01:31.
  unitSeconds: number;
  // Label above the digit box rather than beside it: a third of the width
  // at roughly 1.4x the height. Driven from Timer so all three switch
  // together.
  stacked: boolean;
  // A typed commit: this unit's new magnitude, unclamped. 61 arrives as 61
  // and the owner carries it.
  onRequestChange: (value: number) => void;
  // A chevron or an arrow key: move the whole time by this many seconds,
  // sign and all.
  onStepTotal: (deltaSeconds: number) => void;
  // "-" pressed: flip the sign of the whole time.
  onToggleSign: () => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
// Lower floors than the app's other controls: the stacked form is the
// taller one, and this panel competes with the word counter for the same
// leftover height, so it needs room to shrink before it gets tucked away.
const chevronButtonStyle = { padding: shrinkClamp(0.1, 0.4, 0.45, 0.375) };
// Lower floors than this panel used to carry, so it compresses further
// before the auto-tuck gives up and hides it, the way the sidebar's rows
// keep shrinking rather than disappearing. Every floor here is what stops
// the box getting smaller, and each one it hits early is height the panel
// can't give back to the row it shares.
const FIELD_FONT_SIZE = shrinkClamp(0.6, 1.5, 1.7, 1.5);
const CHEVRON_ICON_SIZE = { width: shrinkClamp(0.55, 1.2, 1.35, 1.25), height: shrinkClamp(0.55, 1.2, 1.35, 1.25) };

// Two-digit time input. A typed digit lands where the caret is and takes
// its room off the padding, and nothing is clamped or applied until the
// edit commits on blur or Enter.
//
// The caret is useDigitEntry's job: the box reformats as it's typed into,
// so the browser would otherwise park it at the end after every keystroke.
function TimeField({ label, placeholder, value, negative, unitSeconds, stacked, onRequestChange, onStepTotal, onToggleSign }: TimeFieldProps) {
  // null = not editing; '' = editing but untouched (placeholder shown)
  const [digits, setDigits] = useState<string | null>(null);
  const cancelledRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = digits !== null;

  // Editing and empty, the value matches the placeholder's character count
  // and is drawn invisible, so the caret lands after it rather than in the
  // middle of an empty box. Padded either way, so a half-typed entry reads
  // as the number it is: one digit in a two-digit box is "07", where the
  // leading zero is padding the next keystroke replaces.
  //
  // The sign rides in front of whatever is showing, typed or not. It
  // belongs to the time rather than the digits, so backspacing never has
  // to delete it and typing never has to preserve it.
  const shown = isEditing ? (digits === '' ? placeholder : pad(digits)) : pad(value);
  const inputValue = negative ? `-${shown}` : shown;

  const { handleChange, handleKeyDown } = useDigitEntry(inputRef, 2, inputValue, {
    setValue: setDigits,
    // The sign is a change to the whole time and applies at once, so a
    // half-typed magnitude behind it is dropped rather than left to commit
    // later: the confirmation dialog takes focus as it opens, and that
    // blur would apply the digits behind the question still asking about
    // the change. Back to untouched, showing "-SS" for what it now is.
    onToggleSign: () => {
      setDigits('');
      onToggleSign();
    },
    // Committing is blurring; handleBlur applies the digits.
    onCommit: () => inputRef.current?.blur(),
    onCancel: () => {
      cancelledRef.current = true;
      inputRef.current?.blur();
    },
    // The keyboard half of the chevrons beside the box: same target, the
    // whole signed time, and same moment, on the press rather than at the
    // commit a typed entry waits for. Stepping this box's own magnitude
    // instead puts the two at odds wherever the time is negative, with the
    // arrow reaching -01:31 from -01:30 while the chevron an inch away
    // reaches -01:29.
    //
    // Anything half-typed underneath is dropped, and the box goes back to
    // showing the live value so the number can be watched moving. `fresh`
    // keeps typing working after that: with a committed value on screen
    // the next digit starts a new entry over it rather than being refused
    // by a box that already holds two.
    onStep: (direction) => {
      setDigits(null);
      onStepTotal(direction * unitSeconds);
    },
    fresh: !isEditing,
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
      style={{ gap: shrinkClamp(0.15, 0.5, 0.55, 0.5) }}
    >
      <label
        className="text-white font-bold whitespace-nowrap flex-shrink-0"
        style={{ fontSize: shrinkClamp(0.5, 1.3, 1.5, 1.1), fontFamily: "'IBM Plex Mono', monospace", width: stacked ? undefined : '9ch' }}
      >
        {label}:
      </label>
      <div className="flex items-center flex-shrink-0" style={{ gap: shrinkClamp(0.25, 0.5, 0.55, 0.5) }}>
        {/* Three glyphs, not two: any of these boxes can be the one wearing
            the minus, and a box that only fits its own digits clips it. */}
        <div className="relative flex-shrink-0" style={{ width: 'clamp(2.4rem, min(7.4vw, 8.2dvh), 5rem)' }}>
          {digits === '' && (
            <div
              className="absolute inset-0 flex items-center justify-center font-bold pointer-events-none zoom-safe-text"
              // Mixed off --app-ink, not a literal white: on the light
              // theme's near-white surface the hint was invisible.
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: FIELD_FONT_SIZE, color: 'color-mix(in oklab, var(--app-ink) 40%, transparent)' }}
            >
              {/* The sign too, or focusing a negative box hid the minus:
                  the input's own text is drawn transparent while nothing
                  has been typed, and this is what stands in for it. */}
              {negative ? `-${placeholder}` : placeholder}
            </div>
          )}
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            placeholder={placeholder}
            aria-label={label}
            value={inputValue}
            // Starts empty, like the preset box: the first digit typed is
            // the first digit of the new value, and the zeros in front of
            // it are padding it overrides. Seeding it with the current
            // value meant typing appended to it instead.
            onFocus={() => setDigits('')}
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
