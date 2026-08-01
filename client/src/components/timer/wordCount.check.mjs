// Self-check for the counting and capping rules, since they're the one
// piece of the word counter that's logic rather than layout. No test
// runner in this project on purpose — run it with:
//
//   node client/src/components/timer/wordCount.check.mjs
//
// It imports the .ts beside it directly — node strips the types itself —
// so it checks the shipped source rather than a copy of it.
import assert from 'node:assert/strict';
import { countStats, capInsertion, isWithinCap, isAtCap, countLabel, COUNTER_MAX, COUNTER_WARN } from './wordCount.ts';

// the numbers as the boxes print them, grouped in threes. How far they
// then shrink to fit is countFontSize in WordCounter, which is layout and
// belongs with the column width it's measured against.
assert.equal(countLabel(999), '999');
assert.equal(countLabel(1000), '1,000');
assert.equal(countLabel(COUNTER_MAX), '999,999');
assert.ok(COUNTER_WARN < COUNTER_MAX, 'the warning comes before the ceiling');

// counting: the two filters are independent, and TOTAL is the columns summed
const mixed = countStats('ab $# cd\n$$', true, true);
assert.equal(mixed.totalLines, 2);
assert.equal(mixed.totalWords, 2, 'alphanumeric words only: "$#" and "$$" are not words');
assert.equal(mixed.totalChars, 4, 'alphanumeric chars only: only a, b, c, d');
const raw = countStats('ab $# cd\n$$', false, false);
assert.equal(raw.totalWords, 4);
assert.equal(raw.totalChars, 10, 'every character in each line, newlines excluded');

// the cap goes by the unfiltered counts, so symbols count toward it even
// while the switches are hiding them — this is the hole that let a page
// of "$$$$" grow forever
const symbols = '$'.repeat(COUNTER_MAX);
assert.equal(countStats(symbols, true, true).totalChars, 0, 'the switches show none of it');
assert.ok(!isWithinCap(symbols + '$'), 'the cap still sees all of it');
assert.equal(capInsertion(symbols, symbols + '$'), symbols, 'and stops there');

// a paste that overruns is cut where it crosses, not refused
const room = 'a'.repeat(COUNTER_MAX - 5);
const pasted = capInsertion(room, room + 'b'.repeat(100));
assert.equal(pasted.length, COUNTER_MAX, 'kept exactly what fit');
assert.ok(pasted.startsWith(room) && pasted.endsWith('bbbbb'), 'kept the first five pasted characters');

// cut in the inserted run, not off the end of the result: text after the
// caret survives a paste that overruns
const tail = 'ZZZZZ';
const middle = capInsertion(room + tail, room + 'b'.repeat(100) + tail);
assert.ok(middle.endsWith(tail), 'text after the caret is untouched');
assert.equal(middle.length, COUNTER_MAX, 'still filled exactly to the limit');

// deletions and no-ops are never touched
assert.equal(capInsertion(symbols, symbols.slice(0, 10)), symbols.slice(0, 10));
assert.equal(capInsertion('abc', 'abcd'), 'abcd');

// lines cap too
const lines = '\n'.repeat(COUNTER_MAX - 1);
assert.equal(countStats(lines, false, false).totalLines, COUNTER_MAX);
assert.equal(capInsertion(lines, lines + '\n'), lines, 'no room for another line');

// full means full: at the character limit, nothing goes in — including a
// line break, which isn't a character and so kept passing the "would this
// be legal?" test forever
const full = 'a'.repeat(COUNTER_MAX);
assert.ok(isAtCap(full), 'characters are at the ceiling');
assert.ok(isWithinCap(full), 'and legal, which is a different question');
assert.equal(capInsertion(full, full + '\n'), full, 'no newline at the character limit');
assert.equal(capInsertion(full, full + ' '), full, 'no space either');
assert.equal(capInsertion(full, `${full.slice(0, 10)}x${full.slice(10)}`), full, 'nor mid-text');
const fullWords = Array.from({ length: COUNTER_MAX }, () => 'a').join(' ');
assert.ok(isAtCap(fullWords), 'words can be the one that is full');
assert.equal(capInsertion(fullWords, `${fullWords}\n`), fullWords, 'and it stops newlines too');

// the fast path for an ordinary keystroke has to agree with the slow one
// it skips — including the cases its bounds are drawn from: a newline
// (adds a line, no characters) and a space in the middle of a word (adds
// no characters that count, but splits one word into two)
const nearWords = `${Array.from({ length: COUNTER_MAX - 1 }, () => 'a').join(' ')} bb`;
assert.equal(capInsertion(nearWords, `${nearWords.slice(0, -1)} b`), nearWords, 'splitting a word would be one word too many');
const nearLines = '\n'.repeat(COUNTER_MAX - 2);
assert.equal(capInsertion(nearLines, `${nearLines}\n`).length, nearLines.length + 1, 'one more line still fits');
assert.equal(capInsertion(`${nearLines}\n`, `${nearLines}\n\n`), `${nearLines}\n`, 'the one after it does not');

console.log('wordCount: all checks passed');
