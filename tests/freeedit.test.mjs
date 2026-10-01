// The boxes as ordinary text inputs: caret where you put it, selection,
// mid-string deletion, and a filter that only lets digits and "-" through.
// Plus the overflow report the three boxes now share with preset entry.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 10040);
const profile = mkdtempSync(join(tmpdir(), 'freeedit-'));
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
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); return; }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const key = async (k, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key: k, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  await sleep(200);
};
const digit = (d) => key(d, `Digit${d}`, 48 + Number(d), d);
const clickEl = async (expr) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) return false;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(350);
  return true;
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const ADD = `document.querySelector('input[aria-label="New preset time"]')`;
const SEC = `document.querySelectorAll('.time-fields-box input')[2]`;
const boxValue = (sel) => ev(`${sel}.value`);
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
// Put the caret at an offset inside a focused box.
const caretTo = (sel, at) => ev(`(()=>{const e=${sel};e.focus();e.setSelectionRange(${at}, ${at});return e.selectionStart})()`);
const caretAt = (sel) => ev(`${sel}.selectionStart`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2400);
await ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:0,isPaused:false,isRunning:false,hours:0,minutes:0,timerSeconds:0})),
  localStorage.setItem('timerConfiguredNegative','false'), localStorage.setItem('timerSkipConfirmations','false'),
  localStorage.setItem('timerDontAskAgain','[]'), localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('timerAppPresets','[]'), localStorage.setItem('wordCounterCollapsed','true'),
  localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2600);

// 1. The preset box takes a caret in the middle and inserts there.
await clickEl(ADD);
for (const d of '105') await digit(d);
check('typed 105', await boxValue(ADD), '1:05');
// The digit lands at the caret. "1:05" with the caret after the colon
// puts the 2 in front of the 05, taking its room from the padding.
await caretTo(ADD, 2);
await digit('2');
check('typed digit lands at the caret', await boxValue(ADD), '12:05');

// 2. Selection replace.
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await digit('9');
check('select-all then type', await boxValue(ADD), '0:09');

// 3. Deleting from the middle rather than only the end.
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await key('Backspace', 'Backspace', 8);
for (const d of '1234') await digit(d);
check('four digits', await boxValue(ADD), '12:34');
// Caret sits just after the ":" — the character the value doesn't hold.
await caretTo(ADD, 3);
await key('Backspace', 'Backspace', 8);
check('backspace over a separator', await boxValue(ADD), '1:34');

// 3b. The caret stays where the edit happened rather than snapping right.
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await key('Backspace', 'Backspace', 8);
for (const d of '1234') await digit(d);
check('typed 1234', await boxValue(ADD), '12:34');
await caretTo(ADD, 1);          // between the 1 and the 2
await digit('9');               // lands there; 2, 3 and 4 keep their places
check('nothing beside the caret was disturbed', await boxValue(ADD), '1:92:34');
check('caret sits after the digit it wrote', await caretAt(ADD), 3);
// Deleting is positional too — it takes the digit the caret is on.
await key('Backspace', 'Backspace', 8);
check('backspace takes that digit back off', await boxValue(ADD), '12:34');
check('caret stayed put after deleting', await caretAt(ADD), 1);

// 4. Letters never reach the value; "-" is the sign, not a character.
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await key('Backspace', 'Backspace', 8);
for (const d of '134') await digit(d);
await key('a', 'KeyA', 65, 'a');
check('a letter is refused', await boxValue(ADD), '1:34');
await key('-', 'Minus', 189, '-');
check('minus signs it', await boxValue(ADD), '-1:34');
await key('-', 'Minus', 189, '-');
check('minus again clears it', await boxValue(ADD), '1:34');

// 4b. The arrows step the whole signed entry by a second, the way they do
// in the time boxes — carries and the crossing at zero included.
await key('ArrowUp', 'ArrowUp', 38);
check('arrow up steps a second', await boxValue(ADD), '1:35');
await key('ArrowDown', 'ArrowDown', 40);
check('arrow down steps back', await boxValue(ADD), '1:34');
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await key('Backspace', 'Backspace', 8);
await key('ArrowDown', 'ArrowDown', 40);
check('down from empty crosses zero', await boxValue(ADD), '-0:01');
await key('ArrowUp', 'ArrowUp', 38);
check('and up comes back', await boxValue(ADD), '0:00');
// Held down: ten presses with no render time between them have to move ten
// seconds, not read the same total ten times and land on one.
for (let i = 0; i < 10; i++) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 });
await sleep(500);
check('ten presses move ten seconds', await boxValue(ADD), '0:10');

// 5. The same in a time box.
await clickEl(SEC);
// Starts empty on the placeholder, like the preset box: the first digit
// typed is the first digit of the new value, not an append to the old one.
check('focusing starts fresh', await boxValue(SEC), 'SS');
await ev(`(()=>{const e=${SEC};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
for (const d of '45') await digit(d);
check('typed over it', await boxValue(SEC), '45');
await key('z', 'KeyZ', 90, 'z');
check('a letter is refused there too', await boxValue(SEC), '45');

// 6. Past 99:59:59 the boxes report, like preset entry does.
await ev(`document.activeElement?.blur?.(), 'ok'`);
await sleep(400);
await ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:359999,isPaused:false,isRunning:false,hours:99,minutes:59,timerSeconds:59})), 'ok'`);
await send('Page.reload', {});
await sleep(2600);
await clickEl(`document.querySelector('.time-fields-box [aria-label="Increase hours"]')`);
check('stepping past the end reports', await dialogTitle(), 'TIME CORRECTED');
const copy = await ev(`document.querySelector('[role="alertdialog"]')?.innerText ?? ''`);
check('and names the corrected time', /99:59:59/.test(copy), 'true');
// ESC lands where OK does. With no case of its own in the confirm switch
// it fell through without closing, and the report sat there through the
// first press.
await key('Escape', 'Escape', 27);
await sleep(700);
check('ESC closes the report', await dialogTitle(), null);
// And its own "don't ask again" is read as well as written: silenced, the
// next overshoot is refused in silence.
await clickEl(`document.querySelector('.time-fields-box [aria-label="Increase hours"]')`);
await ev(`document.querySelector('[data-dont-ask]')?.click(), 'ok'`);
await sleep(250);
await key('Escape', 'Escape', 27);
await sleep(700);
await clickEl(`document.querySelector('.time-fields-box [aria-label="Increase hours"]')`);
check('silenced, it stays quiet', await dialogTitle(), null);

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} got=${String(r.got).padEnd(12)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
