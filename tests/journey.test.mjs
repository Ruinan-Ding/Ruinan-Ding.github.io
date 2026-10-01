// The whole app in one sitting: a fresh browser, one continuous session,
// every feature used the way a person uses it — real clicks, real keys, a
// real file downloaded and loaded back in — and every result read back off
// the page. The other suites each pin one behaviour down; this one is for
// the seams between them, which is where a feature that works alone and a
// layout that works alone stopped working together.
//
//   node tests/journey.test.mjs [port]      (SHOTS=<dir> to keep screenshots)
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const BASE = 'http://localhost:5199';
const OUT = mkdtempSync(join(tmpdir(), 'journey-'));
const DL = join(OUT, 'downloads');
mkdirSync(DL, { recursive: true });
const SHOTS = process.env.SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const port = Number(process.argv[2] ?? 9975);
// A browser left behind on this port by an earlier run would be picked up
// instead of a fresh one, with that run's storage in it.
try { await fetch(`http://127.0.0.1:${port}/json/version`); console.error(`port ${port} is already taken by another browser`); process.exit(2); } catch { /* free */ }
const profile = join(OUT, 'profile');
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1', '--hide-scrollbars',
  '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch { /* gone */ } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- CDP plumbing
async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (m) => {
    const x = JSON.parse(m.data);
    if (x.id && pending.has(x.id)) { pending.get(x.id)(x); pending.delete(x.id); }
    else if (x.method) listeners.forEach((l) => l(x));
  };
  const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  return { ws, send, on: (f) => listeners.push(f) };
}
let pageUrl, browserUrl;
for (let i = 0; i < 100 && !(pageUrl && browserUrl); i++) {
  try {
    pageUrl = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page')?.webSocketDebuggerUrl;
    browserUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl;
  } catch { /* not up yet */ }
  if (!(pageUrl && browserUrl)) await sleep(100);
}
const page = await connect(pageUrl);
const browser = await connect(browserUrl);

