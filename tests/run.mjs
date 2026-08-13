// Runs every *.test.mjs in this directory against a real headless Chrome.
//
//   pnpm test:ui              build, serve, run all of them
//   pnpm test:ui keys signed  just those two
//   CHROME=/path/to/chrome pnpm test:ui
//
// Each suite drives the app the way a person does — real key events, real
// clicks, real layout measurements through the DevTools protocol — and
// prints one verdict line saying how many of its checks held. This reads
// those lines back and fails on the first suite that reports a shortfall.
//
// They share one server on 5199 and each takes its own debugging port, so
// they could run in parallel; they don't, because sixteen headless Chromes
// on one machine measure a slower page than one does, and half of what is
// asserted here is a measurement.
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const root = join(here, '..');
const PORT = 5199;
const only = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const serving = async () => {
  try {
    return (await fetch(`http://localhost:${PORT}/`)).ok;
  } catch {
    return false;
  }
};

// A server already on the port is used as it is: that's the dev server
// somebody has open, and running against it is the whole point of being
// able to run one suite while working on the thing it covers.
let server = null;
if (await serving()) {
  console.log(`using the server already on ${PORT}`);
} else {
  console.log('building');
  const build = spawnSync('node', [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--logLevel', 'warn'], { cwd: root, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
  server = spawn('node', [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 100 && !(await serving()); i++) await sleep(200);
  if (!(await serving())) {
    server.kill();
    console.error(`nothing came up on ${PORT}`);
    process.exit(1);
  }
  console.log(`serving the build on ${PORT}`);
}

const suites = readdirSync(here)
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !only.length || only.some((name) => f.startsWith(name)));

// "18/18 passed", "all widths pass", "all 22 viewports pass" — and the
// shapes of the same lines that mean it didn't.
const VERDICT = /(\d+)\/(\d+) passed|all (?:\d+ )?(?:widths|viewports) pass|(\d+) (?:failing widths|of \d+ viewports fail)/;

let failed = 0;
let port = 9600;
for (const suite of suites) {
  const label = suite.replace('.test.mjs', '');
  const res = spawnSync('node', [join(here, suite), String(port++)], { cwd: here, encoding: 'utf8', timeout: 900000 });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  const line = out.split('\n').reverse().find((l) => VERDICT.test(l))?.trim();
  const m = line?.match(VERDICT);
  const ok = res.status === 0 && m && !m[4] && (!m[1] || m[1] === m[2]);
  if (!ok) {
    failed++;
    console.log(`FAIL  ${label.padEnd(12)} ${line ?? 'no verdict — see below'}`);
    // Only the failing suite's own output, since that is the one anybody
    // is about to read.
    console.log(out.split('\n').filter((l) => /FAIL|fail|error/i.test(l)).slice(0, 20).join('\n'));
  } else {
    console.log(`ok    ${label.padEnd(12)} ${line}`);
  }
}

server?.kill();
console.log(failed ? `\n${failed} of ${suites.length} suites failed` : `\nall ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
