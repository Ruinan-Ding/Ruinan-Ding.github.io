import { ChevronsDown, ChevronsUp, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readRaw, writeRaw } from '@/lib/storage';
import ConfirmDialog from './ConfirmDialog';
import { HEADER_CORNER_RESERVE, HEADER_ICON_SIZE, STORAGE_KEYS, TOGGLE_FONT_SIZE } from './constants';
import DotCheckbox from './DotCheckbox';
import HeaderToggleButton from './HeaderToggleButton';
import { shrinkClamp } from './responsive';
import { isDialogSuppressed, suppressDialog } from './suppressions';
import { capInsertion, countLabel, countStats, COUNTER_MAX, COUNTER_WARN } from './wordCount';
import type { DialogState } from './types';
import { FLASH_DURATION_MS } from './useFlashOnToken';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
  // Lets the timer hide its own header controls while this covers the
  // page they'd otherwise float over.
  onFullscreenChange: (fullscreen: boolean) => void;
  // Holds the glowFade A/B class while the window is green, '' otherwise.
  // The header sits directly on the window, so it has to fade with it.
  greenFadeTextClass: string;
  // Fullscreen covers everything the timer normally shows, so Timer
  // pre-renders its controls at this row's size and hands them over.
  // All six are null while windowed, which is what lets memo() bail out.
  speakerButton: ReactNode;
  ringerButton: ReactNode;
  clockCluster: ReactNode;
  // Measured width of the floating top-right corner, which paints above
  // this view. The fullscreen row reserves exactly this much on its right.
  headerCornerWidth: number;
  timerDigits: ReactNode;
  timerBar: ReactNode;
  timerControls: ReactNode;
}

// The one dialog this component owns. A constant so the "is it silenced?"
// check and the "silence it" call can't drift apart.
const CLEAR_DIALOG = { type: 'clearWordCounter' } as const;

