import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { countColor, LIST_ROW_BUTTON_STYLE, LIST_ROW_REMOVE_BUTTON_STYLE, MAX_PRESETS, PRESETS_WARN, SIDEBAR_COUNT_FONT_SIZE, SIDEBAR_HEADING_FONT_SIZE } from './constants';
import { formatEntryLabel, isPresetOutOfRange, pad, parsePresetDigits, presetDigits, presetDigitsFromParts, rawPresetDigits } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimeParts, TimerEntry } from './types';
import { useDigitEntry } from './useDigitEntry';
import { useEntryFlash, useFizzRemove } from './useDomFlash';
import { FLASH_DURATION_MS } from './useFlashOnToken';

type CorrectedUnits = { hours: boolean; minutes: boolean; seconds: boolean };

// Split the way formatEntryLabel builds it, so each piece can be coloured
// on its own: hours only when there are any, minutes unpadded when it
// leads.
const labelSegments = ({ hours, minutes, seconds }: TimeParts): Array<{ text: string; unit: keyof CorrectedUnits }> =>
  hours > 0
    ? [
        { text: String(hours), unit: 'hours' },
        { text: pad(minutes), unit: 'minutes' },
        { text: pad(seconds), unit: 'seconds' },
      ]
    : [
        { text: String(minutes), unit: 'minutes' },
        { text: pad(seconds), unit: 'seconds' },
      ];

function PresetRow({ preset, onRequestRemove, onRemove, isRemoving, onSelect, inserted, loaded, duplicate }: {
  preset: TimerEntry;
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
  duplicate: FlashTarget;
}) {
  const buttonRef = useEntryFlash(preset.id, inserted, loaded, duplicate);
  const fizz = useFizzRemove(useCallback(() => onRemove(preset.id), [onRemove, preset.id]));

  // Unlike a history row, this doesn't start its own fizz on click.
  // Deleting a preset asks first, so the animation is triggered from above
  // once there's an answer.
  const { start } = fizz;
  useEffect(() => {
    if (isRemoving) start();
  }, [isRemoving, start]);

  return (
    // items-stretch so the − takes its height from the box beside it
    // rather than its own smaller font. flex-shrink-0 because the sidebar
    // scrolls: without it a full list squashes every row flat instead of
    // overflowing into that scroll.
    <div className="flex items-stretch flex-shrink-0" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
      <button
        onClick={() => onRequestRemove(preset.id)}
        disabled={fizz.isRemoving}
        aria-label={`Remove preset ${formatEntryLabel(preset)}`}
        className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors"
        style={LIST_ROW_REMOVE_BUTTON_STYLE}
      >
        −
      </button>
      {/* The fizz plays on the label box, not the − that triggered it, so
          what animates out is the thing being deleted. */}
      <button
        ref={buttonRef}
        onClick={() => onSelect(preset)}
        disabled={fizz.isRemoving}
        onAnimationEnd={fizz.onAnimationEnd}
        className={`border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 whitespace-nowrap overflow-hidden ${fizz.isRemoving ? 'animate-removeFizz' : ''}`}
        style={LIST_ROW_BUTTON_STYLE}
      >
        {formatEntryLabel(preset)}
      </button>
    </div>
  );
}

interface PresetsPanelProps {
  presets: TimerEntry[];
  // Returns whether the preset actually went in. False when that time is
  // already listed, which is answered by flashing the existing row rather
  // than adding a second copy.
  onAdd: (parts: TimeParts) => boolean;
  // asks to remove; onRemove is the other half, called once the row has
  // finished animating out (see PresetRow)
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  // The preset whose removal has been confirmed and should now be playing
  // its fizz; null the rest of the time.
  removingId: string | null;
  // Asks whether to correct an out-of-range entry. The answer comes back
  // as `correction`, which is applied and then acknowledged.
  onRequestCorrect: (digits: string, add: boolean) => void;
  // Empties the whole list, always asking first, unlike history's Clear.
  onClear: () => void;
  correction: { digits: string; add: boolean } | null;
  onCorrectionApplied: () => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
  // The row whose time an add was refused for, so it can flash red.
  duplicate: FlashTarget;
}

