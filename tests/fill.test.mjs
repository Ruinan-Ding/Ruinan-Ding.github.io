// The control label with the hint gone. The button's height is spelled
// out so the box never moves, which means the room the two hint rows give
// up has exactly one thing that can use it: the word in the middle.
//
// Two asks, both by geometry:
//  1 the word never runs over the button's border, on either axis
//  2 with the hint hidden it is bigger than the button's own label size,
//    which is what "takes the freed space" means — it used to be solved
//    inside side padding that is only there to hold "Press TAB to" off
//    the borders, and with no hint drawn there is nothing to hold off.
//
// Swept on both axes: the size is min() of a width term and a height
// term, so a sweep along one of them only ever tests one of the two.
import { spawnSync } from 'node:child_process';

const expr = `(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.querySelector('span.control-hint'));
  if (!btns.length) return { err: 'no control buttons' };
  return {
    btns: btns.map((b) => {
      const lab = b.querySelector('span.flex-1');
      const hint = b.querySelector('.control-hint');
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const rng = document.createRange();
      rng.selectNodeContents(lab);
      const t = rng.getBoundingClientRect();
      // The glyph run, not the span: the span is stretched by flex and
      // says nothing about where the letters actually are.
      return {
        word: lab.textContent.trim(),
        shown: getComputedStyle(hint).display !== 'none',
        base: Math.round(parseFloat(cs.fontSize) * 10) / 10,
        fs: Math.round(parseFloat(getComputedStyle(lab).fontSize) * 10) / 10,
        // What the label is solved against: the border box less its two
        // 4px borders, and the height less the borders and the padding.
        innerW: Math.round(r.width - 8),
        availH: Math.round(r.height - 8 - parseFloat(cs.paddingTop) * 2),
        // 4px of border each side, inside the width by box-sizing.
        overL: Math.round(r.left + 4 - t.left),
        overR: Math.round(t.right - (r.right - 4)),
        overT: Math.round(r.top + 4 - t.top),
        overB: Math.round(t.bottom - (r.bottom - 4)),
      };
    }),
  };
})()`;

const cfg = {
  url: 'http://localhost:5199/',
  port: Number(process.argv[2] ?? 9640),
  storage: {
    // Restored running, which comes back paused, so the first button
    // reads RESUME. That is the six-letter word every size is solved
    // against and the only one that can overflow; an idle timer shows
    // START, RESET and STOP and never exercises it.
    timerAppState: JSON.stringify({ seconds: 600, isPaused: false, isRunning: true, hours: 0, minutes: 10, timerSeconds: 0 }),
    timerSilentMode: 'true', wordCounterFullscreen: 'false',
    wordCounterCollapsed: 'false', wordCounterCollapsedAt: 'null',
    timerSidebarHidden: 'false', timerTimeFieldsHidden: 'false',
  },
  // Both axes, and the short/narrow corner where the hint goes away.
  sizes: [],
  expr,
  settle: 2200,
};
for (const w of [1600, 1280, 1024, 900, 760, 640]) {
  for (const h of [1000, 820, 700, 600, 520]) cfg.sizes.push([w, h]);
}

const res = spawnSync('node', ['cdp.mjs', JSON.stringify(cfg)], { cwd: import.meta.dirname, encoding: 'utf8', timeout: 900000 });
const rows = (res.stdout || '').split('\n').filter((l) => l.startsWith('{')).map(JSON.parse);
let bad = 0;
let hidden = 0;
for (const r of rows) {
  if (r.err) { console.log(`${r.w}x${r.h}  ${r.err}`); bad++; continue; }
  // A 1px allowance for the sub-pixel rounding of a clamp() size.
  const fits = r.btns.every((b) => b.overL <= 1 && b.overR <= 1 && b.overT <= 1 && b.overB <= 1);
  const off = r.btns.filter((b) => !b.shown);
  hidden += off.length ? 1 : 0;
  // Solved against RESUME, six characters of a monospace that advances
  // 0.6em each, whichever word is on the button. Full means one of the two
  // axes is used up: the label is min() of a width term and a height term,
  // so exactly one of them binds and the other has room to spare.
  //
  // Not "bigger than the button's own label size", which was true before
  // this and after it: the side padding is only there to hold the hint off
  // the borders, and with the hint gone a label solved inside it left a
  // fifth of the button empty and still passed that test.
  const claims = off.every((b) => b.fs * 3.6 >= b.innerW - 5 || b.fs * 1.15 >= b.availH - 2);
  const ok = fits && claims;
  if (!ok) bad++;
  const b0 = r.btns[0];
  console.log(`${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} hint=${b0.shown ? 'shown ' : 'hidden'} base=${String(b0.base).padEnd(5)} label=${String(b0.fs).padEnd(5)} over=${[b0.overL, b0.overR, b0.overT, b0.overB].join('/')} fits=${String(fits).padEnd(5)} claims=${String(claims).padEnd(5)} ${ok ? '' : '<== FAIL'}`);
}
if (!hidden) { console.log('\nno viewport hid the hint — the second ask was never exercised'); bad++; }
if (!rows.some((r) => r.btns?.some((b) => b.word === 'RESUME'))) { console.log('the six-letter label never rendered — the widest case went untested'); bad++; }
console.log(bad ? `\n${bad} of ${rows.length} viewports fail` : `\nall ${rows.length} viewports pass`);
process.stderr.write(res.stderr || '');
process.exit(bad ? 1 : 0);