const consoleProblems = [];
const exceptions = [];
const network = [];
const sandboxOnly = [];
const expectedLog = [];
const isSandboxOnly = (text) => /fonts\.(googleapis|gstatic)\.com/.test(text) && /ERR_CERT|ERR_TUNNEL|ERR_PROXY|net::/.test(text);
let leavePrompts = 0;
page.on((x) => {
  if (x.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(x.params.type)) {
    consoleProblems.push(`${x.params.type}: ${x.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  }
  if (x.method === 'Runtime.exceptionThrown') exceptions.push(x.params.exceptionDetails?.exception?.description ?? x.params.exceptionDetails?.text);
  if (x.method === 'Log.entryAdded' && ['error', 'warning'].includes(x.params.entry.level)) {
    const line = `${x.params.entry.level} [${x.params.entry.source}] ${x.params.entry.text} ${x.params.entry.url ?? ''}`.trim();
    // GitHub Pages answers an unknown path with 404.html and a 404 status,
    // which Chrome logs; the 404 section visits one on purpose.
    const expected404 = /status of 404/.test(line) && /\/not-a-page$/.test(x.params.entry.url ?? '');
    (isSandboxOnly(line) ? sandboxOnly : expected404 ? expectedLog : network).push(line);
  }
  if (x.method === 'Page.javascriptDialogOpening') {
    leavePrompts++;
    page.send('Page.handleJavaScriptDialog', { accept: true });
  }
});

const ev = async (expression) => {
  const r = await page.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    console.log(`  (probe threw: ${r.result.exceptionDetails.exception?.description?.split('\n')[0]})`);
    return undefined;
  }
  return r.result?.result?.value;
};

// ------------------------------------------------------------------- results
const results = [];
let section = '';
const sec = (name) => { section = name; console.log(`\n== ${name}`); };
const check = (name, got, want) => {
  const pass = String(got) === String(want);
  results.push({ section, name, got: String(got), want: String(want), pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n        got=${String(got).slice(0, 160)}\n       want=${String(want).slice(0, 160)}`}`);
  return pass;
};
const ok = (name, cond, detail = '') => check(name, cond ? 'yes' : `no${detail ? ` (${detail})` : ''}`, 'yes');

// ------------------------------------------------------------------- input
const press = async (key, code, vk, text, wait = 350) => {
  await page.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await page.send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(wait);
};
const KEY = {
  tab: () => press('Tab', 'Tab', 9, null, 500),
  s: () => press('s', 'KeyS', 83, 's', 500),
  r: () => press('r', 'KeyR', 82, 'r', 500),
  esc: () => press('Escape', 'Escape', 27, null, 600),
  yes: () => press('`', 'Backquote', 192, '`', 700),
  enter: () => press('Enter', 'Enter', 13, '\r', 600),
  up: () => press('ArrowUp', 'ArrowUp', 38, null, 500),
  left: () => press('ArrowLeft', 'ArrowLeft', 37, null, 150),
  digit: (d) => press(String(d), `Digit${d}`, 48 + Number(d), String(d), 120),
};
const where = (expr) => ev(`(()=>{const e=${expr};if(!e)return null;e.scrollIntoView?.({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect();if(!r.width&&!r.height)return null;return {x:r.left+r.width/2,y:r.top+r.height/2,l:r.left,w:r.width}})()`);
const mouseAt = async (x, y, click = true) => {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  if (click) {
    await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
};
const clickEl = async (expr, name, wait = 600) => {
  // A question left open by an earlier step would swallow this click and
  // every one after it. Say so, clear it, and carry on from a clean page.
  const blocked = await ev(`(()=>{const d=document.querySelector('[role="alertdialog"][data-state="open"]');if(!d)return null;const e=${expr};return e&&d.contains(e)?null:(d.querySelector('h2')?.textContent??'?')})()`);
  if (blocked) { check(`no question left open before "${name}"`, blocked, 'none'); await press('Escape', 'Escape', 27, null, 600); }
  const p = await where(expr);
  if (!p) { check(`${name} is on the page`, 'missing', 'found'); return false; }
  await mouseAt(p.x, p.y);
  await sleep(wait);
  return true;
};
const byLabel = (label) => `document.querySelector(${JSON.stringify(`[aria-label="${label}"]`)})`;
const byTitle = (title) => `document.querySelector(${JSON.stringify(`[title="${title}"]`)})`;
const CTRL = (label) => `[...document.querySelectorAll('button')].find(b=>{const t=b.textContent.trim();if(t===${JSON.stringify(label)})return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()===${JSON.stringify(label)};})`;
const TRANSFER = byLabel("Import or export the website's state as JSON");
const BIN = byLabel('Reset the website to defaults');
const has = (label) => ev(`!!${byLabel(label)}`);
// Keys go to the timer only from outside a text field, and only while the
// window reads as focused.
const activate = async () => { await ev(`document.activeElement?.blur?.(), 'ok'`); await press('Shift', 'ShiftLeft', 16, null, 150); };

// ------------------------------------------------------------------- readers
const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim() ?? null`);
const digits = () => ev(`(()=>{const e=[...document.querySelectorAll('div')].find(x=>typeof x.className==='string'&&x.className.includes('items-baseline')&&x.className.includes('justify-center')&&/\\d\\d:\\d\\d/.test(x.textContent));return e?e.textContent.trim():null})()`);
const toSec = (t) => {
  const m = /^(-)?(?:(\d{2}):)?(\d{2}):(\d{2})/.exec(t ?? '');
  if (!m) return NaN;
  const s = Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]);
  return m[1] ? -s : s;
};
const shownSeconds = async () => toSec(await digits());
const fields = () => ev(`[...document.querySelectorAll('.time-fields-box input')].map(i=>i.value).join(':')`);
const presets = () => ev(`[...document.querySelectorAll('[aria-label^="Remove preset "]')].map(b=>b.getAttribute('aria-label').slice(14))`);
const history = () => ev(`[...document.querySelectorAll('[aria-label^="Remove history entry "]')].map(b=>b.getAttribute('aria-label').slice(21))`);
const rowButton = (removeLabel, label) => `(()=>{const r=document.querySelector(${JSON.stringify(`[aria-label="${removeLabel}"]`)});return r?[...r.parentElement.querySelectorAll('button')].find(b=>b!==r):null})()`;
const totals = () => ev(`(()=>{const t=[...document.querySelectorAll('div')].find(d=>d.children.length===0&&d.textContent.trim()==='TOTAL');return t?[...t.nextElementSibling.children].map(c=>c.textContent.trim()).join('/'):null})()`);
const theme = () => ev(`document.documentElement.dataset.theme`);
const mode = () => ev(`document.querySelector('[data-confirm-mode]')?.dataset.confirmMode ?? null`);
const linkShown = () => ev(`!![...document.querySelectorAll('a')].find(a=>/Check Out My Website/.test(a.textContent)&&a.getBoundingClientRect().width>0)`);
const clockText = () => ev(`(document.querySelector('[aria-label="Show the clock as 24-hour time"]')||document.querySelector('[aria-label="Show the clock as 12-hour time"]'))?.textContent.trim() ?? null`);
const zoneShown = () => ev(`(()=>{const s=document.querySelector('select[aria-label="Clock time zone"]');return s?{value:s.value,offset:s.parentElement.querySelector('span.whitespace-nowrap')?.textContent.trim()}:null})()`);
const icon = () => ev(`document.querySelector('link[rel~="icon"]')?.href ?? null`);
const title = () => ev(`document.title`);
const h1 = () => ev(`document.querySelector('h1')?.textContent ?? null`);
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"][data-state="open"] h2')?.textContent ?? null`);
const answered = [];
// Answers the open question with the confirm key, checking it was the one
// expected. Called where a question may or may not come (expected null),
// it answers whatever came and records it.
const answer = async (expected) => {
  const t = await dialogTitle();
  if (t === null) {
    if (expected) check(`asks "${expected}"`, 'no question', expected);
    return null;
  }
  answered.push(t);
  if (expected) check(`asks "${expected}"`, t, expected);
  await KEY.yes();
  if ((await dialogTitle()) === t) {
    check(`the confirm key answers "${t}"`, 'still open', 'answered');
    await KEY.esc();
  }
  return t;
};
const answerAny = async () => { const seen = []; for (let i = 0; i < 3; i++) { const t = await answer(null); if (!t) break; seen.push(t); } return seen; };
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'));
};
const viewport = async (width, height, mobile = false) => {
  await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
};
const load = async (path = '/') => { await page.send('Page.navigate', { url: `${BASE}${path}` }); await sleep(2600); };
const reload = async () => { await page.send('Page.reload', {}); await sleep(2800); };

// ======================================================================= run
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('Log.enable');
await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
await browser.send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL, eventsEnabled: true });
await viewport(1400, 900);
await load('/');