// Digit entry is keydown-driven rather than derived from onChange, which
// can't tell a partial entry from a complete one. The raw typed digits are
// tracked instead and rendered unpadded, "1:30" rather than "00:01:30".
function PresetsPanel({ presets, onAdd, onRequestRemove, onRemove, removingId, onRequestCorrect, onClear, correction, onCorrectionApplied, onSelect, inserted, loaded, duplicate }: PresetsPanelProps) {
  const [digits, setDigits] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atCapacity = presets.length >= MAX_PRESETS;
  // Once, not once per style property: the colour and the opacity beside it
  // are the same decision and have to stay the same answer.
  const warnColor = countColor(presets.length, PRESETS_WARN, MAX_PRESETS);

  // Shows exactly what was typed, out of range and all. Correcting happens
  // once, at commit, and only after asking.
  const displayValue = digits === '' ? '' : formatEntryLabel(rawPresetDigits(digits));
  // While empty, the real value matches the hint's character count, drawn
  // invisible, so the caret lands after the hint's last "S".
  const inputValue = digits === '' ? 'HH:MM:SS' : displayValue;

  // Three ways to finish an entry: Enter, the + button, and leaving the
  // field. Only the first two add it, but all three are a commit and so
  // all three are where an out-of-range entry gets questioned.
  const handleCommit = (add: boolean) => {
    if (digits === '') return;
    if (add && atCapacity) return;
    if (isPresetOutOfRange(digits)) {
      onRequestCorrect(digits, add);
      return;
    }
    if (add) {
      // Only clear if the time actually went in. A refused duplicate
      // leaves what was typed sitting there to edit, beside the row
      // flashing red to say why.
      if (onAdd(parsePresetDigits(digits))) setDigits('');
    } else {
      setDigits(presetDigitsFromParts(parsePresetDigits(digits)));
    }
  };

  const handleAdd = () => handleCommit(true);

  const { handleKeyDown, handlePaste, handleSelect, pinCaret } = useDigitEntry(inputRef, inputValue, {
    append: (text) => {
      const typed = presetDigits(text);
      if (typed) setDigits((prev) => (prev + typed).slice(0, 6));
    },
    remove: () => setDigits((prev) => prev.slice(0, -1)),
    onCommit: handleAdd,
  });

  const handleBlur = () => handleCommit(false);

  // Which of HH/MM/SS the correction rewrote, so only those flash.
  // Correcting 1:99 to 1:59 touches only the seconds, and lighting up the
  // untouched 1 would point at the wrong number. Only for the
  // correct-and-stay path; correcting on the way to adding leaves an empty
  // box and the new row carries its own insert flash.
  const [correctedUnits, setCorrectedUnits] = useState<CorrectedUnits | null>(null);
  const isFlashingCorrection = correctedUnits !== null;
  useEffect(() => {
    if (!isFlashingCorrection) return;
    const id = setTimeout(() => setCorrectedUnits(null), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [isFlashingCorrection, correctedUnits]);

  // A correction the dialog got a yes to, applied here because this is
  // where the typed digits live.
  useEffect(() => {
    if (!correction) return;
    if (correction.add) {
      if (onAdd(parsePresetDigits(correction.digits))) setDigits('');
    } else {
      const before = rawPresetDigits(digits);
      const after = rawPresetDigits(correction.digits);
      setDigits(correction.digits);
      setCorrectedUnits({
        hours: before.hours !== after.hours,
        minutes: before.minutes !== after.minutes,
        seconds: before.seconds !== after.seconds,
      });
    }
    onCorrectionApplied();
  }, [correction, digits, onAdd, onCorrectionApplied]);

  return (
    // flex-shrink-0: as tall as its own content, with nothing squeezing
    // it. The sidebar is the one scroll region, so a long list scrolls the
    // pair rather than shortening this box.
    <div className="flex flex-col flex-shrink-0">
      {/* Spacing on shrinkClamp rather than fixed Tailwind steps, which
          don't move at all as the window shrinks.
          Clear sits in the heading rule, and only when there's something
          to clear. */}
      <div
        // flex-wrap and a gap for the same reason as the history heading:
        // the count is nowrap and the heading is one word, so a row too
        // narrow for both plus Clear spilled them over each other rather
        // than breaking anywhere.
        className="flex flex-wrap justify-between items-center gap-x-2 gap-y-1 border-b-2 border-white flex-shrink-0"
        style={{ marginBottom: shrinkClamp(0.5, 0.9, 1, 1), paddingBottom: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        <span className="flex items-baseline gap-1.5 min-w-0">
          <h2 className="text-white font-bold" style={{ fontSize: SIDEBAR_HEADING_FONT_SIZE }}>PRESETS</h2>
          <span
            className="text-white font-bold whitespace-nowrap"
            style={{
              fontSize: SIDEBAR_COUNT_FONT_SIZE,
              color: warnColor,
              opacity: warnColor ? 1 : 0.6,
            }}
            title={presets.length >= MAX_PRESETS ? `Preset limit reached (${MAX_PRESETS})` : undefined}
          >
            {presets.length}/{MAX_PRESETS}
          </span>
        </span>
        {presets.length > 0 && (
          <button
            onClick={onClear}
            title="Delete every preset — asks first"
            className="text-white border border-white hover:bg-white hover:text-black transition-colors flex-shrink-0 ml-auto"
            style={{ fontSize: shrinkClamp(0.55, 0.8, 0.85, 0.7), padding: shrinkClamp(0.25, 0.4, 0.45, 0.375) }}
          >
            Clear
          </button>
        )}
      </div>
      {/* No scrolling of its own; the sidebar scrolls the pair. The add row
          below stays directly under the list it adds to and travels with
          it. */}
      <div
        className="flex flex-col"
        style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        {presets.map((preset) => (
          <PresetRow
            key={preset.id}
            preset={preset}
            onRequestRemove={onRequestRemove}
            onRemove={onRemove}
            isRemoving={removingId === preset.id}
            onSelect={onSelect}
            inserted={inserted}
            loaded={loaded}
            duplicate={duplicate}
          />
        ))}
      </div>
      <div className="flex-shrink-0">
        <div className="flex items-stretch" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5), marginTop: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
          <button
            onClick={handleAdd}
            // Keeps the input focused through the click, so this is one
            // commit rather than two. Otherwise the input blurs first,
            // which is itself a commit, and an out-of-range entry opens the
            // correction dialog on the way down, swallowing the click.
            onMouseDown={(e) => e.preventDefault()}
            disabled={atCapacity}
            aria-label="Add preset"
            title={atCapacity ? `Preset limit reached (${MAX_PRESETS})` : 'Add preset'}
            className="border-2 border-green-500 text-green-500 font-bold hover:bg-green-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={LIST_ROW_REMOVE_BUTTON_STYLE}
          >
            +
          </button>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            {/* Two jobs, both shown through a transparent input: the grey
                HH:MM:SS hint while empty, and the corrected value split
                into segments during a correction flash, so only the
                rewritten ones glow. An input draws one colour for its whole
                value, so per-segment colouring has to happen out here.
                No letter-spacing on either, since the two have to render
                the same 8 characters at the same width. */}
            <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: LIST_ROW_BUTTON_STYLE.fontSize, color: '#888888', pointerEvents: 'none', zIndex: 0, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
              {displayValue === '' && 'HH:MM:SS'}
              {correctedUnits && labelSegments(rawPresetDigits(digits)).map((segment, index) => (
                <span key={segment.unit}>
                  {index > 0 && <span style={{ color: 'var(--app-ink)' }}>:</span>}
                  <span
                    className={correctedUnits[segment.unit] ? 'animate-correctFlashText' : ''}
                    style={{ color: 'var(--app-ink)' }}
                  >
                    {segment.text}
                  </span>
                </span>
              ))}
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
              // Typing ends the flash early. The segments underneath are a
              // still image of what the correction did, and they'd stop
              // matching the moment the value changed under them.
              onFocus={(e) => {
                setCorrectedUnits(null);
                pinCaret(e.target);
              }}
              onSelect={handleSelect}
              className="border-4 border-white font-bold transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                // The same box as a preset or history row: this is the
                // 8-character HH:MM:SS every other box is sized to hold.
                ...LIST_ROW_BUTTON_STYLE,
                // Transparent while showing the hint and during a
                // correction flash, so the div underneath shows through.
                // caretColor is set separately because it inherits from
                // color and would vanish with the text.
                color: digits === '' || correctedUnits ? 'transparent' : 'var(--app-ink)',
                caretColor: 'var(--app-ink)',
                backgroundColor: 'transparent',
                position: 'relative',
                zIndex: 1,
                // Centred, so the caret lands after the last typed digit
                // rather than at the box's outer edge.
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
