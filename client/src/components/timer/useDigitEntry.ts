import { useRef } from 'react';

interface DigitEntryHandlers {
  /** the whole value after an edit, already filtered to digits and capped */
  setValue: (digits: string) => void;
  /** Enter, with or without modifiers */
  onCommit?: () => void;
  /** Escape */
  onCancel?: () => void;
  /** ArrowUp (+1) / ArrowDown (-1) */
  onStep?: (direction: 1 | -1) => void;
  /** "-" typed: flip the sign of the value being entered */
  onToggleSign?: () => void;
}

// Shared plumbing for the two time inputs. They are ordinary text boxes:
// the caret goes where you put it, selections work, and Backspace, Delete,
// cut, drag and paste all behave the way they do anywhere else. What's
// left here is the filter — digits reach the value, "-" is a sign toggle,
// nothing else gets in — plus Enter, Escape and the arrows.
//
// The calculator entry this replaces pinned the caret to the end and
// appended from the right, so fixing a typo in the middle meant deleting
// everything after it.
//
// onChange rather than a beforeinput listener: reading the box after the
// browser has already edited it covers every path into it at once,
// including soft keyboards that report key='Unidentified' and the
// deletions React's synthetic onBeforeInput never fires for.
export function useDigitEntry(
  inputRef: React.RefObject<HTMLInputElement | null>,
  maxDigits: number,
  handlers: DigitEntryHandlers
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // The sign lives outside the digits, so a "-" typed or pasted anywhere
  // in the box toggles it and never lands in the value itself.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw.includes('-')) handlersRef.current.onToggleSign?.();
    handlersRef.current.setValue(raw.replace(/\D/g, '').slice(0, maxDigits));
  };

  // How many digits sit before an index in the displayed string. The box
  // shows a formatted time — "12:05" — and the value behind it is just its
  // digits, so this is what maps a caret in one onto a position in the
  // other.
  const digitsBefore = (shown: string, index: number) => shown.slice(0, index).replace(/\D/g, '').length;

  // Deletions are done by digit rather than left to the filter. Backspace
  // over the ":" in "12:05" removes a character the value never held, so
  // the filtered result came back identical and the key did nothing at
  // all — you had to press it twice, once for a separator you couldn't
  // see the point of.
  const handleDelete = (e: React.KeyboardEvent<HTMLInputElement>, forward: boolean) => {
    const el = e.currentTarget;
    const shown = el.value;
    const start = el.selectionStart ?? shown.length;
    const end = el.selectionEnd ?? start;
    const digits = shown.replace(/\D/g, '');
    let from = digitsBefore(shown, start);
    let to = digitsBefore(shown, end);
    // A collapsed caret takes the digit on the side the key points at.
    if (from === to) {
      if (forward) to = from + 1;
      else from = from - 1;
    }
    if (from < 0 || to > digits.length || from >= to) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    handlersRef.current.setValue(digits.slice(0, from) + digits.slice(to));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      handleDelete(e, e.key === 'Delete');
      return;
    }
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
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      handlersRef.current.onStep?.(e.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    // Left/Right/Home/End, Shift-selection and every clipboard shortcut
    // keep their defaults — that is the point of the rework.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // A character the value can't hold. "-" is let through to onChange,
    // which reads it as the sign toggle and drops it from the digits.
    if (e.key.length === 1 && !/[\d-]/.test(e.key)) e.preventDefault();
  };

  // Kept so callers can still reach the element for focus/blur.
  void inputRef;

  return { handleChange, handleKeyDown };
}