// ------------------------------------------------------------ 0. first visit
sec('0. First visit: a clean browser gets the defaults');
check('heading', await h1(), 'Write Timer');
check('tab title', await title(), 'Write Timer');
check('status', await status(), 'READY');
check('digits', (await digits())?.slice(0, 5), '01:05');
check('fields', await fields(), '00:01:05');
check('default presets', JSON.stringify(await presets()), JSON.stringify(['1:05', '30:35', '5:35']));
check('history is empty', await ev(`[...document.querySelectorAll('p')].some(p=>p.textContent.trim()==='No history yet')`), 'true');
check('dark theme', await theme(), 'dark');
check('confirmations: half', await mode(), 'half');
check('website link shown', await linkShown(), 'true');
check('word counter empty', await totals(), '1/0/0');
check('clock zone', (await zoneShown())?.value, 'America/New_York');
check('clock is 12-hour', /AM|PM/.test(await clockText() ?? ''), 'true');
check('sound on', await has('Mute'), 'true');
check('alarm repeat off', await has('Enable alarm repeat'), 'true');
ok('all four corner buttons present', (await ev(`[${JSON.stringify("Import or export the website's state as JSON")},'Reset the website to defaults','Switch to the light theme'].every(l=>document.querySelector('[aria-label="'+l+'"]'))&&!!document.querySelector('[data-confirm-mode]')`)));
check('schema served', await ev(`fetch('/timer-state.schema.json').then(r=>r.ok?r.json():null).then(j=>j&&j.$id)`), 'https://ruinan-ding.com/timer-state.schema.json');
const idleIcon = await icon();
await shot('00-first-visit');

// --------------------------------------------------- 1. set a time by typing
sec('1. Setting the time in the HOURS/MINUTES/SECONDS boxes');
const typeInto = async (index, text) => {
  const f = `document.querySelectorAll('.time-fields-box input')[${index}]`;
  await clickEl(f, `time box ${index}`, 300);
  await ev(`(()=>{const i=${f};i.focus();i.select();return 'ok'})()`);
  for (const d of text) await KEY.digit(d);
  await KEY.enter();
  return answerAny();
};
const asked1 = await typeInto(2, '03');
const asked2 = await typeInto(1, '00');
console.log(`  questions answered: ${[...asked1, ...asked2].join(', ') || 'none'}`);
check('fields read 00:00:03', await fields(), '00:00:03');
check('digits read 00:03', (await digits())?.slice(0, 5), '00:03');
check('still ready', await status(), 'READY');

// ------------------------------------------- 2. run, pause, resume, overtime
sec('2. Start, pause, resume, and run past zero');
await activate();
await KEY.tab();
check('TAB starts it', await status(), 'RUNNING');
ok('tab title shows the time', / - Write Timer$/.test(await title() ?? ''), await title());
const runningIcon = await icon();
ok('favicon changes while running', runningIcon && runningIcon !== idleIcon);
check('a run adds a history row', (await history()).length, 1);
await KEY.tab();
check('TAB pauses it', await status(), 'PAUSED');
const p1 = await digits();
await sleep(1200);
check('paused time holds still', await digits(), p1);
await clickEl(CTRL('RESUME'), 'RESUME button');
check('RESUME button runs it again', await status(), 'RUNNING');
await sleep(4200);
check('past zero it keeps counting: FINISHED', await status(), 'FINISHED');
ok('digits are negative', (await digits())?.startsWith('-'), await digits());
ok('tab title shows negative time', (await title())?.startsWith('-'), await title());
await shot('02-overtime');
await activate();
await KEY.s();
check('S past zero stops without asking', await dialogTitle(), 'null');
check('stopped back to ready', await status(), 'READY');
check('back at the configured time', await fields(), '00:00:03');
check('tab title back to plain', await title(), 'Write Timer');

// ---------------------------------------------------------- 3. chevrons, R, S
sec('3. Chevrons, RESET and STOP with their questions');
await clickEl(byLabel('Increase minutes'), 'minutes chevron up');
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
check('chevron adds a minute', await fields(), '00:01:03');
await clickEl(CTRL('START'), 'START button');
check('START button runs it', await status(), 'RUNNING');
await activate();
await KEY.r();
check('R mid-run asks', await dialogTitle(), 'CONFIRM RESET');
await KEY.esc();
check('ESC declines, still running', await status(), 'RUNNING');
await sleep(1500);
const beforeReset = await shownSeconds();
await activate();
await KEY.r();
await answer('CONFIRM RESET');
const afterReset = await shownSeconds();
ok('RESET restarts from the configured time', afterReset > beforeReset && afterReset >= 61, `${beforeReset} -> ${afterReset}`);
check('and keeps running', await status(), 'RUNNING');
await activate();
await KEY.s();
await answer('CONFIRM STOP');
check('STOP returns to ready', await status(), 'READY');

// ---------------------------------------------------------- 4. leave guard
sec('4. Leaving mid-run is guarded, and the run survives a reload');
await activate();
await KEY.tab();
check('running again', await status(), 'RUNNING');
await sleep(1200);
const promptsBefore = leavePrompts;
await reload();
check('reloading a live run asks the browser first', leavePrompts - promptsBefore, 1);
check('the run comes back paused', await status(), 'PAUSED');
const kept = await shownSeconds();
ok('with its time kept', kept <= 63 && kept >= 55, kept);
await activate();
await KEY.s();
await answer('CONFIRM STOP');
check('stopped', await status(), 'READY');

// ---------------------------------------------------- 5. arrow key, drain bar
sec('5. Arrow keys in a box, and clicking the drain bar');
await clickEl(`document.querySelectorAll('.time-fields-box input')[2]`, 'seconds box', 300);
await KEY.up();
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
check('ArrowUp adds a second', await fields(), '00:01:04');
await ev(`document.activeElement?.blur?.(), 'ok'`);
const bar = await where(`[...document.querySelectorAll('div')].find(d=>typeof d.className==='string'&&d.className.includes('cursor-pointer')&&d.className.includes('border-2')&&d.style.height)`);
ok('drain bar found', !!bar);
if (bar) {
  await mouseAt(bar.l + bar.w * 0.25, bar.y);
  await sleep(600);
  console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
  const f = toSec((await fields())?.replace(/^(\d\d):/, '$1:'));
  const secs = await ev(`(()=>{const v=[...document.querySelectorAll('.time-fields-box input')].map(i=>+i.value);return v[0]*3600+v[1]*60+v[2]})()`);
  ok('clicking a quarter along sets about three quarters of the time', Math.abs(secs - 48) <= 2, `${secs}s`);
}

