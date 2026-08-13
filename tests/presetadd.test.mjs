// Preset entry now carries like the three boxes do, and is only refused
// when the carry has nowhere left to go.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9990);
const profile = mkdtempSync(join(tmpdir(), 'presetadd-'));
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
  await sleep(280);
};
const clickEl = async (expr) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) return false;
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(450);
  return true;
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const ADD = `document.querySelector('input[aria-label="New preset time"]')`;
const rows = () => ev(`[...document.querySelectorAll('button')].filter(b=>/^-?\\d+:\\d\\d(:\\d\\d)?$/.test(b.textContent.trim())).map(b=>b.textContent.trim())`);
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);

const enter = async (text, minus = false) => {
  await clickEl(ADD);
  await ev(`(()=>{const e=${ADD};e.focus();return 'ok'})()`);
  for (let i = 0; i < 8; i++) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
  await sleep(200);
  for (const ch of text) await press(ch, `Digit${ch}`, 48 + Number(ch), ch);
  if (minus) await press('-', 'Minus', 189, '-');
  await press('Enter', 'Enter', 13, String.fromCharCode(13));
  await sleep(700);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2400);
await ev(`localStorage.setItem('timerAppPresets','[]'), localStorage.setItem('timerSkipConfirmations','true'),
  localStorage.setItem('timerSilentMode','true'), localStorage.setItem('wordCounterCollapsed','true'),
  localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('timerSidebarHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2600);

// 161 is 1m 61s, which carries to 2:01 rather than being refused or clamped.
await enter('161');
check('161 carries to 2:01', (await rows()).includes('2:01'), 'true');
check('and asked nothing', await dialogTitle(), 'null');

// 9999 is 99m 99s, which carries into an hour.
await enter('9999');
check('9999 carries to 1:40:39', (await rows()).includes('1:40:39'), 'true');

// A minus makes it a time that starts already counting up.
await enter('105', true);
check('minus adds a negative preset', (await rows()).some((r) => r.startsWith('-')), 'true');

// 99:99:99 has no hour left to carry into, so it is refused — with
// confirmations on, since the whole point of the refusal is the question,
// and skipConfirmations answers it silently by design.
await ev(`localStorage.setItem('timerSkipConfirmations','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2600);
await enter('999999');
check('999999 is refused', await dialogTitle(), 'TIME CORRECTED');

console.log('rows:', JSON.stringify(await rows()));
for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} got=${r.got.padEnd(16)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
