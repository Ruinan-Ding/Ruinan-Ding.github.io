// Every viewport this app is expected to hold, swept: the sub-sm range
// where the countdown, its controls and the status line share one column,
// and the sm+ sizes as a regression guard. Nothing may overflow its row,
// clip, or scroll the page in either direction.
//   node layout.test.mjs [port] [collapsed] [sidebarHidden] [fieldsHidden]
import { spawnSync } from 'node:child_process';

const port = Number(process.argv[2] ?? 9336);
const collapsed = (process.argv[3] ?? 'true') === 'true';
const sidebar = process.argv[4] ?? 'true';
const fields = process.argv[5] ?? 'true';

const expr = `(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom)]; };
  const row = [...document.querySelectorAll('div')].find((e) => e.className.includes && e.className.includes('sm:flex-row') && e.className.includes('flex-1'));
  const col = [...row.children].find((e) => !e.className.includes('hidden'));
  const inner = col.querySelector(':scope > div:last-child');
  const dig = inner.children[0], ctrls = inner.children[1], stat = inner.children[2];
  const line = [...dig.querySelectorAll(':scope > div')].find((e) => e.className.includes('items-baseline'));
  const clone = line.cloneNode(true);
  clone.innerHTML = '<span style="font-size:0.5em;margin-right:0.3em">-99</span><span class="flex items-baseline"><span>59</span><span>:</span><span>58</span></span><span style="font-size:0.5em">\\u00b700</span>';
  const host = document.createElement('div');
  host.className = dig.className; host.style.cssText = dig.style.cssText;
  host.style.position = 'absolute'; host.style.left = '-9999px'; host.style.top = '0'; host.style.width = 'max-content';
  // pinned to the real, resolved size: the digit font-size is a cqi clamp,
  // and outside its container cqi falls back to the viewport, which measured
  // a readout about twice the size of the one on the screen.
  host.style.fontSize = getComputedStyle(dig).fontSize;
  host.appendChild(clone); document.body.appendChild(host);
  const widest = Math.round(host.getBoundingClientRect().width); host.remove();
  const ib = r(inner), db = r(dig), sb = r(stat);
  const de = document.documentElement;
  const pad = 2 * parseFloat(getComputedStyle(row.parentElement).paddingLeft);
  return {
    fs: Math.round(parseFloat(getComputedStyle(dig).fontSize) * 10) / 10,
    rowH: r(row)[1] - r(row)[0], innerH: ib[1] - ib[0],
    gapTop: db[0] - ib[0], gapBot: ib[1] - sb[1],
    contentH: sb[1] - db[0],
    overflows: sb[1] - db[0] > ib[1] - ib[0] + 1,
    widest, widestFits: widest <= innerWidth - pad,
    widestSlack: Math.round(innerWidth - pad - widest),
    btnMinW: getComputedStyle(ctrls.querySelector('button')).minWidth,
    btnFs: getComputedStyle(ctrls.querySelector('button')).fontSize,
    tucked: !document.querySelector('textarea'),
    pageScrolls: de.scrollHeight > de.clientHeight + 1,
    rowClips: row.scrollHeight > row.clientHeight + 1,
    // proof the container attached and the max-sm variant emitted
    rowCT: getComputedStyle(row).containerType,
    colMt: getComputedStyle(col).marginTop,
    // real horizontal overflow, not just the digit block's own rect
    docScrollW: de.scrollWidth, fitsDoc: de.scrollWidth <= innerWidth,
    digInRow: Math.round(dig.getBoundingClientRect().left) >= Math.round(row.getBoundingClientRect().left) && Math.round(dig.getBoundingClientRect().right) <= Math.round(row.getBoundingClientRect().right),
  };
})()`;

const cfg = {
  url: 'http://localhost:5199/',
  port,
  storage: {
    timerSidebarHidden: sidebar,
    timerTimeFieldsHidden: fields,
    wordCounterCollapsed: String(collapsed),
    // Pinned to a MANUAL collapse. Left alone it carries over from
    // whichever earlier size in the sweep auto-collapsed, and an
    // auto-collapsed counter hides its arrow and is 8px shorter — which
    // reads as the timer row changing height for no reason.
    wordCounterCollapsedAt: 'null',
    wordCounterFullscreen: 'false',
  },
  sizes: process.env.BAND
    ? [[420, 340], [420, 380], [420, 420], [500, 320], [500, 340], [500, 360], [500, 380], [500, 400], [500, 420], [500, 440], [500, 480],
       [640, 360], [640, 400], [768, 380], [900, 380], [1280, 380], [1920, 400]]
    : [
    // sub-sm: the range the user is in
    [320, 740], [320, 400], [360, 640], [420, 800], [420, 600], [420, 460],
    [500, 900], [500, 700], [500, 560], [500, 460], [500, 380], [500, 300],
    [639, 900], [639, 620], [639, 400],
    // sm+ regression guard
    [640, 620], [768, 700], [1024, 768], [1280, 720], [1400, 760], [1484, 805], [1920, 1000],
  ],
  expr,
  // The word counter's auto-collapse fires after mount; measuring before it
  // settles compares an expanded run against a collapsed one and every
  // number looks like a regression.
  settle: 3000,
};

const res = spawnSync('node', ['cdp.mjs', JSON.stringify(cfg)], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 600000 });
process.stdout.write(res.stdout || '');
process.stderr.write(res.stderr || '');

const rows = (res.stdout || '').split('\n').filter((l) => l.startsWith('{')).map(JSON.parse);
// Six ways a size can be wrong, and they are all "something ended up
// where it can't be seen": the column overflowed, the row clipped it, the
// document scrolls sideways, the widest readout the digits can hold
// wouldn't fit the window, or the digits left the row entirely.
const bad = rows.filter((r) => r.error || r.overflows || r.rowClips || !r.fitsDoc || !r.widestFits || !r.digInRow);
for (const r of bad) console.log(`${r.w}x${r.h} FAIL ${JSON.stringify(r).slice(0, 200)}`);
if (!rows.length) console.log('\nno viewports measured');
else console.log(bad.length ? `\n${bad.length} of ${rows.length} viewports fail` : `\nall ${rows.length} viewports pass`);
