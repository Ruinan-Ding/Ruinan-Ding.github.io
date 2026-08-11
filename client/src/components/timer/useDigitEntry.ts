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
  /** "-" typed: flip the sign of the value being entered */
  onToggleSign?: () => void;
}

// Shared plumbing for the calculator-style digit inputs: digits enter from
// the right, the caret stays pinned at the end, and every entry path
// funnels into the same append/remove pair.
//
// Physical keys are handled on keydown. Soft keyboards sending
// key='Unidentified', paste and drop arrive through a native beforeinput
// listener instead: React's synthetic onBeforeInput is synthesised from
// textInput/keypress and never fires for deletions, nor for paste in
// Firefox. onPaste stays as a fallback for engines without beforeinput.
export function useDigitEntry(
  inputRef: React.RefObject<HTMLInputElement | null>,
  value: string,
  handlers: DigitEntryHandlers
) {
  // The native listener registers once; this keeps its handlers fresh.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handleBeforeInput = (e: InputEvent) => {
      // Composition edits settle through the controlled value instead.
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

  // Keeps the caret parked at the end as the value changes.
  useEffect(() => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [inputRef, value]);

  // Digits enter from the right, so the caret belongs at the end. onSelect
  // catches every way it could move: click, drag, arrow keys.
  const pinCaret = (el: HTMLInputElement) => {
    const end = el.value.length;
    if (el.selectionStart !== end || el.selectionEnd !== end) {
      el.setSelectionRange(end, end);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // Or the same keypress activates whatever button a confirmation
      // dialog focuses as it opens.
      e.preventDefault();
      handlersRef.current.onCommit?.();
      return;
    }
    if (e.key === 'Escape') {
      handlersRef.current.onCancel?.();
      return;
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      // Modifiers included, so Ctrl+Backspace still deletes one digit.
      e.preventDefault();
      handlersRef.current.remove();
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      handlersRef.current.onStep?.(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    // Ctrl+V/C/A keep their defaults: cancelling the keydown would cancel
    // the paste it triggers.
    if (e.ctrlKey || e.metaKey) return;
    // A toggle rather than a character: pressing it again takes the sign
    // back off, and it works from anywhere in the entry rather than only
    // in front. The digits it would otherwise be filtered out of never see
    // it — the sign isn't part of them.
    if (e.key === '-' && handlersRef.current.onToggleSign) {
      e.preventDefault();
      handlersRef.current.onToggleSign();
      return;
    }
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
