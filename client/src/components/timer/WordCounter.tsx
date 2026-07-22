import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { readJSON, readRaw, writeJSON, writeRaw } from '@/lib/storage';
import { STORAGE_KEYS } from './constants';
import { shrinkClamp } from './responsive';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
  // the window flashes green and fades toward black while the timer
  // runs; the header sits directly on it, so its label fades black ->
  // white in step, then glows back to green. Holds the glowFade A/B
  // class while the window is green, '' otherwise
  greenFadeTextClass: string;
}

const COUNTER_COLUMN_WIDTH = 'clamp(6rem, 12vw, 8rem)';
// used identically in both the decorative row-rules overlay and the
// textarea itself, so they stay in sync regardless of viewport
const COUNTER_FONT_SIZE = shrinkClamp(0.55, 1.3, 1.4, 0.75);
const COUNTER_PADDING = shrinkClamp(0.5, 1, 1.1, 0.75);
const COUNTER_GAP = '0.5rem';
const COUNTER_LINE_HEIGHT = 1.6;
const RULE_COLOR_FOCUSED = 'rgba(34, 197, 94, 0.4)';
const RULE_COLOR_IDLE = 'rgba(255, 255, 255, 0.35)';
// the checkbox squares are sized in em, so this scales both the label
// text and the box together
const WORD_TOGGLE_FONT_SIZE = shrinkClamp(0.875, 2, 2.2, 1.25);