// ----------------------------------------------------------------- 6. presets
sec('6. Presets: add (which runs it), duplicate, load, switch mid-run, delete, clear');
const addPreset = async (digitsText) => {
  await clickEl(byLabel('New preset time'), 'new preset box', 300);
  await ev(`(()=>{const i=${byLabel('New preset time')};i.focus();i.select();return 'ok'})()`);
  for (const d of digitsText) await KEY.digit(d);
  await KEY.enter();
};
const stopRun = async () => { await activate(); await KEY.s(); await answer(await dialogTitle() ? 'CONFIRM STOP' : null); };
let h0 = (await history()).length;
await addPreset('230');
ok('adds 2:30', (await presets()).includes('2:30'), JSON.stringify(await presets()));
check('four presets now', (await presets()).length, 4);
check('adding a preset also loads and runs it', await status(), 'RUNNING');
ok('at 2:30', Math.abs((await shownSeconds()) - 150) <= 3, await digits());
check('and records the run', (await history()).length, h0 + 1);
await stopRun();
check('stopped', await status(), 'READY');
await addPreset('230');
check('the same time again is reported, not added', await dialogTitle(), 'ALREADY SAVED');
await KEY.esc();
check('still four', (await presets()).length, 4);
h0 = (await history()).length;
await clickEl(rowButton('Remove preset 1:05'), 'preset 1:05');
check('clicking a preset on an idle timer runs it, no question', `${await dialogTitle()} ${await status()}`, 'null RUNNING');
ok('at 1:05', Math.abs((await shownSeconds()) - 65) <= 3, await digits());
check('recorded', (await history()).length, h0 + 1);
await clickEl(rowButton('Remove preset 2:30'), 'preset 2:30 mid-run');
await answer('SWITCH TIMER');
ok('switching mid-run asks, then runs the new time', (await status()) === 'RUNNING' && Math.abs((await shownSeconds()) - 150) <= 3, `${await status()} ${await digits()}`);
await stopRun();
await clickEl(byLabel('Remove preset 2:30'), 'remove 2:30');
await answer('DELETE PRESET');
await sleep(1200);
ok('2:30 deleted', !(await presets()).includes('2:30'), JSON.stringify(await presets()));
await clickEl(byTitle('Delete every preset — asks first'), 'clear presets');
await answer('CLEAR PRESETS');
await sleep(1200);
check('presets cleared', (await presets()).length, 0);
await addPreset('1000');
check('10:00 added and running', `${(await presets()).join(',')} ${await status()}`, '10:00 RUNNING');
await stopRun();
await addPreset('45');
check('0:45 added and running', `${(await presets()).join(',')} ${await status()}`, '10:00,0:45 RUNNING');
await stopRun();
check('stopped', await status(), 'READY');

// ----------------------------------------------------------------- 7. history
sec('7. History: load, delete a row, clear, record again');
const hist = await history();
ok('history has every run so far', hist.length >= 9, `${hist.length}: ${hist.join(',')}`);
check('newest first', hist.slice(0, 2).join(','), '0:45,10:00');
await clickEl(rowButton(`Remove history entry ${hist[1]}`), 'history row 10:00');
check('clicking a history row runs it', `${await dialogTitle()} ${await status()}`, 'null RUNNING');
ok('at 10:00', Math.abs((await shownSeconds()) - 600) <= 3, await digits());
await stopRun();
const beforeDelete = (await history()).length;
await clickEl(`document.querySelector('[aria-label^="Remove history entry "]')`, 'remove a history row');
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
await sleep(1200);
check('one row deleted', (await history()).length, beforeDelete - 1);
await clickEl(byTitle('Delete every run — asks first'), 'clear history');
await answer('CLEAR HISTORY');
await sleep(1200);
check('history cleared', await ev(`[...document.querySelectorAll('p')].some(p=>p.textContent.trim()==='No history yet')`), 'true');
await clickEl(rowButton('Remove preset 0:45'), 'preset 0:45');
await stopRun();
check('one fresh history row', JSON.stringify(await history()), JSON.stringify(['0:45']));

