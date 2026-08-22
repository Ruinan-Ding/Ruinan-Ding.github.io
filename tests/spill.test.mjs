// The countdown column squeezed narrower than the things it draws.
//
// The one combination the layout sweep doesn't cover: presets & history
// showing AND the HOURS/MINUTES/SECONDS panel showing, in a window small
// enough that the two of them leave the countdown column less than its
// START/RESET/STOP row needs. The buttons bottom out on a rem floor, so
// past that point they don't shrink with the column; centred in it they
// spill equally both ways, and the left half lands outside the row that
// clips. That is a START button reading TART and a clock missing its
// first digit, and no amount of scrollWidth can see it: in a
// left-to-right box scrollWidth reports the right-hand overflow only.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CHROME } from './chrome.mjs';

const port = Number(process.argv[2] ?? 9577);
const profile = mkdtempSync(join(tmpdir(), 'sweep-'));
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 640, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://localhost:5199/' });
await sleep(2500);
await ev(`localStorage.clear(),
  localStorage.setItem('timerSilentMode','true'),
  localStorage.setItem('timerSidebarHidden','false'),
  localStorage.setItem('timerTimeFieldsHidden','false'),
  localStorage.setItem('wordCounterCollapsed','false'),
  localStorage.setItem('wordCounterCollapsedAt','null'),
  localStorage.setItem('wordCounterFullscreen','false'), 'ok'`);
await send('Page.reload', {});
await sleep(2500);

// Does anything in the countdown column paint left of the clipping row?
const PROBE = `(()=>{
  const start=[...document.querySelectorAll('button')].find(b=>{const m=[...b.children].find(c=>!c.classList.contains('control-hint'));return m&&m.textContent.trim()==='START';});
  if(!start) return {err:'no START'};
  const controls=start.parentElement, box=controls.parentElement;
  let row=controls; while(row && getComputedStyle(row).overflowX!=='hidden') row=row.parentElement;
  const rowL=row?row.getBoundingClientRect().left:0, rowR=row?row.getBoundingClientRect().right:0;
  const spill=(el)=>{const r=el.getBoundingClientRect();if(!r.width)return 0;return Math.round(Math.max(rowL-r.left, r.right-rowR));};
  // Worst spill anywhere in the countdown column, so the clock and the
  // bar are covered as well as the buttons.
  const col=box.parentElement;
  let worst=0, who='';
  for(const el of col.querySelectorAll('*')){const s=spill(el);if(s>worst){worst=s;who=el.tagName+'.'+String(el.className).slice(0,24);}}
  return {
    w: window.innerWidth,
    fields: !!document.querySelector('.time-fields-box'),
    controlsSpill: spill(controls),
    worstSpill: worst,
    worstEl: who,
    short: Math.round(controls.getBoundingClientRect().width - box.clientWidth),
  };
})()`;

// Width and height both, and short windows especially: the panel has its
// own too-tall check, and a window tall enough for that to tuck it anyway
// hides this entirely.
const SIZES = [];
for (const h of [420, 460, 560, 700]) {
  for (const w of [645, 660, 680, 700, 720, 760, 820, 900, 1000, 1200]) SIZES.push([w, h]);
}
const rows = [];
for (const [w, h] of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  // Settled? Sample twice and compare, to catch a panel flipping in and out.
  const a = await ev(PROBE);
  await sleep(600);
  const b = await ev(PROBE);
  rows.push({ w, h, ...a, stable: a.fields === b.fields });
}
let bad = 0;
for (const r of rows) {
  // 1px of tolerance: a fractional clamp() result rounds either way.
  const clipped = r.worstSpill > 1;
  // A width where the panel is in on one sample and out on the next is the
  // tuck fighting its own reversal.
  const flapping = !r.stable;
  if (clipped || flapping) {
    bad++;
    console.log(`FAIL  ${r.w}x${r.h}  ${clipped ? `${r.worstSpill}px clipped off ${r.worstEl}` : 'panel flapping in and out'}`);
  }
}
console.log(bad === 0 ? `all ${rows.length} viewports pass` : `${bad} of ${rows.length} viewports fail`);
ws.close(); chrome.kill();
await sleep(200);
process.exit(bad === 0 ? 0 : 1);
