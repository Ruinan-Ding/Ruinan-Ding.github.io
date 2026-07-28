import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { LIST_ROW_BUTTON_STYLE, LIST_ROW_REMOVE_BUTTON_STYLE, MAX_PRESETS } from './constants';
import { formatEntryLabel, isPresetOutOfRange, parsePresetDigits, presetDigits, presetDigitsFromParts, rawPresetDigits } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimeParts, TimerEntry } from './types';
import { useDigitEntry } from './useDigitEntry';
import { useEntryFlash, useFizzRemove } from './useDomFlash';

function PresetRow({ preset, onRequestRemove, onRemove, isRemoving, onSelect, inserted, loaded }: {
  preset: TimerEntry;
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  isRemoving: boolean;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useEntryFlash(preset.id, inserted, loaded);
  const fizz = useFizzRemove(useCallback(() => onRemove(preset.id), [onRemove, preset.id]));

  // Unlike a history row, this one doesn't start its own fizz on click —
  // deleting a preset asks first, so the animation waits for the answer
  // and is triggered from above once there is one.
  const { start } = fizz;
  useEffect(() => {
    if (isRemoving) start();
  }, [isRemoving, start]);

  return (
    // items-stretch, so the − button takes its height from the box
    // beside it rather than from its own smaller font
    <div className="flex items-stretch" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
      <button
        onClick={() => onRequestRemove(preset.id)}
        disabled={fizz.isRemoving}
        aria-label={`Remove preset ${formatEntryLabel(preset)}`}
        className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors"
        style={LIST_ROW_REMOVE_BUTTON_STYLE}
      >
        −
      </button>
      {/* the fizz plays on the label box, not the − that triggered it,
          so what animates out is the thing being deleted; the row
          unmounts on animationend (see useFizzRemove) */}
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
  onAdd: (parts: TimeParts) => void;
  // asks to remove; onRemove is the other half, called once the row has
  // finished animating out (see PresetRow)
  onRequestRemove: (id: string) => void;
  onRemove: (id: string) => void;
  // the preset whose removal has been confirmed, and which should now be
  // playing its fizz — null the rest of the time
  removingId: string | null;
  // asks whether to correct an out-of-range entry; the answer comes back
  // as `correction`, which is applied and then acknowledged
  onRequestCorrect: (digits: string, add: boolean) => void;
  correction: { digits: string; add: boolean } | null;
  onCorrectionApplied: () => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}

// Digit entry is keydown-driven rather than derived from onChange, since
// onChange alone can't tell a partial entry from a complete one. Track the
// raw typed digits instead, and render them unpadded (same style used
// everywhere else in the app: "1:30", not "00:01:30").
function PresetsPanel({ presets, onAdd, onRequestRemove, onRemove, removingId, onRequestCorrect, correction, onCorrectionApplied, onSelect, inserted, loaded }: PresetsPanelProps) {
  const [digits, setDigits] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atCapacity = presets.length >= MAX_PRESETS;

  // Shows exactly what was typed, out of range and all — see
  // rawPresetDigits. Correcting happens once, at commit, and only after
  // asking (handleCommit below).
  const displayValue = digits === '' ? '' : formatEntryLabel(rawPresetDigits(digits));
  // the input's real value matches the hint's character count while empty
  // (rendered invisible) purely so the caret lands right after the hint's
  // last "S" instead of in the middle of the empty box
  const inputValue = digits === '' ? 'HH:MM:SS' : displayValue;

  // The three ways an entry is finished: Enter, the + button, and
  // leaving the field. Only the first two add it; blurring just settles
  // the text. All three are a commit, though, so all three are where an
  // out-of-range entry gets questioned.
  const handleCommit = (add: boolean) => {
    if (digits === '') return;
    if (add && atCapacity) return;
    if (isPresetOutOfRange(digits)) {
      onRequestCorrect(digits, add);
      return;
    }
    if (add) {
      onAdd(parsePresetDigits(digits));
      setDigits('');
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

  // A correction the dialog got a yes to, applied here because this is
  // where the typed digits live.
  useEffect(() => {
    if (!correction) return;
    if (correction.add) {
      onAdd(parsePresetDigits(correction.digits));
      setDigits('');
    } else {
      setDigits(correction.digits);
    }
    onCorrectionApplied();
  }, [correction, onAdd, onCorrectionApplied]);

  return (
    <div>
      {/* margin/padding/gap below all sized on shrinkClamp rather than
          fixed mb-4/pb-2/gap-2/mt-2 — those never moved at all regardless
          of window size, same rigidity as the font sizes above before
          their own fix. */}
      <h2
        className="text-white font-bold border-b-2 border-white"
        style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.25), marginBottom: shrinkClamp(0.5, 0.9, 1, 1), paddingBottom: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}
      >
        PRESETS
      </h2>
      <div className="flex flex-col" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
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
          />
        ))}
        <div className="flex items-stretch" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5), marginTop: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
          <button
            onClick={handleAdd}
            // keeps the input focused through the click, so this is one
            // commit (an add) rather than two: without it the input
            // blurs first, which is itself a commit, and an
            // out-of-range entry would open the correction dialog on the
            // way down — swallowing the click that was meant to add it
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
            {/* no letter-spacing here or on the input itself: the two
                have to render the same 8 characters at the same width
                (this div shows through while the input's own text is
                transparent), and the extra spacing pushed both past the
                8 characters the input now sizes itself to. */}
            <div style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontFamily: "'IBM Plex Mono', monospace", fontSize: LIST_ROW_BUTTON_STYLE.fontSize, color: '#888888', pointerEvents: 'none', zIndex: 0, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
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
              className="border-4 border-white font-bold transition-colors duration-0 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                // Literally the same box as a preset or history row —
                // same font, same padding, same fixed width — since this
                // is the one every other box in the sidebar is sized to
                // hold: 8 characters of HH:MM:SS.
                ...LIST_ROW_BUTTON_STYLE,
                // invisible while showing the hint's character count, so the
                // decorative hint div shows through underneath instead —
                // caretColor is set separately since it inherits from color
                // and would otherwise vanish along with the text
                color: digits === '' ? 'transparent' : '#ffffff',
                caretColor: '#ffffff',
                backgroundColor: 'transparent',
                position: 'relative',
                zIndex: 1,
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
