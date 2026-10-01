// A typed digit lands where the caret is. Nothing to the right of it moves
// or is lost, and room comes off the padding on the left — a leading zero
// and nothing else.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 10200);
const profile = mkdtempSync(join(tmpdir(), 'joinright-'));
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
  await sleep(190);
};
const digit = (d) => key(d, `Digit${d}`, 48 + Number(d), d);
const clickEl = async (expr) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) return false;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(320);
  return true;
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const SEC = `document.querySelectorAll('.time-fields-box input')[2]`;
const ADD = `document.querySelector('input[aria-label="New preset time"]')`;
const val = (sel) => ev(`${sel}.value`);
const caretTo = (sel, at) => ev(`(()=>{const e=${sel};e.focus();e.setSelectionRange(${at}, ${at});return e.selectionStart})()`);
const clear = async (sel) => {
  await ev(`(()=>{const e=${sel};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
  await key('Backspace', 'Backspace', 8);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2400);
await ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:0,isPaused:false,isRunning:false,hours:0,minutes:0,timerSeconds:0})),
  localStorage.setItem('timerConfiguredNegative','false'), localStorage.setItem('timerSkipConfirmations','true'),
  localStorage.setItem('timerSilentMode','true'), localStorage.setItem('timerAppPresets','[]'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('timerSidebarHidden','false'), localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2600);

// The case that was wrong: caret between the 0 and the 7 of "07".
await clickEl(SEC);
await digit('7');
check('one digit reads 07', await val(SEC), '07');
await caretTo(SEC, 1);          // between the 0 and the 7
await digit('5');
// 57, not 75: the 5 goes where the caret was and the 7 keeps its place.
check('the digit landed at the caret', await val(SEC), '57');

// Full and no padding left: the keystroke is refused, wherever the caret is.
await caretTo(SEC, 1);
await digit('3');
check('full box refuses, mid-caret', await val(SEC), '57');
await caretTo(SEC, 2);
await digit('3');
check('full box refuses at the end too', await val(SEC), '57');

// The same in the six-digit box, with room to spare.
await clickEl(ADD);
await clear(ADD);
for (const d of '1234') await digit(d);
check('preset reads 12:34', await val(ADD), '12:34');
await caretTo(ADD, 1);          // between the 1 and the 2
await digit('9');
// The 9 sits where the caret was; 2, 3 and 4 keep their places, and the 1
// moves up into the hours because that is where the room came from.
check('the digit landed at the caret', await val(ADD), '1:92:34');

// Highlighting says exactly what to be rid of, so that still replaces.
await ev(`(()=>{const e=${ADD};e.focus();e.setSelectionRange(0, e.value.length);return 'ok'})()`);
await digit('8');
check('a selection is replaced', await val(ADD), '0:08');

// And the padding zero still gives way at the end.
await clear(SEC);
await digit('0');
await digit('9');
check('0 then 9 reads 09', await val(SEC), '09');
await digit('4');
check('the leading 0 gave way', await val(SEC), '94');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(42)} got=${String(r.got).padEnd(9)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
