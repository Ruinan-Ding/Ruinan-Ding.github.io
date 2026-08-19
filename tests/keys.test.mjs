// Enter starts, Enter confirms, Space no longer starts, Esc leaves the
// word counter. Real key events through CDP so focus and default
// activation behave the way they will for a person.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9380);
const profile = mkdtempSync(join(tmpdir(), 'keys-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
ws.onmessage = (m) => { const x = JSON.parse(m.data); if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const KEYS = {
  Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' },
  Space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, text: ' ' },
  Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
  Tab: { key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 },
};
const press = async (name) => {
  const k = KEYS[name];
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
  if (k.text) await send('Input.dispatchKeyEvent', { type: 'char', ...k });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
  await sleep(700);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 850, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
await evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('wordCounterCollapsed','false'), localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('wordCounterFullscreen','false'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);

const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogOpen = () => evaluate(`!!document.querySelector('[role="alertdialog"][data-state="open"]')`);
// The hint is printed on the button it works now, so this reads it off
// that button and returns it beside the label it sits above: "which key"
// and "which button" were two facts the old body-wide text search could
// only check one of.
const CTRL_FIRST = `[...document.querySelectorAll('button')].find(b=>{const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&/^(START|PAUSE|RESUME)$/.test(m.textContent.trim());})`;
// The three rows in order, which is the thing that changed: the key on
// top, the label in the middle, what it acts on underneath.
const hints = () => evaluate(`(()=>{const b=${CTRL_FIRST};if(!b)return null;return [...b.children].map(c=>c.textContent.trim()).join(' | ')})()`);
// Still in the markup either way, so the button keeps its size whether
// the hint is showing or not. Whether it draws is the question, and a
// client rect is the one answer that covers every way it can be taken
// out: it has been visibility:hidden and display:none at different
// points, and a check written against one quietly passes under the other.
const hintShown = () => evaluate(`(()=>{const h=document.querySelector('.control-hint');return !!h&&h.getClientRects().length>0})()`);
// The box has to be the same box either way: that it stops moving when the
// hint goes is the whole reason the hint is hidden instead of dropped.
const ctrlBox = () => evaluate(`(()=>{const b=${CTRL_FIRST};if(!b)return null;const r=b.getBoundingClientRect();return Math.round(r.width)+'x'+Math.round(r.height)})()`);
const focusTag = () => evaluate(`document.activeElement?.tagName ?? null`);
// A click somewhere inert, for the user activation the browser wants.
const clickBody = async () => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 700, y: 430, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 700, y: 430, button: 'left', clickCount: 1 });
  await sleep(300);
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });

check('hint advertises TAB', await hints(), 'Press TAB to | START | the timer');
await clickBody();

check('idle status', await status(), 'READY');
await press('Space');
check('SPACE no longer starts', await status(), 'READY');
await press('Tab');
check('TAB starts', await status(), 'RUNNING');
check('running hint', await hints(), 'Press TAB to | PAUSE | the timer');
await press('Tab');
check('TAB pauses', await status(), 'PAUSED');
await press('Tab');
check('TAB resumes', await status(), 'RUNNING');
// ENTER is the dialog's key now, not the timer's: loose on the page it
// should do nothing at all.
await press('Enter');
check('ENTER no longer toggles', await status(), 'RUNNING');

// S opens the stop confirmation; ENTER should take it. The dialog keeps
// ENTER — only the timer's own start/pause moved to TAB.
await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 });
await send('Input.dispatchKeyEvent', { type: 'char', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83, text: 's' });
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', windowsVirtualKeyCode: 83 });
await sleep(800);
check('S opens a dialog', await dialogOpen(), 'true');
check('dialog advertises ENTER', await evaluate(`document.querySelector('[role="alertdialog"]')?.innerText.includes('(ENTER)')`), 'true');
// Radix focuses Cancel on open, so an unguarded Space pressed it and
// answered the question. It should do nothing at all.
await press('Space');
check('SPACE leaves the dialog open', await dialogOpen(), 'true');
check('SPACE answered nothing', await status(), 'RUNNING');
await press('Enter');
check('ENTER confirms the dialog', await dialogOpen(), 'false');
check('timer stopped', await status(), 'READY');

// Esc leaves the word counter.
const box = await evaluate(`(()=>{const t=document.querySelector('textarea');if(!t)return null;const r=t.getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+20)}})()`);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
await sleep(600);
check('clicked into word counter', await focusTag(), 'TEXTAREA');
// The hints go while typing rather than saying they are disabled: the
// old wording was that sentence three times over, about buttons nobody
// looking at the textarea was looking at.
const boxBefore = await ctrlBox();
check('hints go while typing', await hintShown(), 'false');
check('the button did not resize', await ctrlBox(), boxBefore);
await press('Escape');
check('ESC leaves the textarea', await focusTag(), 'BODY');
check('hints back after ESC', await hintShown(), 'true');
await press('Tab');
check('TAB starts again after ESC', await status(), 'RUNNING');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(34)} got=${r.got.padEnd(30)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
