// The HOURS/MINUTES/SECONDS fields as a live remaining-time readout: they
// tick down with the run, an edit moves the run without moving its total,
// and the bar waves green while remaining is past the end of it.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9840);
const profile = mkdtempSync(join(tmpdir(), 'fields-'));
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
  if (x.method === 'Page.javascriptDialogOpening') { ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } })); return; }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

const press = async (key, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(450);
};
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(600);
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

const fields = () => evaluate(`[...document.querySelectorAll('.time-fields-box input')].map(i=>i.value).join(':')`);
const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogTitle = () => evaluate(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
// The fill is the drain bar's first child.
const bar = () => evaluate(`(()=>{
  const track=[...document.querySelectorAll('div')].find(d=>d.className.includes('cursor-pointer')&&d.className.includes('border-2')&&d.style.height);
  if(!track) return null;
  const fill=track.firstElementChild&&track.firstElementChild.style.width?track.firstElementChild:[...track.children].find(c=>c.style.width);
  return fill?{width:fill.style.width, waving:fill.className.includes('waveGreenBar')}:null;
})()`);
const MINUTE_UP = `document.querySelectorAll('.time-fields-box [aria-label*="Increase"], .time-fields-box button')[2]`;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
// 5 minutes, confirmations off so an edit lands without a dialog in the way
// (the dialog itself is covered separately, below).
await evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:300,isPaused:false,isRunning:false,hours:0,minutes:5,timerSeconds:0})),
  localStorage.setItem('timerSkipConfirmations','true'), localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerSilentMode','true'), localStorage.setItem('timerAlarmLoop','false'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('timerSidebarHidden','false'), localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);

// 1. Idle: the fields are the configured time.
check('idle fields show the total', await fields(), '00:05:00');
await activate();
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('running', await status(), 'RUNNING');

// 2. Running: they tick down.
const t1 = await fields();
await sleep(3000);
const t2 = await fields();
check('fields tick down with the run', t1 !== t2 && t2 < t1, 'true');
check('still under 5 minutes', /^00:04:/.test(t2), 'true');

// 3. An edit moves the run, not the total. Type 9 into MINUTES.
const min = `document.querySelectorAll('.time-fields-box input')[1]`;
await clickEl(min, 'minutes field');
await evaluate(`(()=>{const i=${min};i.focus();i.select();return 'ok'})()`);
for (const [k, c, v] of [['9', 'Digit9', 57]]) await press(k, c, v, k);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(800);
const afterEdit = await fields();
check('edit moved the remaining time', /^00:09:/.test(afterEdit), 'true');
check('still running', await status(), 'RUNNING');

// 4. The bar waves green while remaining is past its end.
const over = await bar();
check('bar is waving green', over?.waving, 'true');
check('bar is full while waving', over?.width, '100%');

// 5. STOP returns to the original total, not the edited remaining.
await clickEl(`[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();if(t==='STOP')return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()==='STOP';})`, 'STOP');
await sleep(800);
check('STOP returns to the configured 5:00', await fields(), '00:05:00');
check('stopped', await status(), 'READY');
const back = await bar();
check('bar stopped waving', back?.waving, 'false');

// 6. With confirmations on, the running edit asks — in the new words.
await evaluate(`localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('timerDontAskAgain','[]'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);
await activate();
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(600);
await clickEl(MINUTE_UP, 'a minutes arrow');
check('running edit asks', await dialogTitle(), 'ADJUST TIME');
const copy = await evaluate(`document.querySelector('[role="alertdialog"]')?.innerText ?? ''`);
check('and says the total is kept', /configured time stays the same/.test(copy), 'true');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(40)} got=${r.got.padEnd(12)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
