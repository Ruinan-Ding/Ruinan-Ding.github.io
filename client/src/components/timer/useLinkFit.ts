import { useEffect, useRef, useState } from 'react';

// How close the link's X may get to the buttons on its left before the
// pair is dropped. Small, because the point is to stop them touching
// rather than to keep them apart.
const CLEARANCE = 8;

// Whether the website link still clears the header buttons beside it.
//
// This can't be a media query, which is what it was: the link is centred
// in the timer row while the buttons sit at the row's left edge, so the
// width where the two meet moves with the sidebar and the
// HOURS/MINUTES/SECONDS panel. Pinned to the viewport it dropped the link
// at 1150px however much room was actually there, which with the sidebar
// hidden left 222px of clear space between them.
//
// A container query can't do it either. The link's font-size clamps on vw
// while the buttons' position depends on the row, so no single width
// describes the crossing in both states.
//
// So it is measured, the same way the panel's auto-tuck is, and it records
// what the row NEEDED rather than what the row had: hiding the link
// doesn't widen the row, so "grown back to what it was" would be true the
// moment it went and the link would flicker in and out at one size.
export function useLinkFit(
  bandRef: React.RefObject<HTMLDivElement | null>,
  leftButtonsRef: React.RefObject<HTMLDivElement | null>,
  rowRef: React.RefObject<HTMLDivElement | null>
) {
  const [isCrowded, setIsCrowded] = useState(false);
  const isCrowdedRef = useRef(isCrowded);
  isCrowdedRef.current = isCrowded;
  const neededRef = useRef<number | null>(null);

  useEffect(() => {
    const check = () => {
      const row = rowRef.current;
      if (!row) return;
      const have = row.clientWidth;
      if (isCrowdedRef.current) {
        if (neededRef.current !== null && have >= neededRef.current) {
          neededRef.current = null;
          setIsCrowded(false);
        }
        return;
      }
      const band = bandRef.current;
      const buttons = leftButtonsRef.current;
      if (!band || !buttons) return;
      const gap = band.getBoundingClientRect().left - buttons.getBoundingClientRect().right;
      if (gap < CLEARANCE) {
        neededRef.current = have + (CLEARANCE - gap);
        setIsCrowded(true);
      }
    };
    check();
    window.addEventListener('resize', check);
    const observer = new ResizeObserver(check);
    if (rowRef.current) observer.observe(rowRef.current);
    // The label is monospace and the fallback is narrower, so the first
    // check can clear a gap the real font would not.
    document.fonts?.ready.then(check);
    return () => {
      window.removeEventListener('resize', check);
      observer.disconnect();
    };
  }, [bandRef, leftButtonsRef, rowRef, isCrowded]);

  return isCrowded;
}
