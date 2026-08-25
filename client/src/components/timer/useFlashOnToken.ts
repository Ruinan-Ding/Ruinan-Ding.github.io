import { useEffect, useRef, useState } from 'react';

// Matches the CSS flash animations' own duration (index.css).
export const FLASH_DURATION_MS = 1200;

// Flips off then on a tick later whenever the token changes, so a CSS
// flash replays on back-to-back triggers: setting a class to the value it
// already holds doesn't restart an animation.
//
// setTimeout rather than requestAnimationFrame, which only fires once the
// tab is being composited and can stall past the animation's own duration
// in a background tab. The class is dropped again afterwards, or
// animation-fill-mode: forwards pins the property at its end value and
// blocks any later change to it.
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
