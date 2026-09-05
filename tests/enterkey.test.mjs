// Two things a click leaves behind.
//
// A clicked button keeps focus, and a focused button answers ENTER and
// SPACE by pressing itself again. This app's start/pause key is TAB, and
// TAB never reaches a button — the window handler takes it first — so
// those two were presses nobody asked for: click START, hit ENTER, and the
// run you just started pauses.
//
// And the alarm tip, which is a note on the bell and the speaker together,
// so it starts at the bell's left edge and its box ends at the speaker's
// right edge.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME } from './chrome.mjs';

const port = 9583;
const profile = mkdtempSync(join(tmpdir(), 'enter-'));
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
  await sleep(700);
};
const clickAt = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(700);
};
const CONTROL = (label) => `[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();if(t==='${label}')return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()==='${label}';})`;
const centreOf = (expr) => ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const clickEl = async (expr, name) => {
  const p = await centreOf(expr);
  if (!p) { check(`${name} (not found)`, 'missing', 'found'); return false; }
  await clickAt(p.x, p.y);
  return true;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);
await ev(`localStorage.clear(),
  localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})),
  localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('timerSidebarHidden','true'),
  localStorage.setItem('wordCounterCollapsed','false'),
  localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2500);

// --- ENTER must not press the button the mouse just left --------------
await clickEl(CONTROL('START'), 'START');
check('clicking START runs it', await status(), 'RUNNING');
check('the button did not keep focus', await ev(`document.activeElement === document.body || document.activeElement === null`), 'true');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER does not pause it', await status(), 'RUNNING');
await press(' ', 'Space', 32, ' ');
check('SPACE does not pause it either', await status(), 'RUNNING');
// TAB is the one key that does.
await press('Tab', 'Tab', 9);
check('TAB still pauses', await status(), 'PAUSED');
await press('Tab', 'Tab', 9);
check('TAB still resumes', await status(), 'RUNNING');

// Same for the pause button once it has been clicked.
await clickEl(CONTROL('PAUSE'), 'PAUSE');
check('clicking PAUSE pauses', await status(), 'PAUSED');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER does not resume', await status(), 'PAUSED');

// --- the tip against the two buttons above it -------------------------
// The row's own box is the honest right edge: the speaker sits inside a
// wrapper for its volume popup, so the last <button> in there is the bell.
const tip = await ev(`(()=>{
  const p=document.querySelector('.alarm-tip');
  if(!p) return null;
  const row=p.parentElement.querySelector(':scope > div');
  const r=p.getBoundingClientRect(), rr=row.getBoundingClientRect();
  return {
    tipL: Math.round(r.left), tipR: Math.round(r.right),
    rowL: Math.round(rr.left), rowR: Math.round(rr.right),
    // Wider content than box means a line ran past the cap.
    overflow: Math.round(p.scrollWidth - p.clientWidth),
    lines: Math.round(r.height / parseFloat(getComputedStyle(p).lineHeight)),
    fontPx: Math.round(parseFloat(getComputedStyle(p).fontSize) * 10) / 10,
  };
})()`);
if (!tip) check('alarm tip (not found)', 'missing', 'found');
else {
  check("tip starts at the bell's left edge", Math.abs(tip.tipL - tip.rowL) <= 1, true);
  check("tip box ends at the speaker's right edge", Math.abs(tip.tipR - tip.rowR) <= 1, true);
  // The point of the box: the text is capped by it rather than running on
  // past the speaker and out over whatever is to the right.
  check('tip text is capped by that box', tip.overflow <= 1, true);
  console.log(`  tip: ${tip.lines} lines at ${tip.fontPx}px in ${tip.tipR - tip.tipL}px`);
}

// --- The confirm key still answers after the mouse has been elsewhere --
// The dialog opens pointed at its action button, but a click anywhere
// inside moves focus, and a key that presses whatever holds it would
// answer the wrong control. Clearing "keep asking this" and then
// confirming is the ordinary way to answer one of these, and it was
// pressing the checkbox again.
const dialogOpen = () => ev(`!!document.querySelector('[role="alertdialog"][data-state="open"]')`);
const DONT_ASK = `document.querySelector('[role="alertdialog"] [data-dont-ask]')`;
const TICKED = `${DONT_ASK}?.getAttribute('aria-pressed')`;

await clickEl(CONTROL('STOP'), 'STOP');
check('STOP asks first', await dialogOpen(), 'true');
check('the box arrives ticked', await ev(TICKED), 'true');
await clickEl(DONT_ASK, 'keep asking this');
check('and clicking clears it', await ev(TICKED), 'false');
check('and it holds focus', await ev(`document.activeElement?.hasAttribute?.('data-dont-ask') === true`), 'true');
await press('`', 'Backquote', 192, '`');
check('the backquote confirms rather than re-ticking', await dialogOpen(), 'false');
check('and the timer stopped', await status(), 'READY');

// ENTER on the button the dialog opens pointed at answers nothing. This is
// the press the confirm key was moved off ENTER to stop: the dialog arrives
// with the ring already on its action, so a reflex on ENTER would have
// confirmed a question that had not been read yet.
await clickEl(CONTROL('START'), 'START');
await clickEl(CONTROL('RESET'), 'RESET');
check('RESET asks', await dialogOpen(), 'true');
const ACTION = `document.querySelector('[role="alertdialog"] [aria-keyshortcuts]')`;
check('and opens pointed at its action', await ev(`document.activeElement === ${ACTION}`), 'true');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER there confirms nothing', await dialogOpen(), 'true');
await press(' ', 'Space', 32, ' ');
check('and neither does Space', await dialogOpen(), 'true');

// The confirm key bare and once, not as half of a shortcut. Alt+backquote
// switches windows on GNOME and Cmd+backquote cycles them on macOS, and a
// modifier's own keydown reaches the page first, so the combination that
// leaves the window would answer the dialog on its way out.
const backquote = (extra) => send('Input.dispatchKeyEvent', {
  type: 'rawKeyDown', key: '`', code: 'Backquote', windowsVirtualKeyCode: 192, ...extra,
});
// Alt=1, Ctrl=2, Meta=4 in the protocol's modifier bits.
for (const [name, modifiers] of [['Ctrl', 2], ['Alt', 1], ['Cmd', 4]]) {
  await backquote({ modifiers });
  await sleep(300);
  check(`${name}+backquote confirms nothing`, await dialogOpen(), 'true');
}
// Held down it repeats about thirty times a second, which would answer
// every dialog in a chain before the second one was on screen.
await backquote({ autoRepeat: true });
await sleep(300);
check('a held backquote confirms nothing', await dialogOpen(), 'true');

