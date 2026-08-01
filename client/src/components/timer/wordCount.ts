// Counting and capping for the word counter, kept out of the component
// so both the numbers on screen and the guard on typing come from one
// implementation — "what the counters would say" about text that hasn't
// been accepted yet has to be measured exactly the way they say it.

// Ceiling for lines, words and chars alike, and the mark where a total
// turns yellow on the way to it — far enough out to be a heads-up rather
// than a surprise. These numbers are wider than an L/W/C box can hold at
// its usual size, so the numbers shrink to fit rather than the boxes
// growing (see countFontSize in WordCounter).
export const COUNTER_MAX = 999999;
export const COUNTER_WARN = 999000;

// Grouped in threes, always the same way regardless of where the browser
// thinks it is — this app writes its dates and times in en-US too.
export function countLabel(value: number): string {
  return value.toLocaleString('en-US');
}


export interface CountStats {
  lineStats: { wordCount: number; charCount: number }[];
  totalLines: number;
  totalWords: number;
  totalChars: number;
  // the same two totals with nothing filtered out, which is what the cap
  // goes by. Returned from this one pass rather than asked for in a
  // second one: both are wanted on every keystroke, the parts they share
  // are most of the work, and this text is allowed to be a million
  // characters long.
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
    // alnumWordsOnly requires at least one letter/digit for a token to
    // count as a word (so "$#" alone doesn't); off counts every
    // whitespace-separated token. alnumCharsOnly restricts C to
    // a-z/A-Z/0-9; off counts every character in the line, including
    // spaces. The two are intentionally independent — with words-only
    // off and chars-only on, a punctuation-only line like "$# @!" will
    // show words > 0 with chars === 0. That's correct, not a bug.
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
    // summed from the same per-line numbers shown in the columns (rather
    // than an independent scan over the whole text) so TOTAL always
    // matches "add up the column" — an independent scan would also pick
    // up the '\n' line separators once chars-only is off and every
    // character in a line counts
    totalWords,
    totalChars,
    rawWords,
    rawChars,
  };
}

// The cap is judged on the unfiltered counts — every token, every
// character — not on whatever the two alphanumeric-only switches are
// currently showing. Judging it on the displayed numbers left a hole you
// could drive a document through: with chars-only on, a line of "$$$$$"
// counts as nothing, so nothing ever reached the ceiling and the text
// could grow without limit. What the switches change is what you're
// shown, not how much there is.
export function isWithinCap(text: string): boolean {
  const { totalLines, rawWords, rawChars } = countStats(text, false, false);
  return totalLines <= COUNTER_MAX && rawWords <= COUNTER_MAX && rawChars <= COUNTER_MAX;
}

// Full: one of the three has reached the ceiling, and nothing more goes
// in at all. Not the same question as isWithinCap, which asks whether a
// text is legal — a text sitting exactly on the limit is legal and full
// at once. Asking only "would this be legal?" is what let newlines
// through at 9999 characters: a line break isn't a character (see
// countStats — the split eats it), so the character count didn't move and
// every Enter was legal, forever.
export function isAtCap(text: string): boolean {
  const { totalLines, rawWords, rawChars } = countStats(text, false, false);
  return totalLines >= COUNTER_MAX || rawWords >= COUNTER_MAX || rawChars >= COUNTER_MAX;
}

// What `next` should actually become, given the text it's replacing.
// Anything that fits goes in whole; anything that doesn't gets cut where
// it crosses the line rather than refused outright — paste a novel and
// you keep the first 9999 characters of it, which is what you'd expect
// and what the alternative (nothing happens, no reason given) isn't.
//
// The cut is made in the inserted run, not at the end of the result: a
// paste can land in the middle of what's already there, and trimming the
// tail would eat text the paste never touched. Which characters were
// inserted is worked out from the common prefix and suffix of the two
// strings — a textarea's change event doesn't say.
export function capInsertion(prev: string, next: string): string {
  if (next.length <= prev.length) return next;

  const { totalLines, rawWords, rawChars } = countStats(prev, false, false);
  if (totalLines >= COUNTER_MAX || rawWords >= COUNTER_MAX || rawChars >= COUNTER_MAX) return prev;
  // What n inserted characters can add at most: n characters (a newline
  // isn't one), n lines (if every one of them is a newline), and n + 1
  // words (n new ones, plus splitting the word it landed in). If even the
  // worst case fits, this is a keystroke that can't have crossed anything
  // and there's nothing to work out — which matters because the check it
  // skips is a pass over the whole text, on every keypress, and this text
  // is allowed to be a million characters long.
  const added = next.length - prev.length;
  if (rawChars + added <= COUNTER_MAX && totalLines + added <= COUNTER_MAX && rawWords + added + 1 <= COUNTER_MAX) {
    return next;
  }
  if (isWithinCap(next)) return next;

  let start = 0;
  while (start < prev.length && prev[start] === next[start]) start++;
  let end = 0;
  while (end < prev.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;

  const before = next.slice(0, start);
  const after = prev.slice(prev.length - end);
  const inserted = next.slice(start, next.length - end);

  // largest number of inserted characters that still fits
  let fits = 0;
  let most = inserted.length;
  while (fits < most) {
    const mid = Math.ceil((fits + most) / 2);
    if (isWithinCap(before + inserted.slice(0, mid) + after)) fits = mid;
    else most = mid - 1;
  }
  return fits === 0 ? prev : before + inserted.slice(0, fits) + after;
}