// ------------------------------------------------------------ 8. word counter
sec('8. Word counter: typing, counts, filters, copy, fullscreen, tuck');
const TEXT = 'Hello world\nSecond line here';
await clickEl(byLabel('Writing'), 'writing area', 300);
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
await page.send('Input.insertText', { text: TEXT });
await sleep(500);
check('counts: 2 lines, 5 words, 24 letters', await totals(), '2/5/24');
await clickEl(byLabel('Disable alphanumeric-only character counting'), 'chars filter');
check('every character counted: 27', await totals(), '2/5/27');
await clickEl(byLabel('Disable alphanumeric-only word counting'), 'words filter');
await clickEl(byLabel('Writing'), 'writing area', 200);
await ev(`(()=>{const t=${byLabel('Writing')};t.setSelectionRange(t.value.length,t.value.length);return 'ok'})()`);
await page.send('Input.insertText', { text: ' $$' });
await sleep(400);
check('symbols count as a word with the filter off', await totals(), '2/6/30');
await clickEl(byLabel('Enable alphanumeric-only word counting'), 'words filter back on');
check('and not with it on', await totals(), '2/5/30');
await clickEl(byLabel('Copy text to clipboard'), 'copy');
check('copy reports on its button', await ev(`${byLabel('Copy text to clipboard')}.textContent.trim()`), 'Copied');
// The Windows clipboard keeps text with CRLF, so the \n the page wrote
// reads back as \r\n there. The same text either way.
check('the clipboard holds the text', await ev(`navigator.clipboard.readText().then((t)=>t.replace(/\\r\\n/g,'\\n'))`), `${TEXT} $$`);
await clickEl(byLabel('Full screen'), 'full screen');
ok('full screen row is up', await ev(`!!document.querySelector('.fs-header-row')`));
ok('the corner buttons ride along, import/export included', await ev(`!!document.querySelector('.fs-header-row ' + ${JSON.stringify(`[aria-label="Import or export the website's state as JSON"]`)})`));
check('typing area focused', await ev(`document.activeElement?.getAttribute('aria-label')`), 'Writing');
await shot('08-word-counter-fullscreen');
await clickEl(byLabel('Exit full screen'), 'exit full screen');
ok('full screen closed', !(await ev(`!!document.querySelector('.fs-header-row')`)));
await clickEl(byLabel('Hide word counter'), 'tuck word counter');
ok('word counter tucked away', await has('Show word counter'));
await clickEl(byLabel('Show word counter'), 'bring word counter back');
check('text survived the tuck', await ev(`${byLabel('Writing')}.value`), `${TEXT} $$`);

// ------------------------------------------------------- 9. clock, theme, sound
sec('9. Clock format and zone, theme, volume, mute, alarm repeat');
await clickEl(byLabel('Show the clock as 24-hour time'), '24-hour toggle');
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
ok('clock is 24-hour', !/AM|PM/.test(await clockText() ?? 'AM'), await clockText());
await ev(`(()=>{const s=document.querySelector('select[aria-label="Clock time zone"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'Asia/Tokyo');s.dispatchEvent(new Event('change',{bubbles:true}));return s.value})()`);
await sleep(600);
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
check('zone is Tokyo', (await zoneShown())?.value, 'Asia/Tokyo');
check('offset reads +9', (await zoneShown())?.offset, '+9');
const tokyoOk = await ev(`(()=>{const t=(document.querySelector('[aria-label="Show the clock as 12-hour time"]')?.textContent||'').trim();const m=/^(\\d{1,2}):(\\d{2})/.exec(t);if(!m)return 'unreadable '+t;const now=new Date();const f=(d)=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tokyo',hourCycle:'h23',hour:'2-digit',minute:'2-digit'}).format(d);const ok=[f(now),f(new Date(now-60000))].some(x=>{const [h,mm]=x.split(':').map(Number);return h===+m[1]&&mm===+m[2]});return ok?'yes':'clock '+t+' vs '+f(now)})()`);
check('clock shows the time in Tokyo', tokyoOk, 'yes');
await clickEl(byLabel('Switch to the light theme'), 'theme toggle');
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
check('light theme', await theme(), 'light');
check('browser chrome colour follows', await ev(`document.querySelector('meta[name="theme-color"]')?.content === getComputedStyle(document.documentElement).getPropertyValue('--app-surface').trim()`), 'true');
// The slider is hidden until the speaker's group is hovered or holds focus.
// Headless Chrome reports no hover-capable pointer, and Tailwind only
// applies hover styles where there is one, so this takes the path a touch
// screen takes: focus on the speaker button opens the popup.
const hoverCapable = await ev(`matchMedia('(hover: hover)').matches`);
console.log(`  (hover: hover) in this browser: ${hoverCapable}`);
await ev(`${byLabel('Mute')}.focus(), 'ok'`);
await sleep(300);
check('focus on the speaker reveals the volume slider', await ev(`getComputedStyle(${byLabel('Volume')}).visibility`), 'visible');
await ev(`${byLabel('Volume')}.focus(), 'ok'`);
const v0 = Number(await ev(`${byLabel('Volume')}.value`));
for (let i = 0; i < 5; i++) await KEY.left();
await sleep(400);
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
const v1 = Number(await ev(`${byLabel('Volume')}.value`));
ok('arrow keys turn the volume down', v1 < v0, `${v0} -> ${v1}`);
check('its readout follows', await ev(`document.querySelector('[title^="Volume: "]')?.getAttribute('title')`), `Volume: ${Math.round(v1 * 100)}%`);
await ev(`document.activeElement?.blur?.(), 'ok'`);
await mouseAt(700, 450, false);
await sleep(300);
await clickEl(byLabel('Mute'), 'mute');
await answer('CONFIRM MUTE');
ok('muted', await has('Unmute'));
await clickEl(byLabel('Enable alarm repeat'), 'alarm repeat');
console.log(`  questions answered: ${(await answerAny()).join(', ') || 'none'}`);
ok('alarm repeats', await has('Disable alarm repeat'));
await shot('09-light-24h-tokyo');

// ---------------------------------------------------- 10. website link switch
sec('10. Hiding the website link, and the list that brings it back');
await clickEl(byLabel('Hide website link'), 'hide link');
await answer('HIDE LINK');
check('link hidden', await linkShown(), 'false');
const confirmBtn = await where(`document.querySelector('[data-confirm-mode]')`);
await mouseAt(confirmBtn.x, confirmBtn.y, false);
await sleep(500);
const listRows = await ev(`document.querySelectorAll('[data-confirm-list] button').length`);
ok('hovering the confirmations button drops the list', listRows > 20, listRows);
const linkRow = await where(`[...document.querySelectorAll('[data-confirm-list] button')].find(b=>b.textContent.includes('Show the website link'))`);
ok('the list has the link switch', !!linkRow);
if (linkRow) { await mouseAt(linkRow.x, linkRow.y); await sleep(600); }
check('the switch brings the link back', await linkShown(), 'true');
await mouseAt(700, 450, false);
await sleep(400);
await clickEl(byLabel('Hide website link'), 'hide link again');
await answer('HIDE LINK');
check('hidden again', await linkShown(), 'false');

