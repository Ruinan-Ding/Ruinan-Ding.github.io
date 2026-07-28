import { memo, useRef, useState } from 'react';
import { LIST_ROW_BUTTON_STYLE, LIST_ROW_LABEL_EM, LIST_ROW_REMOVE_FONT_SIZE, MAX_PRESETS } from './constants';
import { formatEntryLabel, parsePresetDigits, presetDigits } from './format';
import { shrinkClamp } from './responsive';
import type { FlashTarget, TimeParts, TimerEntry } from './types';
import { useDigitEntry } from './useDigitEntry';
import { useEntryFlash } from './useDomFlash';

// Shared by the +/- preset buttons. No minWidth of its own any more —
// that floor made these squares wider than the single glyph in them
// needs, and this row is what sets the whole sidebar's width (it holds
// the longest string in the panel, the HH:MM:SS hint), so every pixel
// spent here is a pixel the list labels can't have.
const PRESET_BUTTON_STYLE = { padding: '0.12em 0.35em', fontSize: LIST_ROW_REMOVE_FONT_SIZE };
// Fixed, and sized off the same LIST_ROW_LABEL_EM the sidebar's own
// width is solved from, so the input and the column it lives in can't
// drift apart. This used to be size={8}, which resolves to exactly 8
// glyph advances of content — a perfect fit for an 8-character string
// and therefore no fit at all, since a fraction of a pixel of layout
// rounding is enough to clip the last "S" off HH:MM:SS (or the last
// digit off 99:59:59). Border-box here, so the 8px of border-4 and the
// 2px of rounding slack are spelled out rather than left to the input's
// own intrinsic sizing; the em part already includes the 0.3em side
// padding. Fixed also means the box doesn't twitch as digits are typed.
const PRESET_INPUT_WIDTH = `calc(${LIST_ROW_LABEL_EM}em + 10px)`;

function PresetRow({ preset, onRemove, onSelect, inserted, loaded }: {
  preset: TimerEntry;
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}) {
  const buttonRef = useEntryFlash(preset.id, inserted, loaded);

  return (
    <div className="flex items-center" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
      <button
        onClick={() => onRemove(preset.id)}
        aria-label={`Remove preset ${formatEntryLabel(preset)}`}
        className="border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
        style={PRESET_BUTTON_STYLE}
      >
        −
      </button>
      <button
        ref={buttonRef}
        onClick={() => onSelect(preset)}
        className="border-4 border-white text-white font-bold hover:bg-white hover:text-black transition-colors duration-0 whitespace-nowrap"
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
  onRemove: (id: string) => void;
  onSelect: (entry: TimerEntry) => void;
  inserted: FlashTarget;
  loaded: FlashTarget;
}

// Digit entry is keydown-driven rather than derived from onChange, since
// onChange alone can't tell a partial entry from a complete one. Track the
// raw typed digits instead, and render them unpadded (same style used
// everywhere else in the app: "1:30", not "00:01:30").
function PresetsPanel({ presets, onAdd, onRemove, onSelect, inserted, loaded }: PresetsPanelProps) {
  const [digits, setDigits] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const atCapacity = presets.length >= MAX_PRESETS;

  const displayValue = digits === '' ? '' : formatEntryLabel(parsePresetDigits(digits));
  // the input's real value matches the hint's character count while empty
  // (rendered invisible) purely so the caret lands right after the hint's
  // last "S" instead of in the middle of the empty box
  const inputValue = digits === '' ? 'HH:MM:SS' : displayValue;

  const handleAdd = () => {
    if (atCapacity || digits === '') return;
    onAdd(parsePresetDigits(digits));
    setDigits('');
  };

  const { handleKeyDown, handlePaste, handleSelect, pinCaret } = useDigitEntry(inputRef, inputValue, {
    append: (text) => {
      const typed = presetDigits(text);
      if (typed) setDigits((prev) => (prev + typed).slice(0, 6));
    },
    remove: () => setDigits((prev) => prev.slice(0, -1)),
    onCommit: handleAdd,
  });

  const handleBlur = () => {
    if (digits === '') return;
    const { hours, minutes, seconds } = parsePresetDigits(digits);
    setDigits(`${String(hours).padStart(2, '0')}${String(minutes).padStart(2, '0')}${String(seconds).padStart(2, '0')}`);
  };

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
          <PresetRow key={preset.id} preset={preset} onRemove={onRemove} onSelect={onSelect} inserted={inserted} loaded={loaded} />
        ))}
        <div className="flex items-center" style={{ gap: shrinkClamp(0.25, 0.45, 0.5, 0.5), marginTop: shrinkClamp(0.25, 0.45, 0.5, 0.5) }}>
          <button
            onClick={handleAdd}
            disabled={atCapacity}
            aria-label="Add preset"
            title={atCapacity ? `Preset limit reached (${MAX_PRESETS})` : 'Add preset'}
            className="border-2 border-green-500 text-green-500 font-bold hover:bg-green-500 hover:text-white transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            style={PRESET_BUTTON_STYLE}
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
                fontFamily: "'IBM Plex Mono', monospace",
                // em-based, same as the list-row buttons below it, so
                // this row's box hugs the hint at every size instead of
                // padding out wider than the labels it sits under
                padding: '0.12em 0.3em',
                // Same size as the list buttons — this box is one of
                // them, not a lesser control under them. That makes this
                // row the widest in the sidebar by the 2px of slack in
                // PRESET_INPUT_WIDTH, which SIDEBAR_WIDTH accounts for.
                fontSize: LIST_ROW_BUTTON_STYLE.fontSize,
                // see PRESET_INPUT_WIDTH's own comment above
                width: PRESET_INPUT_WIDTH,
                boxSizing: 'border-box',
                flexShrink: 0,
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
