// The dialog paths the focus change touched that nothing else covers: the
// one-button acknowledgements, and the site RESET, which is the only
// dialog that can never be silenced.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9950);
const profile = mkdtempSync(join(tmpdir(), 'ack-'));
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
const press = async (key, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(500);
};
const clickEl = async (expr, name) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(700);
  return true;
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
const focused = () => ev(`document.activeElement?.textContent?.trim().slice(0,22) ?? document.activeElement?.tagName ?? null`);
const presetCount = () => ev(`[...document.querySelectorAll('button')].filter(b=>/^\\d+:\\d\\d(:\\d\\d)?$/.test(b.textContent.trim())).length`);

const seed = () => ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})),
  localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('timerSidebarHidden','false'), localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);
await seed();
await send('Page.reload', {});
await sleep(2800);

// 1. An acknowledgement: add a preset the list already holds.
const ADD = `document.querySelector('input[aria-label="New preset time"]')`;
const addBox = await ev(`(()=>{const e=${ADD};return !!e})()`);
check('found the add box', addBox, 'true');
const first = await ev(`[...document.querySelectorAll('button')].filter(b=>/^\\d+:\\d\\d(:\\d\\d)?$/.test(b.textContent.trim()))[0]?.textContent.trim() ?? null`);
await clickEl(ADD, 'add box');
await ev(`(()=>{const i=${ADD};i.focus();i.select();return 'ok'})()`);
for (const ch of (first || '1:05').replace(/:/g, '')) {
  await press(ch, `Digit${ch}`, 48 + Number(ch), ch);
}
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(700);
check('duplicate is acknowledged', await dialogTitle(), 'ALREADY SAVED');
check('ENTER is pointed at OK', /OK/.test(await focused() ?? ''), 'true');
// ESC must land on the same result as OK for an acknowledgement.
await press('Escape', 'Escape', 27);
check('ESC closed it', await dialogTitle(), 'null');
check('nothing was added', await presetCount(), String(await presetCount()));

// 2. The site RESET: the one dialog that can never be silenced.
await seed();
await send('Page.reload', {});
await sleep(2800);
await clickEl(`document.querySelector('[aria-label="Reset the website to defaults"]')`, 'bin button');
check('site RESET asks', await dialogTitle(), 'CLEAR CACHE');
check('no dont-ask-again offered', await ev(`!document.querySelector('[role="alertdialog"] [data-dont-ask]')`), 'true');
check('ENTER is pointed at CLEAR', /CLEAR/.test(await focused() ?? ''), 'true');
await press('Escape', 'Escape', 27);
check('ESC backed out', await dialogTitle(), 'null');
// Reopen: the previous dialog must leave nothing behind that changes this one.
await clickEl(`document.querySelector('[aria-label="Reset the website to defaults"]')`, 'bin again');
check('reopens the same way', await dialogTitle(), 'CLEAR CACHE');
check('and ENTER still points at CLEAR', /CLEAR/.test(await focused() ?? ''), 'true');
await press('Escape', 'Escape', 27);

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(40)} got=${r.got.padEnd(16)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
