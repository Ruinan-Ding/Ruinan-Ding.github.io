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
  // label above the digit box/arrows instead of beside them — a third of
  // the width, at roughly 1.4x the height. Driven from Timer.tsx so all
  // three fields switch together (see its own comment there).
  stacked: boolean;
  onRequestChange: (value: number) => void;
}

const chevronButtonClass =
  'border-2 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed';
// This panel sits beside the digits column in the same row, so it
// shrinks first on a short window like every other non-digit control.
// Floors dropped further than usual — in its stacked form (see below)
// each field's label sits above its digit box/arrows, which makes the
// panel taller, and it competes with the word counter for the same
// leftover vertical space. Lower floors here give it real room to
// shrink before that happens instead of collapsing entirely.
const chevronButtonStyle = { padding: shrinkClamp(0.15, 0.4, 0.45, 0.375) };
const FIELD_FONT_SIZE = shrinkClamp(0.75, 1.5, 1.7, 1.5);
const CHEVRON_ICON_SIZE = { width: shrinkClamp(0.7, 1.2, 1.35, 1.25), height: shrinkClamp(0.7, 1.2, 1.35, 1.25) };

// Two-digit time input; digits enter from the right, calculator-style, and
// nothing is clamped or applied until the edit commits (blur or Enter).
// Caret behavior reaches the same end state as the custom preset input —
// text stays centered, and the caret always sits at the end of the typed
// digits (or the placeholder's length while empty) — but through a
// different path: focus here always changes the displayed value (blank ->
// placeholder), which useDigitEntry's own value-change effect already
// re-pins on its own, so this field doesn't need the explicit onFocus
// pinCaret call the preset input uses (whose value doesn't change on focus).
function TimeField({ label, placeholder, value, max, stacked, onRequestChange }: TimeFieldProps) {
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
    // Two forms, switched explicitly rather than by flex-wrap. Wrapping
    // read well but never actually fired: every control in the timer row
    // is clamped on min(vw, vh), so the digits column and this panel
    // shrink together as the window narrows and the row doesn't truly
    // run out of width until those clamps hit their floors — long after
    // the layout has already dropped below the breakpoint that used to
    // hide this panel outright. An explicit prop also switches all three
    // fields at once, where wrapping could leave them mid-transition at
    // different widths.
    // Inline (the wide form): label beside the digit box/arrows, at a
    // fixed 9ch — "SECONDS:", the longest of the three — so the boxes
    // line up across the three fields despite their differing label
    // lengths. Shortest form there is, so it's also what a vertically
    // squeezed window falls back to.
    // Stacked (the narrow form): label above, which is about a third of
    // the width at ~1.4x the height. The 9ch goes with it — on its own
    // line there's nothing to align against and it would just pad the
    // panel back out.
    // The inline form keeps flex-wrap anyway, as a fallback rather than
    // as the mechanism: inside the 3-across grid (see .time-fields-box
    // in index.css) the three tracks are equal 1fr, so on a row too
    // narrow for three inline fields they reach min-content and all
    // three wrap in step — which is what makes across fit at 1024,
    // where the inline strip would need ~526px against ~349 available.
    // The objection to wrapping as the primary mechanism stands: it's
    // the equal grid tracks that make this switch in unison rather than
    // one field at a time. min-w-min because index.css's blanket
    // `.flex { min-width: 0 }` would otherwise let a track crush the
    // field past its own min-content instead of wrapping it.
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
              padding: shrinkClamp(0.15, 0.4, 0.45, 0.375),
              color: digits === '' ? 'transparent' : 'var(--app-ink)',
              caretColor: 'var(--app-ink)',
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
