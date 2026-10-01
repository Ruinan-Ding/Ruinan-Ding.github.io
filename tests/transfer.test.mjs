// The import/export button: that an export holds every setting the page
// keeps, that importing it into an empty browser gives back the same file,
// that a bad file is refused with a reason and changes nothing, and that
// a partial file leaves out what it leaves out.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9960);
const profile = mkdtempSync(join(tmpdir(), 'transfer-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = l.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* not up */ }
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
// Counted rather than only accepted: an import is a reload the page asked
// for, and the leave guard challenging it is a bug.
let leavePrompts = 0;
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Page.javascriptDialogOpening') { leavePrompts++; ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); return; }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const press = async (key, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(500);
};
const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const clickEl = async (expr, name) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(600);
  return true;
};

const OPEN = `document.querySelector('[aria-label="Import or export the website\\'s state as JSON"]')`;
const dialogButton = (label, pressed) =>
  `[...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent.trim().startsWith(${JSON.stringify(label)})&&b.hasAttribute('aria-pressed')===${pressed})`;
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"] h2')?.textContent ?? null`);
const exported = async () => {
  await clickEl(OPEN, 'import/export button');
  const text = await ev(`document.querySelector('[data-transfer-text="export"]')?.value ?? null`);
  await press('Escape', 'Escape', 27);
  return text === null ? null : JSON.parse(text);
};
// Pastes into the import box the way a person does, so React sees it.
const paste = async (text) => {
  await clickEl(OPEN, 'import/export button');
  await clickEl(dialogButton('IMPORT', true), 'IMPORT tab');
  await ev(`(()=>{const t=document.querySelector('[data-transfer-text="import"]');t.focus();t.select();return 'ok'})()`);
  await send('Input.insertText', { text });
  await sleep(200);
  await clickEl(dialogButton('IMPORT', false), 'IMPORT button');
};
const errorsShown = () => ev(`document.querySelector('[data-transfer-errors]')?.textContent ?? ''`);
// Seeded from a page on the same origin that isn't the app. Written under
// a running app, the store is overwritten on the way out: the page flushes
// its own milliseconds as it goes, over the ones seeded.
const seedAndLoad = async (script) => {
  await send('Page.navigate', { url: 'http://localhost:5199/timer-state.schema.json' });
  await sleep(800);
  await ev(script);
  await send('Page.navigate', { url: 'http://localhost:5199/' });
  await sleep(2800);
};
const withoutStamp = (file) => JSON.stringify({ ...file, exportedAt: undefined });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });

// Every key off its default, so an export that drops or mangles one shows.
const TEXT = 'first line "quoted"\nsecond line ✓ \\ back';
const seeded = {
  timerAppState: { seconds: 183, milliseconds: 420, isPaused: true, isRunning: true, hours: 0, minutes: 5, timerSeconds: 0 },
  timerConfiguredNegative: false,
  timerAppPresets: [
    { id: 'p1', hours: 0, minutes: 2, seconds: 30, negative: false, timestamp: 1 },
    { id: 'p2', hours: 1, minutes: 0, seconds: 0, negative: true, timestamp: 2 },
  ],
  timerAppHistory: [{ id: 'h1', hours: 0, minutes: 5, seconds: 0, negative: false, timestamp: 1727600000000 }],
  timerSilentMode: true,
  timerVolume: 0.3,
  timerAlarmLoop: true,
  timerConfirmMode: 'full',
  timerDontAskAgain: ['stop', 'theme', 'hideWebsiteLink'],
  timerWebsiteLinkHidden: true,
  timerLinkRowMigrated: true,
  timerSidebarHidden: true,
  timerTimeFieldsHidden: true,
  wordCounterCollapsed: true,
  wordCounterCollapsedAt: null,
  wordCounterFullscreen: false,
  wordCounterFullscreenBefore: true,
  timerLightTheme: true,
  timerClockTimeZone: 'Asia/Tokyo',
  timerClock24Hour: true,
  wordCounterAlnumWordsOnly: false,
  wordCounterAlnumCharsOnly: false,
};
await seedAndLoad(`(()=>{localStorage.clear();const s=${JSON.stringify(seeded)};for(const k in s)localStorage.setItem(k,JSON.stringify(s[k]));localStorage.setItem('wordCounterText',${JSON.stringify(TEXT)});return 'ok'})()`);

