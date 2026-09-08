import { useEffect, useRef, useState } from 'react';
import { TYPES_INTO } from './constants';

export type KeyCode = 'Tab' | 'KeyR' | 'KeyS';

// How long a released key holds its button white. Long enough to read as
// a press on a tap too quick to see held, short enough that the length the
// list rows use would still be on when the next one lands. It lands at
// once and fades out over the 200ms the buttons carry, so this is how long
// it holds at full white before that starts.
const KEY_PRESS_MS = 320;

type TimerKeys = {
  // Whether the key would do anything, asked before the button lights up,
  // so a refused one lights nothing: S and R are refused on an untouched
  // timer, and the dialog owns the keyboard while it is open.
  isDialogOpen: boolean;
  isIdleAtConfigured: boolean;
  isWindowFocused: boolean;
  onTab: () => void;
  onStop: () => void;
  onReset: () => void;
};

// Tab/S/R mirror the on-screen controls, and give back which key is down
// and which just came up so those buttons can colour themselves.
//
// Everything the listeners need goes through a ref reassigned each render,
// which is what lets them register once instead of rebinding every tick —
// and is also why this hook is called below the handlers it runs rather
// than beside the rest of the state: they are consts declared further down
// the component, and only a closure reaches them.
export function useTimerKeys({ isDialogOpen, isIdleAtConfigured, isWindowFocused, onTab, onStop, onReset }: TimerKeys) {
  const keyLiveRef = useRef<(code: KeyCode) => boolean>(() => false);
  keyLiveRef.current = (code) => {
    if (isDialogOpen) return false;
    if (code === 'Tab') return true;
    return !isIdleAtConfigured;
  };
  // Reports whether it did anything: a key can be refused between going
  // down and coming up, and one that did nothing must not flash as though
  // it worked.
  const keyActionRef = useRef<(code: KeyCode) => boolean>(() => false);
  keyActionRef.current = (code) => {
    if (!keyLiveRef.current(code)) return false;
    if (code === 'Tab') onTab();
    if (code === 'KeyS') onStop();
    if (code === 'KeyR') onReset();
    return true;
  };

  // Down colours the button and does nothing else; up moves the run and
  // holds the colour a beat longer, so a tap too quick to see held still
  // reads as a press.
  //
  // Set straight rather than through useFlashOnToken, which turns on a
  // tick later: batched with the release that clears heldKey, that tick
  // is a frame of the armed white between the two colours.
  const [heldKey, setHeldKey] = useState<KeyCode | null>(null);
  const [firedKey, setFiredKey] = useState<KeyCode | null>(null);
  const heldKeyRef = useRef<KeyCode | null>(null);
  heldKeyRef.current = heldKey;
  const firedTimerRef = useRef(0);
  const markFired = (code: KeyCode) => {
    window.clearTimeout(firedTimerRef.current);
    setFiredKey(code);
    firedTimerRef.current = window.setTimeout(() => setFiredKey(null), KEY_PRESS_MS);
  };
  useEffect(() => () => window.clearTimeout(firedTimerRef.current), []);
  // The window going away takes the keyup with it, and the button would
  // hold its colour for good. Off the focus the component already tracks
  // rather than a listener of its own.
  useEffect(() => {
    if (!isWindowFocused) setHeldKey(null);
  }, [isWindowFocused]);

  useEffect(() => {
    const codeOf = (e: KeyboardEvent): KeyCode | null =>
      (e.key === 'Tab' ? 'Tab' : e.code === 'KeyS' || e.code === 'KeyR' ? e.code : null);
    const handleKeyDown = (e: KeyboardEvent) => {
      const action = codeOf(e);
      if (!action) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // A text field keeps its own keys: TAB moves out of one, and S and R
      // are letters someone is typing. Everywhere else these three are the
      // timer's, which for TAB means the page gives up focus stepping
      // outside its fields — the trade the shortcut is worth having.
      // Buttons are deliberately not exempt: blocking S and R there would
      // kill both shortcuts for anyone who had just clicked something.
      if ((e.target as HTMLElement | null)?.closest?.(TYPES_INTO)) return;
      if (!keyLiveRef.current(action)) return;
      // Every repeat too, or the browser takes the held TAB and walks the
      // focus ring with it.
      e.preventDefault();
      // Autorepeat is not three hundred presses. Nothing here acts on the
      // way down any more, but the state still shouldn't churn at ~30Hz.
      if (e.repeat) return;
      setHeldKey(action);
    };
    // Where the run actually moves. Guarded on this key having been the
    // one taken on the way down, so a TAB released over the page after
    // being pressed inside a text field isn't the timer's to act on.
    const handleKeyUp = (e: KeyboardEvent) => {
      const action = codeOf(e);
      if (!action || heldKeyRef.current !== action) return;
      setHeldKey(null);
      if (keyActionRef.current(action)) markFired(action);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  return { heldKey, firedKey };
}
