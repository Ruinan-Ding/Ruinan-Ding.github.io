// Enter is a global shortcut now, so prove it still belongs to whatever is
// being typed into: a newline in the word counter, a commit in a time field,
// and no timer started behind either.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9382);
const profile = mkdtempSync(join(tmpdir(), 'typing-'));
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
const evaluate = async (e) => (await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.value;
const pressEnter = async () => {
  for (const type of ['rawKeyDown', 'char', 'keyUp']) {
    await send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
  }
  await sleep(700);
};
const clickAt = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  await sleep(500);
};
const typeText = async (s) => {
  for (const ch of s) await send('Input.dispatchKeyEvent', { type: 'char', text: ch });
  await sleep(400);
};
// Digit entry listens on keydown, which a bare char event never produces.
const typeDigits = async (s) => {
  for (const ch of s) {
    const k = { key: ch, code: `Digit${ch}`, windowsVirtualKeyCode: 48 + Number(ch) };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
    await send('Input.dispatchKeyEvent', { type: 'char', ...k, text: ch });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
    await sleep(150);
  }
  await sleep(400);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 850, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
await evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), localStorage.setItem('wordCounterText','one'), localStorage.setItem('wordCounterCollapsed','false'), localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('timerSidebarHidden','false'), localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);

const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const out = [];
const check = (name, got, want) => out.push({ name, got: JSON.stringify(got), want: JSON.stringify(want), pass: JSON.stringify(got) === JSON.stringify(want) });

// --- word counter: Enter must make a newline, not start the timer
const ta = await evaluate(`(()=>{const t=document.querySelector('textarea');const r=t.getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+20)}})()`);
await clickAt(ta.x, ta.y);
await evaluate(`(()=>{const t=document.querySelector('textarea');t.setSelectionRange(t.value.length,t.value.length);return t.value})()`);
await pressEnter();
await typeText('two');
check('newline typed in word counter', await evaluate(`document.querySelector('textarea').value`), 'one\ntwo');
check('timer did not start from the textarea', await status(), 'READY');

// --- time field: Enter must commit the digits, not start the timer
const mins = await evaluate(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/minute/i.test(x.getAttribute('aria-label')||''));if(!i)return null;const r=i.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),label:i.getAttribute('aria-label')}})()`);
check('found the minutes field', !!mins, true);
if (mins) {
  await clickAt(mins.x, mins.y);
  await typeDigits('07');
  await pressEnter();
  const after = await evaluate(`(()=>{const i=[...document.querySelectorAll('input')].find(x=>/minute/i.test(x.getAttribute('aria-label')||''));return {value:i.value, dialog:!!document.querySelector('[role="alertdialog"][data-state="open"]'), status:[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()}})()`);
  // Enter in a field commits it. An idle timer has nothing at stake — see
  // hasRunToLose — so there's no question in the way and the digits land
  // where they were typed. What matters is that the keystroke reached the
  // field and not the global start shortcut.
  check('ENTER committed the digits', after.value, '07');
  check('an idle edit asks nothing', after.dialog, false);
  check('timer did not start from the field', after.status, 'READY');
  // Committing blurs the field, so the next ENTER is the window's again.
  await pressEnter();
  await sleep(400);
  check('ENTER after the commit starts the timer', await status(), 'RUNNING');
}

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(36)} got=${String(r.got).padEnd(14)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
