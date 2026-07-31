// Self-check for the counting and capping rules, since they're the one
// piece of the word counter that's logic rather than layout. No test
// runner in this project on purpose — run it with:
//
//   node client/src/components/timer/wordCount.check.mjs
//
// It imports the .ts beside it directly — node strips the types itself —
// so it checks the shipped source rather than a copy of it.
import assert from 'node:assert/strict';
import { countStats, capInsertion, isWithinCap, COUNTER_MAX } from './wordCount.ts';

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

console.log('wordCount: all checks passed');
