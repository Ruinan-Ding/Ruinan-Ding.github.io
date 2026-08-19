// Four behaviours: equal control-button boxes, a muted volume that stays
// where it was left, an alarm that still flashes while muted, and seeking
// that only asks where there's a run to lose.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9600);
const profile = mkdtempSync(join(tmpdir(), 'alarm-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* not up */ }
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Page.javascriptDialogOpening') {
    ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    return;
  }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const press = async (key, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(600);
};
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(700);
};
const clickEl = async (expr, name) => {
  const p = await evaluate(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await clickAt(p.x, p.y);
  return true;
};
const activate = async () => { await evaluate(`document.activeElement?.blur?.(), 'ok'`); await press('Shift', 'ShiftLeft', 16); };

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });

// A control button carries its key hint above its label now, so its
// textContent is "Press ENTER to" + "the timer" + "START". Matching on the
// label alone would find nothing; matching on endsWith alone would find
// anything ending in those letters. Both, and the hint's own prefix.
const CTRL = `[...document.querySelectorAll('button')].filter(b=>{const t=b.textContent.trim();const m=[...b.children].find(c=>!c.classList.contains('control-hint'));const n=m?m.textContent.trim():t;return ['START','PAUSE','RESUME','RESET','STOP'].includes(n);})`;
const widths = () => evaluate(`(()=>{const b=${CTRL};return b.map(x=>x.textContent.trim()+':'+Math.round(x.getBoundingClientRect().width)).join(' ')})()`);
const widthsEqual = () => evaluate(`(()=>{const w=${CTRL}.map(x=>Math.round(x.getBoundingClientRect().width));return w.length>1 && new Set(w).size===1})()`);
const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogTitle = () => evaluate(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
const seed = (extra = '') => evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:2,isPaused:false,isRunning:false,hours:0,minutes:0,timerSeconds:2})),
  localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerHasMutedBefore','true'), localStorage.setItem('timerAlarmLoop','true'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'), localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), ${extra} 'ok'`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
await seed();
await send('Page.reload', {});
await sleep(3000);
await activate();

// 1. Every control button is the same box, in every run state.
check('idle widths equal', await widthsEqual(), 'true');
const idleW = await widths();
await press('Enter', 'Enter', 13, '\r');
check('running now', await status(), 'RUNNING');
check('running widths equal', await widthsEqual(), 'true');
await press('Enter', 'Enter', 13, '\r');
check('paused now', await status(), 'PAUSED');
check('paused widths equal (RESUME)', await widthsEqual(), 'true');
const pausedW = await widths();
check('same box across states', idleW.split(' ')[0].split(':')[1] === pausedW.split(' ')[0].split(':')[1], 'true');

// 2. Volume left at 0 stays at 0 through mute and unmute.
await seed(`localStorage.setItem('timerVolume','0'), localStorage.setItem('timerSilentMode','true'),`);
await send('Page.reload', {});
await sleep(3000);
await activate();
check('starts muted at 0', await evaluate(`localStorage.getItem('timerVolume')`), '0');
await clickEl(`document.querySelector('[aria-label="Unmute"]')`, 'unmute');
check('unmuted', await evaluate(`!!document.querySelector('[aria-label="Mute"]')`), 'true');
check('volume still 0', await evaluate(`document.querySelector('input[type=range]')?.value`), '0');
await clickEl(`document.querySelector('[aria-label="Mute"]')`, 'mute again');
await clickEl(`document.querySelector('[aria-label="Unmute"]')`, 'unmute again');
check('volume still 0 after a round trip', await evaluate(`document.querySelector('input[type=range]')?.value`), '0');

// 3. A muted alarm still flashes the window and reddens the digits.
await seed(`localStorage.setItem('timerSilentMode','true'),`);
await send('Page.reload', {});
await sleep(3000);
await activate();
await press('Enter', 'Enter', 13, '\r');
await sleep(3000);
// .h-dvh.flex.overflow-hidden, not .h-dvh: there are two elements with
// that class and the outer one is an inert wrapper that never changes
// colour. Reading it reported "never flashed" for a window that was
// flashing the whole time.
// Watched with a MutationObserver rather than polled — a flash is one
// beep long, and a sample interval can step over every one of them.
const sawRed = await evaluate(`(async () => {
  const root = document.querySelector('.h-dvh.flex.overflow-hidden');
  const seen = new Set([root.className]);
  const obs = new MutationObserver(() => seen.add(root.className));
  obs.observe(root, { attributes: true, attributeFilter: ['class'] });
  await new Promise((r) => setTimeout(r, 5000));
  obs.disconnect();
  return [...seen].some((c) => c.includes('bg-red-500'));
})()`);
check('muted alarm flashes the window red', sawRed, 'true');
check('muted alarm still muted', await evaluate(`!!document.querySelector('[aria-label="Unmute"]')`), 'true');

// 4. Seeking always asks, in the words for the state it was clicked in.
// The bar is 8px tall and sits under the digits, and on an idle timer a
// seek rewrites the configured time outright, so no state skips it.
const BAR = `[...document.querySelectorAll('div')].find(d=>d.className.includes('cursor-pointer')&&d.className.includes('border-2')&&d.style.height)`;
await seed();
await send('Page.reload', {});
await sleep(3000);
await activate();
await clickEl(BAR, 'bar while unstarted');
check('idle seek asks', await dialogTitle(), 'SET TIME');
await press('Escape', 'Escape', 27);
await activate();
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await clickEl(BAR, 'bar while running');
check('running seek asks', await dialogTitle(), 'MOVE TIMER');
await press('Escape', 'Escape', 27);
await sleep(3500); // past zero
await clickEl(BAR, 'bar while ringing');
check('ringing seek asks', await dialogTitle(), 'MOVE TIMER');
await press('Escape', 'Escape', 27);

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} got=${r.got.padEnd(16)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);
console.log(`idle:   ${idleW}\npaused: ${pausedW}`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
