// The findings from the second review, as behaviour: a paused overtime
// timer keeps its confirmations and its configured total, an edit past
// zero moves the run rather than rewriting the setup, seeking always asks,
// and ENTER lands on the action button rather than being intercepted.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9900);
const profile = mkdtempSync(join(tmpdir(), 'review2-'));
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
  await sleep(450);
};
const clickEl = async (expr, name) => {
  const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (!p) { out.push({ name: `${name} (not found)`, got: 'missing', want: 'found', pass: false }); return false; }
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
  await sleep(650);
  return true;
};
const activate = async () => { await ev(`document.activeElement?.blur?.(), 'ok'`); await press('Shift', 'ShiftLeft', 16); };

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });

const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"] h2, [role="alertdialog"] [id$="title"]')?.textContent ?? null`);
const fields = () => ev(`[...document.querySelectorAll('.time-fields-box input')].map(i=>i.value).join(':')`);
const digits = () => ev(`(()=>{const e=[...document.querySelectorAll('div')].find(x=>x.className.includes('items-baseline')&&x.className.includes('justify-center'));return (e.textContent||'').trim()})()`);
// A control button carries its key hint above its label now, so its
// textContent is "Press ENTER to" + "the timer" + "START". Matching on the
// label alone would find nothing; matching on endsWith alone would find
// anything ending in those letters. Both, and the hint's own prefix.
// A control button is three rows now — the key, the label, what the key
// acts on — so its textContent is "Press ENTER toSTARTthe timer" and
// neither an exact match nor endsWith finds it. The label is the one child
// that is not a hint, so that is what gets matched.
const btn = (l) => `[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();if(t==='${l}')return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()==='${l}';})`;
const SEC_UP = `document.querySelectorAll('.time-fields-box [aria-label="Increase seconds"]')[0]`;
const BAR = `[...document.querySelectorAll('div')].find(d=>d.className.includes('cursor-pointer')&&d.className.includes('border-2')&&d.style.height)`;
const seed = (secs, extra = '') => ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:${secs},isPaused:false,isRunning:false,hours:0,minutes:${Math.floor(secs / 60)},timerSeconds:${secs % 60}})),
  localStorage.setItem('timerSkipConfirmations','false'), localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerSilentMode','true'), localStorage.setItem('timerAlarmLoop','false'),
  localStorage.setItem('timerHasMutedBefore','true'),
  localStorage.setItem('wordCounterCollapsed','true'), localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('timerSidebarHidden','false'), localStorage.setItem('timerTimeFieldsHidden','false'), ${extra} 'ok'`);
// Run a 3s timer past zero, then PAUSE it: silent, holding a count-up.
const pausedOvertime = async () => {
  await seed(3);
  await send('Page.reload', {});
  await sleep(2500);
  await activate();
  await press('Tab', 'Tab', 9);
  await sleep(5000);
  await press('Tab', 'Tab', 9); // pause mid-overtime
  await sleep(400);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);

// 1. A paused overtime timer still asks before STOP throws its reading away.
await pausedOvertime();
check('paused mid-overtime', await status(), 'PAUSED');
const held = await digits();
check('holding a count-up', /^-/.test(held), 'true');
await clickEl(btn('STOP'), 'STOP');
check('paused overtime STOP asks', await dialogTitle(), 'CONFIRM STOP');
await press('Escape', 'Escape', 27);
check('reading survived the cancel', /^-/.test(await digits()), 'true');

// 2. An edit past zero moves the run and leaves the configured total alone.
// The boxes are a signed view now, so stepping up past zero walks the
// count-up back toward it rather than setting a fresh positive remaining.
const signedFields = async () => {
  const raw = await fields();
  const [h, m, sec] = raw.split(':');
  const negative = raw.includes('-');
  const mag = Math.abs(parseInt(h, 10)) * 3600 + Math.abs(parseInt(m, 10)) * 60 + Math.abs(parseInt(sec, 10));
  return negative ? -mag : mag;
};
await pausedOvertime();
const beforeCfg = '00:00:03';
const beforeStep = await signedFields();
check('paused overtime reads negative', beforeStep < 0, 'true');
await clickEl(SEC_UP, 'seconds up arrow while overtime');
await sleep(600);
check('overtime edit did not restart a countdown', await status(), 'PAUSED');
const afterStep = await signedFields();
check(`stepping up moved toward zero (${beforeStep} -> ${afterStep})`, afterStep === beforeStep + 1, 'true');
await clickEl(btn('STOP'), 'STOP');
if (await dialogTitle()) await press('Enter', 'Enter', 13, String.fromCharCode(13));
await sleep(600);
check('STOP returned to the configured total', await fields(), beforeCfg);

// 3. Seeking an idle timer asks again.
await seed(300);
await send('Page.reload', {});
await sleep(2500);
await clickEl(BAR, 'bar while idle');
check('idle seek asks', await dialogTitle(), 'SET TIME');
await press('Escape', 'Escape', 27);

// 4. ENTER lands on the action button; CANCEL is reachable and says no.
await seed(600);
await send('Page.reload', {});
await sleep(2500);
await activate();
await press('Tab', 'Tab', 9);
await clickEl(btn('STOP'), 'STOP');
check('dialog open', await dialogTitle(), 'CONFIRM STOP');
check('focus starts on the action', await ev(`/CONFIRM/.test(document.activeElement?.textContent ?? '')`), 'true');
// One TAB lands on the "don't ask" checkbox, which is not an answer to
// anything: ENTER goes to the action from there, as it does from anywhere
// that isn't CANCEL. It used to press the checkbox again and leave the
// question standing, which is the whole complaint about ENTER not working.
await press('Tab', 'Tab', 9);
const moved = await ev(`document.activeElement?.textContent?.trim().slice(0,10) ?? ''`);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check(`ENTER off the action (${moved}) still confirms`, await status(), 'READY');

// CANCEL is the exception, and the reason ENTER isn't simply bound to the
// action for the whole dialog: it is the one way a keyboard says no, and
// the key printed on it has to do what it says.
await ev(`document.activeElement?.blur?.(), 'ok'`);
await clickEl(btn('START'), 'START');
await clickEl(btn('STOP'), 'STOP again');
check('dialog open again', await dialogTitle(), 'CONFIRM STOP');
await press('Tab', 'Tab', 9);
await press('Tab', 'Tab', 9);
const onCancel = await ev(`document.activeElement?.textContent?.trim().slice(0,6) ?? ''`);
check('two TABs reach CANCEL', onCancel, 'CANCEL');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('ENTER on CANCEL says no', await status(), 'RUNNING');
await press('Escape', 'Escape', 27);
await sleep(400);
await clickEl(btn('STOP'), 'STOP once more');
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('untouched ENTER confirms', await status(), 'READY');

for (const r of out) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} got=${r.got.padEnd(14)} want=${r.want}`);
console.log(`\n${out.filter((r) => r.pass).length}/${out.length} passed`);

ws.close(); chrome.kill();
try { rmSync(profile, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
