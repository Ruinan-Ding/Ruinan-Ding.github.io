import { ChevronsDown, ChevronsUp, Maximize2, Minimize2 } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readBoolean, readRaw, writeJSON, writeRaw } from '@/lib/storage';
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
  // lets the timer header hide its own arrow/speaker/repeat buttons while
  // this takes over the screen — they'd otherwise sit uselessly on top of
  // a view that has nothing to do with them
  onFullscreenChange: (fullscreen: boolean) => void;
  // the window flashes green and fades toward black while the timer
  // runs; the header sits directly on it, so its label fades black ->
  // white in step, then glows back to green. Holds the glowFade A/B
  // class while the window is green, '' otherwise
  greenFadeTextClass: string;
  // Mute/volume and alarm-repeat, pre-rendered by Timer — normally these
  // float in the top-left corner, but fullscreen covers the whole page
  // they'd float over, so Timer stops rendering them there and hands
  // over copies for this row instead (icon-only — the tip that rides
  // alongside the ringer normally is dropped here, see the row below)
  speakerButton: ReactNode;
  ringerButton: ReactNode;
  // wall clock — time, date, and the zone and 12/24 settings under them —
  // pre-rendered by Timer at a size that suits this row. It normally sits
  // above the digits, which this view covers, so it comes along to the far
  // end of the centered group, past the timer controls
  clockCluster: ReactNode;
  // measured width of the floating top-right corner (theme, CONFIRMATIONS,
  // RESET), which is painted above this view — the fullscreen row reserves
  // exactly this much on its right so nothing of its own ends up under it
  headerCornerWidth: number;
  // "remaining / total", pre-rendered by Timer — fullscreen covers the
  // real digits entirely, so this is the only countdown visible while
  // typing
  timerDigits: ReactNode;
  // compact copy of the drain/progress bar, pre-rendered by Timer —
  // sits between the digits and the controls, same as the main page
  timerBar: ReactNode;
  // START/RESUME-PAUSE/RESET/STOP, pre-rendered by Timer at a size that
  // fits this component's own header row — fullscreen covers the timer's
  // normal button row entirely, so without this there'd be no way to
  // control the timer at all while typing in fullscreen
  timerControls: ReactNode;
}

// The one dialog this component owns, as a constant so the "is it
// silenced?" check and the "silence it" call can't drift apart
const CLEAR_DIALOG = { type: 'clearWordCounter' } as const;

const COUNTER_COLUMN_WIDTH = 'clamp(6rem, 12vw, 8rem)';
// used identically in both the decorative row-rules overlay and the
// textarea itself, so they stay in sync regardless of viewport
const COUNTER_FONT_SIZE = shrinkClamp(0.7, 1.6, 1.75, 0.95);
const COUNTER_PADDING = shrinkClamp(0.5, 1, 1.1, 0.75);
const COUNTER_GAP = '0.5rem';
const COUNTER_LINE_HEIGHT = 1.6;
const RULE_COLOR_FOCUSED = 'rgba(34, 197, 94, 0.4)';
const RULE_COLOR_IDLE = 'rgba(255, 255, 255, 0.35)';
// These labels and the checkbox squares beside them (DotCheckbox, which
// carries the same size itself) shrink together — a notch below the
// bigger textarea above (COUNTER_FONT_SIZE) to leave it room to grow
const WORD_TOGGLE_FONT_SIZE = TOGGLE_FONT_SIZE;

// The largest size at which a number still fits its counter box: the box
// is a third of COUNTER_COLUMN_WIDTH less its padding and borders, and a
// monospace digit is 0.6em wide, so n characters need n * 0.6 of them.
// Capped at the column's usual size, which short numbers keep.
//
// Worked out from the column's own width rather than picked by eye,
// because the two don't shrink together — the column is a vw clamp and
// the font is a min(vw, vh) one — so "how many characters fit" isn't a
// constant. "1,000" is five characters where "999" was three, and five
// never fit at full size at any window size.
const countFontSize = (value: number) =>
  `min(${COUNTER_FONT_SIZE}, calc((${COUNTER_COLUMN_WIDTH} - 30px) / ${(countLabel(value).length * 1.8).toFixed(2)}))`;


