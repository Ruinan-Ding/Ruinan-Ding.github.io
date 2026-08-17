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
    check();
    window.addEventListener('resize', check);
    const observer = new ResizeObserver(check);
    if (container.current) observer.observe(container.current);
    // The app is monospace with a narrower fallback, so a first check
    // before the real font lands can clear a gap that it won't.
    document.fonts?.ready.then(check);
    return () => {
      window.removeEventListener('resize', check);
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

// How much room is left over inside the box something sits in. This is
// what "reaches the corner" comes to where a row already reserves the
// corner's width as padding: the piece can never actually touch it, it
// just runs out of the room it was left, and does it at the same moment.
export const roomInParent = (inner: React.RefObject<HTMLElement | null>) => () => {
  const el = inner.current;
  const box = el?.parentElement;
  if (!el || !box) return null;
  return box.clientWidth - el.scrollWidth;
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
