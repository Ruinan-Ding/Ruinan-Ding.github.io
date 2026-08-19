// Which actions still ask, and which no longer do. Real clicks and keys
// through CDP, so focus and default activation behave as they will for a
// person.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9530);
const profile = mkdtempSync(join(tmpdir(), 'confirm-'));
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
// The leave guard is armed whenever a timer is running, so every reload
// below raises a native beforeunload dialog. Unanswered it blocks the whole
// CDP session, so it gets accepted the moment it opens.
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
// centre of the first element matching a predicate, evaluated in the page
const centreOf = (expr) => evaluate(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
const clickEl = async (expr, name) => {
  const p = await centreOf(expr);
  if (!p) { out.push({ name: `${name} (element not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await clickAt(p.x, p.y);
  return true;
};

// The browser wants a real interaction before it will let the page play
// audio. Picked by asking the page which point is inert rather than
// guessing: a hardcoded mid-screen click landed on the drain bar and
// opened the seek dialog, which then answered every check below.
// A keydown grants it just as a click does, and Shift is the one key
// nothing in the app listens for — every inert-looking *point* I tried
// turned out to be the drain bar, which seeks and opens its own dialog.
// Also drops focus, so the Enter that follows reaches the window handler
// instead of pressing whatever button was last clicked.
const activate = async () => {
  await evaluate(`document.activeElement?.blur?.(), 'ok'`);
  await press('Shift', 'ShiftLeft', 16);
};

const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogOpen = () => evaluate(`!!document.querySelector('[role="alertdialog"][data-state="open"]')`);
const dialogTitle = () => evaluate(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
const configured = () => evaluate(`[...document.querySelectorAll('input')].map(i=>i.value).join(':')`);

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
await evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})),
  localStorage.setItem('timerSkipConfirmations','false'),
  localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('wordCounterCollapsed','false'),
  localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'),
  localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);
await activate();

const ARROW = `document.querySelector('[aria-label*="Increase"], [aria-label*="increase"]')
  ?? [...document.querySelectorAll('button')].find(b=>b.closest('.time-fields-box'))`;
const PRESET_ROW = `[...document.querySelectorAll('button')].find(b=>/^\\d+:\\d\\d$/.test(b.textContent.trim()))`;
// A control button carries its key hint above its label now, so its
// textContent is "Press ENTER to" + "the timer" + "START". Matching on the
// label alone would find nothing; matching on endsWith alone would find
// anything ending in those letters. Both, and the hint's own prefix.
const btn = (label) => `[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();return t==='${label}'||(t.startsWith('Press ')&&t.endsWith('${label}'));})`;

// 1. Unstarted: neither the fields nor the list asks.
const before = await configured();
await clickEl(ARROW, 'time field arrow');
check('unstarted arrow: no dialog', await dialogOpen(), 'false');
check('unstarted arrow: value changed', (await configured()) !== before, 'true');
await clickEl(PRESET_ROW, 'preset row');
check('unstarted preset: no dialog', await dialogOpen(), 'false');
check('unstarted preset: running now', await status(), 'RUNNING');

// 2. Running: the list asks.
await clickEl(PRESET_ROW, 'preset row while running');
check('running preset: asks', await dialogTitle(), 'SWITCH TIMER');
await press('Escape', 'Escape', 27);
check('running preset: cancelled', await status(), 'RUNNING');

// 3. Running: a field asks.
await clickEl(ARROW, 'arrow while running');
check('running arrow: asks', await dialogTitle(), 'ADJUST TIME');
await press('Escape', 'Escape', 27);

// 4. Paused: the list asks.
await activate();
await press('Enter', 'Enter', 13, '\r');
check('paused now', await status(), 'PAUSED');
await clickEl(PRESET_ROW, 'preset row while paused');
check('paused preset: asks', await dialogTitle(), 'SWITCH TIMER');
await press('Escape', 'Escape', 27);
await clickEl(ARROW, 'arrow while paused');
check('paused arrow: asks', await dialogTitle(), 'ADJUST TIME');
await press('Escape', 'Escape', 27);

// 5. STOP while counting down still asks.
await activate();
await press('Enter', 'Enter', 13, '\r'); // resume
await clickEl(btn('STOP'), 'STOP');
check('stop mid-countdown asks', await dialogTitle(), 'CONFIRM STOP');
await press('Escape', 'Escape', 27);

// A real ring rather than a seeded one: a two-second timer, started and
// left to run past zero. Restoring a saved run comes back paused, which is
// not the state the button is being asked about.
const ringOut = async () => {
  await evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:2,isPaused:false,isRunning:false,hours:0,minutes:0,timerSeconds:2})),
    localStorage.setItem('timerSilentMode','true'), 'ok'`);
  await send('Page.reload', {});
  await sleep(3000);
  await activate();
  await press('Enter', 'Enter', 13, '\r');
  // Waited for rather than slept through. A fixed 4s assumed the timer had
  // reached zero by then, and under the load of the full sweep it
  // sometimes hadn't: a still-running timer asks before an adjustment, so
  // the arrow check below read a legitimate ADJUST TIME as a failure.
  //
  // Read off the digits rather than the status word. Under load the status
  // query came back empty often enough to burn the whole poll budget while
  // the timer was still counting, and the run carried on regardless.
  const overtime = () => evaluate(`(() => {
    const d = [...document.querySelectorAll('div')].find((e) => /^-\\d/.test(e.textContent.trim()) && e.className.includes('items-baseline'));
    return !!d;
  })()`);
  for (let i = 0; i < 150 && !(await overtime()); i++) await sleep(100);
  await sleep(300);
  // Named as its own check, so a run that never got there says so instead
  // of blaming whatever is clicked next.
  check('rang out before the ringing checks', await overtime(), true);
};

// 6. Ringing: nothing asks.
await ringOut();
check('dialog clear before STOP', await dialogTitle(), 'null');
await clickEl(ARROW, 'arrow while ringing');
check('ringing arrow: no dialog', `${await dialogOpen()}/${await dialogTitle()}`, 'false/null');

await ringOut();
await clickEl(PRESET_ROW, 'preset row while ringing');
check('ringing preset: no dialog', `${await dialogOpen()}/${await dialogTitle()}`, 'false/null');

await ringOut();
await clickEl(btn('STOP'), 'STOP while ringing');
check('ringing STOP: no dialog', `${await dialogOpen()}/${await dialogTitle()}`, 'false/null');
check('ringing STOP: stopped', await status(), 'READY');

await ringOut();
await clickEl(btn('RESET'), 'RESET while ringing');
check('ringing RESET: no dialog', `${await dialogOpen()}/${await dialogTitle()}`, 'false/null');

// 7. Copy and Clear are disabled on an empty box, not missing from it.
const wcButtons = (expr) => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].filter(x=>x.closest('.zoom-safe-text, [class*="border-4"]')&&['Copy','Clear'].includes(x.textContent.trim()));return ${expr}})()`);
check('empty box: Copy present', await wcButtons(`b.some(x=>x.textContent.trim()==='Copy')`), 'true');
check('empty box: Copy disabled', await wcButtons(`b.filter(x=>x.textContent.trim()==='Copy').every(x=>x.disabled)`), 'true');
check('empty box: Clear disabled', await wcButtons(`b.filter(x=>x.textContent.trim()==='Clear').every(x=>x.disabled)`), 'true');
await evaluate(`localStorage.setItem('wordCounterText','hello'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);
check('with text: Copy enabled', await wcButtons(`b.filter(x=>x.textContent.trim()==='Copy').every(x=>!x.disabled)`), 'true');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(32)} got=${r.got.padEnd(14)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