function WordCounter({ onFocusChange, onFullscreenChange, greenFadeTextClass, speakerButton, ringerButton, clockCluster, headerCornerWidth, timerDigits, timerBar, timerControls }: WordCounterProps) {
  const [text, setText] = useState(() => readRaw(STORAGE_KEYS.wordCounter, ''));
  // Clearing wipes everything typed with no undo, so it gets its own
  // confirm dialog — reusing the same ConfirmDialog/DialogState the
  // timer uses for its own destructive actions, but with fully local
  // state (rather than routed through the timer's dialog prop) since
  // `text` itself lives entirely in this component.
  const [clearDialog, setClearDialog] = useState<DialogState>({ type: null });
  // Copy reports back on its own button for a beat, then goes quiet —
  // no dialog, since copying changes nothing and asking about it would
  // cost more than the action. Shares the app's one-shot cue duration so
  // it reads at the same tempo as the flashes elsewhere.
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (copyState === 'idle') return;
    const id = setTimeout(() => setCopyState('idle'), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [copyState]);
  const [isFocused, setIsFocused] = useState(false);
  // Persisted, like collapse and the timer's own hide toggles: a reload
  // comes back to the view you left. (It used to be deliberately
  // transient, on the grounds that a view covering everything else is
  // better escaped than restored — but that reasoning loses to reloading
  // mid-sentence and landing somewhere else.) The site RESET clears it
  // with every other key.
  const [isFullscreen, setIsFullscreen] = useState(() => readBoolean(STORAGE_KEYS.wordCounterFullscreen, false));
  const [isCollapsed, setIsCollapsed] = useState(() => readBoolean(STORAGE_KEYS.wordCounterCollapsed, false));
  // true only while isCollapsed was forced by the auto-collapse check
  // below, never by the manual toggle — the collapse arrow hides itself
  // while this is true (see the render below), since clicking it would
  // just bounce straight back to collapsed on the next check(). A
  // manual collapse leaves this false, so the arrow keeps working.
  const [isAutoCollapsed, setIsAutoCollapsed] = useState(false);
  // window size (both dimensions) at the moment the auto-collapse below
  // last forced this closed — null whenever it isn't currently
  // auto-collapsed. Grown back to at least this size is this app's
  // proxy for "there's room again", since the expanded content isn't in
  // the DOM once collapsed and so can't be re-measured directly.
  const collapsedAtSizeRef = useRef<{ w: number; h: number } | null>(null);
  // shadow ref mirroring isCollapsed, reassigned every render — check()
  // below reads through this rather than the state directly, since
  // window resize and the ResizeObserver can both fire the same check
  // closure from an effect run whose state has since gone stale (same
  // hazard as the timer's own equivalent check on the HOURS/MINUTES/
  // SECONDS panel — see its comment for the concrete sequence). Reading
  // the ref means every invocation always sees the true current value
  // regardless of which listener triggered it.
  const isCollapsedRef = useRef(isCollapsed);
  isCollapsedRef.current = isCollapsed;

  useEffect(() => {
    onFullscreenChange(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);
  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterCollapsed, isCollapsed);
  }, [isCollapsed]);
  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterFullscreen, isFullscreen);
  }, [isFullscreen]);

  // hiding while fullscreen has to drop out of fullscreen too (there's no
  // such thing as a hidden-but-fullscreen view) — remembered here so
  // un-hiding restores exactly the view that was showing, fullscreen or
  // not. Routed through this one function (rather than set directly by
  // both the manual toggle below and the auto-collapse effect further
  // down) so the ref can never go stale relative to whichever path
  // actually triggered the collapse.
  const wasFullscreenBeforeCollapseRef = useRef(false);
  const collapse = () => {
    wasFullscreenBeforeCollapseRef.current = isFullscreen;
    setIsFullscreen(false);
    setIsCollapsed(true);
  };
  const toggleCollapsed = () => {
    // a manual click always means whatever happens next is deliberate —
    // clearing this keeps the auto-collapse check below from treating
    // this click's result as something it caused (and later possibly
    // reversing it out from under the user)
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

  // fullscreen has nothing else to type into, so entering it focuses the
  // textarea immediately rather than waiting for a click — otherwise a
  // keystroke right after maximizing would either land nowhere or hit
  // the global SPACE/R/S shortcuts instead of the text itself
  useEffect(() => {
    if (isFullscreen) textareaRef.current?.focus();
  }, [isFullscreen]);
  // fullscreen has nothing else to type into, so any keystroke — no
  // matter what was last clicked (a checkbox, the collapse arrow, a
  // dialog that has since closed) — should land in the textarea.
  // Refocusing on document keydown (rather than the textarea's own
  // onBlur) is what makes this work even after a click that doesn't
  // blur the textarea until later, or a dialog that opens and closes
  // without ever blurring it again. Skipped while a confirm dialog is
  // open (e.g. RESET) — that's a real, intentional destination for
  // focus, not a stray click to bounce back from.
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Radix keeps the dialog element mounted (data-state="closed")
      // through its exit animation, so matching on the role alone would
      // keep skipping refocus for that entire fade-out — gating on
      // data-state="open" makes this only wait out a dialog that's
      // actually still showing.
      if (document.querySelector('[role="alertdialog"][data-state="open"]')) return;
      textareaRef.current?.focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // auto-collapses once the timer above is eating enough of the shared
  // column that this box's own chrome (toggles, L/W/C header, totals —
  // the textarea itself is elastic and doesn't factor in) no longer fits
  // in what's left, instead of silently clipping that chrome — and
  // auto-reverses that once the window regrows past the size it
  // collapsed at (collapsedAtSizeRef; same reasoning as the timer's own
  // equivalent check on the HOURS/MINUTES/SECONDS panel — the expanded
  // content isn't in the DOM to re-measure directly once collapsed, so
  // window size is this app's proxy for "there's room again"). Skipped
  // only while fullscreen (a fixed overlay, not competing for column
  // space). That reversal only ever undoes ITS OWN collapse: a manual
  // collapse (collapsedAtSizeRef stays null, see toggleCollapsed) is
  // never fought — a manual re-open always gets a fresh measurement
  // rather than being reopened for you, and if there's still no room,
  // this puts it right back.
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
      // Two ways this box stops being usable, and only the first one
      // overflows: the chrome (toggles, L/W/C header, totals) is fixed
      // height and spills once the column can't hold it, but the
      // textarea between them is flex-1 min-h-0 and just keeps shrinking
      // — silently, down to a couple of pixels, never overflowing
      // anything. A word counter you can't fit one line of text into is
      // as tucked-in as one that's clipped, so measure the typing area
      // against a single line box (line-height plus its own padding,
      // read off the element so it tracks COUNTER_FONT_SIZE /
      // COUNTER_PADDING at whatever the current viewport makes them).
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

  useEffect(() => {
    writeRaw(STORAGE_KEYS.wordCounter, text);
  }, [text]);

  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterAlnumWordsOnly, alnumWordsOnly);
  }, [alnumWordsOnly]);

  useEffect(() => {
    writeJSON(STORAGE_KEYS.wordCounterAlnumCharsOnly, alnumCharsOnly);
  }, [alnumCharsOnly]);

  // rawWords/rawChars are the same text with nothing filtered out, which
  // is what the cap goes by (see isWithinCap) — counted in the same pass
  // rather than a second one. Lines have no filtered form.
  const { lineStats, totalLines, totalWords, totalChars, rawWords, rawChars } = useMemo(
    () => countStats(text, alnumWordsOnly, alnumCharsOnly),
    [text, alnumWordsOnly, alnumCharsOnly],
  );
  // A filter is hiding a full count when the unfiltered number is at the
  // ceiling and the one on screen isn't — the state where typing has
  // stopped and the counter you're looking at doesn't say why. That's
  // what turns the switch responsible red; turning it off shows the real
  // number, which is over the line and red on its own, and the switch
  // goes back to normal because it's no longer hiding anything.
  const wordsCapHidden = alnumWordsOnly && rawWords >= COUNTER_MAX && totalWords < COUNTER_MAX;
  const charsCapHidden = alnumCharsOnly && rawChars >= COUNTER_MAX && totalChars < COUNTER_MAX;
  // A switch is colored by the number the cap actually goes by, not the
  // one it's showing — yellow on the approach, red at the ceiling, the
  // same pair as the totals below. Filtered or not, the switch and its
  // column then agree about how close this is to stopping.
  const capColor = (raw: number, on: boolean) =>
    raw >= COUNTER_MAX ? '#ef4444' : raw >= COUNTER_WARN ? '#eab308' : on ? 'var(--app-ink)' : '#6b7280';

  // Deletions always go through — otherwise text pasted in over the cap,
  // or left over from before it existed, would be stuck there. Everything
  // else is cut to fit rather than refused (capInsertion).
  //
  // Keeping anything back means the textarea's own value is no longer
  // what the DOM has, and putting it back — React does that for us —
  // drops the caret at the end of the text. So it goes back where it was:
  // where the typing left it, less whatever didn't make it in. In a frame,
  // because the value has to be restored before the caret can be placed
  // in it.
  //
  // Then the scroll position goes back too, and after the caret rather
  // than before: placing a caret scrolls it into view, so restoring the
  // value and then the caret is two separate ways for the view to jump to
  // somewhere you weren't looking. Nothing about a refused keystroke
  // should move the page under you.
  //
  // One restore per burst, keeping the position the burst started at. Two
  // details make that necessary. It's queued rather than done here,
  // because React puts the value back after this handler returns and
  // that's what moves the view — a microtask is the first moment after it.
  // And a second keystroke can land before that microtask runs, at which
  // point the view HAS already jumped, so reading the scroll position
  // again would save the bottom of the text as the place to return to.
  // Which is exactly what spamming keys at the cap did: each key pinned
  // the jump the last one caused.
  const pendingRestoreRef = useRef<{ caret: number; top: number; left: number } | null>(null);
  const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = event.target;
    const typed = el.value;
    const accepted = typed.length <= text.length ? typed : capInsertion(text, typed);
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

  // navigator.clipboard is the whole implementation on purpose: it needs
  // a secure context, which this has everywhere it actually runs (https
  // in production, localhost in dev). The legacy execCommand fallback
  // would only ever fire where the modern one is blocked on purpose, so
  // the honest answer there is to say it failed rather than to smuggle
  // the text out through a hidden textarea.
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

  // Fullscreen means there's nothing else to interact with but this box
  // — it auto-focuses the textarea on entry (see the effect below) so
  // typing really does land there, but even if focus later shifts to
  // one of this row's own buttons (e.g. clicking RESUME), the view is
  // still "the word counter" the whole time you're in it. Everything
  // that visually reads as "focused" (green vs. red) — and the warning
  // that Space/R/S are disabled — goes by this instead of raw isFocused.
  const isActive = isFocused || isFullscreen;
  const ruleColor = isActive ? RULE_COLOR_FOCUSED : RULE_COLOR_IDLE;
  // Divider between consecutive lines only — nothing under the last line,
  // so an empty document shows no rules
  const rowDivider = (idx: number) =>
    idx < lineStats.length - 1 ? `1px solid ${ruleColor}` : undefined;

  return (
    <>
    <div
      ref={containerRef}
      className={
        isFullscreen
          // matches the p-2 sm:p-3 md:p-4 padding on Timer's own content
          // column exactly. Always full width (left-0, no reservation for
          // the presets/history sidebar) — fullscreen means fullscreen,
          // and that reclaimed width is real room this view can actually
          // use rather than leaving it sitting empty behind the sidebar's
          // former spot.
          ? 'fixed inset-0 z-[60] bg-black p-2 sm:p-3 md:p-4 flex flex-col items-start gap-1 overflow-hidden'
          // Equal flex-1 split with the timer row above it (Timer.tsx's
          // own timerRowRef is flex-1 too) — this used to lean flex-[1.15]
          // for a bit more of the shared leftover height, but that traded
          // directly against the row's own HOURS/MINUTES/SECONDS panel,
          // which has no slack left to give up before its one-directional
          // auto-tuck hides it (see timerRowRef's effect). Even split
          // gives that panel back the room it was losing.
          : `flex flex-col items-start gap-1 w-full overflow-hidden min-h-0 ${isCollapsed ? '' : 'flex-1'}`
      }
    >
      {/* Fullscreen: just the collapse arrow plus mute/repeat/digits/
          controls, in that reading order — no WORD COUNTER label,
          website link, or repeat-tip text here, freeing the row for the
          controls that actually matter while typing (Timer.tsx stops
          rendering its own copies of the mute/repeat buttons while this
          is up — see speakerButton/ringerButton — so they visibly
          relocate into this row instead of being duplicated). The
          "Spacebar/R/S disabled" warning drops too: that was about
          needing actual focus, and fullscreen auto-focuses the textarea
          and treats the whole view as active regardless (see isActive
          below), so the warning has nothing left to warn about. Only
          the CONFIRMATIONS/RESET cluster (top-right, z-[70]) still
          floats separately.
          flex-nowrap on purpose, in both versions: nothing on this row
          ever moves to a second line, however narrow the window gets.
          The fullscreen version also reserves the floating top-right
          corner as padding on this row rather than as a spacer element
          inside it — padding shrinks the line box itself, where a spacer
          only reserves while the row still fits and stops protecting
          anything the moment it doesn't, which is exactly when the corner
          lands on top of something. What running out of width does here
          is shrink the clock (see its own box below), not wrap it, move
          it, or take it away. */}
      <div
        className="flex items-center gap-3 flex-nowrap w-full"
        style={isFullscreen ? { paddingRight: headerCornerWidth ? headerCornerWidth + 24 : HEADER_CORNER_RESERVE } : undefined}
      >
        {isFullscreen ? (
          <>
            {/* arrow/ringer/speaker on the left, then the timer, then the
                clock; the two flex-1 ends center the middle of that in
                what the row's padding leaves.
                No minWidth on this cluster any more. It used to carry the
                same one as the spacer opposite, forcing the two symmetric
                so the timer landed on the row's true midpoint — but that
                spacer is gone (the corner is padding now), and reserving
                21vw here for content that measures a third of it was
                simply taking room off the only items that need it.
                No min-w-0 either, deliberately: that would let this
                cluster be squeezed to nothing while its own buttons (each
                flex-shrink-0) spilled out over the timer beside them. Left
                on min-width auto it can't go below its content, and its
                content is what the row counts when deciding what wraps. */}
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
            {/* countdown, bar and buttons as one block that never splits.
                gap-2 rather than the row's gap-3: this is the densest run
                in the app, and the 4px a gap gives back is 12px across it. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {timerDigits}
              {timerBar}
              {timerControls}
            </div>
            {/* The clock gets whatever room is left after the timer, and
                is sized from it: this box is flex-1 (so it IS the leftover,
                between the buttons and the padding held for the corner)
                and an inline-size container, so the clock inside can be
                measured in cqi — percent of that leftover — rather than in
                vw. That's the difference that matters. Every vw clamp in
                the app bottoms out on a rem floor somewhere, and past that
                point the window keeps narrowing while the clock doesn't,
                which is what put it under the corner. A cqi size has
                nothing to bottom out against: less room means a smaller
                clock, at every width, without wrapping, moving down, or
                disappearing.
                It has to be on this row at all rather than in that corner
                because the corner is painted above this view (z-[70] over
                z-[60]) — anything of ours it reaches, it covers. */}
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

      {/* gap-1 on the box below, not gap-3: three fixed 12px gaps
          between its four children is 36px of nothing, spent whether the
          window has room or not, and every pixel of it comes straight
          off the typing area — the only part of this box anyone
          actually uses. Same reasoning as the padding trims inside. */}
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
              // colored like the switch beside it, and for the sharper
              // version of the same reason: a line of "$$$$$" counts as no
              // characters here, so C can read far under a limit the text
              // is already sitting on
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
                {/* Same conditional as Clear — there's nothing to copy
                    from an empty box either. The label reports the
                    result rather than assuming it: writeText can be
                    refused (denied permission, or a non-secure context),
                    and a Copy button that looks identical whether or not
                    anything reached the clipboard is worse than one that
                    says so. minWidth holds the box at its longest label
                    so Clear and the fullscreen toggle beside it don't
                    shuffle sideways when it changes. */}
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
            {/* filled red while fullscreen: it's the one way back out of a
                view that covers everything else, so it reads as the exit
                rather than as one more square in the row */}
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
        {/* pb-1 rather than pb-3, and no gap: this wrapper has exactly
            one child, so its gap-2 was never anything but dead height */}
        <div className="flex flex-col px-3 pb-1 flex-1 overflow-hidden min-h-0">
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
                    {/* the row's own height is a text line exactly (see
                        above), so a number that shrinks to fit its column
                        can't be allowed to change it — hence a font-size
                        on the number and not on the row */}
                    <div className="grid grid-cols-3 text-center text-white font-bold flex-shrink-0" style={{ width: COUNTER_COLUMN_WIDTH }}>
                      <div className="overflow-hidden" style={{ fontSize: countFontSize(idx + 1) }}>{countLabel(idx + 1)}</div>
                      <div
                        className={`overflow-hidden border-l-2 border-r-2 ${isActive ? 'border-green-500' : 'border-white'}`}
                        style={{ fontSize: countFontSize(stat.wordCount) }}
                      >
                        {countLabel(stat.wordCount)}
                      </div>
                      <div className="overflow-hidden" style={{ fontSize: countFontSize(stat.charCount) }}>{countLabel(stat.charCount)}</div>
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
        <div className="flex justify-between items-start px-3 pb-1 gap-4" style={{ fontSize: shrinkClamp(0.5, 1, 1.1, 0.65) }}>
          <div className="text-white font-bold flex flex-col gap-0">
            <div className="text-white mb-0.5" style={{ fontSize: shrinkClamp(0.35, 0.8, 0.9, 0.55) }}>TOTAL</div>
            {/* yellow on the way to the cap, red at it — the same pair of
                warning colors the timer itself uses for "nearly" and
                "stop". A red one is the reason typing has stopped.
                A total that's full shows the number that's full, even
                when a switch above is filtering that column down to
                something smaller: the limit is why typing stopped, so the
                limit is what it has to say. The switch responsible goes
                red too (see wordsCapHidden), so it's clear which one to
                turn off to make the column agree with the number. */}
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
                    className="border border-white px-1 py-0.5 bg-black overflow-hidden"
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
