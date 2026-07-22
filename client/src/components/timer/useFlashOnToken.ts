import { useEffect, useRef, useState } from 'react';

// Matches the CSS flash animations' own duration (index.css).
export const FLASH_DURATION_MS = 1200;

// Flips off then on a tick later whenever token changes, so a CSS "flash"
// animation replays even on back-to-back triggers — toggling a class to
// the value it already holds doesn't replay a CSS animation, so a
// same-state retrigger needs a genuine off/on cycle. setTimeout rather
// than requestAnimationFrame: rAF only fires once the tab is actually
// being composited, so it can stall well past the animation's own
// duration while the tab is backgrounded. Also drops the class again
// once the animation's had time to finish — left on, animation-fill-mode:
// forwards would pin the animated property at its end value indefinitely,
// blocking any later style change to that same property.
export function useFlashOnToken(token: number): boolean {
  const [isFlashing, setIsFlashing] = useState(false);
  const prevTokenRef = useRef(token);

  useEffect(() => {
    if (token === prevTokenRef.current) return;
    prevTokenRef.current = token;
    setIsFlashing(false);
    const id = setTimeout(() => setIsFlashing(true), 0);
    return () => clearTimeout(id);
  }, [token]);

  useEffect(() => {
    if (!isFlashing) return;
    const id = setTimeout(() => setIsFlashing(false), FLASH_DURATION_MS);
    return () => clearTimeout(id);
  }, [isFlashing]);

  return isFlashing;
}
