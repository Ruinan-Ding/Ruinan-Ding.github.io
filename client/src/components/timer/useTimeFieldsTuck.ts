import { usePersisted } from '@/hooks/usePersisted';
import { readBoolean } from '@/lib/storage';
import { useEffect, useRef, useState } from 'react';
import { STORAGE_KEYS } from './constants';

// Whether the HOURS/MINUTES/SECONDS panel is showing and what shape it
// takes. Hidden, stacked and auto-tucked come out of here together
// because they're one decision: the panel gets narrower before it gets
// hidden, and whatever hides it has to be what brings it back.
//
// Tucking is the last rung of the ladder, not the first response. In
// order: inline, stacked (a third of the width), 3-across if the row is
// too short for the stack (.time-fields-box in index.css), inline again,
// tucked. Narrower or shorter always beats disappearing.
export function useTimeFieldsTuck(isRowLayout: boolean, isWideLayout: boolean) {
  // Manual hide, persisted, so a tucked-in panel stays tucked in across a
  // reload. Only the site RESET brings it back.
  const [isHidden, setIsHidden] = useState(() => readBoolean(STORAGE_KEYS.timeFieldsHidden, false));
  // True only when the auto-tuck below forced it. The "Show" arrow hides
  // itself while this is set, since clicking would bounce straight back on
  // the next check().
  const [isAutoTucked, setIsAutoTucked] = useState(false);
  // Only a manual hide persists. An auto-tuck is a reaction to one window
  // size, and the check that reverses it needs tuckedNeedsRef, which is in
  // memory and gone on reload, so saving one would hide the panel for good
  // at every later size.
  usePersisted(STORAGE_KEYS.timeFieldsHidden, isHidden && !isAutoTucked);

  // The row holding the website link, the digits and, at sm+, the panel.
  // Measured directly so the auto-tuck reacts to what actually doesn't fit
  // rather than an assumed size.
  const rowRef = useRef<HTMLDivElement | null>(null);
  // The panel itself, so the height check can ask whether this is what
  // overflows the row rather than reading the row's own scrollHeight.
  const panelRef = useRef<HTMLDivElement | null>(null);

  // What the row NEEDED to keep the panel, measured with the panel still
  // in it, or null when it isn't auto-tucked. Once hidden the panel is out
  // of the DOM and can't be re-measured, so this is the proxy for "there's
  // room again".
  //
  // Deliberately not the row's size at that moment: hiding the panel
  // doesn't change that size, so "grown back to what it was" is already
  // true the instant it tucks, and the panel bounces in and out forever.
  const tuckedNeedsRef = useRef<{ w: number; h: number } | null>(null);
  // check() reads state through refs. Window resize, the ResizeObserver
  // and the deferred fonts.ready callback can all fire the same closure
  // from an effect run whose state has gone stale: check() flips isHidden,
  // and fonts.ready, registered in that same call, still fires against the
  // pre-flip closure.
  const isHiddenRef = useRef(isHidden);
  isHiddenRef.current = isHidden;
  const isAutoTuckedRef = useRef(isAutoTucked);
  isAutoTuckedRef.current = isAutoTucked;
  // Stacked is the narrow form but also the taller one, so a window that's
  // both narrow and short can't have it, and this overrides the breakpoint
  // back to inline rather than tucking the panel away. It records a need
  // for the same reason tuckedNeedsRef does.
  const [isInlinedByHeight, setIsInlinedByHeight] = useState(false);
  const inlinedByHeightNeedsRef = useRef<number | null>(null);
  const isInlinedByHeightRef = useRef(isInlinedByHeight);
  isInlinedByHeightRef.current = isInlinedByHeight;
  // Stacked: label above the digit box. Inline: label beside it.
  const isStacked = !isWideLayout && !isInlinedByHeight;
  const isStackedRef = useRef(isStacked);
  isStackedRef.current = isStacked;
  const isRowLayoutRef = useRef(isRowLayout);
  isRowLayoutRef.current = isRowLayout;

  // Tucks the panel away once the row is genuinely too cramped for it, and
  // reverses once the row grows back past what the panel needed. That
  // reversal only ever undoes its own hide: a manual hide leaves
  // tuckedNeedsRef null and is never fought.
  //
  // Below sm the panel isn't rendered at all. The row is a column there,
  // and under the digits this reads as part of the countdown rather than a
  // control for it.
  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const check = () => {
      if (!isRowLayoutRef.current) {
        tuckedNeedsRef.current = null;
        // A manual hide is left alone here. Only a hide that isn't an
        // auto-tuck persists, so relabelling one as an auto-tuck let a
        // single visit on a narrow window erase the preference.
        if (isHiddenRef.current && !isAutoTuckedRef.current) return;
        if (!isHiddenRef.current || !isAutoTuckedRef.current) {
          setIsHidden(true);
          setIsAutoTucked(true);
        }
        return;
      }
      if (isHiddenRef.current && isAutoTuckedRef.current && !tuckedNeedsRef.current) {
        setIsHidden(false);
        setIsAutoTucked(false);
        return;
      }
      // A few px of tolerance throughout: sub-pixel rounding off
      // fractional clamp() results and font metrics is enough to trip a
      // bare `>` and tuck the panel over an overflow nobody can see.
      const tooWide = el.scrollWidth > el.clientWidth + 4;
      // The panel's own box against the row's, not the row's scrollHeight.
      // The digits column is the tallest thing here, so on a short window
      // it's what overflows, and tucking the panel for that frees no
      // vertical space at all. getBoundingClientRect because the panel's
      // offsetParent is the column wrapper rather than the row.
      const panel = panelRef.current;
      let tooTall = false;
      let neededHeight = 0;
      if (panel) {
        const rowRect = el.getBoundingClientRect();
        const panelRect = panel.getBoundingClientRect();
        neededHeight = panelRect.bottom - rowRect.top;
        tooTall = neededHeight > el.clientHeight + 4;
      }

      // A row that's short rather than narrow is better served by going
      // back to inline than by losing the panel. Only once inline also
      // doesn't fit does this fall through to the tuck below.
      if (!isHiddenRef.current && tooTall && isStackedRef.current) {
        inlinedByHeightNeedsRef.current = neededHeight;
        setIsInlinedByHeight(true);
        return;
      }

      // `panel &&`: only something rendered can be tucked. Once it is, the
      // row's remaining overflow belongs to the digits column, and must
      // not re-record a need this can no longer measure or turn a manual
      // hide into an auto-tuck the branch above would undo.
      if (panel && (tooWide || tooTall)) {
        // Recorded while the panel is still measurable, and as what it
        // needed rather than what the row had.
        tuckedNeedsRef.current = { w: el.scrollWidth, h: neededHeight };
        setIsHidden(true);
        setIsAutoTucked(true);
        return;
      }

      // >= is honest here only because tuckedNeedsRef holds what the
      // panel NEEDED rather than what the row had: the need is by
      // construction more than the row could give, so this can't be true
      // at the moment of tucking the way a recorded row size was.
      if (
        tuckedNeedsRef.current &&
        el.clientWidth >= tuckedNeedsRef.current.w &&
        el.clientHeight >= tuckedNeedsRef.current.h
      ) {
        tuckedNeedsRef.current = null;
        setIsHidden(false);
        setIsAutoTucked(false);
        return;
      }

      // The row has the height the stacked form wanted, so hand the
      // decision back to the breakpoint.
      if (
        isInlinedByHeightRef.current &&
        (!inlinedByHeightNeedsRef.current || el.clientHeight >= inlinedByHeightNeedsRef.current)
      ) {
        inlinedByHeightNeedsRef.current = null;
        setIsInlinedByHeight(false);
      }
    };
    check();
    window.addEventListener('resize', check);
    const resizeObserver = new ResizeObserver(check);
    resizeObserver.observe(el);
    // The first check can land before the monospace font swaps in,
    // measuring the narrower fallback and missing an overflow that only
    // appears once the real font's wider digits load.
    document.fonts?.ready.then(check);
    return () => {
      window.removeEventListener('resize', check);
      resizeObserver.disconnect();
    };
  }, [isHidden, isAutoTucked, isInlinedByHeight, isRowLayout, isWideLayout]);

  // The two arrows. Clearing the recorded need is what tells check() this
  // was a decision rather than a measurement, so it doesn't undo it.
  const setHidden = (hidden: boolean) => {
    tuckedNeedsRef.current = null;
    setIsAutoTucked(false);
    setIsHidden(hidden);
  };

  return { isHidden, isAutoTucked, isStacked, rowRef, panelRef, setHidden };
}