// 1. The export holds all of it.
const first = await exported();
check('export opens and parses', first !== null, 'true');
check('format and version', `${first?.format} ${first?.version}`, 'write-timer-state 1');
check('points at the schema', first?.$schema, 'https://ruinan-ding.com/timer-state.schema.json');
check('timer', JSON.stringify(first?.timer), JSON.stringify({ status: 'paused', remainingMs: 183420, configured: { hours: 0, minutes: 5, seconds: 0, negative: false } }));
check('presets', JSON.stringify(first?.presets), JSON.stringify(seeded.timerAppPresets));
check('history', JSON.stringify(first?.history), JSON.stringify(seeded.timerAppHistory));
check('sound', JSON.stringify(first?.sound), JSON.stringify({ muted: true, volume: 0.3, alarmRepeats: true }));
check('clock', JSON.stringify(first?.clock), JSON.stringify({ timeZone: 'Asia/Tokyo', hour24: true }));
check('theme', first?.theme, 'light');
check('confirmations', JSON.stringify(first?.confirmations), JSON.stringify({ mode: 'full', dontAskAgain: ['stop', 'theme', 'hideWebsiteLink'] }));
check('layout', JSON.stringify(first?.layout), JSON.stringify({ sidebarTucked: true, timeFieldsTucked: true, websiteLinkHidden: true, wordCounter: { view: 'tucked', restoreFullscreen: true, autoTuckedAt: null } }));
check('word counter', JSON.stringify(first?.wordCounter), JSON.stringify({ text: TEXT, alphanumericWordsOnly: false, alphanumericCharsOnly: false }));
check('schema is served', await ev(`fetch('/timer-state.schema.json').then(r=>r.json()).then(s=>s.$id)`), 'https://ruinan-ding.com/timer-state.schema.json');

