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
  /**
   * The box is showing a committed value rather than an entry in progress,
   * so the next digit starts a new one over the top of it instead of
   * inserting into it, the same thing focusing an untouched box does.
   */
  fresh?: boolean;
}

// The box shows a formatted time ("12:05", "-01") and the value behind it
// is just its digits, so these map a caret in one onto a position in the
// other. Separators and the sign are not positions the value has.
const digitsBefore = (shown: string, index: number) => shown.slice(0, index).replace(/\D/g, '').length;

// Counted from the right, not the left, because these are numbers: they
// fill from the bottom unit up and the display pads what isn't typed yet,
// so one typed digit shows as "0:01". From the left that puts the caret
// three places from where it belongs, in the middle of the padding; from
// the right, the digits past the caret are the ones really there.
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

// Shared plumbing for the two time inputs. They stay ordinary text boxes:
// the caret goes where you put it, selections work, and cut, paste and
// drag behave as they do anywhere else. What's here is the filter (digits
// reach the value, "-" toggles the sign, nothing else gets in) plus Enter,
// Escape and the arrows.
//
// The caret is why this is a hook rather than an onChange. Both boxes are
// controlled and reformat as you type, so every edit replaces the value
// and the browser parks the caret at the end. It's tracked in digits, not
// characters, and put back after the render, so a digit typed into the
// middle of "12:05" stays where you typed it, on either side of a colon
// that may have moved.
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

  // Every render rather than every value change: an edit that lands on the
  // value already showing gives the effect nothing to watch, leaving the
  // target in the ref to be spent on the next change it does see, which
  // drags the caret back to an edit two interactions old. With nothing
  // pending this is a null check.
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
    // Only a "-" past the one the display already wears counts. Cutting a
    // digit out of "-01" hands this back "-0", and reading that as a
    // toggle flips the whole timer on a clipboard shortcut, or on every
    // keystroke of an Android keyboard, which reports no key and edits the
    // value directly.
    const beyondSign = displayValue.startsWith('-') && raw.startsWith('-') ? raw.slice(1) : raw;
    if (beyondSign.includes('-')) handlersRef.current.onToggleSign?.();
    // Overflow drops a leading zero, and only a leading zero. The display
    // pads what hasn't been typed, so once "07" is on screen that zero
    // can't be told from a typed one and re-filtering gives three digits
    // for a two-digit box. Shedding it is what makes padding get
    // overridden rather than appended to: 07 then 7 is 77.
    //
    // With no zero left to shed the box is genuinely full and the
    // keystroke is dropped, rather than 77 then 5 becoming 75.
    let digits = raw.replace(/\D/g, '');
    while (digits.length > maxDigits && digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, maxDigits);
    // Counted against the raw string the browser just produced, so an
    // insertion is measured where it actually happened.
    pendingCaretRef.current = Math.min(digitsAfter(raw, caret), digits.length);
    handlersRef.current.setValue(digits);
  };

  // By digit rather than left to the filter. Backspace over the ":" in
  // "12:05" removes a character the value never held, so the filtered
  // result comes back identical and the key appears to do nothing until
  // you press it twice.
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
    // in, so carrying its zeros forward leaves "07" deleting to "0", which
    // redraws as "00" and deletes to "0" for ever. Shedding them lets the
    // last digit delete back to the placeholder it started as.
    let next = digits.slice(0, from) + digits.slice(to);
    while (next.startsWith('0')) next = next.slice(1);
    // Counted from the right, where every digit past the caret survives,
    // so shedding zeros off the left cannot move it.
    pendingCaretRef.current = digits.length - to;
    handlersRef.current.setValue(next);
  };

  // A typed digit lands where the caret is: not at the right end, which
  // ignores where you put it, and not over the digit under it, which eats
  // one you didn't ask to lose.
  //
  // Room is made on the left, off the padding. A leading zero stands for a
  // digit not yet typed, so it's what gives way, and everything right of
  // the caret keeps its value and its place: type into "07" between the 0
  // and the 7 and you get "57", the 7 still the seconds it always was.
  // With no zero left to shed the keystroke is refused wherever the caret
  // is, rather than pushing a real digit out of one end.
  //
  // A selection is the exception, since highlighting says exactly which
  // digits to be rid of.
  const handleDigit = (e: React.KeyboardEvent<HTMLInputElement>, typed: string) => {
    e.preventDefault();
    const el = e.currentTarget;
    const shown = el.value;
    const start = el.selectionStart ?? shown.length;
    const end = el.selectionEnd ?? start;
    // Off the displayed string, so the padding counts: it's what the new
    // digit takes its room from. Unless the box is showing a committed
    // value, a time the arrows just stepped say, in which case there's no
    // entry to insert into and this digit starts one.
    const fresh = handlersRef.current.fresh === true;
    const digits = fresh ? '' : shown.replace(/\D/g, '');
    const from = fresh ? 0 : digitsBefore(shown, start);
    const to = fresh ? 0 : digitsBefore(shown, end);
    // Room is made before the digit goes in rather than after. Shedding
    // afterwards can only reach a zero that stayed leading, so a digit
    // typed at the very left of "07" makes "507" and is refused with the
    // padding it should have taken sitting one place to its right.
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
      // Or the same keypress presses whatever button a confirmation dialog
      // focuses as it opens.
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
    // keep their defaults.
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
