// Counting and capping for the word counter. Kept out of the component so
// the numbers on screen and the guard on typing come from one place.

// Ceiling for lines, words and chars alike, plus the mark where a total
// turns yellow on the way to it. Both are wider than an L/W/C box holds at
// its usual size, so the numbers shrink to fit (see countFontSize).
export const COUNTER_MAX = 999999;
export const COUNTER_WARN = 999000;

// en-US regardless of locale, matching the dates and times elsewhere.
export function countLabel(value: number): string {
  return value.toLocaleString('en-US');
}

export interface CountStats {
  lineStats: { wordCount: number; charCount: number }[];
  totalLines: number;
  totalWords: number;
  totalChars: number;
  // The same two totals unfiltered, which is what the cap goes by. Counted
  // in this pass rather than a second one: both are wanted on every
  // keystroke and they share most of the work.
  rawWords: number;
  rawChars: number;
}

export function countStats(text: string, alnumWordsOnly: boolean, alnumCharsOnly: boolean): CountStats {
  const lines = text.split('\n');
  let totalWords = 0;
  let totalChars = 0;
  let rawWords = 0;
  let rawChars = 0;
  const lineStats = lines.map((line) => {
    const trimmed = line.trim();
    const tokens = trimmed === '' ? [] : trimmed.split(/\s+/);
    // The two filters are independent by design: with words-only off and
    // chars-only on, "$# @!" shows words > 0 and chars === 0.
    const alnumWords = alnumWordsOnly ? tokens.filter((word) => /[a-zA-Z0-9]/.test(word)).length : tokens.length;
    const alnumChars = alnumCharsOnly ? (line.match(/[a-zA-Z0-9]/g) || []).length : line.length;
    totalWords += alnumWords;
    totalChars += alnumChars;
    rawWords += tokens.length;
    rawChars += line.length;
    return { wordCount: alnumWords, charCount: alnumChars };
  });

  return {
    lineStats,
    totalLines: lines.length,
    // Summed from the per-line numbers the columns show, so TOTAL always
    // matches adding up the column. A separate scan over the whole text
    // would also count the '\n' separators once chars-only is off.
    totalWords,
    totalChars,
    rawWords,
    rawChars,
  };
}

// Judged on the unfiltered counts, not on what the alphanumeric-only
// switches are showing. With chars-only on, a line of "$$$$$" displays as
// nothing, so a cap read off the display would never be reached.
export function isWithinCap(text: string): boolean {
  const { totalLines, rawWords, rawChars } = countStats(text, false, false);
  return totalLines <= COUNTER_MAX && rawWords <= COUNTER_MAX && rawChars <= COUNTER_MAX;
}

// What `next` should become, given the text it replaces. Anything that
// fits goes in whole; anything that doesn't is cut where it crosses,
// rather than refused with no explanation. The cut is made in the inserted
// run, not at the end of the result, since a paste can land mid-text.
export function capInsertion(prev: string, next: string): string {
  // Work out what was actually inserted from the common prefix and suffix.
  // A textarea's change event doesn't say, and the length difference is
  // not a substitute: an edit replacing a selection can insert far more
  // than it grows the text by, and can insert while shrinking it. A
  // newline is not a character, so neither "the result is shorter" nor "it
  // only grew by n" bounds how many lines arrived.
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) start++;
  let end = 0;
  while (
    end < prev.length - start &&
    end < next.length - start &&
    prev[prev.length - 1 - end] === next[next.length - 1 - end]
  ) {
    end++;
  }

  const before = next.slice(0, start);
  const after = prev.slice(prev.length - end);
  const inserted = next.slice(start, next.length - end);
  // The deletion half always applies, or text pasted in over the cap would
  // be stuck there. Deleting can't raise any of the three counts.
  const base = before + after;
  if (inserted === '') return base;

  const { totalLines, rawWords, rawChars } = countStats(base, false, false);
  // At the ceiling once the deletion is applied, nothing more goes in.
  // Asking "would the result be legal?" instead lets newlines through
  // forever at the character limit: the split eats them, so the character
  // count never moves.
  if (totalLines >= COUNTER_MAX || rawWords >= COUNTER_MAX || rawChars >= COUNTER_MAX) return base;
  // Worst case for n inserted characters: n chars, n lines (all newlines),
  // and n + 1 words (n new, plus splitting the one it landed in). If that
  // fits, skip the full re-count, which is a pass over text allowed to be
  // a million characters long.
  const added = inserted.length;
  if (rawChars + added <= COUNTER_MAX && totalLines + added <= COUNTER_MAX && rawWords + added + 1 <= COUNTER_MAX) {
    return next;
  }
  if (isWithinCap(next)) return next;

  // Largest number of inserted characters that still fits. None fitting
  // lands back on `base`.
  let fits = 0;
  let most = inserted.length;
  while (fits < most) {
    const mid = Math.ceil((fits + most) / 2);
    if (isWithinCap(before + inserted.slice(0, mid) + after)) fits = mid;
    else most = mid - 1;
  }
  return before + inserted.slice(0, fits) + after;
}
