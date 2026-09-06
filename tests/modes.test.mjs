// The confirm button's three positions, and the list it drops down.
// Real clicks, keys and pointer moves through CDP, so hover and focus
// behave as they will for a person.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CHROME } from './chrome.mjs';
const port = Number(process.argv[2] ?? 9545);
const profile = mkdtempSync(join(tmpdir(), 'modes-'));
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
// The leave guard arms whenever a timer is running, so a reload here can
// raise a native beforeunload dialog. Unanswered it blocks the whole CDP
// session, so it gets accepted the moment it opens.
ws.onmessage = (m) => {
  const x = JSON.parse(m.data);
  if (x.method === 'Page.javascriptDialogOpening') {
    ws.send(JSON.stringify({ id: id++, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    return;
  }
  if (pending.has(x.id)) { pending.get(x.id)(x.result); pending.delete(x.id); }
};
const send = (method, params = {}) => new Promise((res) => { const i = id++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;

// ENTER needs its char event as well as the key one, or the focused
// button never activates and the dialog just sits there.
const press = async (key, code, vk, text) => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: vk });
  if (text) await send('Input.dispatchKeyEvent', { type: 'char', key, code, windowsVirtualKeyCode: vk, text });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  await sleep(700);
};
// The backquote is the confirm key; ENTER answers nothing in a dialog.
const confirmDialog = () => press('`', 'Backquote', 192, '`');
const moveTo = async (x, y) => {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(300);
};
const clickAt = async (x, y) => {
  // Moved first, or the pointer teleports onto the target and the hover
  // the list hangs on never opens.
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(600);
};
const centreOf = (expr) => ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);

const out = [];
const check = (name, got, want) => out.push({ name, got: String(got), want: String(want), pass: String(got) === String(want) });
const clickEl = async (expr, name) => {
  const p = await centreOf(expr);
  if (!p) { check(`${name} (not found)`, 'missing', 'found'); return false; }
  await clickAt(p.x, p.y);
  return true;
};

// A row past the fold has a rect the panel clips, so clicking its centre
// lands on the page behind. Scrolled into view first, the way a person
// reaching it would.
const clickRow = async (label) => {
  const found = await ev(`(()=>{const b=[...document.querySelectorAll('[data-confirm-list] button:not([data-confirm-section])')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b)return false;b.scrollIntoView({block:'center'});return true})()`);
  if (!found) { check(`${label} row (not found)`, 'missing', 'found'); return false; }
  await sleep(200);
  return clickEl(`[...document.querySelectorAll('[data-confirm-list] button:not([data-confirm-section])')].find(b=>b.textContent.trim()===${JSON.stringify(label)})`, `${label} row`);
};

// The button carries its mode as an attribute, so nothing here has to
// match on the prose in its tooltip.
const CONFIRM_BTN = `document.querySelector('[data-confirm-mode]')`;
const LIST = `document.querySelector('[data-confirm-list]')`;
const CONTROL = (label) => `[...document.querySelectorAll('button:not([data-confirm-section])')].find(b=>{const t=b.textContent.trim();if(t==='${label}')return true;const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return !!m&&m.textContent.trim()==='${label}';})`;

const mode = () => ev(`(${CONFIRM_BTN})?.dataset.confirmMode ?? null`);
const dialogTitle = () => ev(`document.querySelector('[role="alertdialog"][data-state="open"] h2')?.textContent ?? null`);
const status = () => ev(`[...document.querySelectorAll('div')].filter(e=>/^(READY|RUNNING|PAUSED|STOPPED|FINISHED)$/.test(e.textContent.trim())&&e.children.length===0).pop()?.textContent.trim()`);
const stored = () => ev(`localStorage.getItem('timerConfirmMode')`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(3000);
const seed = `localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})),
  localStorage.removeItem('timerConfirmMode'),
  localStorage.setItem('timerSkipConfirmations','false'),
  localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('wordCounterCollapsed','false'),
  localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'),
  localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'), 'ok'`;
await ev(seed);
await send('Page.reload', {});
await sleep(3000);
await ev(`document.activeElement?.blur?.(), 'ok'`);

// --- half: the mode a browser that never knew this button lands in ------
check('starts in half', await mode(), 'half');
check('half fills to the diagonal', await ev(`(${CONFIRM_BTN})?.querySelector('span > span')?.style.clipPath || null`), 'polygon(0% 0%, 0% 100%, 100% 100%)');
await clickEl(CONTROL('START'), 'START');
check('half mode starts without asking', await dialogTitle(), 'null');
check('and it is running', await status(), 'RUNNING');

// --- half -> full -------------------------------------------------------
await clickEl(CONFIRM_BTN, 'confirm toggle');
check('turning the full set on asks first', await dialogTitle(), 'CONFIRM EVERYTHING');
await press('Escape', 'Escape', 27);
check('cancelling leaves it in half', await mode(), 'half');
await clickEl(CONFIRM_BTN, 'confirm toggle');
await confirmDialog();
check('confirming reaches full', await mode(), 'full');
check('full fills the square', await ev(`(${CONFIRM_BTN})?.querySelector('span > span')?.style.clipPath || 'none'`), 'none');
check('full is persisted', await stored(), '"full"');

// TAB is pause/resume, and full mode asks about it.
await press('Tab', 'Tab', 9);
check('full mode asks before pausing', await dialogTitle(), 'PAUSE TIMER');
await press('Escape', 'Escape', 27);
check('cancelling leaves it running', await status(), 'RUNNING');
await press('Tab', 'Tab', 9);
await confirmDialog();
check('confirming pauses', await status(), 'PAUSED');

// --- the list -----------------------------------------------------------
// Hovering is the only way in, so a missing button here is fatal to
// everything below it rather than one failed check.
const hoverConfirm = async () => {
  const p = await centreOf(CONFIRM_BTN);
  if (!p) { check('confirm button (not found)', 'missing', 'found'); return false; }
  await moveTo(p.x, p.y);
  return true;
};
await hoverConfirm();
check('hovering opens the list', await ev(`!!(${LIST})`), 'true');
check('every question has a row', await ev(`(${LIST})?.querySelectorAll('button:not([data-confirm-section])').length ?? 0`), 54);
check('the list scrolls', await ev(`(()=>{const l=document.querySelector('[data-confirm-scroll]');return !!l && l.scrollHeight > l.clientHeight})()`), 'true');
// In full mode nothing is greyed: every row is a question being asked.
check('full greys nothing', await ev(`[...(${LIST}).querySelectorAll('button:not([data-confirm-section])')].filter(b=>b.style.color==='rgb(107, 114, 128)').length`), 0);
// A heading over each group: the questions half mode asks, then the ones
// only full does. Without them the greying is the only thing marking that
// turn, and in the two modes that grey those rows there is nothing to
// read it against.
const SECTION = (tier) => `document.querySelector('[data-confirm-section="${tier}"]')`;
// Rows before a heading, counted through the DOM rather than by index, so
// reordering the list moves the check with it.
const rowsAbove = (tier) => ev(`(()=>{const d=${SECTION(tier)};if(!d)return -1;return [...document.querySelectorAll('[data-confirm-list] button:not([data-confirm-section])')].filter(b=>d.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_PRECEDING).length})()`);
check('the half group is headed', await ev(`${SECTION('half')}?.textContent ?? null`), 'ACTIVE CONFIRMATIONS');
check('and it opens the list', await rowsAbove('half'), 0);
check('the full group is headed', await ev(`${SECTION('full')}?.textContent ?? null`), 'ACTIVE IN FULL CONFIRMATION ONLY');
check('and it sits on the turn', await rowsAbove('full'), 24);
check('both lit in full', await ev(`[...document.querySelectorAll('[data-confirm-section]')].map(d=>getComputedStyle(d).color).join('|')`), 'rgb(34, 197, 94)|rgb(34, 197, 94)');
// One line, not two, where the panel's own heading already drew one.
check('the top heading is not double-ruled', await ev(`getComputedStyle(${SECTION('half')}).borderTopWidth`), '0px');
// Green while its section is asking, and the same grey its rows go when
// it isn't. The heading is the one line saying which of the two a reader
// is looking at, so it must not be the colour of either on its own.
check('a live heading is green', await ev(`getComputedStyle(${SECTION('half')}).color`), 'rgb(34, 197, 94)');
// Over the rows it heads, and still on one line. The longer heading is
// thirty-two characters against a 22rem panel
// less its padding, its border and the heading's own box, so there is
// not much room over.
check('a heading is larger than its rows', await ev(`(()=>{
  const h=parseFloat(getComputedStyle(${SECTION('half')}).fontSize);
  const r=parseFloat(getComputedStyle(document.querySelector('[data-confirm-list] button:not([data-confirm-section])')).fontSize);
  return h > r;
})()`), 'true');
check('and neither wraps', await ev(`[...document.querySelectorAll('[data-confirm-section]')].every(h=>h.querySelector('span:last-child').getClientRects().length === 1)`), 'true');

// --- the heading's own box, over its whole section ----------------------
// Standard select-all: none ticked and it silences the section, any
// ticked and it clears it. Behind a question, since one click answers
// twenty-three of them.
const ticks = () => ev(`JSON.parse(localStorage.getItem('timerDontAskAgain')||'[]').length`);
// Scrolled into view first: the full heading sits below the fold, and
// clicking its centre otherwise lands on the page behind the list.
const clickSection = async (tier, name) => {
  await ev(`${SECTION(tier)}?.scrollIntoView({block:'center'}), 'ok'`);
  await sleep(200);
  return clickEl(SECTION(tier), name);
};

check('nothing ticked yet', await ticks(), 0);
await clickSection('full', 'full heading');
check('the heading asks first', await dialogTitle(), 'SILENCE THE SECTION');
await press('Escape', 'Escape', 27);
check('cancelling ticks nothing', await ticks(), 0);

await hoverConfirm();
await clickSection('full', 'full heading again');
await confirmDialog();
await sleep(400);
check('confirming silences the whole section', await ticks(), 30);
await hoverConfirm();
// Ticked means asks, so a silenced section reads as empty.
check('and the heading empties', await ev(`${SECTION('full')}?.getAttribute('aria-pressed')`), 'false');

// Any ticked, so the same box clears them.
await clickSection('full', 'full heading a third time');
check('the other way asks too', await dialogTitle(), 'BRING THE SECTION BACK');
await confirmDialog();
await sleep(400);
check('and clears the section', await ticks(), 0);

// The half section is the one that catches it: the two rows about this
// box live there, and a box that ticks its own confirmation asks once and
// never again. Silencing the half section used to tick both, and the
// click that brought it back was silent. The website link's row is spared
// for its own reason — it is the link's switch, not a question, and a
// heading that swept it up would take the link off the page.
await hoverConfirm();
await clickSection('half', 'half heading');
check('the half section asks going out', await dialogTitle(), 'SILENCE THE SECTION');
await confirmDialog();
await sleep(400);
check('and leaves the three it must not touch alone', await ticks(), 21);
await hoverConfirm();
await clickSection('half', 'half heading again');
check('so the way back still asks', await dialogTitle(), 'BRING THE SECTION BACK');
await confirmDialog();
await sleep(400);
check('and clears it', await ticks(), 0);

// Left open, since the checks below carry on with the list up.
await hoverConfirm();

// Ticking a row silences that one question and nothing else.
await clickRow('Start the timer');
check('the tick is written', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('"start"')`), 'true');
await moveTo(700, 500);
await clickEl(CONTROL('STOP'), 'STOP');
await confirmDialog();
await sleep(400);
await clickEl(CONTROL('START'), 'START');
check('a silenced question stops asking', await dialogTitle(), 'null');
check('and the action went through', await status(), 'RUNNING');
// Its neighbour is untouched.
await press('Tab', 'Tab', 9);
check('its neighbour still asks', await dialogTitle(), 'PAUSE TIMER');
await press('Escape', 'Escape', 27);

// --- full -> none, which is the one step that warns ---------------------
await clickEl(CONFIRM_BTN, 'confirm toggle');
check('turning it off asks first', await dialogTitle(), 'TURN OFF CONFIRMATIONS');
await confirmDialog();
check('two clicks reach none', await mode(), 'none');
check('none empties the square', await ev(`(${CONFIRM_BTN})?.querySelector('span > span')?.style.backgroundColor`), 'transparent');
await clickEl(CONTROL('STOP'), 'STOP');
check('none asks nothing', await dialogTitle(), 'null');
check('and the stop went through', await status(), 'READY');

await hoverConfirm();
check('none greys every row', await ev(`[...(${LIST}).querySelectorAll('button:not([data-confirm-section])')].filter(b=>b.style.color==='rgb(107, 114, 128)').length`), 54);
// The rows grey, the headings go red: grey says "not in play", red says
// the group is off.
check('and both headings go red', await ev(`[...document.querySelectorAll('[data-confirm-section]')].map(d=>getComputedStyle(d).color).join('|')`), 'rgb(239, 68, 68)|rgb(239, 68, 68)');
// Greyed is not disabled: the answer still lands, it just changes nothing
// until the mode comes back round to asking that question.
await clickRow('Stop the timer');
check('a greyed row still toggles', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('"stop"')`), 'true');

// --- none -> half, round again ------------------------------------------
await moveTo(700, 500);
await clickEl(CONFIRM_BTN, 'confirm toggle');
check('three clicks come back to half', await mode(), 'half');
await hoverConfirm();
check('half greys only the full rows', await ev(`[...(${LIST}).querySelectorAll('button:not([data-confirm-section])')].filter(b=>b.style.color==='rgb(107, 114, 128)').length`), 30);
check('the half heading stays lit', await ev(`getComputedStyle(${SECTION('half')}).color`), 'rgb(34, 197, 94)');
check('and the full one is red', await ev(`getComputedStyle(${SECTION('full')}).color`), 'rgb(239, 68, 68)');
check('the twelve greyed are the twelve under it', await ev(`(()=>{const d=${SECTION('full')};return [...document.querySelectorAll('[data-confirm-list] button:not([data-confirm-section])')].filter(b=>b.style.color==='rgb(107, 114, 128)').every(b=>d.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING)})()`), 'true');
await moveTo(700, 500);
check('leaving closes the list', await ev(`!!(${LIST})`), 'false');

// Half mode ignores a FULL-tier answer as well as the question: pausing
// asks nothing here whether or not it was ticked above.
await clickEl(CONTROL('START'), 'START');
await press('Tab', 'Tab', 9);
check('half mode never asks a full question', await dialogTitle(), 'null');
check('and it paused', await status(), 'PAUSED');

// --- the half-tier questions still work the way they always did ---------
await clickEl(CONTROL('RESET'), 'RESET');
check('half still asks about reset', await dialogTitle(), 'CONFIRM RESET');
// The tick here and the row in the list are one answer written to one
// key, and nothing said so: from the dialog it read as a per-dialog
// setting, from the list as a separate one. The dialog names its row.
check('the box names its row in the list', await ev(`document.querySelector('[role="alertdialog"] [data-dont-ask]')?.textContent ?? null`), 'Keep asking this (Reset the timer)');
await press('Escape', 'Escape', 27);

// --- the same list inside the word counter's fullscreen row -------------
// The corner controls relocate into that row, and the list has to come
// with them intact.
await ev(`localStorage.setItem('wordCounterFullscreen','true'), 'ok'`);
await send('Page.reload', {});
await sleep(3000);
check('the corner moves into the fullscreen row', await ev(`!!document.querySelector('.fs-header-row [data-confirm-mode]')`), 'true');
await hoverConfirm();
check('the list opens there too', await ev(`!!(${LIST})`), 'true');
// That row caps every button it holds to a square icon's size, and the
// list hangs off one of them. Capped, its rows came out 93px wide inside
// a 346px panel and every label wrapped onto four lines.
check('its rows fill the panel', await ev(`(()=>{const s=document.querySelector('[data-confirm-scroll]'),b=document.querySelector('[data-confirm-list] button');return !!s&&!!b&&Math.abs(s.getBoundingClientRect().width-b.getBoundingClientRect().width)<2})()`), 'true');

// --- FULL asks about every adjustment, in every state -------------------
// Half asks once per timer state and only while there's a run to lose, so
// the idle and ringing rows in the list are unreachable there. Full asks
// every time, which is what makes them mean anything.
// Stopped, so the state is 'unstarted' — the one half mode never asks in
// at all, since there is no run to lose.
// Out of full screen explicitly. The section above left the counter in
// it, and the time boxes this one clicks are not on screen there — it
// used to get out by accident, because a stray click on the exit button
// went straight through. That button asks now.
await ev(`localStorage.setItem('timerConfirmMode','"full"'),
  localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('wordCounterFullscreen','false'),
  localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
await ev(`document.activeElement?.blur?.(), 'ok'`);
check('back in full', await mode(), 'full');
check('and idle', await status(), 'READY');
const ARROW = `document.querySelector('[aria-label*="Increase"], [aria-label*="increase"]')`;
// Three digits, read off the time boxes rather than every input on the
// page: the volume slider moves in DOM order when its popup opens.
const FIELDS = `[...document.querySelectorAll('.time-fields-box input')].map(i=>i.value).join(':')`;
// One throwaway press first. The claim under test is that the NEXT one
// asks too, and a first click right after a reload sometimes lands where
// the arrow was a frame ago rather than where it is.
await sleep(900);
await clickEl(ARROW, 'warm-up step');
await press('Escape', 'Escape', 27);
const before = await ev(FIELDS);
check('the fields read back', /^\d\d:\d\d:\d\d$/.test(before || ''), true);

await clickEl(ARROW, 'first step');
check('an idle adjustment asks', await dialogTitle(), 'ADJUST TIME');
await press('Escape', 'Escape', 27);
check('cancelling changes nothing', await ev(FIELDS), before);

await clickEl(ARROW, 'second step');
check('and asks again the very next time', await dialogTitle(), 'ADJUST TIME');
await confirmDialog();
await sleep(400);
check('confirming applies it', (await ev(FIELDS)) !== before, true);

// The slider asks where the pointer lets go, not at every point it
// passes over. Asking on the way put a dialog under a pointer still
// holding the thumb, which killed the drag and left the volume
// unchangeable. Dispatched rather than dragged: the popup only shows on
// hover, and what is under test is the handler.
const SLIDER = `document.querySelector('input[type=range]')`;
const slide = async (value) => {
  await ev(`(()=>{const el=${SLIDER};const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(el,'${value}');el.dispatchEvent(new Event('input',{bubbles:true}));return 'ok'})()`);
  await sleep(200);
};
const pointer = async (type) => {
  await ev(`(()=>{${SLIDER}.dispatchEvent(new PointerEvent('${type}',{bubbles:true}));return 'ok'})()`);
  await sleep(400);
};
const grab = () => pointer('pointerdown');
const release = () => pointer('pointerup');
const sliderValue = () => ev(`${SLIDER}.value`);
await grab();
await slide(0.4);
check('mid-drag asks nothing', await dialogTitle(), 'null');
await slide(0.7);
check('and the thumb goes where it is dragged', await sliderValue(), '0.7');
await release();
check('letting go is what asks', await dialogTitle(), 'CHANGE VOLUME');
await press('Escape', 'Escape', 27);
await sleep(300);
check('saying no puts the thumb back', await sliderValue(), '0.5');
await slide(0.7);
await release();
await confirmDialog();
await sleep(300);
check('saying yes keeps it', await sliderValue(), '0.7');
check('and the volume took it', await ev(`localStorage.getItem('timerVolume')`), '0.7');

// Nothing moved, so there is nothing to ask about: a click on the thumb
// that goes nowhere used to raise a dialog for a change of zero, and
// confirming it played the preview burst.
await grab();
await release();
check('a release that moved nothing asks nothing', await dialogTitle(), 'null');
// A value that arrives with no pointer behind it is a finished change,
// not a drag in progress — a screen reader's own increment reaches the
// slider this way, and would otherwise move the thumb and nothing else.
await slide(0.3);
check('a change with no drag behind it asks at once', await dialogTitle(), 'CHANGE VOLUME');
await press('Escape', 'Escape', 27);
await sleep(300);
// A drag the browser takes back is not an answer either.
await grab();
await slide(0.9);
await pointer('pointercancel');
check('a cancelled drag puts the thumb back', await sliderValue(), '0.7');

// A question that replaced another one has not been read yet. Saving a
// preset queues RUN IT NOW a microtask after SAVE PRESET is answered, so
// it arrives with no fade and no re-open — and a double-tap on the
// confirm key is two real presses, which the auto-repeat guard does not
// catch. Tapped through raw key events: the helper above waits long
// enough between presses to be a considered second answer.
const ADD = `document.querySelector('input[aria-label="New preset time"]')`;
const tap = async () => {
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: '`', code: 'Backquote', windowsVirtualKeyCode: 192 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '`', code: 'Backquote', windowsVirtualKeyCode: 192 });
};
await clickEl(ADD, 'the new preset box');
for (let i = 0; i < 8; i++) await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8 });
await sleep(200);
for (const ch of '25') await press(ch, `Digit${ch}`, 48 + Number(ch), ch);
await press('Enter', 'Enter', 13, String.fromCharCode(13));
check('saving a preset asks', await dialogTitle(), 'SAVE PRESET');
await tap();
await tap();
await sleep(400);
check('and the tap that answered it does not answer the next one', await dialogTitle(), 'RUN IT NOW');
await sleep(600);
await confirmDialog();
check('which answers to a press aimed at it', await dialogTitle(), 'null');

// --- the one thing full mode does with no dialog to silence -------------
// Asking on every adjustment, where half asks once per pause or resume,
// is a rule rather than an act: the question it governs is a half-tier
// one and only its cadence changes. So it gets a row of its own, and
// ticking it drops full back to half's cadence.
await hoverConfirm();
await clickRow('Change the time again in the same run');
check('the rule is written', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('"adjustAgain"')`), 'true');
await moveTo(700, 500);
// Reloaded, because "once per stretch" is in memory and this timer is
// idle: it has already been asked once above, and an idle timer never
// pauses or resumes to start a fresh stretch. The tick itself is stored,
// so it survives.
await send('Page.reload', {});
await sleep(3000);
await ev(`document.activeElement?.blur?.(), 'ok'`);