// Keys that drive the focused control rather than typing into it. The
// fullscreen refocus effect below has to leave these alone, or nothing in
// that view is reachable by keyboard.
const NON_TYPING_KEYS = new Set([
  'Tab', 'Enter', ' ', 'Escape',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

const COUNTER_COLUMN_WIDTH = 'clamp(6rem, 12vw, 8rem)';
// Used by both the row-rules overlay and the textarea, so their line
// boxes stay aligned at any viewport.
const COUNTER_FONT_SIZE = shrinkClamp(0.7, 1.6, 1.75, 0.95);
const COUNTER_PADDING = shrinkClamp(0.5, 1, 1.1, 0.75);
const COUNTER_GAP = '0.5rem';
const COUNTER_LINE_HEIGHT = 1.6;
const RULE_COLOR_FOCUSED = 'rgba(34, 197, 94, 0.4)';
// Mixed off --app-ink rather than a literal white, or the rules vanish
// against the light theme's own near-white surface.
const RULE_COLOR_IDLE = 'color-mix(in oklab, var(--app-ink) 35%, transparent)';
// A notch below the textarea's size, leaving it room to grow.
const WORD_TOGGLE_FONT_SIZE = TOGGLE_FONT_SIZE;

// Largest size at which a number still fits its counter box. The box is a
// third of COUNTER_COLUMN_WIDTH less padding and borders, and a monospace
// digit is 0.6em, so n characters need n * 0.6 of them.
//
// Derived from the column width rather than picked, because the two don't
// shrink together: the column is a vw clamp, the font a min(vw, vh) one.
// "1,000" is five characters where "999" was three, and five never fit at
// full size at any window width.
const countFontSize = (value: number) =>
  `min(${COUNTER_FONT_SIZE}, calc((${COUNTER_COLUMN_WIDTH} - 30px) / ${(countLabel(value).length * 1.8).toFixed(2)}))`;


function WordCounter({ onFocusChange, onFullscreenChange, greenFadeTextClass, speakerButton, ringerButton, clockCluster, headerCornerWidth, timerDigits, timerBar, timerControls }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  // Clearing has no undo, so it asks first. Same ConfirmDialog the timer
  // uses, but with local state, since `text` lives entirely here.
  const [clearDialog, setClearDialog] = useState<DialogState>({ type: null });
  // Copy reports on its own button for a beat instead of opening a dialog.
  // Shares the app's one-shot cue duration so it reads at the same tempo.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyState === 'idle') return;
    const id = setTimeout(() => setCopyState('idle'), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [copyState]);
  const [isFocused, setIsFocused] = useState(false);
  // Both persisted, so a reload comes back to the view you left. The site
  // RESET clears them with every other key.
  const [isFullscreen, setIsFullscreen] = useState(() => readBoolean(STORAGE_KEYS.wordCounterFullscreen, false));
  const [isCollapsed, setIsCollapsed] = useState(() => readBoolean(STORAGE_KEYS.wordCounterCollapsed, false));
  // True only when the auto-collapse below forced it, never for a manual
  // toggle. The collapse arrow hides itself while this is set, since
  // clicking it would bounce straight back on the next check().
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(false);
  // Window size when auto-collapse last fired, null otherwise. Growing
  // back past it is this app's proxy for "there's room again": the
  // expanded content isn't in the DOM to re-measure once collapsed.
  const collapsedAtSizeRef = useRef<{ w: number; h: number } | null>(null);
  // check() reads state through refs, not closures. Window resize and the
  // ResizeObserver can both fire the same closure from an effect run whose
  // state has since gone stale.
  const isCollapsedRef = useRef(isCollapsed);
  isCollapsedRef.current = isCollapsed;

  useEffect(() => {
    onFullscreenChange(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);
  // Only a manual collapse persists, the same guard the timer's own
  // auto-tuck gets. An auto-collapse is a reaction to one window size, and
  // reversing it needs collapsedAtSizeRef, which is in memory and gone on
  // reload: saved, it would come back looking like a deliberate collapse
  // and stay shut at every later size, reopenable only by finding the
  // arrow.
  usePersisted(STORAGE_KEYS.wordCounterCollapsed, isCollapsed && !isAutoCollapsed);
  usePersisted(STORAGE_KEYS.wordCounterFullscreen, isFullscreen);

  // Collapsing has to leave fullscreen too, since there's no such thing as
  // a hidden-but-fullscreen view. Remembered here so un-hiding restores
  // whichever view was showing. Both the manual toggle and the
  // auto-collapse go through this one function, so the ref can't go stale
  // relative to whichever path triggered the collapse.
  const wasFullscreenBeforeCollapseRef = useRef(false);
  const collapse = () => {
    wasFullscreenBeforeCollapseRef.current = isFullscreen;
    setIsFullscreen(false);
    setIsCollapsed(true);
  };
  const toggleCollapsed = () => {
    // Clearing this stops the auto-collapse check treating a deliberate
    // click as something it caused, and later reversing it.
    collapsedAtSizeRef.current = null;
    setIsAutoCollapsed(false);
    if (isCollapsed) {
      setIsFullscreen(wasFullscreenBeforeCollapseRef.current);
      setIsCollapsed(false);
    } else {
      collapse();
    }
  };
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fullscreen has nothing else to type into, so entering it focuses the
  // textarea rather than waiting for a click. Otherwise the first
  // keystroke would hit the global SPACE/R/S shortcuts instead.
  useEffect(() => {
    if (isFullscreen) textareaRef.current?.focus();
  }, [isFullscreen]);
  // Anything that types goes to the textarea whatever was last clicked.
  // Listening on document keydown rather than the textarea's onBlur is
  // what covers a click that doesn't blur until later, or a dialog that
  // opens and closes without ever blurring it.
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Taking these too made this row's controls mouse-only: Tab reaches
      // them, arrows and Space/Enter work the one you landed on, and all
      // of it was being answered by yanking focus back to the text.
      if (NON_TYPING_KEYS.has(e.key)) return;
      // Radix keeps the dialog mounted through its exit animation, so
      // matching the role alone would skip refocus for the whole fade.
      // An open dialog is a real destination for focus; a closing one
      // isn't.
      if (document.querySelector('[role="alertdialog"][data-state="open"]')) return;
      textareaRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Collapses once the timer above leaves too little of the shared column
  // for this box's chrome, rather than clipping it, and reverses once the
  // window grows back past the size it collapsed at. Skipped in
  // fullscreen, which is a fixed overlay and competes for nothing.
  //
  // The reversal only ever undoes its own collapse. A manual collapse
  // leaves collapsedAtSizeRef null and is never fought; re-opening one by
  // hand gets a fresh measurement, and if there's still no room this puts
  // it straight back.
  useEffect(() => {
    if (isFullscreen) return;
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      if (isCollapsedRef.current) {
        if (
          collapsedAtSizeRef.current &&
          window.innerWidth >= collapsedAtSizeRef.current.w &&
          window.innerHeight >= collapsedAtSizeRef.current.h
        ) {
          collapsedAtSizeRef.current = null;
          setIsAutoCollapsed(false);
          setIsFullscreen(wasFullscreenBeforeCollapseRef.current);
          setIsCollapsed(false);
        }
        return;
      }
      // Two ways this stops being usable, and only one of them overflows.
      // The chrome is fixed height and spills once the column can't hold
      // it; the textarea is flex-1 min-h-0 and shrinks silently to a few
      // pixels instead. A box you can't fit one line into is as unusable
      // as a clipped one, so the typing area is measured against a single
      // line box read off the element, which tracks the current viewport.
      const textarea = textareaRef.current;
      const style = textarea && getComputedStyle(textarea);
      const oneLine = style
        ? parseFloat(style.lineHeight) + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        : 0;
      if (el.scrollHeight > el.clientHeight || (textarea && textarea.clientHeight < oneLine)) {
        collapsedAtSizeRef.current = { w: window.innerWidth, h: window.innerHeight };
        setIsAutoCollapsed(true);
        collapse();
      }
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

  const [alnumWordsOnly, setAlnumWordsOnly] = useState(() => readBoolean(STORAGE_KEYS.wordCounterAlnumWordsOnly, true));
  const [alnumCharsOnly, setAlnumCharsOnly] = useState(() => readBoolean(STORAGE_KEYS.wordCounterAlnumCharsOnly, true));

  // writeRaw rather than usePersisted: the text is stored as itself, not
  // as JSON, so a document already a megabyte long isn't also escaped and
  // quoted on the way in
  useEffect(() => {
    writeRaw(STORAGE_KEYS.wordCounter, text);
  }, [text]);

  usePersisted(STORAGE_KEYS.wordCounterAlnumWordsOnly, alnumWordsOnly);
  usePersisted(STORAGE_KEYS.wordCounterAlnumCharsOnly, alnumCharsOnly);

  // rawWords/rawChars are the unfiltered counts the cap goes by, taken in
  // the same pass. Lines have no filtered form.
  const { lineStats, totalLines, totalWords, totalChars, rawWords, rawChars } = useMemo(
    () => countStats(text, alnumWordsOnly, alnumCharsOnly),
    [text, alnumWordsOnly, alnumCharsOnly],
  );
  // A filter is hiding a full count when the real number is at the ceiling
  // and the displayed one isn't: typing has stopped and the counter you're
  // looking at doesn't say why. The switch responsible goes red, and turns
  // normal again once it's showing the real number.
  const wordsCapHidden = alnumWordsOnly && rawWords >= COUNTER_MAX && totalWords < COUNTER_MAX;
  const charsCapHidden = alnumCharsOnly && rawChars >= COUNTER_MAX && totalChars < COUNTER_MAX;
  // Coloured by the number the cap goes by, not the one on show, so the
  // switch and its column agree about how close typing is to stopping.
  const capColor = (raw: number, on: boolean) =>
    raw >= COUNTER_MAX ? '#ef4444' : raw >= COUNTER_WARN ? '#eab308' : on ? 'var(--app-ink)' : '#6b7280';

  // Every edit goes through capInsertion, deletions included: it works out
  // for itself what was inserted and passes the deletion half through.
  //
  // When it keeps something back, React restores the textarea's value and
  // drops the caret at the end. Both the caret and the scroll position
  // have to be put back, caret first, since placing one scrolls it into
  // view. A refused keystroke shouldn't move the page.
  //
  // Queued in a microtask because React restores the value after this
  // handler returns, and that is what moves the view. One restore per
  // burst: a second keystroke can land before the microtask runs, and
  // re-reading the scroll position then would save the jump the previous
  // key caused as the place to return to.
  const pendingRestoreRef = useRef<{ caret: number; top: number; left: number } | null>(null);
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = event.target;
    const typed = el.value;
    const accepted = capInsertion(text, typed);
    setText(accepted);
    if (accepted === typed) return;

    const caret = Math.max(0, (el.selectionStart ?? typed.length) + accepted.length - typed.length);
    const pending = pendingRestoreRef.current;
    if (pending) {
      pending.caret = caret;
      return;
    }
    pendingRestoreRef.current = { caret, top: el.scrollTop, left: el.scrollLeft };
    queueMicrotask(() => {
      const restore = pendingRestoreRef.current;
      pendingRestoreRef.current = null;
      if (!restore) return;
      el.setSelectionRange(restore.caret, restore.caret);
      el.scrollTop = restore.top;
      el.scrollLeft = restore.left;
    });
  };

  // No execCommand fallback. navigator.clipboard needs a secure context,
  // which this has everywhere it runs, and the fallback would only fire
  // where the modern API was deliberately blocked. Better to report the
  // failure than to smuggle the text out through a hidden textarea.
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  const setFocused = (focused: boolean) => {
    setIsFocused(focused);
    onFocusChange(focused);
  };

  // In fullscreen the view is the word counter the whole time, even when
  // focus moves to one of its own buttons. Everything that reads as
  // "focused" goes by this rather than raw isFocused.
  const isActive = isFocused || isFullscreen;
  const ruleColor = isActive ? RULE_COLOR_FOCUSED : RULE_COLOR_IDLE;
  // Between consecutive lines only, so an empty document shows no rules.
  const rowDivider = (idx: number) =>
    idx < lineStats.length - 1 ? `1px solid ${ruleColor}` : undefined;

  return (
    <>
    <div
      ref={containerRef}
      className={
        isFullscreen
          // Padding matches Timer's own content column. Full width, with
          // nothing reserved for the sidebar this covers.
          ? 'fixed inset-0 z-[60] bg-black p-2 sm:p-3 md:p-4 flex flex-col items-start gap-1 overflow-hidden'
          // Even flex-1 split with the timer row above, which is flex-1
          // too. Leaning heavier here takes height straight off the
          // HOURS/MINUTES/SECONDS panel, which has no slack to give before
          // its auto-tuck hides it.
          : `flex flex-col items-start gap-1 w-full overflow-hidden min-h-0 ${isCollapsed ? '' : 'flex-1'}`
      }
    >
      {/* Fullscreen drops the WORD COUNTER label, the website link and the
          repeat tip, leaving the row to the controls that matter while
          typing. Timer stops rendering its own mute/repeat buttons at the
          same time, so those relocate here rather than being duplicated.
          flex-nowrap in both versions: nothing here ever wraps to a second
          line. The corner is reserved as padding rather than a spacer
          element, because padding shrinks the line box itself while a
          spacer stops protecting anything the moment the row overflows,
          which is exactly when the corner lands on something. Running out
          of width shrinks the clock; see its box below. */}
      <div
        className="flex items-center gap-3 flex-nowrap w-full"
        style={isFullscreen ? { paddingRight: headerCornerWidth ? headerCornerWidth + 24 : HEADER_CORNER_RESERVE } : undefined}
      >
        {isFullscreen ? (
          <>
            {/* Arrow, ringer and speaker on the left, then the timer, then
                the clock. The two flex-1 ends centre the middle of that.
                No min-w-0 here on purpose: it would let this cluster be
                squeezed to nothing while its own flex-shrink-0 buttons
                spilled over the timer beside them. On min-width auto it
                can't go below its content. */}
            <div className="flex items-center gap-3 flex-1">
              {!isAutoCollapsed && (
                <HeaderToggleButton
                  onClick={toggleCollapsed}
                  icon={isCollapsed ? <ChevronsUp style={HEADER_ICON_SIZE} /> : <ChevronsDown style={HEADER_ICON_SIZE} />}
                  label={isCollapsed ? 'Show word counter' : 'Hide word counter'}
                />
              )}
              {ringerButton}
              {speakerButton}
            </div>
            {/* Countdown, bar and buttons as one block that never splits.
                gap-2 rather than the row's gap-3: this is the densest run
                in the app, and 4px a gap is 12px across it. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {timerDigits}
              {timerBar}
              {timerControls}
            </div>
            {/* This box is the leftover room, and an inline-size container,
                so the clock inside can size itself in cqi rather than vw.
                That matters: every vw clamp in the app bottoms out on a
                rem floor, past which the window keeps narrowing while the
                clock doesn't, and it ends up under the corner. cqi has
                nothing to bottom out against. */}
            <div className="flex-1 min-w-0 flex items-center" style={{ containerType: 'inline-size' }}>
              {clockCluster}
            </div>
          </>
        ) : (
          <>
            {!isAutoCollapsed && (
              <HeaderToggleButton
                onClick={toggleCollapsed}
                icon={isCollapsed ? <ChevronsUp style={HEADER_ICON_SIZE} /> : <ChevronsDown style={HEADER_ICON_SIZE} />}
                label={isCollapsed ? 'Show word counter' : 'Hide word counter'}
              />
            )}
            <label
              className={`font-bold text-left whitespace-nowrap flex-shrink-0 ${greenFadeTextClass ? `text-white ${greenFadeTextClass}` : isActive ? 'text-green-500' : 'text-red-500'}`}
              style={{ fontSize: shrinkClamp(0.875, 2.5, 2.7, 1.5), ...(greenFadeTextClass ? { '--glow-from': 'var(--app-surface)' } : {}) } as React.CSSProperties}
            >
              WORD COUNTER
            </label>
          </>
        )}
      </div>

      {/* gap-1, not gap-3: three fixed 12px gaps is 36px spent whether
          there's room or not, and all of it comes off the typing area. */}
      {!isCollapsed && (
      <div className={`flex flex-col gap-1 border-4 transition-colors duration-200 w-full flex-1 ${isActive ? 'border-green-500 bg-black' : 'border-red-500 bg-black'}`} style={{ minHeight: '0' }}>
        <div className="flex justify-between items-center gap-3 flex-wrap px-3 pt-1">
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setAlnumWordsOnly((prev) => !prev)}
              aria-pressed={alnumWordsOnly}
              className="flex items-center gap-1.5 font-bold transition-all duration-200 hover:opacity-80"
              style={{ color: capColor(rawWords, alnumWordsOnly), fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE }}
              title={wordsCapHidden
                ? `Every token counted, this is at the ${countLabel(COUNTER_MAX)} limit — click to count them all and see it`
                : 'When on, a token needs at least one letter or digit to count as a word. Click to count every whitespace-separated token instead, punctuation-only ones included.'}
              aria-label={alnumWordsOnly ? 'Disable alphanumeric-only word counting' : 'Enable alphanumeric-only word counting'}
            >
              <DotCheckbox checked={alnumWordsOnly} />
              Alphanumeric words only
            </button>

            <button
              onClick={() => setAlnumCharsOnly((prev) => !prev)}
              aria-pressed={alnumCharsOnly}
              className="flex items-center gap-1.5 font-bold transition-all duration-200 hover:opacity-80"
              // Coloured like the switch beside it, and more sharply
              // needed: "$$$$$" counts as no characters, so C can read far
              // under a limit the text is already sitting on.
              style={{ color: capColor(rawChars, alnumCharsOnly), fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE }}
              title={charsCapHidden
                ? `Every character counted, this is at the ${countLabel(COUNTER_MAX)} limit — click to count them all and see it`
                : 'When on, only letters and digits count toward C. Click to count every character in the line instead, including spaces.'}
              aria-label={alnumCharsOnly ? 'Disable alphanumeric-only character counting' : 'Enable alphanumeric-only character counting'}
            >
              <DotCheckbox checked={alnumCharsOnly} />
              Alphanumeric chars only
            </button>

            <span
              className="opacity-60 font-bold"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: shrinkClamp(0.5, 0.9, 1, 0.65) }}
            >
              Turn both off to count everything, like a classic word processor
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {text !== '' && (
              <>
                {/* The label reports the result rather than assuming it:
                    writeText can be refused. minWidth holds the box at its
                    longest label so the buttons beside it don't shuffle
                    when it changes. */}
                <button
                  onClick={handleCopy}
                  title="Copy all text to the clipboard"
                  aria-label="Copy text to clipboard"
                  className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0 text-center"
                  style={{ fontSize: shrinkClamp(0.65, 1.2, 1.3, 0.75), minWidth: '5.6em' }}
                >
                  {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy'}
                </button>
                <button
                  onClick={() => (isDialogSuppressed(CLEAR_DIALOG) ? setText('') : setClearDialog(CLEAR_DIALOG))}
                  className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0"
                  style={{ fontSize: shrinkClamp(0.65, 1.2, 1.3, 0.75) }}
                >
                  Clear
                </button>
              </>
            )}
            {/* Filled red in fullscreen: it's the only way back out, so it
                reads as the exit rather than one more square in the row. */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className={`border p-1 transition-colors flex-shrink-0 ${isFullscreen ? 'border-red-500 bg-red-500 text-black hover:opacity-80' : 'border-white text-white hover:bg-white hover:text-black'}`}
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
        {/* No gap: one child, so it would only be dead height. */}
        <div className="flex flex-col px-3 pb-1 flex-1 overflow-hidden min-h-0">
          <div className="relative flex-1 overflow-hidden min-h-0">
            {/* Numbers and rule lines as one full-width row per line, so
                each row's border-bottom runs unbroken from the L/W/C
                columns into the text with no seam for two separately
                aligned elements to drift apart on. Decorative only: the
                textarea drives its scroll. */}
            <div ref={rowsRef} aria-hidden className="absolute inset-0 overflow-hidden pointer-events-none">
              {/* Set here so each row's 1.6em height equals a textarea
                  line box exactly. */}
              <div className="zoom-safe-text" style={{ fontSize: COUNTER_FONT_SIZE, lineHeight: COUNTER_LINE_HEIGHT, paddingTop: COUNTER_PADDING, paddingBottom: COUNTER_PADDING }}>
                {lineStats.map((stat, idx) => (
                  <div key={idx} className="flex items-stretch" style={{ height: `${COUNTER_LINE_HEIGHT}em`, borderBottom: rowDivider(idx) }}>
                    {/* font-size goes on the number, not the row, so a
                        number shrinking to fit its column can't change the
                        row height. Each cell then centres its own number,
                        or a shrunken one sits at the top of a
                        full-height cell and reads as a different line. */}
                    <div className="grid grid-cols-3 text-center text-white font-bold flex-shrink-0" style={{ width: COUNTER_COLUMN_WIDTH }}>
                      <div className="flex items-center justify-center overflow-hidden" style={{ fontSize: countFontSize(idx + 1) }}>{countLabel(idx + 1)}</div>
                      <div
                        className={`flex items-center justify-center overflow-hidden border-l-2 border-r-2 ${isActive ? 'border-green-500' : 'border-white'}`}
                        style={{ fontSize: countFontSize(stat.wordCount) }}
                      >
                        {countLabel(stat.wordCount)}
                      </div>
                      <div className="flex items-center justify-center overflow-hidden" style={{ fontSize: countFontSize(stat.charCount) }}>{countLabel(stat.charCount)}</div>
                    </div>
                    <div className="flex-1" />
                  </div>
                ))}
              </div>
            </div>
            {/* thick divider between the C column and the text */}
            <div aria-hidden className={`absolute inset-y-0 w-1 ${isActive ? 'bg-green-500' : 'bg-white'}`} style={{ left: COUNTER_COLUMN_WIDTH }} />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleTextChange}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onScroll={() => {
                if (rowsRef.current && textareaRef.current) rowsRef.current.scrollTop = textareaRef.current.scrollTop;
              }}
              placeholder="Start typing..."
              className="absolute inset-y-0 bg-transparent text-white font-bold outline-none overflow-auto zoom-safe-text"
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
        <div className="flex justify-between items-start px-3 pb-1 gap-4" style={{ fontSize: shrinkClamp(0.5, 1, 1.1, 0.65) }}>
          <div className="text-white font-bold flex flex-col gap-0">
            <div className="text-white mb-0.5" style={{ fontSize: shrinkClamp(0.35, 0.8, 0.9, 0.55) }}>TOTAL</div>
            {/* Yellow approaching the cap, red at it, matching the timer's
                own warning colours. A full total shows the number that's
                full even when a switch above is filtering that column
                down: the limit is why typing stopped, so the limit is what
                it has to say. */}
            <div className="grid grid-cols-3 text-center" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
              {[
                [totalLines, totalLines],
                [totalWords, rawWords],
                [totalChars, rawChars],
              ].map(([shown, raw], idx) => {
                const total = raw >= COUNTER_MAX ? raw : shown;
                return (
                  <div
                    key={idx}
                    // Centred for the same reason as the cells above: all
                    // three boxes are as tall as the tallest, so a shrunken
                    // "999,999" would hang from the top beside a "12".
                    className="flex items-center justify-center border border-white px-1 py-0.5 bg-black overflow-hidden"
                    style={{
                      fontSize: countFontSize(total),
                      color: total >= COUNTER_MAX ? '#ef4444' : total >= COUNTER_WARN ? '#eab308' : undefined,
                    }}
                    title={
                      total >= COUNTER_MAX
                        ? `${countLabel(COUNTER_MAX)} is the limit — delete some text to keep typing`
                        : total >= COUNTER_WARN
                          ? `${countLabel(COUNTER_MAX - total)} to go before typing stops`
                          : undefined
                    }
                  >
                    {countLabel(total)}
                  </div>
                );
              })}
            </div>
          </div>
          <div className={`text-xs flex flex-wrap justify-center items-baseline gap-x-2 text-center ${isActive ? 'text-green-500' : 'text-gray-400'}`}>
            <span><strong>L:</strong> Line number</span>
            <span className="opacity-50">|</span>
            <span><strong>W:</strong> {alnumWordsOnly ? 'Words on that line (a-z, A-Z, 0-9)' : 'Words on that line, punctuation included'}</span>
            <span className="opacity-50">|</span>
            <span><strong>C:</strong> {alnumCharsOnly ? 'Alphanumeric chars (a-z, A-Z, 0-9)' : 'All characters, including spaces'}</span>
          </div>
        </div>
      </div>
      )}
    </div>
    <ConfirmDialog
      dialog={clearDialog}
      onDismiss={() => setClearDialog({ type: null })}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) suppressDialog(CLEAR_DIALOG);
        setText('');
        setClearDialog({ type: null });
      }}
    />
    </>
  );
}

export default memo(WordCounter);
