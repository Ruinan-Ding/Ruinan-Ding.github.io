import { ChevronsDown, ChevronsUp, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { readJSON, readRaw, writeJSON, writeRaw } from '@/lib/storage';
import { HEADER_ICON_SIZE, STORAGE_KEYS } from './constants';
import HeaderToggleButton from './HeaderToggleButton';
import { shrinkClamp } from './responsive';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
  // lets the timer header hide its own arrow/speaker/repeat buttons while
  // this takes over the screen — they'd otherwise sit uselessly on top of
  // a view that has nothing to do with them
  onFullscreenChange: (fullscreen: boolean) => void;
  // whether the presets/history sidebar is currently hidden — the
  // fullscreen overlay needs this to know whether to leave room for it
  // (lg:w-48) on the left, so the chevron/label don't jump sideways
  // relative to where they sit in the normal (non-fullscreen) layout
  sidebarHidden: boolean;
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

function WordCounter({ onFocusChange, onFullscreenChange, sidebarHidden, greenFadeTextClass }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  const [isFocused, setIsFocused] = useState(false);
  // full screen and collapse are transient view toggles — not persisted,
  // so a reload always comes back expanded/windowed
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    onFullscreenChange(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);
  // hiding while fullscreen has to drop out of fullscreen too (there's no
  // such thing as a hidden-but-fullscreen view) — remembered here so
  // un-hiding restores exactly the view that was showing, fullscreen or not
  const wasFullscreenBeforeCollapseRef = useRef(false);
  const toggleCollapsed = () => {
    if (isCollapsed) {
      setIsFullscreen(wasFullscreenBeforeCollapseRef.current);
      setIsCollapsed(false);
    } else {
      wasFullscreenBeforeCollapseRef.current = isFullscreen;
      setIsFullscreen(false);
      setIsCollapsed(true);
    }
  };
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // auto-collapses once the timer above is eating enough of the shared
  // column that this box's own chrome (toggles, L/W/C header, totals —
  // the textarea itself is elastic and doesn't factor in) no longer fits
  // in what's left, instead of silently clipping that chrome. Skipped
  // while fullscreen (a fixed overlay, not competing for column space)
  // or already collapsed. One-directional, like the timer's own
  // equivalent check on the HOURS/MINUTES/SECONDS panel: a manual
  // re-open always gets a fresh measurement rather than being fought —
  // if there's still no room, this puts it right back.
  useEffect(() => {
    if (isFullscreen || isCollapsed) return;
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      if (el.scrollHeight > el.clientHeight) setIsCollapsed(true);
    };
    check();
    window.addEventListener('resize', check);
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(el);
    return () => {
      window.removeEventListener('resize', check);
      resizeObserver.disconnect();
    };
  }, [isFullscreen, isCollapsed]);

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
    <div
      ref={containerRef}
      className={
        isFullscreen
          // matches the p-2 sm:p-3 md:p-4 padding on Timer's own content
          // column exactly, and leaves room on the left for the sidebar
          // (lg:w-48) when it's showing, so the chevron + WORD COUNTER
          // label land at the same horizontal spot whether this is
          // fullscreen or not
          ? `fixed inset-y-0 right-0 z-[60] bg-black p-2 sm:p-3 md:p-4 flex flex-col items-start gap-1 overflow-hidden left-0 ${sidebarHidden ? '' : 'lg:left-48'}`
          : `flex flex-col items-start gap-1 w-full overflow-hidden min-h-0 ${isCollapsed ? '' : 'flex-1'}`
      }
    >
      {/* fullscreen only: keep clear of the mute/alarm-repeat buttons
          (left, z-[70]) and the CONFIRMATIONS/RESET buttons (right,
          z-[70]) that float above this row in those same corners —
          otherwise this label or the focus hint get painted over */}
      <div
        className="flex justify-between items-center gap-3 w-full"
        style={isFullscreen ? { paddingLeft: 'clamp(5rem, 13vw, 8.5rem)', paddingRight: 'clamp(9rem, 18vw, 16rem)' } : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          <HeaderToggleButton
            onClick={toggleCollapsed}
            icon={isCollapsed ? <ChevronsUp style={HEADER_ICON_SIZE} /> : <ChevronsDown style={HEADER_ICON_SIZE} />}
            label={isCollapsed ? 'Show word counter' : 'Hide word counter'}
          />
          <label
            className={`font-bold text-left ${greenFadeTextClass ? `text-white ${greenFadeTextClass}` : isFocused ? 'text-green-500' : 'text-red-500'}`}
            style={{ fontSize: shrinkClamp(0.875, 2.5, 2.7, 1.5), ...(greenFadeTextClass ? { '--glow-from': '#000000' } : {}) } as React.CSSProperties}
          >
            WORD COUNTER
          </label>
        </div>

        {isFocused && (
          <span className="text-red-500 opacity-75 text-right" style={{ fontSize: shrinkClamp(0.875, 2, 2.2, 1.25) }}>Spacebar, R, and S disabled for timer</span>
        )}
      </div>

      {!isCollapsed && (
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

          <div className="flex items-center gap-2 flex-shrink-0">
            {text !== '' && (
              <button
                onClick={() => setText('')}
                className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0"
                style={{ fontSize: shrinkClamp(0.65, 1.2, 1.3, 0.75) }}
              >
                Clear
              </button>
            )}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="text-white border border-white p-1 hover:bg-white hover:text-black transition-colors flex-shrink-0"
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <Minimize2 style={{ width: shrinkClamp(0.65, 1.2, 1.3, 0.75), height: shrinkClamp(0.65, 1.2, 1.3, 0.75) }} />
              ) : (
                <Maximize2 style={{ width: shrinkClamp(0.65, 1.2, 1.3, 0.75), height: shrinkClamp(0.65, 1.2, 1.3, 0.75) }} />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center px-3">
          <div className="text-white font-bold grid grid-cols-3 text-center flex-shrink-0" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
            <div className="border-2 border-white px-1 py-1">L</div>
            <div className="border-2 border-white px-1 py-1">W</div>
            <div className="border-2 border-white px-1 py-1">C</div>
          </div>
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
      )}
    </div>
  );
}

export default memo(WordCounter);