await clickEl(ARROW, 'first step after the tick');
check('the first adjustment still asks', await dialogTitle(), 'ADJUST TIME');
await confirmDialog();
await sleep(400);
const oncePer = await ev(FIELDS);
await clickEl(ARROW, 'second step after the tick');
check('the next one in the same stretch is silent', await dialogTitle(), 'null');
check('but still applied', (await ev(FIELDS)) !== oncePer, true);

// --- HALF: one adjustment question per stretch of the run --------------
// Half's rule is unchanged in shape — the three boxes share one prompt,
// and only where there's a run to lose — but the stretch it covers is a
// pause or a resume, not a state kind. Keyed by kind, answering while
// paused, resuming and pausing again walked straight past the question:
// 'paused' had already been asked once, so the second pause was silent.
await ev(`localStorage.setItem('timerConfirmMode','"half"'),
  localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('wordCounterFullscreen','false'),
  localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
await ev(`document.activeElement?.blur?.(), 'ok'`);
check('back in half', await mode(), 'half');
// The seconds box, so one step is one second and the digits stay readable.
const SEC_ARROW = `document.querySelector('[aria-label="Increase seconds"]')`;

await clickEl(CONTROL('START'), 'START');
await press('Tab', 'Tab', 9);
check('paused with a run to lose', await status(), 'PAUSED');
await sleep(600);
const paused = await ev(FIELDS);
check('the fields hold still', /^\d\d:\d\d:\d\d$/.test(paused || ''), true);

await clickEl(SEC_ARROW, 'seconds step');
check('half asks about the first adjustment', await dialogTitle(), 'ADJUST TIME');
// The boxes show what the question is about while it's still open. They
// used to snap back to the old number the moment the dialog appeared,
// which reads as the edit having already been refused.
check('and the boxes show the pending time', (await ev(FIELDS)) !== paused, true);
await press('Escape', 'Escape', 27);
check('cancelling puts them back', await ev(FIELDS), paused);

await clickEl(SEC_ARROW, 'seconds step');
check('a cancelled question is asked again', await dialogTitle(), 'ADJUST TIME');
await confirmDialog();
await sleep(400);
const answered = await ev(FIELDS);
check('confirming applies it', answered !== paused, true);

await clickEl(SEC_ARROW, 'seconds step');
check('and the next one in the same pause is silent', await dialogTitle(), 'null');
check('but still applied', (await ev(FIELDS)) !== answered, true);

await press('Tab', 'Tab', 9);
check('resumed', await status(), 'RUNNING');
await clickEl(SEC_ARROW, 'seconds step');
check('a resume re-arms the question', await dialogTitle(), 'ADJUST TIME');
await confirmDialog();
await sleep(400);

await press('Tab', 'Tab', 9);
check('paused again', await status(), 'PAUSED');
await clickEl(SEC_ARROW, 'seconds step');
check('and so does the next pause', await dialogTitle(), 'ADJUST TIME');
await press('Escape', 'Escape', 27);

// --- HALF: a ringing timer has nothing left to lose --------------------
await ev(`localStorage.setItem('timerAppState', JSON.stringify({seconds:3,isPaused:false,isRunning:false,hours:0,minutes:0,timerSeconds:3})), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
await ev(`document.activeElement?.blur?.(), 'ok'`);
await clickEl(CONTROL('START'), 'START');
await sleep(4500);
check('past zero and ringing', await status(), 'FINISHED');
await clickEl(SEC_ARROW, 'seconds step');
check('half never asks while it rings', await dialogTitle(), 'null');

// --- the website link's row is the link's own switch --------------------
// Not a question: ticked means the link is on the page, and the two move
// together. Answering the hide dialog clears the row, ticking the row
// puts the link back, and the dialog carries no "keep asking this" box,
// which here would read as one thing and do another.
await ev(`localStorage.setItem('timerConfirmMode','"half"'),
  localStorage.setItem('timerDontAskAgain','[]'),
  localStorage.setItem('timerWebsiteLinkHidden','false'),
  localStorage.setItem('timerAppState', JSON.stringify({seconds:600,isPaused:false,isRunning:false,hours:0,minutes:10,timerSeconds:0})), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
const LINK = `!!document.querySelector('a[href="https://ruinan-ding.com/"]')`;
check('the link is on the page', await ev(LINK), 'true');
await clickEl(`document.querySelector('[aria-label="Hide website link"]')`, 'the link X');
check('hiding asks', await dialogTitle(), 'HIDE LINK');
check('with no keep-asking box', await ev(`!!document.querySelector('[role="alertdialog"] [data-dont-ask]')`), 'false');
await confirmDialog();
await sleep(400);
check('confirming takes the link away', await ev(LINK), 'false');
check('and clears its row', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('"hideWebsiteLink"')`), 'true');
await hoverConfirm();
await clickRow('Show the website link');
await sleep(500);
check('ticking the row brings it back', await ev(LINK), 'true');
await moveTo(700, 500);

