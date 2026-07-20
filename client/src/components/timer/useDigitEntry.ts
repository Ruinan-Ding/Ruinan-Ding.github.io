import { useEffect, useRef } from 'react';

interface DigitEntryHandlers {
  /** append raw text; the owner filters non-digits and enforces its cap */
  append: (text: string) => void;
  /** remove the last digit */
  remove: () => void;
  /** Enter, with or without modifiers */
  onCommit?: () => void;
  /** Escape */
  onCancel?: () => void;
  /** ArrowUp (+1) / ArrowDown (-1) */
  onStep?: (direction: 1 | -1) => void;
}

// Shared plumbing for the calculator-style digit inputs (the HH/MM/SS
// fields and the preset input): digits enter from the right, the caret
// stays pinned at the end, and every entry path funnels into the same
// append/remove pair.
//
// Physical keys are handled on keydown. Everything else — soft keyboards
// that send key='Unidentified', paste, drop — arrives through a NATIVE
// beforeinput listener: React's synthetic onBeforeInput is synthesized from
// textInput/keypress and never fires for deletions (nor for paste in
// Firefox), so it can't cover these. onPaste stays as a fallback for
// engines without native beforeinput support.
export function useDigitEntry(
  inputRef: React.RefObject<HTMLInputElement | null>,
  value: string,
  handlers: DigitEntryHandlers
) {
  // the native listener registers once; the ref keeps its handlers fresh
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleBeforeInput = (e: InputEvent) => {
      // composition edits settle through the controlled value instead
      if (e.isComposing) return;
      e.preventDefault();
      if (e.inputType.startsWith('delete')) {
        handlersRef.current.remove();
      } else {
        const data = e.data ?? e.dataTransfer?.getData('text') ?? '';
        if (data) handlersRef.current.append(data);
      }
    };
    el.addEventListener('beforeinput', handleBeforeInput);
    return () => el.removeEventListener('beforeinput', handleBeforeInput);
  }, [inputRef]);

  // keep the caret parked at the end as the value changes
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [inputRef, value]);

  // digits enter from the right, so the caret always belongs at the end;
  // onSelect catches every way it could move (click, drag, arrow keys)
  const pinCaret = (el: HTMLInputElement) => {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // preventDefault, or the same key press can activate whatever button
      // a confirmation dialog focuses as it opens
      e.preventDefault();
      handlersRef.current.onCommit?.();
      return;
    }
    if (e.key === 'Escape') {
      handlersRef.current.onCancel?.();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // modifiers included — Ctrl+Backspace still deletes a digit
      e.preventDefault();
      handlersRef.current.remove();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      handlersRef.current.onStep?.(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    // remaining shortcuts (Ctrl+V/C/A) keep their defaults — cancelling
    // the keydown would also cancel the paste it triggers
    if (e.ctrlKey || e.metaKey) return;
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      handlersRef.current.append(e.key);
    } else if (e.key.length === 1) {
      e.preventDefault();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    handlersRef.current.append(e.clipboardData.getData('text'));
  };

  const handleSelect = (e: React.SyntheticEvent<HTMLInputElement>) => {
    pinCaret(e.target as HTMLInputElement);
  };

  return { handleKeyDown, handlePaste, handleSelect, pinCaret };
}