// ------------------------------------------------------- 11. confirmation modes
sec('11. Confirmation modes: half, full, none');
await clickEl(`document.querySelector('[data-confirm-mode]')`, 'confirmations button');
await answer('CONFIRM EVERYTHING');
check('full', await mode(), 'full');
await mouseAt(700, 450, false);
await clickEl(byLabel('Switch to the dark theme'), 'theme in full mode');
ok('full mode asks even about the theme', (await dialogTitle()) !== null, await dialogTitle());
await KEY.esc();
check('declined, still light', await theme(), 'light');
await clickEl(`document.querySelector('[data-confirm-mode]')`, 'confirmations button');
await answer('TURN OFF CONFIRMATIONS');
check('none', await mode(), 'none');
await mouseAt(700, 450, false);
await clickEl(byLabel('Switch to the dark theme'), 'theme, no questions');
check('no question in none mode', await dialogTitle(), 'null');
check('dark', await theme(), 'dark');
await clickEl(byLabel('Switch to the light theme'), 'theme back');
check('light again', await theme(), 'light');

// ------------------------------------------------------------------ 12. tucks
sec('12. Tucking the sidebar, the time boxes and the word counter');
await clickEl(byLabel('Hide presets & history'), 'hide sidebar');
ok('sidebar tucked', await has('Show presets & history'));
check('its presets are off the page', (await presets()).length, 0);
await clickEl(byLabel('Show presets & history'), 'show sidebar');
check('sidebar back with its presets', (await presets()).length, 2);
await clickEl(byLabel('Hide hours/minutes/seconds'), 'hide time boxes');
ok('time boxes tucked', await has('Show hours/minutes/seconds'));
await clickEl(byLabel('Hide word counter'), 'hide word counter');
ok('word counter tucked', await has('Show word counter'));

// ------------------------------------------------ 13. a run to carry across
sec('13. A paused run to carry through export and import');
await clickEl(rowButton('Remove preset 10:00'), 'preset 10:00');
check('10:00 running (no questions in none mode)', await status(), 'RUNNING');
await sleep(2300);
await activate();
await KEY.tab();
check('paused', await status(), 'PAUSED');
const pausedAt = await digits();
console.log(`  paused at ${pausedAt}`);
await shot('13-before-export');

// ------------------------------------------------------------------ 14. export
sec('14. Export: the file matches what is on screen, and downloads');
await clickEl(TRANSFER, 'import/export button');
check('dialog opens on EXPORT', await dialogTitle(), 'IMPORT / EXPORT');
const exported = JSON.parse(await ev(`document.querySelector('[data-transfer-text="export"]').value`));
check('timer: paused at the shown time', `${exported.timer.status} ${Math.trunc(exported.timer.remainingMs / 1000)}`, `paused ${toSec(pausedAt)}`);
check('timer: configured 10:00', JSON.stringify(exported.timer.configured), JSON.stringify({ hours: 0, minutes: 10, seconds: 0, negative: false }));
check('presets', JSON.stringify(exported.presets.map((p) => `${p.minutes}:${String(p.seconds).padStart(2, '0')}`).sort()), JSON.stringify(['0:45', '10:00']));
check('history rows', exported.history.length, 2);
check('sound', `${exported.sound.muted} ${exported.sound.alarmRepeats} ${exported.sound.volume}`, `true true ${v1}`);
check('clock', `${exported.clock.timeZone} ${exported.clock.hour24}`, 'Asia/Tokyo true');
check('theme', exported.theme, 'light');
check('confirmations', exported.confirmations.mode, 'none');
check('layout', JSON.stringify(exported.layout), JSON.stringify({ sidebarTucked: false, timeFieldsTucked: true, websiteLinkHidden: true, wordCounter: { view: 'tucked', restoreFullscreen: false, autoTuckedAt: null } }));
check('word counter', JSON.stringify(exported.wordCounter), JSON.stringify({ text: `${TEXT} $$`, alphanumericWordsOnly: true, alphanumericCharsOnly: false }));
await shot('14-export');
await clickEl(CTRL('DOWNLOAD'), 'DOWNLOAD');
let file = null;
for (let i = 0; i < 40 && !file; i++) {
  file = readdirSync(DL).find((f) => f.endsWith('.json'));
  if (!file) await sleep(150);
}
ok('DOWNLOAD saves a .json file', !!file, readdirSync(DL).join(','));
const fileText = file ? readFileSync(join(DL, file), 'utf8') : '';
ok('named write-timer-state-<date>.json', /^write-timer-state-\d{4}-\d{2}-\d{2}\.json$/.test(file ?? ''), file);
check('the file is the JSON on screen', fileText, await ev(`document.querySelector('[data-transfer-text="export"]').value`));
await KEY.esc();
check('ESC closes it', await dialogTitle(), 'null');

