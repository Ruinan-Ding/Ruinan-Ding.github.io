// The wall clock against the ringer and the speaker.
//
// The clock is centred over the countdown and those two float above it in
// their own corner, so on a short window the clock rides up into their
// band and runs underneath them. Nothing about that shows up as an
// overflow: both boxes are exactly where their own layout puts them, and
// they simply happen to be in the same place.
//
// Swept over both sidebar states, since the sidebar moves the column the
// clock is centred in without moving the corner it has to clear.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME } from './chrome.mjs';

const port = 9581;
const profile = mkdtempSync(join(tmpdir(), 'ovl-'));
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

const SEED = (sidebarHidden) => `localStorage.clear(),
  localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('timerSidebarHidden','${sidebarHidden}'),
  localStorage.setItem('timerTimeFieldsHidden','false'),
  localStorage.setItem('wordCounterCollapsed','false'),
  localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'), 'ok'`;
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 700, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);


// The clock is the row holding the HH:MM:SS AM box, the zone select and
// the date; the top-left group is the absolutely-placed corner holding the
// sidebar arrow, the ringer and the speaker.
const PROBE = `(()=>{
  // The ClockCluster root itself, not the flex wrapper that centres it:
  // the wrapper spans the column and its left edge says nothing about
  // where the clock is drawn.
  const clock=[...document.querySelectorAll('div')].find(e=>e.style && e.style.letterSpacing==='0.05em' && e.style.fontSize && e.querySelector('select'));
  // The two buttons, not the corner around them: the alarm tip lives in
  // that corner and wraps to a tall column, and running under the tip is
  // not what this is about.
  const corner=[...document.querySelectorAll('div')].find(e=>typeof e.className==='string' && e.className.includes('absolute') && e.className.includes('left-2') && e.className.includes('items-start'));
  const left=corner?corner.querySelector('.flex.flex-col.items-start > div'):null;
  if(!clock||!left) return {err:!clock?'no clock':'no corner'};
  const c=clock.getBoundingClientRect(), l=left.getBoundingClientRect();
  const overlapX=Math.round(Math.min(c.right,l.right)-Math.max(c.left,l.left));
  const overlapY=Math.round(Math.min(c.bottom,l.bottom)-Math.max(c.top,l.top));
  return {
    w:innerWidth, h:innerHeight,
    clock:[Math.round(c.left),Math.round(c.right),Math.round(c.top),Math.round(c.bottom)],
    corner:[Math.round(l.left),Math.round(l.right),Math.round(l.top),Math.round(l.bottom)],
    gap: Math.round(c.left-l.right),
    overlap: (overlapX>0&&overlapY>0)?Math.min(overlapX,overlapY):0,
    clockShown: c.width>0,
    dateShown: /\d{4}/.test(clock.textContent),
    clockTag: clock.tagName+'.'+String(clock.className).slice(0,40),
    clockW: Math.round(c.width),
  };
})()`;

const WIDTHS = [380, 420, 480, 540, 600, 660, 720, 780, 840, 900, 1000, 1150, 1300];
const HEIGHTS = [400, 440, 480, 540, 620, 720, 860];
let bad = 0, total = 0;
for (const sidebarHidden of ['false', 'true']) {
  await ev(SEED(sidebarHidden));
  await send('Page.reload', {});
  await sleep(2200);
  for (const h of HEIGHTS) for (const w of WIDTHS) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(420);
    const r = await ev(PROBE);
    total++;
    if (!r || r.err) { console.log(`FAIL  ${w}x${h} sidebar=${sidebarHidden === 'true' ? 'hidden' : 'shown'} ${r ? r.err : 'no result'}`); bad++; continue; }
    if (r.overlap > 0) {
      bad++;
      console.log(`FAIL  ${w}x${h} sidebar=${sidebarHidden === 'true' ? 'hidden' : 'shown'} the clock overlaps the corner buttons by ${r.overlap}px (gap ${r.gap})`);
    }
  }
}
console.log(bad === 0 ? `all ${total} viewports pass` : `${bad} of ${total} viewports fail`);

ws.close(); chrome.kill();
await sleep(200);
process.exit(bad === 0 ? 0 : 1);
