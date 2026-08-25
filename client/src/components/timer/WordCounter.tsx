import { ChevronsDown, ChevronsUp, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean, readRaw, writeRaw } from '@/lib/storage';
import ConfirmDialog from './ConfirmDialog';
import { HEADER_ICON_SIZE, STORAGE_KEYS, TYPES_INTO } from './constants';
import DotCheckbox from './DotCheckbox';
import HeaderToggleButton from './HeaderToggleButton';
import { boxCap, shrinkClamp } from './responsive';
import { shouldAsk, suppressDialog } from './suppressions';
import { capInsertion, countLabel, countStats, COUNTER_MAX, COUNTER_WARN } from './wordCount';
import type { ConfirmMode, DialogState, FullAct } from './types';
import { FLASH_DURATION_MS } from './useFlashOnToken';
import { useWordCounterCollapse } from './useWordCounterCollapse';

interface WordCounterProps {
  onFocusChange: (focused: boolean) => void;
  // Which questions the app is asking. This box owns three of them, so it
  // has to weigh them the same way Timer does rather than reading the
  // stored mode behind Timer's back.
  confirmMode: ConfirmMode;
  // Lets the timer hide its own header controls while this covers the
  // page they'd otherwise float over.
  onFullscreenChange: (fullscreen: boolean) => void;
  // Holds the glowFade A/B class while the window is green, '' otherwise.
  // The header sits directly on the window, so it has to fade with it.
  // Fullscreen covers everything the timer normally shows, so Timer
  // pre-renders its controls at this row's size and hands them over.
  // All six are null while windowed, which is what lets memo() bail out.
  speakerButton: ReactNode;
  ringerButton: ReactNode;
  clockCluster: ReactNode;
  // The floating corner's controls, handed over in fullscreen so they
  // sit in this row rather than over it. Null the rest of the time,
  // when they render in their own corner.
  cornerButtons: ReactNode;
  // So Timer can measure how close the countdown block is to them.
  cornerRef: React.RefObject<HTMLDivElement | null>;
  midRef: React.RefObject<HTMLDivElement | null>;
  timerDigits: ReactNode;
  timerBar: ReactNode;
  timerControls: ReactNode;
}

// The dialog this component owns outright. A constant so the "is it
// silenced?" check and the "silence it" call can't drift apart.
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
// The same padding vertically was 12px of nothing between the L/W/C boxes
// and the first line, and another 12 between the last line and TOTAL. Only
// the horizontal one is doing work, it holds the text off the thick
// divider, so the vertical one shrinks and the typing area takes the 16px
// back. The rules overlay and the textarea have to carry the identical
// figure or every line box drifts from the rule under it.
const COUNTER_PADDING_Y = shrinkClamp(0.15, 0.3, 0.35, 0.25);
const COUNTER_GAP = '0.5rem';
const COUNTER_LINE_HEIGHT = 1.6;
const RULE_COLOR_FOCUSED = 'rgba(34, 197, 94, 0.4)';
// Mixed off --app-ink rather than a literal white, or the rules vanish
// against the light theme's own near-white surface.
const RULE_COLOR_IDLE = 'color-mix(in oklab, var(--app-ink) 35%, transparent)';
// Side by side on one line. No container cap on this one: the two labels
// together are ~31em of monospace, and capped to fit they went to 5px on a
// narrow window, one line, and unreadable, which is not a trade worth
// making for text. The floor holds instead, and the labels drop out
// entirely once they stop fitting at it (see .switch-label in index.css).
// The checkboxes stay, so the two settings are still there to click.
const WORD_TOGGLE_FONT_SIZE = shrinkClamp(0.6, 1.2, 1.35, 0.78);
// Copy, Clear and the full-screen icon. Smaller than the switches beside
// them on purpose: this group never shrinks, so every pixel it takes is
// one the switches can't have, and it's the reason they used to stack.
const ACTION_FONT_SIZE = shrinkClamp(0.55, 1, 1.1, 0.7);

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