// Confirmations off, so the X asks nothing — and nothing was answered,
// so the row still says the link is wanted. Switching back to a mode
// that reads it settles the two.
await ev(`localStorage.setItem('timerConfirmMode','"none"'), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
await clickEl(`document.querySelector('[aria-label="Hide website link"]')`, 'the link X with nothing asking');
await sleep(500);
check('none hides it without asking', await ev(LINK), 'false');
check('and leaves the row ticked', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('"hideWebsiteLink"')`), 'false');
await ev(`localStorage.setItem('timerConfirmMode','"half"'), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
check('so half brings it back', await ev(LINK), 'true');

// The row used to be an ordinary "stop asking this" box, so a browser
// that answered it — or swept it up with the section heading — carries an
// entry that would now read as "the link is hidden". The stored
// visibility wins once, and the row is rewritten from it.
await ev(`localStorage.setItem('timerDontAskAgain','["hideWebsiteLink"]'),
  localStorage.setItem('timerWebsiteLinkHidden','false'),
  localStorage.removeItem('timerLinkRowMigrated'), 'ok'`);
await send('Page.reload', {});
await sleep(3500);
check('an old silenced question does not hide the link', await ev(LINK), 'true');
check('and the stale row goes with it', await ev(`(localStorage.getItem('timerDontAskAgain')||'').includes('hideWebsiteLink')`), 'false');

const width = Math.max(...out.map((r) => r.name.length));
out.forEach((r) => console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name.padEnd(width)}  got=${r.got.padEnd(24)} want=${r.want}`));
console.log(`${out.filter((r) => r.pass).length}/${out.length} passed`);
ws.close();
chrome.kill();
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* windows holds it briefly */ }
process.exit(out.every((r) => r.pass) ? 0 : 1);
