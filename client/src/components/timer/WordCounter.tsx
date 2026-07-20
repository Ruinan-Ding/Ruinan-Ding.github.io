import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { readRaw, writeRaw } from '@/lib/storage';
import { STORAGE_KEYS } from './constants';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
  // the window flashes green and fades toward black while the timer
  // runs; the header sits directly on it, so its label fades black ->
  // white in step. Holds the runFadeText A/B class while the window is
  // green, '' otherwise
  greenFadeTextClass: string;
}

const COUNTER_COLUMN_WIDTH = 'clamp(6rem, 12vw, 8rem)';
const COUNTER_FONT_SIZE = 'clamp(0.55rem, 1.3vw, 0.75rem)';
const COUNTER_PADDING = 'clamp(0.5rem, 1vw, 0.75rem)';
const COUNTER_GAP = '0.5rem';
const COUNTER_LINE_HEIGHT = 1.6;
const RULE_COLOR_FOCUSED = 'rgba(34, 197, 94, 0.4)';
const RULE_COLOR_IDLE = 'rgba(255, 255, 255, 0.35)';

function WordCounter({ onFocusChange, greenFadeTextClass }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    writeRaw(STORAGE_KEYS.wordCounter, text);
  }, [text]);

  const { lineStats, totalLines, totalWords, totalChars } = useMemo(() => {
    const lines = text.split('\n');
    const stats = lines.map((line) => {
      const trimmed = line.trim();
      return {
        wordCount: trimmed === '' ? 0 : trimmed.split(/\s+/).length,
        charCount: (line.match(/[a-zA-Z0-9]/g) || []).length,
      };
    });

    return {
      lineStats: stats,
      totalLines: lines.length,
      totalWords: stats.reduce((sum, stat) => sum + stat.wordCount, 0),
      totalChars: (text.match(/[a-zA-Z0-9]/g) || []).length,
    };
  }, [text]);

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
      <div className="flex justify-between items-center w-full">
        <label className={`font-bold text-left ${greenFadeTextClass ? `text-white ${greenFadeTextClass}` : isFocused ? 'text-green-500' : 'text-red-500'}`} style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.5rem)' }}>WORD COUNTER</label>
        {text !== '' && (
          <button
            onClick={() => setText('')}
            className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors"
            style={{ fontSize: 'clamp(0.65rem, 1.2vw, 0.75rem)' }}
          >
            Clear
          </button>
        )}
      </div>

      <div className={`flex flex-col gap-3 border-4 transition-colors duration-200 w-full flex-1 ${isFocused ? 'border-green-500 bg-black' : 'border-red-500 bg-black'}`} style={{ minHeight: '0' }}>
        <div className="flex justify-between items-center px-3 pt-3">
          <div className="text-white font-bold grid grid-cols-3 text-center flex-shrink-0" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
            <div className="border-2 border-white px-1 py-1">L</div>
            <div className="border-2 border-white px-1 py-1">W</div>
            <div className="border-2 border-white px-1 py-1">C</div>
          </div>
          {isFocused && (
            <span className="text-green-500 opacity-75" style={{ fontSize: 'clamp(0.875rem, 2vw, 1.25rem)' }}>Spacebar disabled for timer</span>
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
        <div className="flex justify-between items-start px-3 py-1 gap-4" style={{ fontSize: 'clamp(0.5rem, 1vw, 0.65rem)' }}>
          <div className="text-white font-bold flex flex-col gap-0">
            <div className="text-white mb-0.5" style={{ fontSize: 'clamp(0.35rem, 0.8vw, 0.55rem)' }}>TOTAL</div>
            <div className="grid grid-cols-3 text-center" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalLines}</div>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalWords}</div>
              <div className="border border-white px-1 py-0.5 bg-black overflow-hidden">{totalChars}</div>
            </div>
          </div>
          <div className={`text-xs flex flex-col justify-center items-center text-center ${isFocused ? 'text-green-500' : 'text-gray-400'}`}>
            <p><strong>L:</strong> Line number</p>
            <p><strong>W:</strong> Words on that line</p>
            <p><strong>C:</strong> Alphanumeric chars (a-z, A-Z, 0-9)</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(WordCounter);
