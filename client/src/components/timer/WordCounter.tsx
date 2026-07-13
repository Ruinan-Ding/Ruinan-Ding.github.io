import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { STORAGE_KEYS } from './constants';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
}

const COUNTER_COLUMN_WIDTH = 'clamp(6rem, 12vw, 8rem)';
const COUNTER_FONT_SIZE = 'clamp(0.55rem, 1.3vw, 0.75rem)';

function WordCounter({ onFocusChange }: WordCounterProps) {
  const [text, setText] = useState(() => localStorage.getItem(STORAGE_KEYS.wordCounter) || '');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineCounterRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.wordCounter, text);
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

  return (
    <div className="flex flex-col items-start gap-1 w-full flex-1 overflow-hidden min-h-0">
      <label className={`font-bold text-left ${isFocused ? 'text-green-500' : 'text-red-500'}`} style={{ fontSize: 'clamp(0.875rem, 2.5vw, 1.5rem)' }}>WORD COUNTER</label>

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
          <div className="flex gap-2 flex-1 overflow-hidden min-h-0">
            <div className="flex flex-col flex-shrink-0" style={{ width: COUNTER_COLUMN_WIDTH }}>
              <div ref={lineCounterRef} className="overflow-auto flex-1" onScroll={() => {
                if (textareaRef.current && lineCounterRef.current) {
                  textareaRef.current.scrollTop = lineCounterRef.current.scrollTop;
                }
              }}>
                {/* padding mirrors the textarea's border + padding so row 1
                    lines up with text line 1 */}
                <div style={{ paddingTop: 'calc(clamp(0.5rem, 1vw, 0.75rem) + 4px)', paddingBottom: 'calc(clamp(0.5rem, 1vw, 0.75rem) + 4px)' }}>
                  {lineStats.map((stat, idx) => (
                    <div key={idx} className="grid grid-cols-3 text-center text-white font-bold" style={{ fontSize: COUNTER_FONT_SIZE, lineHeight: '1.6', height: '1.6em' }}>
                      <div className="overflow-hidden">{idx + 1}</div>
                      <div className={`overflow-hidden border-l-2 border-r-2 ${isFocused ? 'border-green-500' : 'border-white'}`}>{stat.wordCount}</div>
                      <div className="overflow-hidden">{stat.charCount}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onScroll={() => {
                if (textareaRef.current && lineCounterRef.current) {
                  lineCounterRef.current.scrollTop = textareaRef.current.scrollTop;
                  lineCounterRef.current.scrollLeft = textareaRef.current.scrollLeft;
                }
              }}
              placeholder="Start typing..."
              className={`flex-1 bg-black border-4 text-white font-bold outline-none overflow-auto ${isFocused ? 'border-green-500' : 'border-white'}`}
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: COUNTER_FONT_SIZE, padding: 'clamp(0.5rem, 1vw, 0.75rem)', lineHeight: '1.6', whiteSpace: 'pre', overflowWrap: 'normal' }}
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