// The other half of the same rule: ENTER on CANCEL is how a keyboard says
// no, and must stay that way. Both keys a button answers to are live
// everywhere in here except on that one action.
const CANCEL = `[...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent.trim().startsWith('CANCEL'))`;
await ev(`(${CANCEL})?.focus(), 'ok'`);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER on CANCEL cancels', await dialogOpen(), 'false');
check('and the run carried on', await status(), 'RUNNING');

// The confirm key is answered inside the dialog and stops there. Loose on
// the page it is an ordinary character: the word counter pulls focus back
// to its text on any key a control does not answer to, and would have
// caught this one and typed it into somebody's writing.
await clickEl(CONTROL('RESET'), 'RESET');
check('RESET asks again', await dialogOpen(), 'true');
await ev(`window.__seen = 0, document.addEventListener('keydown', () => { window.__seen++; }), 'ok'`);
await press('`', 'Backquote', 192, '`');
check('the confirm key answers', await dialogOpen(), 'false');
check('and never reaches the page', await ev('window.__seen'), '0');

const width = Math.max(...out.map((r) => r.name.length));
out.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(width)}  got=${r.got.padEnd(10)} want=${r.want}`));
console.log(`${out.filter((r) => r.pass).length}/${out.length} passed`);
ws.close(); chrome.kill();
await sleep(200);
process.exit(out.every((r) => r.pass) ? 0 : 1);