function WordCounter({ onFocusChange, greenFadeTextClass }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  const [alnumWordsOnly, setAlnumWordsOnly] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.wordCounterAlnumWordsOnly, null);
    return typeof saved === 'boolean' ? saved : true;
  });
  const [alnumCharsOnly, setAlnumCharsOnly] = useState(() => {
    const saved = readJSON<unknown>(STORAGE_KEYS.wordCounterAlnumCharsOnly, null);
    return typeof saved === 'boolean' ? saved : true;
  });

  useEffect(() => {
    writeRaw(STORAGE_KEYS.wordCounter, text);
  }, [text]);

  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterAlnumWordsOnly, alnumWordsOnly);
  }, [alnumWordsOnly]);

  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterAlnumCharsOnly, alnumCharsOnly);
  }, [alnumCharsOnly]);

  const { lineStats, totalLines, totalWords, totalChars } = useMemo(() => {
    const lines = text.split('\n');
    const stats = lines.map((line) => {
      const trimmed = line.trim();
      const tokens = trimmed === '' ? [] : trimmed.split(/\s+/);
      // alnumWordsOnly requires at least one letter/digit for a token to
      // count as a word (so "$#" alone doesn't); off counts every
      // whitespace-separated token. alnumCharsOnly restricts C to
      // a-z/A-Z/0-9; off counts every character in the line, including
      // spaces. The two are intentionally independent — with words-only
      // off and chars-only on, a punctuation-only line like "$# @!" will
      // show words > 0 with chars === 0. That's correct, not a bug.
      const words = alnumWordsOnly ? tokens.filter((word) => /[a-zA-Z0-9]/.test(word)) : tokens;
      const charCount = alnumCharsOnly ? (line.match(/[a-zA-Z0-9]/g) || []).length : line.length;
      return { wordCount: words.length, charCount };
    });

    return {
      lineStats: stats,
      totalLines: lines.length,
      totalWords: stats.reduce((sum, stat) => sum + stat.wordCount, 0),
      // summed from the same per-line numbers shown in the C column
      // (rather than an independent scan over the raw text) so TOTAL
      // always matches "add up the C column" — an independent scan
      // would also pick up the '\n' line separators once chars-only is
      // off and every character in a line counts
      totalChars: stats.reduce((sum, stat) => sum + stat.charCount, 0),
    };
  }, [text, alnumWordsOnly, alnumCharsOnly]);

  const setFocused = (focused: boolean) => {
    setIsFocused(focused);
    onFocusChange(focused);
  };

  const ruleColor = isFocused ? RULE_COLOR_FOCUSED : RULE_COLOR_IDLE;
  // Divider between consecutive lines only — nothing under the last line,
  // so an empty document shows no rules
  const rowDivider = (idx: number) =>
    idx < lineStats.length - 1 ? `1px solid ${ruleColor}` : undefined;

  return (
    <div className="flex flex-col items-start gap-1 w-full flex-1 overflow-hidden min-h-0">
      <label
        className={`font-bold text-left ${greenFadeTextClass ? `text-white ${greenFadeTextClass}` : isFocused ? 'text-green-500' : 'text-red-500'}`}
        style={{ fontSize: shrinkClamp(0.875, 2.5, 2.7, 1.5), ...(greenFadeTextClass ? { '--glow-from': '#000000' } : {}) } as React.CSSProperties}
      >
        WORD COUNTER
      </label>

      <div className={`flex flex-col gap-3 border-4 transition-colors duration-200 w-full flex-1 ${isFocused ? 'border-green-500 bg-black' : 'border-red-500 bg-black'}`} style={{ minHeight: '0' }}>
        <div className="flex justify-between items-center gap-3 flex-wrap px-3 pt-3">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setAlnumWordsOnly((prev) => !prev)}
              aria-pressed={alnumWordsOnly}
              className="flex items-center gap-1.5 font-bold transition-all duration-200 hover:opacity-80"
              style={{ color: alnumWordsOnly ? '#ffffff' : '#6b7280', fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE }}
              title="When on, a token needs at least one letter or digit to count as a word. Click to count every whitespace-separated token instead, punctuation-only ones included."
              aria-label={alnumWordsOnly ? 'Disable alphanumeric-only word counting' : 'Enable alphanumeric-only word counting'}
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center border-2 flex-shrink-0"
                style={{ width: '0.9em', height: '0.9em', borderColor: 'currentColor' }}
              >
                <span style={{ width: '0.45em', height: '0.45em', backgroundColor: alnumWordsOnly ? 'currentColor' : 'transparent' }} />
              </span>
              Alphanumeric words only
            </button>

            <button
              onClick={() => setAlnumCharsOnly((prev) => !prev)}
              aria-pressed={alnumCharsOnly}
              className="flex items-center gap-1.5 font-bold transition-all duration-200 hover:opacity-80"
              style={{ color: alnumCharsOnly ? '#ffffff' : '#6b7280', fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE }}
              title="When on, only letters and digits count toward C. Click to count every character in the line instead, including spaces."
              aria-label={alnumCharsOnly ? 'Disable alphanumeric-only character counting' : 'Enable alphanumeric-only character counting'}
            >
              <span
                aria-hidden
                className="inline-flex items-center justify-center border-2 flex-shrink-0"
                style={{ width: '0.9em', height: '0.9em', borderColor: 'currentColor' }}
              >
                <span style={{ width: '0.45em', height: '0.45em', backgroundColor: alnumCharsOnly ? 'currentColor' : 'transparent' }} />
              </span>
              Alphanumeric chars only
            </button>
          </div>

          {text !== '' && (
            <button
              onClick={() => setText('')}
              className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0"
              style={{ fontSize: shrinkClamp(0.65, 1.2, 1.3, 0.75) }}
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex justify-between items-center px-3">
          <div className="text-white font-bold grid grid-cols-3 text-center flex-shrink-0" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
            <div className="border-2 border-white px-1 py-1">L</div>
            <div className="border-2 border-white px-1 py-1">W</div>
            <div className="border-2 border-white px-1 py-1">C</div>
          </div>
          {isFocused && (
            <span className="text-green-500 opacity-75" style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.25) }}>Spacebar disabled for timer</span>
          )}
        </div>
        <div className="flex flex-col gap-2 px-3 pb-3 flex-1 overflow-hidden min-h-0">
          <div className="relative flex-1 overflow-hidden min-h-0">
            {/* Counter numbers + rule lines as one full-width row per line of
                text, so the row's own border-bottom runs unbroken straight
                through from the L/W/C numbers into the text — no seam where
                two separately-aligned elements could drift apart. Purely
                decorative: it never scrolls itself, the textarea drives it. */}
            <div ref={rowsRef} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
              {/* font-size/line-height here so each row's 1.6em height equals
                  a textarea line box exactly */}
              <div style={{ fontSize: COUNTER_FONT_SIZE, lineHeight: COUNTER_LINE_HEIGHT, paddingTop: COUNTER_PADDING, paddingBottom: COUNTER_PADDING }}>
                {lineStats.map((stat, idx) => (
                  <div key={idx} className="flex items-stretch" style={{ height: `${COUNTER_LINE_HEIGHT}em`, borderBottom: rowDivider(idx) }}>
                    <div className="grid grid-cols-3 text-center text-white font-bold flex-shrink-0" style={{ width: COUNTER_COLUMN_WIDTH }}>
                      <div className="overflow-hidden">{idx + 1}</div>
                      <div className={`overflow-hidden border-l-2 border-r-2 ${isFocused ? 'border-green-500' : 'border-white'}`}>{stat.wordCount}</div>
                      <div className="overflow-hidden">{stat.charCount}</div>
                    </div>
                    <div className="flex-1" />
                  </div>
                ))}
              </div>
            </div>
            {/* thick divider between the C column and the text */}
            <div aria-hidden className={`absolute inset-y-0 w-1 ${isFocused ? 'bg-green-500' : 'bg-white'}`} style={{ left: COUNTER_COLUMN_WIDTH }} />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onScroll={() => {
                if (rowsRef.current && textareaRef.current) rowsRef.current.scrollTop = textareaRef.current.scrollTop;
              }}
              placeholder="Start typing..."
              className="absolute inset-y-0 bg-transparent text-white font-bold outline-none overflow-auto"
              style={{
                left: `calc(${COUNTER_COLUMN_WIDTH} + ${COUNTER_GAP})`,
                right: 0,
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: COUNTER_FONT_SIZE,
                padding: COUNTER_PADDING,
                lineHeight: COUNTER_LINE_HEIGHT,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                resize: 'none',
              }}
            />
          </div>
        </div>
        <div className="flex justify-between items-start px-3 py-1 gap-4" style={{ fontSize: shrinkClamp(0.5, 1, 1.1, 0.65) }}>
          <div className="text-white font-bold flex flex-col gap-0">
            <div className="text-white mb-0.5" style={{ fontSize: shrinkClamp(0.35, 0.8, 0.9, 0.55) }}>TOTAL</div>
            <div className="grid grid-cols-3 text-center" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalLines}</div>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalWords}</div>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalChars}</div>
            </div>
          </div>
          <div className={`text-xs flex flex-col justify-center items-center text-center ${isFocused ? 'text-green-500' : 'text-gray-400'}`}>
            <p><strong>L:</strong> Line number</p>
            <p><strong>W:</strong> {alnumWordsOnly ? 'Words on that line (a-z, A-Z, 0-9)' : 'Words on that line, punctuation included'}</p>
            <p><strong>C:</strong> {alnumCharsOnly ? 'Alphanumeric chars (a-z, A-Z, 0-9)' : 'All characters, including spaces'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(WordCounter);
