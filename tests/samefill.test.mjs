// The three time boxes and the preset box fill the same way: digits enter
// from the right, the padding in front of them is overridden rather than
// appended to, and the oldest digit drops once the box is full.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 10100);
const profile = mkdtempSync(join(tmpdir(), 'samefill-'));
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
  localStorage.setItem('timerSilentMode','true'), localStorage.setItem('wordCounterCollapsed','true'),
  localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2600);

// The case as described: a box reading 00, one 7, then another.
await clickEl(SEC);
await digit('7');
check('SECONDS: first 7 overrides the padding', await val(SEC), '07');
await digit('7');
check('SECONDS: second 7 fills the box', await val(SEC), '77');
// Full, and nothing left to shed: the keystroke is refused rather than
// pushing a digit off the left.
await digit('5');
check('SECONDS: a third is refused when full', await val(SEC), '77');
// But a leading zero is still shed, which is what "override the 0" means.
await clear(SEC);
await digit('0');
await digit('9');
check('SECONDS: 0 then 9 reads 09', await val(SEC), '09');
await digit('4');
check('SECONDS: the leading 0 gives way', await val(SEC), '94');

// The same keystrokes in the preset box, which is the box it should match.
await clickEl(ADD);
await clear(ADD);
await digit('7');
check('preset: first 7', await val(ADD), '0:07');
await digit('7');
check('preset: second 7', await val(ADD), '0:77');
await digit('5');
check('preset: a third digit appends', await val(ADD), '7:75');

// Padding is overridden, not appended to, in the minutes box too.
const MIN = `document.querySelectorAll('.time-fields-box input')[1]`;
await clickEl(MIN);
await digit('4');
check('MINUTES: one digit reads as 04', await val(MIN), '04');
// Backspace takes the last digit off. Carrying the padding back into the
// value meant "04" deleted to "0", which redrew as "00" and deleted to "0"
// again — the box stuck there and the key stopped doing anything. With the
// last real digit gone it is untouched again, back on its placeholder, and
// leaving it commits nothing. The preset box does the same with its own
// padding, which is the point.
await key('Backspace', 'Backspace', 8);
check('MINUTES: backspace empties the box', await val(MIN), 'MM');
await key('Backspace', 'Backspace', 8);
check('MINUTES: and it stays empty', await val(MIN), 'MM');
await clear(ADD);
await digit('7');
await key('Backspace', 'Backspace', 8);
check('preset: backspace does the same', await val(ADD), 'HH:MM:SS');

// Committing 75 into a seconds box carries, like typing it into a preset.
await clickEl(SEC);
await clear(SEC);
await digit('7');
await digit('5');
await key('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(600);
check('SECONDS: 75 carried into a minute', await val(SEC), '15');
// The minutes box was emptied rather than zeroed above, so it still holds
// the 1 it was seeded with and the carry puts one on top of it.
check('and the minute landed', await val(MIN), '02');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(38)} got=${String(r.got).padEnd(8)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