function WordCounter({ onFocusChange, confirmMode, onFullscreenChange, speakerButton, ringerButton, clockCluster, cornerButtons, cornerRef, midRef, timerDigits, timerBar, timerControls }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  // Clearing has no undo, so it asks first, and tucking this box away and
  // going full screen ask in FULL mode. Same ConfirmDialog the timer uses,
  // but with local state, since all three act on things that live here.
  const [dialog, setDialog] = useState<DialogState>({ type: null });
  // Copy reports on its own button for a beat instead of opening a dialog.
  // Shares the app's one-shot cue duration so it reads at the same tempo.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyState === 'idle') return;
    const id = setTimeout(() => setCopyState('idle'), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [copyState]);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Collapsed, auto-collapsed or fullscreen: one view state and the
  // measuring that reverses its own collapse. See useWordCounterCollapse.
  const { isFullscreen, setIsFullscreen, isCollapsed, isAutoCollapsed, toggleCollapsed, containerRef } =
    useWordCounterCollapse(textareaRef);

  useEffect(() => {
    onFullscreenChange(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  // The same gate Timer's askThenRun is, against the same mode. Only the
  // dialog state is local.
  const ask = (next: DialogState, run: () => void) => {
    if (!shouldAsk(next, confirmMode)) {
      run();
      return;
    }
    setDialog(next);
  };
  const askFull = (act: FullAct, run: () => void) => ask({ type: 'full', act, run }, run);

  // Focus is the act, so the question comes before it and the box is
  // given the keyboard only once it's answered. It has to let go first,
  // or a textarea still holding focus is typed into behind the dialog.
  // The flag is set in the answer rather than before the blur — set
  // earlier, the blur clears it and the focus that follows asks again,
  // forever — and cleared on blur, so returning to the box asks afresh.
  // Checked before any of it, so the modes that don't ask keep a plain
  // focus rather than a blur and refocus nobody needs.
  const typingAskedRef = useRef(false);
  // Whether a pointer is down anywhere on the page. Blur fires on
  // mousedown, so a question raised straight from it puts a modal overlay
  // up before mouseup and the button under the pointer never gets its
  // click — press the hide arrow and the counter stays where it is. The
  // question waits for the pointer to come up, by which time the click it
  // interrupted has been delivered.
  const pointerDownRef = useRef(false);
  useEffect(() => {
    const down = () => { pointerDownRef.current = true; };
    const up = () => { pointerDownRef.current = false; };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
    };
  }, []);
  const askAfterThePointer = (run: () => void) => {
    if (!pointerDownRef.current) {
      run();
      return;
    }
    document.addEventListener('pointerup', () => setTimeout(run, 0), { once: true });
  };
  const handleTextareaFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const question: DialogState = { type: 'full', act: 'typeInWordCounter', run: () => {} };
    if (typingAskedRef.current || !shouldAsk(question, confirmMode)) {
      typingAskedRef.current = true;
      setFocused(true);
      return;
    }
    const box = e.currentTarget;
    box.blur();
    setDialog({
      type: 'full',
      act: 'typeInWordCounter',
      run: () => {
        typingAskedRef.current = true;
        box.focus();
      },
    });
  };
  // Both ways round, on their own questions: coming back out gives the
  // column back to the timer, which is as much a change to the screen as
  // taking it away. The auto-collapse on a shrinking window goes straight
  // to collapse() and reaches neither of these.
  const handleToggleCollapsed = () =>
    isCollapsed
      ? askFull('untuckWordCounter', toggleCollapsed)
      : askFull('tuckWordCounter', toggleCollapsed);
  const handleToggleFullscreen = () =>
    isFullscreen
      ? askFull('exitFullscreen', () => setIsFullscreen(false))
      : askFull('fullscreen', () => setIsFullscreen(true));

  const rowsRef = useRef<HTMLDivElement | null>(null);

  // Fullscreen has nothing else to type into, so entering it focuses the
  // textarea rather than waiting for a click. Otherwise the first
  // keystroke would hit the global ENTER/R/S shortcuts instead.
  //
  // Counted as already asked. This focus is a consequence of the full
  // screen question, not a separate choice to start typing, and asking
  // again put a second dialog over a view that had just opened — one that
  // swallowed the click on any button behind it, the hide arrow included.
  useEffect(() => {
    if (isFullscreen) {
      typingAskedRef.current = true;
      textareaRef.current?.focus();
    }
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
      // Already somewhere that takes typing, including this row's own
      // clock picker, a <select> answers a letter by jumping to the city
      // that starts with it, and yanking focus away ate that.
      if ((e.target as HTMLElement | null)?.closest?.(TYPES_INTO)) return;
      // This keystroke is typing, so it stops here. Left to carry on, the
      // window's timer shortcuts read the same S or R off whichever button
      // was last clicked in this row, buttons aren't typed into, so
      // nothing there turns them away, and stopped or restarted the run
      // instead of putting a letter on the page.
      e.stopPropagation();
      textareaRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

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
  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  const handleCopy = () => askFull('copyWordCounter', copyText);

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
          same time, so those move here rather than being duplicated.

          The corner is reserved as padding rather than a spacer element:
          padding shrinks the line box itself, where a spacer stops
          protecting anything the moment the row overflows, which is
          exactly when the corner lands on something.

          One line at every width, never wrapped, since dropping the
          countdown and the buttons onto a second row is the one thing this
          view can't do. That works because of the container: everything on
          the row is capped to a share of it (boxCap), so the contents are
          a constant fraction of the room rather than a set of rem floors
          the window can shrink past. The container is the row's content
          box, so the corner's reservation is already subtracted. */}
      <div
        className={`flex items-center w-full ${isFullscreen ? 'fs-header-row' : 'gap-3 flex-wrap sm:flex-nowrap'}`}
        // No right-hand reserve any more: the corner's controls are the
        // last thing in this row rather than floating above its end, so
        // the row can use its whole width and the two flex-1 ends put the
        // countdown in the middle of it. Reserved as padding, that width
        // came off one side only and shifted everything 80px left.
        style={isFullscreen ? {
          containerType: 'inline-size',
          gap: boxCap('0.75rem', 2.2),
        } : undefined}
      >
        {isFullscreen ? (
          <>
            {/* Arrow, ringer and speaker on the left, then the timer, then
                the clock. The two flex-1 ends centre the middle of that.
                min-w-min, not the automatic minimum: index.css's blanket
                `.flex { min-width: 0 }` overrides that, and on a phone this
                cluster really was squeezed to 0 with its flex-shrink-0
                buttons spilling over the timer beside it. Same remedy the
                HOURS/MINUTES/SECONDS box needs for the same rule.
                fs-row-icons is the hook for the caps in index.css: these
                three come from Timer, at the size its floating corners use,
                and a max-width caps them here without restating the clamp
                that gives them that size. The gap comes from there too:
                0.75rem was this row's own figure and it read as a wider
                spread than the same three buttons have when they float,
                which is the only other place anyone sees them. */}
            <div className="flex items-center flex-1 min-w-min fs-row-icons" style={{ gap: boxCap('0.5rem', 1.5) }}>
              {!isAutoCollapsed && (
                <HeaderToggleButton
                  onClick={handleToggleCollapsed}
                  icon={isCollapsed ? <ChevronsUp style={HEADER_ICON_SIZE} /> : <ChevronsDown style={HEADER_ICON_SIZE} />}
                  label={isCollapsed ? 'Show word counter' : 'Hide word counter'}
                />
              )}
              {ringerButton}
              {speakerButton}
            </div>
            {/* Clock, countdown, bar and buttons as one block that never
                splits, centred by the flex-1 ends either side of it. The
                clock leads it because it belongs next to the time it is
                not: the running figure reads against the wall clock, and
                across the row from it that comparison was two saccades.
                A smaller gap than the row's: this is the densest run in
                the app, and a few px a gap is a dozen across it. */}
            <div ref={midRef} className="flex items-center flex-shrink-0" style={{ gap: boxCap('0.5rem', 1.7) }}>
              {clockCluster}
              {timerDigits}
              {timerBar}
              {timerControls}
            </div>
            {/* Leftover room opposite the icons, which is what centres the
                block between them, with the corner pushed to its end.
                fs-row-icons is the hook for the caps in index.css, same as
                the three on the left. */}
            <div className="flex-1 min-w-0 flex items-center justify-end">
              <div ref={cornerRef} className="flex items-center flex-shrink-0 fs-row-icons" style={{ gap: boxCap('0.5rem', 1.5) }}>
                {cornerButtons}
              </div>
            </div>
          </>
        ) : (
          <>
            {!isAutoCollapsed && (
              <HeaderToggleButton
                onClick={handleToggleCollapsed}
                icon={isCollapsed ? <ChevronsUp style={HEADER_ICON_SIZE} /> : <ChevronsDown style={HEADER_ICON_SIZE} />}
                label={isCollapsed ? 'Show word counter' : 'Hide word counter'}
              />
            )}
            <label
              // Its own two colours, and not the window's green: a running
              // timer used to fade this heading green along with everything
              // else on the window, which said "running" in a place that
              // has nothing to do with the timer.
              className={`font-bold text-left whitespace-nowrap flex-shrink-0 ${isActive ? 'text-green-500' : 'text-red-500'}`}
              style={{ fontSize: shrinkClamp(0.875, 2.5, 2.7, 1.5) }}
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
        {/* No flex-wrap on the row: the buttons on the right were the ones
            it dropped, and they landed under the switches as the window
            narrowed. They hold their place now and the row on the left
            gives up the width instead. */}
        <div className="flex justify-between items-center gap-3 px-3 pt-1">
          {/* Both switches and the line about them on one row, so the box
              spends one line box here rather than two and the typing area
              keeps the difference. An inline-size container so the hint can
              tell whether it fits and the switches can size against it;
              flex-1 rather than shrink-to-fit, since a container's own size
              can't come from its contents. */}
          <div
            className="flex items-center gap-2 flex-1 min-w-0"
            style={{ containerType: 'inline-size', containerName: 'counter-switches' }}
          >
            {/* The gaps are capped as well as the type. Fixed at 12px and
                6px they were 24px of the ~130 this box gets at its
                narrowest, and the pair overflowed on padding alone while
                the labels themselves had room to spare. */}
            <div className="flex items-center flex-nowrap" style={{ gap: boxCap('0.75rem', 3) }}>
            <button
              onClick={() => setAlnumWordsOnly((prev) => !prev)}
              aria-pressed={alnumWordsOnly}
              // min-w-0 and clipped: index.css's blanket `.flex { min-width:
              // 0 }` lets these shrink under their own content, and
              // whitespace-nowrap text in a shrunken box spills out of it
              // rather than wrapping. That spill ran "words only" under the
              // checkbox beside it and "chars only" under the hint, which
              // read as the two rows swapping places at one width.
              className="flex items-center font-bold whitespace-nowrap overflow-hidden min-w-0 transition-all duration-200 hover:opacity-80"
              style={{ color: capColor(rawWords, alnumWordsOnly), fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE, gap: boxCap('0.375rem', 1.2) }}
              title={wordsCapHidden
                ? `Every token counted, this is at the ${countLabel(COUNTER_MAX)} limit — click to count them all and see it`
                : 'When on, a token needs at least one letter or digit to count as a word. Click to count every whitespace-separated token instead, punctuation-only ones included.'}
              aria-label={alnumWordsOnly ? 'Disable alphanumeric-only word counting' : 'Enable alphanumeric-only word counting'}
            >
              <DotCheckbox checked={alnumWordsOnly} fontSize="1em" />
              <span className="switch-label overflow-hidden text-ellipsis min-w-0">Alphanumeric words only</span>
            </button>

            <button
              onClick={() => setAlnumCharsOnly((prev) => !prev)}
              aria-pressed={alnumCharsOnly}
              // min-w-0 and clipped: index.css's blanket `.flex { min-width:
              // 0 }` lets these shrink under their own content, and
              // whitespace-nowrap text in a shrunken box spills out of it
              // rather than wrapping. That spill ran "words only" under the
              // checkbox beside it and "chars only" under the hint, which
              // read as the two rows swapping places at one width.
              className="flex items-center font-bold whitespace-nowrap overflow-hidden min-w-0 transition-all duration-200 hover:opacity-80"
              // Coloured like the switch beside it, and more sharply
              // needed: "$$$$$" counts as no characters, so C can read far
              // under a limit the text is already sitting on.
              style={{ color: capColor(rawChars, alnumCharsOnly), fontFamily: "'IBM Plex Mono', monospace", fontSize: WORD_TOGGLE_FONT_SIZE, gap: boxCap('0.375rem', 1.2) }}
              title={charsCapHidden
                ? `Every character counted, this is at the ${countLabel(COUNTER_MAX)} limit — click to count them all and see it`
                : 'When on, only letters and digits count toward C. Click to count every character in the line instead, including spaces.'}
              aria-label={alnumCharsOnly ? 'Disable alphanumeric-only character counting' : 'Enable alphanumeric-only character counting'}
            >
              <DotCheckbox checked={alnumCharsOnly} fontSize="1em" />
              <span className="switch-label overflow-hidden text-ellipsis min-w-0">Alphanumeric chars only</span>
            </button>
            </div>

            {/* Beside the switches it talks about, and the first thing on
                this row to go when the row runs short: it names the switch
                that's left, which is worth less than the switch itself.
                Once neither is on it stops asking for anything and says
                what you have. */}
            <span
              className="counter-hint opacity-60 font-bold whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
              style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: shrinkClamp(0.5, 0.9, 1, 0.65) }}
            >
              {alnumWordsOnly && alnumCharsOnly
                ? 'Turn both off to count everything, like a classic word processor'
                : alnumWordsOnly
                  ? 'Turn off alphanumeric words to count everything, like a classic word processor'
                  : alnumCharsOnly
                    ? 'Turn off alphanumeric chars to count everything, like a classic word processor'
                    : 'Counting everything, like a classic word processor'}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Disabled on an empty box rather than removed from it: two
                buttons appearing and disappearing as you type and delete
                shuffled the row, and a control you can see greyed out is
                one you can find again. Same disabled treatment as the
                timer's own START/RESET/STOP. */}
            {/* The label reports the result rather than assuming it:
                writeText can be refused. minWidth holds the box at its
                longest label so the buttons beside it don't shuffle
                when it changes. */}
            <button
              onClick={handleCopy}
              disabled={text === ''}
              title={text === '' ? 'Nothing to copy yet' : 'Copy all text to the clipboard'}
              aria-label="Copy text to clipboard"
              className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0 text-center disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white"
              style={{ fontSize: ACTION_FONT_SIZE, minWidth: '5.6em' }}
            >
              {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Failed' : 'Copy'}
            </button>
            <button
              onClick={() => ask(CLEAR_DIALOG, () => setText(''))}
              disabled={text === ''}
              title={text === '' ? 'Nothing to clear yet' : 'Clear everything typed here'}
              className="text-white border border-white px-2 py-1 hover:bg-white hover:text-black transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-white"
              style={{ fontSize: ACTION_FONT_SIZE }}
            >
              Clear
            </button>
            {/* Filled red in fullscreen: it's the only way back out, so it
                reads as the exit rather than one more square in the row. */}
            <button
              onClick={handleToggleFullscreen}
              className={`border p-1 transition-colors flex-shrink-0 ${isFullscreen ? 'border-red-500 bg-red-500 text-black hover:opacity-80' : 'border-white text-white hover:bg-white hover:text-black'}`}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
              aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <Minimize2 style={{ width: ACTION_FONT_SIZE, height: ACTION_FONT_SIZE }} />
              ) : (
                <Maximize2 style={{ width: ACTION_FONT_SIZE, height: ACTION_FONT_SIZE }} />
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center px-3">
          {/* The same box as the TOTAL row at the foot of this column: same
              width, same font, and a 1px border rather than 2. The heavier
              border was the whole of the difference between them, it read
              as a bolder box and stood 2px taller on an identical grid. */}
          <div className="text-white font-bold grid grid-cols-3 text-center flex-shrink-0" style={{ fontSize: COUNTER_FONT_SIZE, width: COUNTER_COLUMN_WIDTH }}>
            <div className="border border-white px-1 leading-tight">L</div>
            <div className="border border-white px-1 leading-tight">W</div>
            <div className="border border-white px-1 leading-tight">C</div>
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
              <div className="zoom-safe-text" style={{ fontSize: COUNTER_FONT_SIZE, lineHeight: COUNTER_LINE_HEIGHT, paddingTop: COUNTER_PADDING_Y, paddingBottom: COUNTER_PADDING_Y }}>
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
              // The placeholder is not a name: it is gone the moment
              // anything is typed, and a screen reader reading this box
              // then has nothing to call it.
              aria-label="Writing"
              value={text}
              onChange={handleTextChange}
              onFocus={handleTextareaFocus}
              // Asked after the fact, not before: focus has already left
              // by the time this runs, and a question that took it back
              // would fight whatever the click was aiming at. ESC asks at
              // once; a click waits for its own mouseup first.
              onBlur={() => {
                typingAskedRef.current = false;
                setFocused(false);
                askAfterThePointer(() => {
                  // Whatever was clicked may have raised a question of
                  // its own, and there is one dialog to show. That one
                  // wins: it is about the thing being done, where this is
                  // about having stopped typing. Read off the DOM because
                  // the timer's dialogs are its own state, not this box's.
                  if (document.querySelector('[role="alertdialog"][data-state="open"]')) return;
                  askFull('leaveWordCounter', () => {});
                });
              }}
              // ESC hands the keyboard back to the timer. Its shortcuts sit
              // on the window and skip anything being typed into, so
              // dropping focus is the whole of what "back to the timer"
              // means, and it's the same key that leaves every other
              // typing box in the app.
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                e.preventDefault();
                e.currentTarget.blur();
              }}
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
                padding: `${COUNTER_PADDING_Y} ${COUNTER_PADDING}`,
                lineHeight: COUNTER_LINE_HEIGHT,
                whiteSpace: 'pre',
                overflowWrap: 'normal',
                resize: 'none',
              }}
            />
          </div>
        </div>
        {/* An inline-size container so the legend on the right can tell
            whether its one row fits beside the totals. */}
        <div
          className="flex justify-between items-start px-3 pb-1 gap-4"
          style={{ fontSize: shrinkClamp(0.5, 1, 1.1, 0.65), containerType: 'inline-size', containerName: 'counter-totals' }}
        >
          {/* flex-shrink-0: the boxes below are a fixed COUNTER_COLUMN_WIDTH,
              but index.css's blanket `.flex { min-width: 0 }` lets this
              column shrink under them, and on a narrow window it did, down
              to 40px against a 96px grid, which then overflowed into the
              legend beside it. */}
          <div className="text-white font-bold flex flex-col gap-0 flex-shrink-0">
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
                    // Shaped like the L/W/C boxes at the top of the same
                    // column: same font, and leading-tight with no vertical
                    // padding rather than a full line box plus py-0.5,
                    // which made these 29px against those 23 and read as a
                    // different kind of box.
                    className="flex items-center justify-center border border-white px-1 leading-tight bg-black overflow-hidden"
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
          {/* One row, never wrapped, and gone entirely once it won't fit:
              this is a legend rather than the numbers it labels, so its
              three lines were the easiest height in the box to give back to
              the typing area. */}
          <div
            className={`counter-legend flex items-baseline justify-end self-end text-right whitespace-nowrap overflow-hidden ${isActive ? 'text-green-500' : 'text-gray-400'}`}
            // Sized by the room left beside the totals rather than by the
            // window. The three keys and their gaps run about 55x the font
            // size, and the totals block plus the gap takes ~160px off the
            // row, so that is what there is to divide. It shrinks as the
            // block closes on it and stops when the query below decides
            // there is no longer enough of it to read.
            //
            // The window clamp stays as the ceiling: on a wide row this
            // would otherwise grow the legend to compete with the numbers
            // it labels.
            style={{
              fontSize: `min(${shrinkClamp(0.5, 1.3, 1.5, 0.95)}, calc((100cqi - 160px) / 59))`,
              // 2em, not 0.9: the three keys are sentences with spaces of
              // their own, and a gap barely wider than a word space read
              // as one long line rather than three labels.
              gap: '2em',
            }}
          >
            <span><strong>L:</strong> Line number</span>
            <span><strong>W:</strong> {alnumWordsOnly ? 'Words on that line (a-z, A-Z, 0-9)' : 'Words on that line, punctuation included'}</span>
            <span><strong>C:</strong> {alnumCharsOnly ? 'Alphanumeric chars (a-z, A-Z, 0-9)' : 'All characters, including spaces'}</span>
          </div>
        </div>
      </div>
      )}
    </div>
    <ConfirmDialog
      dialog={dialog}
      onDismiss={() => setDialog({ type: null })}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) suppressDialog(dialog);
        // A FULL question carries its own action; the only other thing
        // this dialog can be is the clear.
        if (dialog.type === 'full') dialog.run();
        else setText('');
        setDialog({ type: null });
      }}
    />
    </>
  );
}

export default memo(WordCounter);