// -------------------------------------------------------------- 15. site reset
sec('15. The bin resets the site to defaults');
const beforeBin = leavePrompts;
await clickEl(BIN, 'bin');
await answer('CLEAR CACHE');
await sleep(2800);
check('its reload is not challenged', leavePrompts - beforeBin, 0);
check('dark again', await theme(), 'dark');
check('default presets back', JSON.stringify(await presets()), JSON.stringify(['1:05', '30:35', '5:35']));
check('history empty', await ev(`[...document.querySelectorAll('p')].some(p=>p.textContent.trim()==='No history yet')`), 'true');
check('ready at 01:05', `${await status()} ${(await digits())?.slice(0, 5)}`, 'READY 01:05');
check('half mode', await mode(), 'half');
check('link back', await linkShown(), 'true');
check('word counter empty and open', await totals(), '1/0/0');
check('time boxes back', await fields(), '00:01:05');
check('12-hour, New York', `${/AM|PM/.test(await clockText() ?? '')} ${(await zoneShown())?.value}`, 'true America/New_York');
ok('sound and repeat back to default', (await has('Mute')) && (await has('Enable alarm repeat')));
check('nothing left in storage but defaults', await ev(`Object.keys(localStorage).filter(k=>!['timerAppState','timerAppHistory','wordCounterText','wordCounterAlnumWordsOnly','wordCounterAlnumCharsOnly','timerSilentMode','timerAppPresets','timerVolume','timerAlarmLoop','timerConfirmMode','timerWebsiteLinkHidden','timerLinkRowMigrated','timerSidebarHidden','timerTimeFieldsHidden','wordCounterCollapsed','wordCounterCollapsedAt','wordCounterFullscreen','wordCounterFullscreenBefore','timerLightTheme','timerDontAskAgain','timerClockTimeZone','timerClock24Hour','timerConfiguredNegative'].includes(k)).length`), 0);
await shot('15-after-reset');

// ------------------------------------------------------------------ 16. import
sec('16. Import the downloaded file with LOAD FILE');
await clickEl(TRANSFER, 'import/export button');
await clickEl(`[...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent.trim()==='IMPORT'&&b.hasAttribute('aria-pressed'))`, 'IMPORT tab');
const input = await page.send('Runtime.evaluate', { expression: `document.querySelector('[role="alertdialog"] input[type="file"]')` });
await page.send('DOM.setFileInputFiles', { files: [join(DL, file)], objectId: input.result.result.objectId });
await sleep(700);
check('LOAD FILE fills the box with the file', await ev(`document.querySelector('[data-transfer-text="import"]').value`), fileText);
await clickEl(`[...document.querySelectorAll('[role="alertdialog"] button')].find(b=>b.textContent.trim()==='IMPORT'&&!b.hasAttribute('aria-pressed'))`, 'IMPORT button');
check('it asks before replacing', await dialogTitle(), 'REPLACE EVERYTHING?');
const summary = await ev(`document.querySelector('[data-transfer-summary]')?.textContent ?? ''`);
ok('summary says what is coming', /paused at/.test(summary) && /2 presets/.test(summary) && /2 history rows/.test(summary) && /word counter text/.test(summary), summary);
await shot('16-import-confirm');
const beforeImport = leavePrompts;
await KEY.yes();
await sleep(2800);
check('its reload is not challenged', leavePrompts - beforeImport, 0);

// ------------------------------------------------------- 17. all of it is back
sec('17. Everything is back, on screen');
check('light theme', await theme(), 'light');
ok('24-hour clock', !/AM|PM/.test(await clockText() ?? 'AM'), await clockText());
check('Tokyo, +9', `${(await zoneShown())?.value} ${(await zoneShown())?.offset}`, 'Asia/Tokyo +9');
ok('muted', await has('Unmute'));
ok('alarm repeats', await has('Disable alarm repeat'));
check('volume', await ev(`${byLabel('Volume')}.value`), String(v1));
check('confirmations: none', await mode(), 'none');
check('website link hidden', await linkShown(), 'false');
ok('time boxes tucked', await has('Show hours/minutes/seconds'));
ok('word counter tucked', await has('Show word counter'));
check('paused', await status(), 'PAUSED');
check('at the same time', await digits(), pausedAt);
check('presets', JSON.stringify((await presets()).slice().sort()), JSON.stringify(['0:45', '10:00']));
check('history', (await history()).length, 2);
await clickEl(byLabel('Show word counter'), 'show word counter');
check('the text', await ev(`${byLabel('Writing')}.value`), `${TEXT} $$`);
check('and its counts, filters as they were', await totals(), '2/5/30');
await clickEl(byLabel('Hide word counter'), 'tuck it again');
await clickEl(TRANSFER, 'import/export button');
const again = JSON.parse(await ev(`document.querySelector('[data-transfer-text="export"]').value`));
check('exporting again gives the same file', JSON.stringify({ ...again, exportedAt: 0 }), JSON.stringify({ ...exported, exportedAt: 0 }));
await KEY.esc();
await shot('17-after-import');
await activate();
await KEY.tab();
check('the imported run resumes', await status(), 'RUNNING');
await sleep(1200);
ok('and counts down', (await shownSeconds()) < toSec(pausedAt), await digits());
await activate();
await KEY.s();
check('STOP, no question in none mode', await status(), 'READY');

// ------------------------------------------------------------------- 18. 404
sec('18. The 404 page and the way home');
await load('/index.html');
check('/index.html is the timer', await h1(), 'Write Timer');
await load('/not-a-page');
check('an unknown path is the 404', await h1(), '404');
await clickEl(`document.querySelector('a[href="/"]')`, 'GO HOME');
await sleep(2200);
check('GO HOME returns to the timer', await h1(), 'Write Timer');
check('with the settings intact', await theme(), 'light');

