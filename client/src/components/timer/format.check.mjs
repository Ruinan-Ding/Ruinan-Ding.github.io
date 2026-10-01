// Self-check for the pure time formatting and entry-conversion helpers.
import assert from 'node:assert/strict';
import { importTypeScript } from '../../../../tests/import-ts.mjs';

const {
  exportFileName,
  formatDateParts,
  formatEntryLabel,
  formatSignedLabel,
  formatTime,
  fromTotalSeconds,
  isPresetInvalid,
  offsetLabel,
  pad,
  parsePresetDigits,
  presetDigitsFromParts,
  presetTotalFromDigits,
  rawPresetDigits,
  signedParts,
  timeFormatter,
  toSignedTotal,
  toTotalSeconds,
} = await importTypeScript(new URL('./format.ts', import.meta.url));

assert.equal(pad(7), '07');
assert.equal(pad(-1), '-1');
assert.equal(offsetLabel('GMT'), '+0');
assert.equal(offsetLabel('GMT-4'), '-4');
assert.equal(offsetLabel('GMT+5:30'), '+5:30');

assert.deepEqual(fromTotalSeconds(3661), { hours: 1, minutes: 1, seconds: 1 });
assert.equal(toTotalSeconds({ hours: 1, minutes: 1, seconds: 1 }), 3661);
assert.equal(toSignedTotal({ hours: 1, minutes: 1, seconds: 1 }, true), -3661);
assert.deepEqual(signedParts(-3661), {
  hours: 1, minutes: 1, seconds: 1, negative: true, signUnit: 'hours',
});
assert.equal(signedParts(-61).signUnit, 'minutes');
assert.equal(signedParts(-1).signUnit, 'seconds');
assert.equal(signedParts(0).signUnit, null);

assert.deepEqual(formatTime(3661, 230), {
  sign: '', hours: '01', minutes: '01', seconds: '01', ms: '23',
});
assert.deepEqual(formatTime(0, -10), {
  sign: '-', hours: '', minutes: '00', seconds: '00', ms: '01',
});
assert.deepEqual(formatTime(-60, 500), {
  sign: '-', hours: '', minutes: '00', seconds: '59', ms: '50',
});
assert.equal(formatEntryLabel({ hours: 0, minutes: 1, seconds: 5 }), '1:05');
assert.equal(formatEntryLabel({ hours: 2, minutes: 1, seconds: 5, negative: true }), '-2:01:05');
assert.equal(formatSignedLabel(-90), '-1:30');

assert.deepEqual(rawPresetDigits('130'), { hours: 0, minutes: 1, seconds: 30 });
assert.equal(presetTotalFromDigits('130'), 90);
assert.deepEqual(parsePresetDigits('888888'), { hours: 88, minutes: 59, seconds: 59 });
assert.equal(isPresetInvalid('888888'), true);
assert.equal(isPresetInvalid('990000'), false);
assert.equal(isPresetInvalid('000059'), false);
assert.equal(presetDigitsFromParts({ hours: 0, minutes: 1, seconds: 5 }), '105');
assert.equal(presetDigitsFromParts({ hours: 0, minutes: 0, seconds: 0 }), '0');

const stamp = Date.UTC(2024, 0, 2, 15, 4, 5);
const utcDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', weekday: 'short', month: '2-digit', day: '2-digit', year: 'numeric',
});
assert.equal(formatDateParts(utcDate, stamp), 'Tue, 01/02/2024');
assert.equal(timeFormatter('UTC', true).format(stamp), '15:04:05');
assert.equal(timeFormatter('UTC', false).format(stamp), '3:04:05 PM');

// Local time, since that is the clock the person saving the file reads.
const local = new Date(2024, 0, 2, 3, 4, 5);
assert.equal(exportFileName('', local), 'write-timer-state-2024-01-02_03-04-05.json');
assert.equal(exportFileName(' . ', local), 'write-timer-state-2024-01-02_03-04-05.json');
assert.equal(exportFileName('backup', local), 'backup.json');
assert.equal(exportFileName('  backup.JSON  ', local), 'backup.JSON');
assert.equal(exportFileName('my backup.json.', local), 'my backup.json');
assert.equal(exportFileName('a/b\\c:d*e?f"g<h>i|j', local), 'a-b-c-d-e-f-g-h-i-j.json');

console.log('format: all checks passed');
