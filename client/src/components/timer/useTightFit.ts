import { useEffect, useRef, useState } from 'react';

// Drop something once it would touch whatever sits beside it.
//
// Three places need this and none of them can say it as a width. The
// website link is centred in a row whose left edge moves with the sidebar;
// the sidebar counts depend on their own text, so "2/1000" and "1000/1000"
// reach Clear at different sizes; the timer hints grow from the middle of a
// column that starts after the sidebar. A media query sees the viewport and
// a container query sees one box, and neither is the sum that matters.
//
// `measure` returns the gap in px, or null when there is nothing to
// collide with. `container` is what the recovery is judged on: this
// records what the container NEEDED rather than what it had, because
// dropping the piece is exactly what reopens the gap it was dropped for.
// Compared against the container's own width it would come back the
// instant it went and flicker at one size.
export function useTightFit(
  measure: () => number | null,
  container: React.RefObject<HTMLElement | null>,
  clearance: number,
  // Anything that changes what `measure` would return without resizing the
  // container, e.g. a count going from 9 to 10 in a fixed-width sidebar.
  watch?: unknown
) {
  const [isTight, setIsTight] = useState(false);
  const isTightRef = useRef(isTight);
  isTightRef.current = isTight;
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const neededRef = useRef<number | null>(null);

  // A changed `watch` is a fresh question: the recorded need was for the
  // old content, and new content may well fit.
  useEffect(() => {
    neededRef.current = null;
    setIsTight(false);
  }, [watch]);

  useEffect(() => {
    const check = () => {
      const box = container.current;
      if (!box) return;
      const have = box.clientWidth;
      if (isTightRef.current) {
        if (neededRef.current !== null && have >= neededRef.current) {
          neededRef.current = null;
          setIsTight(false);
        }
        return;
      }
      const gap = measureRef.current();
      if (gap === null) return;
      if (gap < clearance) {
        neededRef.current = have + (clearance - gap);
        setIsTight(true);
      }
    };
    // One pass per resize is one too few. Dropping the piece changes the
    // layout that decides whether to drop it, and a pass that bails —
    // because the two boxes weren't level yet, or the gap hadn't settled —
    // records nothing, so nothing brings it back. A window resized in one
    // jump then keeps whatever the first frame happened to say: measured
    // over 182 viewports, two of them sat with the clock 12px under the
    // speaker until something else moved. A second look on the next frame
    // costs one rect read and settles both cases.
    // Two of them, because the state this reads is the state it writes:
    // dropping the piece reopens the gap, restoring it closes one, and
    // each pass can only move one step. The frame after covers a drop
    // React has committed but the browser hasn't laid out; the short delay
    // after that covers the other direction, where a piece coming back
    // widens its row only once it has actually rendered.
    let queued = 0;
    let later = 0;
    const checkSoon = () => {
      check();
      cancelAnimationFrame(queued);
      window.clearTimeout(later);
      queued = requestAnimationFrame(check);
      later = window.setTimeout(check, 150);
    };
    checkSoon();
    window.addEventListener('resize', checkSoon);
    const observer = new ResizeObserver(checkSoon);
    if (container.current) observer.observe(container.current);
    // The app is monospace with a narrower fallback, so a first check
    // before the real font lands can clear a gap that it won't.
    document.fonts?.ready.then(check);
    return () => {
      cancelAnimationFrame(queued);
      window.clearTimeout(later);
      window.removeEventListener('resize', checkSoon);
      observer.disconnect();
    };
  }, [container, clearance, isTight, watch]);

  return isTight;
}

// The gap between two boxes, or null if either isn't rendered.
export const gapBetween = (
  left: React.RefObject<HTMLElement | null>,
  right: React.RefObject<HTMLElement | null>
) => () => {
  const a = left.current;
  const b = right.current;
  if (!a || !b) return null;
  return b.getBoundingClientRect().left - a.getBoundingClientRect().right;
};

// The same gap, but only where the two boxes share a horizontal band.
// Two things at different heights pass each other without touching, and a
// bare left-of/right-of test would drop the piece anyway: on a tall window
// the wall clock sits well below the top-left buttons and overlaps their
// column the whole time without ever meeting them. null means "not level,
// so nothing to collide with", which is what useTightFit already treats as
// no collision.
export const gapWhenLevel = (
  left: React.RefObject<HTMLElement | null>,
  right: React.RefObject<HTMLElement | null>
) => () => {
  const a = left.current;
  const b = right.current;
  if (!a || !b) return null;
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  if (rb.top >= ra.bottom || rb.bottom <= ra.top) return null;
  return rb.left - ra.right;
};

// The gap between a box's left edge and the inside of the box it sits in,
// which is what "reaches the sidebar, or the window edge once the sidebar
// is tucked" comes to: the row already starts where the sidebar ends.
export const gapFromLeftEdge = (
  inner: React.RefObject<HTMLElement | null>,
  outer: React.RefObject<HTMLElement | null>
) => () => {
  const a = inner.current;
  const b = outer.current;
  if (!a || !b) return null;
  return a.getBoundingClientRect().left - b.getBoundingClientRect().left;
};