// 2. Bad files are refused with a reason, and nothing is written.
const before = await ev(`JSON.stringify(Object.entries(localStorage).sort())`);
await paste('not json');
check('invalid JSON is refused', /isn't valid JSON/.test(await errorsShown()), 'true');
check('and stays on the text', await dialogTitle(), 'IMPORT / EXPORT');
await press('Escape', 'Escape', 27);
const rejected = async (name, file, error) => {
  await paste(JSON.stringify(file));
  check(`${name} is refused`, error.test(await errorsShown()), 'true');
  check(`${name} leaves the current state alone`, await ev(`JSON.stringify(Object.entries(localStorage).sort())`) === before, 'true');
  await press('Escape', 'Escape', 27);
};
await paste(JSON.stringify({ format: 'write-timer-state', version: 1, presets: [{ minutes: 75, seconds: 0 }], theme: 'blue' }));
const rangeErrors = await errorsShown();
check('out-of-range field is named', /presets\[0\]\.minutes must be at most 59/.test(rangeErrors), 'true');
check('bad enum is named', /theme must be one of "dark", "light"/.test(rangeErrors), 'true');
await press('Escape', 'Escape', 27);
await rejected('unknown format', { format: 'other-timer', version: 1 }, /format must be "write-timer-state"/);
await rejected('missing version', { format: 'write-timer-state' }, /version is missing/);
await rejected('newer version', { format: 'write-timer-state', version: 2 }, /newer copy of this page/);
await rejected('fractional remaining time', { format: 'write-timer-state', version: 1, timer: { remainingMs: 1.5 } }, /timer\.remainingMs must be a whole number/);
await rejected('remaining time over maximum', { format: 'write-timer-state', version: 1, timer: { remainingMs: 360000000 } }, /timer\.remainingMs must be at most 359999999/);
await rejected('remaining time below minimum', { format: 'write-timer-state', version: 1, timer: { remainingMs: -359999001 } }, /timer\.remainingMs must be at least -359999000/);
await rejected('volume below minimum', { format: 'write-timer-state', version: 1, sound: { volume: -0.01 } }, /sound\.volume must be at least 0/);
await rejected('volume above maximum', { format: 'write-timer-state', version: 1, sound: { volume: 1.01 } }, /sound\.volume must be at most 1/);
await rejected('required entry field', { format: 'write-timer-state', version: 1, presets: [{ minutes: 1 }] }, /presets\[0\]\.seconds is missing/);
await rejected('unsupported time zone type', { format: 'write-timer-state', version: 1, clock: { timeZone: 3 } }, /clock\.timeZone must be string/);
await rejected('timestamp over maximum', { format: 'write-timer-state', version: 1, history: [{ minutes: 0, seconds: 1, timestamp: 8640000000000001 }] }, /history\[0\]\.timestamp must be at most 8640000000000000/);
await rejected('unknown field', { format: 'write-timer-state', version: 1, sound: { volume: 0.5, loud: true } }, /sound\.loud isn't something this file can hold/);
const tooManyPresets = Array.from({ length: 101 }, () => ({ minutes: 0, seconds: 1 }));
await rejected('preset count over maximum', { format: 'write-timer-state', version: 1, presets: tooManyPresets }, /presets can hold at most 100/);

// Force one mid-transaction quota error. replaceStorage must restore the
// complete previous store, remain on the page, and give the user a reason.
await paste(JSON.stringify({ format: 'write-timer-state', version: 1, presets: [] }));
await ev(`(()=>{const original=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(key,value){if(fail&&key==='timerAppPresets'){fail=false;throw new DOMException('quota','QuotaExceededError')}return original.call(this,key,value)};return 'armed'})()`);
await press('`', 'Backquote', 192, '`');
await sleep(500);
check('storage failure is explained', /wouldn’t store all of it/.test(await errorsShown()), 'true');
check('storage failure returns to import editing', await dialogTitle(), 'IMPORT / EXPORT');
check('failed import rolls back every stored key', await ev(`JSON.stringify(Object.entries(localStorage).sort())`), before);

check('nothing was written', await ev(`JSON.stringify(Object.entries(localStorage).sort())`) === before, 'true');

// 3. Into an empty browser and back out again: the same file.
await seedAndLoad(`(localStorage.clear(), 'ok')`);
check('cleared to the dark default', await ev(`document.documentElement.dataset.theme`), 'dark');
await paste(JSON.stringify(first));
check('a good file asks first', await dialogTitle(), 'REPLACE EVERYTHING?');
check('saying what it holds', /2 presets[\s\S]*1 history row/.test(await ev(`document.querySelector('[data-transfer-summary]')?.textContent ?? ''`)), 'true');
await press('Escape', 'Escape', 27);
check('ESC backs out to the text', await dialogTitle(), 'IMPORT / EXPORT');
check('with the text still there', (await ev(`document.querySelector('[data-transfer-text="import"]')?.value.length`)) > 100, 'true');
await clickEl(dialogButton('IMPORT', false), 'IMPORT button again');
check('asks again', await dialogTitle(), 'REPLACE EVERYTHING?');
leavePrompts = 0;
await press('`', 'Backquote', 192, '`');
await sleep(2800);
check('the reload went unchallenged', leavePrompts, 0);
check('light theme came in', await ev(`document.documentElement.dataset.theme`), 'light');
const second = await exported();
check('round trip is exact', withoutStamp(second) === withoutStamp(first), 'true');

// 4. A running timer exports as running and imports paused.
await seedAndLoad(`(()=>{localStorage.clear();localStorage.setItem('timerAppState',JSON.stringify({seconds:600,milliseconds:0,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0}));return 'ok'})()`);
await press('Tab', 'Tab', 9);
await sleep(1500);
const running = await exported();
check('running exports as running', running?.timer.status, 'running');
check('at the time it had reached', running?.timer.remainingMs < 600000 && running?.timer.remainingMs > 590000, 'true');
// The dialog owns the keyboard: TAB inside it must not pause the run.
await clickEl(OPEN, 'import/export button');
await press('Tab', 'Tab', 9);
await press('Escape', 'Escape', 27);
check('TAB in the dialog left the run alone', (await exported())?.timer.status, 'running');
await paste(JSON.stringify(running));
// Over a live run this time, which is where the leave guard is up.
leavePrompts = 0;
await press('`', 'Backquote', 192, '`');
await sleep(2800);
check('over a live run, unchallenged too', leavePrompts, 0);
check('and imports paused', (await exported())?.timer.status, 'paused');

// 5. A partial file: what it holds goes in, everything else is default.
await paste(JSON.stringify({ format: 'write-timer-state', version: 1, presets: [{ minutes: 5, seconds: 0 }] }));
await press('`', 'Backquote', 192, '`');
await sleep(2800);
const partial = await exported();
check('its one preset', JSON.stringify(partial?.presets.map(({ hours, minutes, seconds, negative }) => [hours, minutes, seconds, negative])), '[[0,5,0,false]]');
check('given an id', typeof partial?.presets[0].id === 'string' && partial.presets[0].id !== '', 'true');
check('the rest at defaults', `${partial?.theme} ${partial?.history.length} ${partial?.sound.volume} ${partial?.timer.status}`, 'dark 0 0.5 idle');

// Exact representable bounds matter: the upper edge carries milliseconds
// and the lower edge remains negative instead of flooring past the schema.
await paste(JSON.stringify({
  format: 'write-timer-state',
  version: 1,
  timer: { status: 'paused', remainingMs: 359999999 },
  clock: { timeZone: 'Mars/Olympus_Mons' },
  presets: [
    { id: 'duplicate', minutes: 59, seconds: 59, timestamp: 8640000000000000 },
    { id: 'duplicate', minutes: 0, seconds: 0 },
  ],
  history: [{ id: 'duplicate', minutes: 0, seconds: 1 }],
}));
check('unavailable zone warning is shown', /Mars\/Olympus_Mons/.test(await ev(`document.querySelector('[data-transfer-summary]')?.textContent ?? ''`)), 'true');
await press('`', 'Backquote', 192, '`');
await sleep(2800);
const bounded = await exported();
check('upper timer bound survives import/export', bounded?.timer.remainingMs, 359999999);
check('unknown zone falls back to default', bounded?.clock.timeZone, 'America/New_York');
const ids = [...bounded.presets, ...bounded.history].map((entry) => entry.id);
check('duplicate identifiers are repaired across lists', new Set(ids).size, ids.length);
check('presets preserve their upper time and timestamp bounds', `${bounded.presets[0].minutes}:${bounded.presets[0].seconds} ${bounded.presets[0].timestamp}`, '59:59 8640000000000000');
await press('Escape', 'Escape', 27);

await paste(JSON.stringify({
  format: 'write-timer-state',
  version: 1,
  timer: { status: 'paused', remainingMs: -359999000 },
}));
await press('`', 'Backquote', 192, '`');
await sleep(2800);
check('lower timer bound survives import/export', (await exported())?.timer.remainingMs, -359999000);
await press('Escape', 'Escape', 27);

await paste(JSON.stringify({
  format: 'write-timer-state',
  version: 1,
  timer: {
    status: 'paused',
    remainingMs: -1,
    configured: { hours: 0, minutes: 0, seconds: 1, negative: true },
  },
}));
await press('`', 'Backquote', 192, '`');
await sleep(2800);
const crossingZero = await exported();
check('negative one millisecond survives the zero crossing', crossingZero?.timer.remainingMs, -1);
check('count-up configuration keeps its sign', crossingZero?.timer.configured.negative, true);
await press('Escape', 'Escape', 27);

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(40)} got=${r.got.slice(0, 60).padEnd(16)} want=${r.want.slice(0, 60)}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
