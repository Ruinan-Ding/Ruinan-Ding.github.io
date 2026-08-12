import { useLayoutEffect, useRef } from 'react';

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

// How many digits sit before an index in the displayed string. The box
// shows a formatted time — "12:05", or "-01" — and the value behind it is
// just its digits, so this maps a caret in one onto a position in the
// other. Separators and the sign are not positions the value has.
const digitsBefore = (shown: string, index: number) => shown.slice(0, index).replace(/\D/g, '').length;

// How many digits sit after an index — the caret's position counted from
// the right.
//
// From the right, not the left, because these are numbers: they fill from
// the bottom unit up, and the display pads what isn't typed yet. One typed
// digit shows as "0:01", three digit characters standing for one real one,
// so counting from the left put the caret three places from where it
// belonged and the next keystroke landed in the middle of the padding.
// Counted from the right there is nothing to be wrong about — the digits
// you can see past the caret are the digits that are really there.
const digitsAfter = (shown: string, index: number) => shown.slice(index).replace(/\D/g, '').length;

// The inverse: the rightmost index with exactly `n` digits after it.
const indexWithDigitsAfter = (shown: string, n: number) => {
  let seen = 0;
  for (let i = shown.length; i >= 0; i -= 1) {
    if (seen === n) return i;
    if (i > 0 && /\d/.test(shown[i - 1])) seen += 1;
  }
  return 0;
};

// Shared plumbing for the two time inputs. They are ordinary text boxes:
// the caret goes where you put it and stays there, selections work, and
// cut, paste and drag behave the way they do anywhere else. What's left
// here is the filter — digits reach the value, "-" is a sign toggle,
// nothing else gets in — plus Enter, Escape and the arrows.
//
// The caret is the whole reason this is a hook rather than an onChange.
// Both boxes are controlled and reformat as you type, so every edit
// replaced the value and the browser parked the caret at the end. It is
// tracked in digits, not characters, and put back after the render: type a
// digit into the middle of "12:05" and it stays where you typed it, on
// either side of a colon that may have moved.
export function useDigitEntry(
  inputRef: React.RefObject<HTMLInputElement | null>,
  maxDigits: number,
  displayValue: string,
  handlers: DigitEntryHandlers
) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  // Where the caret belongs once the new value has rendered, counted in
  // digits. null between edits, so clicking somewhere is never overridden.
  const pendingCaretRef = useRef<number | null>(null);

  // Every render rather than every value change, because an edit that
  // lands on the value already showing changes nothing for the effect to
  // watch: the target was left sitting in the ref and spent at the next
  // change it did see, dragging the caret back to an edit two
  // interactions ago. With nothing pending this is a null check.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const at = pendingCaretRef.current;
    pendingCaretRef.current = null;
    if (!el || at === null || document.activeElement !== el) return;
    const index = indexWithDigitsAfter(displayValue, at);
    el.setSelectionRange(index, index);
  });

  // The sign lives outside the digits, so a "-" typed or pasted anywhere
  // in the box toggles it and never lands in the value itself.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    // The minus already on screen is not one being typed. Cutting a digit
    // out of "-01" hands this back "-0", and reading that as a toggle
    // flipped the whole timer on a clipboard shortcut — and on every
    // keystroke of an Android keyboard, which reports no key and edits the
    // value directly. Only a "-" past the one the display already wears.
    const beyondSign = displayValue.startsWith('-') && raw.startsWith('-') ? raw.slice(1) : raw;
    if (beyondSign.includes('-')) handlersRef.current.onToggleSign?.();
    // Overflow drops a leading zero, and only a leading zero.
    //
    // The display pads what hasn't been typed, so once "07" is on screen
    // that zero is indistinguishable from a typed one and re-filtering it
    // with a keystroke gives three digits for a two-digit box. Shedding
    // the zero is what makes the padding get overridden rather than
    // appended to: 07 then 7 is 77.
    //
    // Once there is no zero left to shed the box is genuinely full and the
    // keystroke is dropped. Shedding unconditionally instead made 77 then
    // 5 into 75, which is a digit thrown away rather than one refused.
    let digits = raw.replace(/\D/g, '');
    while (digits.length > maxDigits && digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, maxDigits);
    // Counted against the raw string the browser just produced, so an
    // insertion is measured where it actually happened.
    pendingCaretRef.current = Math.min(digitsAfter(raw, caret), digits.length);
    handlersRef.current.setValue(digits);
  };

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
      else from -= 1;
    }
    e.preventDefault();
    if (from < 0 || to > digits.length || from >= to) return;
    // Padding again: what survives a deletion is re-padded on the way back
    // in, so carrying its zeros forward meant "07" deleted to "0", which
    // redrew as "00" and deleted to "0" again — the key stopped doing
    // anything and the box could never be emptied. Shedding them lets the
    // last digit delete back to the placeholder it started as.
    let next = digits.slice(0, from) + digits.slice(to);
    while (next.startsWith('0')) next = next.slice(1);
    // Counted from the right, where every digit past the caret survives,
    // so shedding zeros off the left cannot move it.
    pendingCaretRef.current = digits.length - to;
    handlersRef.current.setValue(next);
  };

  // A typed digit lands where the caret is. Not at the right end — that
  // ignored where you put it — and not over the digit under it, which ate
  // a digit you had not asked to lose.
  //
  // Room is made on the left, off the padding. A leading zero stands for a
  // digit not yet typed, so it is the thing that gives way, and everything
  // to the right of the caret keeps both its value and its place: type
  // into "07" between the 0 and the 7 and you get "57", with that 7 still
  // the seconds it always was.
  //
  // With no zero left to shed the box is full and the keystroke is
  // refused, wherever the caret is, rather than pushing a real digit out
  // of one end or the other.
  //
  // A selection is the exception, because highlighting says exactly which
  // digits to be rid of.
  const handleDigit = (e: React.KeyboardEvent<HTMLInputElement>, typed: string) => {
    e.preventDefault();
    const el = e.currentTarget;
    const shown = el.value;
    const start = el.selectionStart ?? shown.length;
    const end = el.selectionEnd ?? start;
    // Off the displayed string, so the padding counts: it is what the new
    // digit is going to take the room from.
    const digits = shown.replace(/\D/g, '');
    const from = digitsBefore(shown, start);
    const to = digitsBefore(shown, end);
    // Room is made before the digit goes in rather than after. Shedding
    // afterwards could only reach a zero that had stayed leading, so a
    // digit typed at the very left of "07" made "507" and was refused
    // outright, with the padding it should have taken sitting one place to
    // its right. Taken off the front of what's already there, the zero
    // gives way wherever the caret is and the caret comes down with it.
    let base = from !== to ? digits.slice(0, from) + digits.slice(to) : digits;
    let at = from;
    while (base.length >= maxDigits && base.startsWith('0')) {
      base = base.slice(1);
      if (at > 0) at -= 1;
    }
    if (base.length >= maxDigits) return;
    const capped = base.slice(0, at) + typed + base.slice(at);
    // Counted from the right, so shedding zeros off the left cannot move
    // it: the caret ends up just after the digit it wrote.
    pendingCaretRef.current = capped.length - (at + 1);
    handlersRef.current.setValue(capped);
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
    if (/^\d$/.test(e.key)) {
      handleDigit(e, e.key);
      return;
    }
    // A character the value can't hold. "-" is let through to onChange,
    // which reads it as the sign toggle and drops it from the digits.
    if (e.key.length === 1 && e.key !== '-') e.preventDefault();
  };

  return { handleChange, handleKeyDown };
}
