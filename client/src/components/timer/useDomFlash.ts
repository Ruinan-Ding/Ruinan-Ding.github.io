import { useEffect, useRef, useState } from 'react';
import type { FlashTarget } from './types';
import { FLASH_DURATION_MS } from './useFlashOnToken';

// Cleared before applying a new one, so switching kinds mid-fade doesn't
// leave two animation values fighting on the same element.
const ALL_FLASH_CLASSES = [
  'animate-insertFlash',
  'animate-insertWarnFlash',
  'animate-insertFullFlash',
  'animate-loadFlash',
  'animate-duplicateFlash',
  'animate-correctFlashText',
];

// Replays a CSS animation that may still be running. Toggling a
// React-driven className isn't enough: the browser can coalesce the two
// DOM mutations before painting the removed state, and the animation keeps
// counting from where it was. Removing the class, forcing a reflow and
// re-adding it is what actually restarts it, which means going around
// React's className diffing for this one property.
//
// flashKey must change on every trigger, repeats of the same id included,
// so a reselect within the flash window replays rather than no-ops.
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

// Resolves which flash applies to a list row and returns the ref to hang
// on its button. Where two target the same id the newer intent wins:
// duplicate over load, load over insert.
//
// insertClass is which of the three tones an insert gets, which the caller
// decides from how full the list now is.
export function useEntryFlash(
  id: string,
  inserted: FlashTarget,
  loaded: FlashTarget,
  duplicate: FlashTarget = null,
  insertClass = 'animate-insertFlash',
) {
  const ref = useRef<HTMLButtonElement>(null);
  const flash = duplicate?.id === id
    ? { key: `duplicate:${duplicate.token}`, className: 'animate-duplicateFlash' }
    : loaded?.id === id
      ? { key: `load:${loaded.token}`, className: 'animate-loadFlash' }
      : inserted?.id === id
        ? { key: `insert:${inserted.token}:${insertClass}`, className: insertClass }
        : { key: null, className: '' };
  useDomFlash(ref, flash.key, flash.className);
  return ref;
}

// A row plays its fizz-out (removeFizz in index.css) and only leaves the
// list once the animation ends, so it isn't yanked out mid-frame. Driven
// by animationend so retuning the duration can't desync the two, with a
// timeout fallback: animationend never fires when the animation is
// suppressed (prefers-reduced-motion, a throttled background tab), and the
// row still has to be deletable.
export function useFizzRemove(onRemove: () => void) {
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    if (!isRemoving) return;
    const timeoutId = setTimeout(onRemove, 700);
    return () => clearTimeout(timeoutId);
  }, [isRemoving, onRemove]);

  return {
    isRemoving,
    start: () => setIsRemoving(true),
    onAnimationEnd: (e: React.AnimationEvent) => {
      if (isRemoving && e.animationName === 'removeFizz') onRemove();
    },
  };
}
