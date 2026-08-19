// Findings 2, 3 and 7 from the review, each reproduced then re-checked.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9400);
const profile = mkdtempSync(join(tmpdir(), 'review-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 100 && !wsUrl; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
  if (!wsUrl) await sleep(100);
}
const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 1; const pending = new Map();
let dialog = null;
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
  if (x.method === 'Page.javascriptDialogOpening') dialog = x.params;
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const key = async (k) => {
  for (const type of ['rawKeyDown', 'char', 'keyUp']) await send('Input.dispatchKeyEvent', { type, ...k });
  await sleep(700);
};
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(600);
};
const clickSel = async (sel) => {
  const b = await ev(`(()=>{const e=${sel};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!b) throw new Error('no element for ' + sel);
  await clickAt(b.x, b.y);
};
const out = [];
const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want), pass: JSON.stringify(got) === JSON.stringify(want) });

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
await ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), localStorage.setItem('wordCounterCollapsed','false'), localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('wordCounterFullscreen','true'), localStorage.setItem('wordCounterText',''), 'ok'`);
await send('Page.reload', {});
await sleep(3000);

const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
check('started in fullscreen', await ev(`!!document.querySelector('.fixed.inset-0')`), true);

// Finding 2: click a button in the fullscreen row, then type letters.
await clickSel(`document.querySelector('[aria-label*="alarm" i], [aria-label*="repeat" i]')`);
check('focus is on a button, not the text', await ev(`document.activeElement?.tagName`), 'BUTTON');
await key({ key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, text: 's' });
await key({ key: 'r', code: 'KeyR', windowsVirtualKeyCode: 82, text: 'r' });
const afterLetters = await ev(`JSON.stringify({dialog:!!document.querySelector('[role="alertdialog"][data-state="open"]'), status:[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim(), active:document.activeElement?.tagName})`);
const al = JSON.parse(afterLetters);
check('S/R did not open a timer dialog', al.dialog, false);
check('S/R did not change timer state', al.status, 'READY');
check('focus moved to the textarea', al.active, 'TEXTAREA');

// Finding 7: the clock's zone picker keeps its type-ahead.
const sel = await ev(`(()=>{const s=document.querySelector('select');if(!s)return null;s.focus();return s.getAttribute('aria-label')})()`);
if (sel) {
  await key({ key: 'z', code: 'KeyZ', windowsVirtualKeyCode: 90, text: 'z' });
  check('select keeps focus for type-ahead', await ev(`document.activeElement?.tagName`), 'SELECT');
} else {
  check('found the zone select', false, true);
}

// Finding 3: site RESET while a timer runs must not be blocked by the leave guard.
await ev(`localStorage.setItem('wordCounterFullscreen','false'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);
await clickAt(700, 500);
await key({ key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
check('timer running before RESET', await status(), 'RUNNING');
check('leave guard armed', await ev(`document.dispatchEvent, window.dispatchEvent(new Event('beforeunload',{cancelable:true})) === false`), true);
await clickSel(`document.querySelector('[aria-label="Reset the website to defaults"]')`);
await sleep(600);
check('RESET asked first', await ev(`!!document.querySelector('[role="alertdialog"][data-state="open"]')`), true);
dialog = null;
await key({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
await sleep(2500);
check('no browser leave prompt blocked the reload', !!dialog, false);
const after = await ev(`JSON.stringify({keys:Object.keys(localStorage).length, status:[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()})`);
const a = JSON.parse(after);
check('app reloaded to a clean READY state', a.status, 'READY');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(38)} got=${String(r.got).padEnd(12)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);
if (dialog) await send('Page.handleJavaScriptDialog', { accept: true });
ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch {}
process.exit(0);
