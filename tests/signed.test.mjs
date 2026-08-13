// The three boxes as a view of one signed time: carries, borrows, the
// minus sign landing on the largest unit that has a number, and stepping
// up out of overtime being the way back to a countdown.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9970);
const profile = mkdtempSync(join(tmpdir(), 'signed-'));
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
  await sleep(320);
};
// A held key: n keydowns back to back with no render time between them,
// which is the one thing a chevron can't do to the same handler.
const hold = async (key, code, vk, n) => {
  for (let i = 0; i < n; i++) {
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk, autoRepeat: i > 0 });
  }
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(700);
};
const clickEl = async (expr, name) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(450);
  return true;
};

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
// Blurred first: a focused box shows its placeholder rather than its
// value, so reading while the caret is still in one measures "SS".
const fields = async () => {
  await ev(`document.activeElement?.blur?.(), 'ok'`);
  await sleep(120);
  return ev(`[...document.querySelectorAll('.time-fields-box input')].map(i=>i.value).join(':')`);
};
const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const IN = (i) => `document.querySelectorAll('.time-fields-box input')[${i}]`;
const UP = (u) => `document.querySelector('.time-fields-box [aria-label="Increase ${u}"]')`;
const DOWN = (u) => `document.querySelector('.time-fields-box [aria-label="Decrease ${u}"]')`;
// Type into a box and commit.
const type = async (i, text) => {
  await clickEl(IN(i), `field ${i}`);
  await ev(`(()=>{const e=${IN(i)};e.focus();e.select();return 'ok'})()`);
  for (const ch of text) await press(ch, `Digit${ch}`, 48 + Number(ch), ch);
  await press('Enter', 'Enter', 13, String.fromCharCode(13));
  await sleep(450);
};
const seed = (secs) => ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:${secs},isPaused:false,isRunning:false,hours:${Math.floor(secs/3600)},minutes:${Math.floor((secs%3600)/60)},timerSeconds:${secs%60}})),
  localStorage.setItem('timerConfiguredNegative','false'),
  localStorage.setItem('timerSkipConfirmations','true'), localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('timerAlarmLoop','false'), localStorage.setItem('timerAppHistory','[]'),
  localStorage.setItem('wordCounterCollapsed','true'),
  localStorage.setItem('wordCounterCollapsedAt','null'), localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`);
const reload = async (secs) => { await seed(secs); await send('Page.reload', {}); await sleep(2400); };

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2400);

// 1. Typing 61 into SECONDS carries into a minute.
await reload(0);
await type(2, '61');
check('61 seconds becomes 1m 01s', await fields(), '00:01:01');

// 2. Stepping SECONDS up from 59 carries; stepping past zero goes negative.
await reload(59);
await clickEl(UP('seconds'), 'seconds up');
check('59 + 1 is 1m 00s', await fields(), '00:01:00');
await reload(0);
await clickEl(DOWN('seconds'), 'seconds down');
check('0 - 1 is -01 seconds', await fields(), '00:00:-01');

// 3. The sign sits on the largest unit that has a number, and moves up.
await reload(0);
await clickEl(DOWN('minutes'), 'minutes down');
check('-1 minute signs the minutes', await fields(), '00:-01:00');
await reload(0);
await clickEl(DOWN('hours'), 'hours down');
check('-1 hour signs the hours', await fields(), '-01:00:00');

// 4. "-" flips the whole time, and again puts it back.
await reload(3661); // 1:01:01
await clickEl(IN(2), 'seconds box');
await press('-', 'Minus', 189, '-');
await sleep(400);
check('minus signs the largest unit', await fields(), '-01:01:01');
// Reading the fields blurs the box, and "-" is a keystroke the box has to
// have focus to receive — so the second press needs the caret put back.
await clickEl(IN(2), 'seconds box again');
await press('-', 'Minus', 189, '-');
await sleep(400);
check('minus again un-negates', await fields(), '01:01:01');

// 5. Stepping up out of overtime is the way back to a countdown.
await reload(2);
await ev(`document.activeElement?.blur?.(), 'ok'`);
await press('Shift', 'ShiftLeft', 16);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(4200);
check('ran out', await status(), 'FINISHED');
check('fields show the overtime', /-/.test(await fields()), 'true');
await clickEl(UP('minutes'), 'minutes up');
const after = await fields();
check(`stepping up left overtime (${after})`, /-/.test(after), 'false');
check('and it is counting down again', await status(), 'RUNNING');

// 6. A run started on a negative time is written down as one. Without the
// sign, history kept a count-up as the positive time of the same size and
// the row loaded a countdown instead of the run it recorded.
await reload(0);
await clickEl(DOWN('minutes'), 'minutes down');
await ev(`document.activeElement?.blur?.(), 'ok'`);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(700);
check('history kept the sign', await ev(`[...document.querySelectorAll('[aria-label^="Remove history entry"]')].map(b=>b.getAttribute('aria-label').replace('Remove history entry ','')).join()`), '-1:00');
await clickEl(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='-1:00')`, 'history row');
check('and the row loads it back negative', /-/.test(await fields()), 'true');

// 7. The arrows are the chevrons' keyboard half. Stepping this box's own
// magnitude had the two pulling opposite ways everywhere the time was
// negative, and left the arrow with nowhere to go at zero.
await reload(90);
await clickEl(IN(2), 'seconds box');
await press('-', 'Minus', 189, '-');
await sleep(300);
await clickEl(IN(2), 'seconds box again');
await press('ArrowUp', 'ArrowUp', 38);
check('arrow steps the whole time toward zero', await fields(), '00:-01:29');
await reload(0);
await clickEl(IN(2), 'seconds box');
await press('ArrowDown', 'ArrowDown', 40);
check('and down past zero, like the chevron', await fields(), '00:00:-01');
// Held: ten presses with no render time between them are ten seconds, not
// ten reads of the same stale total.
await reload(0);
await clickEl(IN(2), 'seconds box');
await hold('ArrowUp', 'ArrowUp', 38, 10);
check('ten presses moved ten seconds', await ev(`${IN(2)}.value`), '10');
// A committed value is on screen now, so a digit starts a new entry over
// it rather than being refused by a box that is already two digits full.
await press('4', 'Digit4', 52, '4');
check('typing after a step starts fresh', await ev(`${IN(2)}.value`), '04');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(400);
check('and commits like any other entry', await fields(), '00:00:04');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(44)} got=${r.got.padEnd(14)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
