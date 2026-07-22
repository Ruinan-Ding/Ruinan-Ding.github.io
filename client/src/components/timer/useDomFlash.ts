import { useEffect, useRef } from 'react';
import { FLASH_DURATION_MS } from './useFlashOnToken';

// Every class useDomFlash might ever apply to an element, so a switch
// between flash kinds (e.g. a preset's insert flash still fading when it
// gets loaded) always starts from a clean slate instead of leaving the
// previous kind's class sitting alongside the new one — two "animation"
// values on the same element otherwise fight over which one the browser
// actually renders.
const ALL_FLASH_CLASSES = ['animate-insertFlash', 'animate-loadFlash'];

// Toggling a React-driven className isn't enough to replay a still-running
// CSS animation: even when state genuinely flips false->true across two
// renders, the browser can coalesce those DOM mutations before ever
// painting the "removed" state, so the animation just keeps counting up
// from wherever it was instead of restarting (confirmed via
// element.getAnimations()[0].currentTime never resetting). The reliable
// fix is a real DOM class removal, a forced synchronous reflow, then
// re-adding the class — bypassing React's className diffing entirely for
// this one property, driven directly off the ref. flashKey should change
// on every trigger (e.g. `${kind}:${token}`), including repeats of the
// same underlying id, so a reselect within the flash window replays it.
export function useDomFlash(ref: React.RefObject<HTMLElement | null>, flashKey: string | null, className: string) {
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (flashKey === null || flashKey === prevKeyRef.current) return;
    prevKeyRef.current = flashKey;
    const el = ref.current;
    if (!el) return;

    el.classList.remove(...ALL_FLASH_CLASSES);
    void el.offsetWidth; // force a reflow so the removal actually takes effect before re-adding
    el.classList.add(className);

    const timeoutId = setTimeout(() => el.classList.remove(className), FLASH_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [flashKey, className, ref]);
}
