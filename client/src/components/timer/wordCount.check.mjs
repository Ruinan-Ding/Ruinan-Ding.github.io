// Self-check for the counting and capping rules, the one piece of the word
// counter that's logic rather than layout. No test runner on purpose:
//
//   node client/src/components/timer/wordCount.check.mjs
//
// It imports the .ts beside it directly, since node strips the types
// itself, so it checks the shipped source rather than a copy.
import assert from 'node:assert/strict';
import { countStats, capInsertion, isWithinCap, countLabel, COUNTER_MAX, COUNTER_WARN } from './wordCount.ts';

// The numbers as the boxes print them. How far they then shrink to fit is
// countFontSize in WordCounter, which is layout.
assert.equal(countLabel(999), '999');
assert.equal(countLabel(1000), '1,000');
assert.equal(countLabel(COUNTER_MAX), '999,999');
assert.ok(COUNTER_WARN < COUNTER_MAX, 'the warning comes before the ceiling');

// The two filters are independent, and TOTAL is the columns summed.
const mixed = countStats('ab $# cd\n$$', true, true);
assert.equal(mixed.totalLines, 2);
assert.equal(mixed.totalWords, 2, 'alphanumeric words only: "$#" and "$$" are not words');
assert.equal(mixed.totalChars, 4, 'alphanumeric chars only: only a, b, c, d');
const raw = countStats('ab $# cd\n$$', false, false);
assert.equal(raw.totalWords, 4);
assert.equal(raw.totalChars, 10, 'every character in each line, newlines excluded');

// The cap goes by the unfiltered counts, so symbols count toward it even
// while the switches hide them. This is the hole that let a page of
// "$$$$" grow forever.
const symbols = '$'.repeat(COUNTER_MAX);
assert.equal(countStats(symbols, true, true).totalChars, 0, 'the switches show none of it');
assert.ok(!isWithinCap(symbols + '$'), 'the cap still sees all of it');
assert.equal(capInsertion(symbols, symbols + '$'), symbols, 'and stops there');

// a paste that overruns is cut where it crosses, not refused
const room = 'a'.repeat(COUNTER_MAX - 5);
const pasted = capInsertion(room, room + 'b'.repeat(100));
assert.equal(pasted.length, COUNTER_MAX, 'kept exactly what fit');
assert.ok(pasted.startsWith(room) && pasted.endsWith('bbbbb'), 'kept the first five pasted characters');

// Cut in the inserted run, not off the end, so text after the caret
// survives a paste that overruns.
const tail = 'ZZZZZ';
const middle = capInsertion(room + tail, room + 'b'.repeat(100) + tail);
assert.ok(middle.endsWith(tail), 'text after the caret is untouched');
assert.equal(middle.length, COUNTER_MAX, 'still filled exactly to the limit');

// Deletions and ordinary keystrokes are never touched.
assert.equal(capInsertion(symbols, symbols.slice(0, 10)), symbols.slice(0, 10));
assert.equal(capInsertion('abc', 'abcd'), 'abcd');

// Lines cap too.
const lines = '\n'.repeat(COUNTER_MAX - 1);
assert.equal(countStats(lines, false, false).totalLines, COUNTER_MAX);
assert.equal(capInsertion(lines, lines + '\n'), lines, 'no room for another line');

// Full means full: at the character limit nothing goes in, including a
// line break, which isn't a character and so kept passing a "would this be
// legal?" test forever.
const full = 'a'.repeat(COUNTER_MAX);
assert.ok(isWithinCap(full), 'sitting exactly on the limit is legal, and full at the same time');
assert.equal(capInsertion(full, full + '\n'), full, 'no newline at the character limit');
assert.equal(capInsertion(full, full + ' '), full, 'no space either');
assert.equal(capInsertion(full, `${full.slice(0, 10)}x${full.slice(10)}`), full, 'nor mid-text');
const fullWords = Array.from({ length: COUNTER_MAX }, () => 'a').join(' ');
assert.equal(capInsertion(fullWords, `${fullWords}\n`), fullWords, 'words can be the one that is full, and it stops newlines too');

// A paste over a selection inserts more than the text grows by, and can
// insert while the text shrinks. Both skipped the cap when it was guarded
// by length tests, which say nothing about lines: a newline isn't a
// character. The measured overruns were 1,000,004 and 1,000,044 lines.
const linesFor = (text) => countStats(text, false, false).totalLines;
const nearLineCap = 'x'.repeat(100) + '\n'.repeat(COUNTER_MAX - 6);
assert.equal(linesFor(nearLineCap), COUNTER_MAX - 5, 'five lines of headroom');
// 10 characters replaced by 10 newlines: identical length in and out
const sameLength = '\n'.repeat(10) + nearLineCap.slice(10);
assert.equal(sameLength.length, nearLineCap.length);
assert.ok(linesFor(sameLength) > COUNTER_MAX, 'the paste really would overrun');
assert.ok(linesFor(capInsertion(nearLineCap, sameLength)) <= COUNTER_MAX, 'growing by nothing is not the same as adding nothing');
// The same trick with a result shorter than what it replaced. The 50
// newlines have to outrun the cap on their own for this to be a test.
const shorter = '\n'.repeat(50) + nearLineCap.slice(100);
assert.ok(shorter.length < nearLineCap.length, 'the edit really does shrink the text');
assert.ok(linesFor(shorter) > COUNTER_MAX, 'and really would overrun');
assert.ok(linesFor(capInsertion(nearLineCap, shorter)) <= COUNTER_MAX, 'nor does a shorter result mean nothing was added');

// The deletion half of a replacement always applies, ceiling or not:
// selecting text and typing over it is how you get back under the cap, so
// a full counter refusing it outright would be a dead end.
assert.equal(
  capInsertion(full, `z${full.slice(500)}`),
  `z${full.slice(500)}`,
  'replacing a selection at the cap is what gets you back under it',
);

// The fast path for an ordinary keystroke has to agree with the slow one
// it skips, including the cases its bounds are drawn from: a newline,
// which adds a line and no characters, and a space mid-word, which adds no
// characters that count but splits one word into two.
const nearWords = `${Array.from({ length: COUNTER_MAX - 1 }, () => 'a').join(' ')} bb`;
assert.equal(capInsertion(nearWords, `${nearWords.slice(0, -1)} b`), nearWords, 'splitting a word would be one word too many');
const nearLines = '\n'.repeat(COUNTER_MAX - 2);
assert.equal(capInsertion(nearLines, `${nearLines}\n`).length, nearLines.length + 1, 'one more line still fits');
assert.equal(capInsertion(`${nearLines}\n`, `${nearLines}\n\n`), `${nearLines}\n`, 'the one after it does not');

console.log('wordCount: all checks passed');
