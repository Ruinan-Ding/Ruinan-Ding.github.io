// The four fixes: unmuting mid-overtime rings, mute and 0% draw
// differently, Enter on a tabbed-to CANCEL cancels, and autorepeat is one
// press.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9700);
const profile = mkdtempSync(join(tmpdir(), 'fixes-'));
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

const press = async (key, code, vk, text, extra = {}) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, ...extra });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text, ...extra });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(500);
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

const status = () => evaluate(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogTitle = () => evaluate(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
// Beeps counted at the source: the oscillator is the only thing that makes
// a sound, so patching createOscillator counts real audio and nothing else.
const countBeeps = `(() => {
  window.__beeps = 0;
  const proto = (window.AudioContext || window.webkitAudioContext).prototype;
  const orig = proto.createOscillator;
  proto.createOscillator = function () { window.__beeps++; return orig.apply(this, arguments); };
  return 'patched';
})()`;
// secs is the configured time. Short for the alarm sections, long for the
// dialog ones: a 2-second timer expires during six tabbed keystrokes, and
// then 'still RUNNING' is the wrong thing to assert against.
const seed = (extra = '', secs = 2) => evaluate(`localStorage.setItem('timerAppState', JSON.stringify({seconds:${secs},isPaused:false,isRunning:false,hours:0,minutes:${Math.floor(secs / 60)},timerSeconds:${secs % 60}})),
  localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerHasMutedBefore','true'), localStorage.setItem('timerAlarmLoop','false'),
  localStorage.setItem('timerVolume','0.5'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'), localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), ${extra} 'ok'`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);

// The unmute-rings-the-burst behaviour was reverted at the request of
// the user, so its checks are gone with it. What a muted alarm still does
// — flash the window red — is covered by alarm.test.mjs.

// 2. Muted and 0% draw differently.
await seed(`localStorage.setItem('timerSilentMode','true'),`);
await send('Page.reload', {});
await sleep(2500);
const ICON = `document.querySelector('[aria-label="Unmute"], [aria-label="Mute"]')?.querySelector('svg')`;
const mutedIcon = await evaluate(`(()=>{const s=${ICON};return s?{slash:!!s.querySelector('line[stroke="#ef4444"]'),xLines:s.querySelectorAll('line:not([stroke])').length,waves:s.querySelectorAll('path').length}:null})()`);
check('muted: red slash', mutedIcon?.slash, 'true');
check('muted: no small X', mutedIcon?.xLines, '0');
await seed(`localStorage.setItem('timerSilentMode','false'), localStorage.setItem('timerVolume','0'),`);
await send('Page.reload', {});
await sleep(2500);
const zeroIcon = await evaluate(`(()=>{const s=${ICON};return s?{slash:!!s.querySelector('line[stroke="#ef4444"]'),xLines:s.querySelectorAll('line:not([stroke])').length}:null})()`);
check('0%: no red slash', zeroIcon?.slash, 'false');
check('0%: keeps the small X', zeroIcon?.xLines, '2');
check('the two icons differ', JSON.stringify(mutedIcon?.slash) !== JSON.stringify(zeroIcon?.slash), 'true');

// 3. Enter on a deliberately-tabbed CANCEL cancels; untouched Enter confirms.
await seed('', 600);
await send('Page.reload', {});
await sleep(2500);
await activate();
await press('Tab', 'Tab', 9); // start
await clickEl(`[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();if(t==='STOP')return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()==='STOP';})`, 'STOP');
check('dialog open', await dialogTitle(), 'CONFIRM STOP');
// Radix opens with CANCEL focused, so Tab moves *off* it. Cycle until it
// comes back round to CANCEL: that is focus the user placed by hand, which
// is the whole distinction being tested.
let focusedLabel = null;
for (let i = 0; i < 6; i++) {
  await press('Tab', 'Tab', 9);
  focusedLabel = await evaluate(`document.activeElement?.textContent?.trim().slice(0,20) ?? null`);
  if (/CANCEL/.test(focusedLabel ?? '')) break;
}
check('tabbed round to CANCEL', /CANCEL/.test(focusedLabel ?? ''), 'true');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER on hand-focused CANCEL does nothing', await status(), 'RUNNING');
check('and leaves the dialog standing', await dialogTitle(), 'CONFIRM STOP');
// The backquote is not an activation of whatever holds focus, so it
// means the same from CANCEL as from anywhere else.
await press('`', 'Backquote', 192, '`');
check('the backquote confirms from there', await status(), 'READY');

// 4. Held TAB is one press, not thirty.
await seed('', 600);
await send('Page.reload', {});
await sleep(2500);
await activate();
await press('Tab', 'Tab', 9);
check('running after one TAB', await status(), 'RUNNING');
for (let i = 0; i < 20; i++) {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, autoRepeat: true });
}
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await sleep(800);
check('20 autorepeats changed nothing', await status(), 'RUNNING');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} got=${r.got.padEnd(10)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