// ------------------------------------------------------------ 19. other sizes
sec('19. Other screen sizes: nothing off-screen or overlapping');
const layoutProbe = () => ev(`(()=>{
  const W=innerWidth,H=innerHeight;
  const vis=(e)=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return null;const st=getComputedStyle(e);if(st.visibility==='hidden'||st.display==='none'||+st.opacity===0)return null;return r;};
  const off=[...document.querySelectorAll('button,a,input,textarea,select')].map(e=>({e,r:vis(e)})).filter(x=>x.r&&(x.r.right>W+1||x.r.left<-1)).map(x=>(x.e.getAttribute('aria-label')||x.e.textContent.trim()).slice(0,24));
  const bin=document.querySelector('[aria-label="Reset the website to defaults"]');
  const corner=bin?[...bin.parentElement.querySelectorAll(':scope > button, :scope > div > button')].map(vis).filter(Boolean):[];
  const left=['Mute','Unmute','Enable alarm repeat','Disable alarm repeat'].map(l=>document.querySelector('[aria-label="'+l+'"]')).filter(Boolean).map(vis).filter(Boolean);
  const hit=(a,b)=>a.left<b.right-0.5&&b.left<a.right-0.5&&a.top<b.bottom-0.5&&b.top<a.bottom-0.5;
  let overlaps=0;const all=[...corner,...left];for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++)if(hit(all[i],all[j]))overlaps++;
  const link=[...document.querySelectorAll('a')].find(a=>/Check Out My Website/.test(a.textContent));
  const lr=link&&vis(link.parentElement);const linkHits=lr?corner.filter(c=>hit(c,lr)).length:0;
  const fmt=document.querySelector('[aria-label="Show the clock as 24-hour time"],[aria-label="Show the clock as 12-hour time"]');
  const zone=document.querySelector('select[aria-label="Clock time zone"]')?.parentElement;
  const date=fmt?[...fmt.closest('div').parentElement.querySelectorAll('span,div')].find(e=>e.children.length===0&&/^[A-Z][a-z]{2}, \\d\\d\\/\\d\\d\\/\\d{4}$/.test(e.textContent.trim())):null;
  const clockParts=[fmt,zone,date].filter(Boolean).map(vis).filter(Boolean);
  const clockHits=clockParts.reduce((n,p)=>n+[...corner,...left].filter(c=>hit(c,p)).length,0);
  const ctrl=[...document.querySelectorAll('button')].filter(b=>/^(START|PAUSE|RESUME|RESET|STOP)$/.test([...b.children].find(c=>!c.classList.contains('control-hint'))?.textContent.trim()??b.textContent.trim())).map(vis).filter(Boolean);
  const ctrlIn=ctrl.every(r=>r.bottom<=H+1&&r.top>=-1);
  return {scrollW:document.documentElement.scrollWidth,W,off,cornerButtons:corner.length,overlaps,linkHits,clockHits,controls:ctrl.length,ctrlIn};
})()`);
// A clean slate first, so the link and every panel are on the page to be measured.
await clickEl(BIN, 'bin');
await answer('CLEAR CACHE');
await sleep(2800);
for (const [w, h, mobile, name] of [[390, 844, true, 'phone'], [844, 390, true, 'phone-landscape'], [768, 1024, true, 'tablet'], [1920, 1080, false, 'desktop-wide'], [320, 568, true, 'small-phone'], [480, 480, false, 'short-square']]) {
  await viewport(w, h, mobile);
  await reload();
  const L = await layoutProbe();
  ok(`${name} ${w}x${h}: no sideways scroll`, L.scrollW <= L.W, `${L.scrollW} > ${L.W}`);
  check(`${name}: nothing off the edge`, JSON.stringify(L.off), '[]');
  check(`${name}: four corner buttons, none overlapping`, `${L.cornerButtons} ${L.overlaps}`, '4 0');
  check(`${name}: website link clear of the corner`, L.linkHits, 0);
  check(`${name}: wall clock clear of the buttons on both sides`, L.clockHits, 0);
  ok(`${name}: START/RESET/STOP on screen`, L.controls >= 3 && L.ctrlIn, JSON.stringify(L));
  await shot(`19-${name}`);
  if (name === 'phone') {
    await clickEl(TRANSFER, 'import/export on a phone');
    const d = await ev(`(()=>{const r=document.querySelector('[role="alertdialog"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`);
    ok('phone: the import/export dialog fits the screen', d);
    await shot('19-phone-dialog');
    await KEY.esc();
    await clickEl(CTRL('START'), 'START on a phone');
    check('phone: START runs it', await status(), 'RUNNING');
    await clickEl(CTRL('PAUSE'), 'PAUSE on a phone');
    check('phone: PAUSE pauses it', await status(), 'PAUSED');
    await clickEl(CTRL('STOP'), 'STOP on a phone');
    await answer('CONFIRM STOP');
    check('phone: STOP stops it', await status(), 'READY');
  }
}

// ---------------------------------------------------------------- 20. health
sec('20. Page health across the whole session');
check('uncaught exceptions', exceptions.length, 0);
check('console errors and warnings', consoleProblems.length, 0);
check('browser-level errors (network, security)', network.length, 0);

const passed = results.filter((r) => r.pass).length;
console.log(`\nquestions answered along the way: ${answered.length}`);
if (exceptions.length) console.log('exceptions:\n  ' + exceptions.join('\n  '));
if (consoleProblems.length) console.log('console:\n  ' + consoleProblems.join('\n  '));
if (network.length) console.log('browser log:\n  ' + network.join('\n  '));
if (sandboxOnly.length) console.log(`sandbox-only (not counted): ${sandboxOnly.length}x ${sandboxOnly[0]}`);
if (expectedLog.length) console.log(`expected (not counted): ${expectedLog.join(' | ')}`);
console.log(`\n${passed}/${results.length} passed`);
page.ws.close(); browser.ws.close(); chrome.kill();
try { rmSync(OUT, { recursive: true, force: true }); } catch { /* held briefly */ }
process.exit(0);
