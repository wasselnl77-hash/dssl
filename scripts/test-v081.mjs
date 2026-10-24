/* test-v081.mjs; one assertion per fix in 0.8.1.
 * Source: the 2026-10-23 re-test of 0.8.0 (two bugs and one nit).
 *   1. fluid computed clamp(16px, calc(16px + 0.952vw), 24px): no intercept,
 *      so it was already 19.6px at a 375px phone and hit 24px near 840px.
 *   2. the guide's multi-line raw { } example came out as "undefined @font-face"
 *      and, with no semicolons, was not valid CSS.
 *   3. dssl build had no --strict, so CI could not fail on warnings.
 * The fluid tests do not compare strings. They evaluate the emitted clamp()
 * at real viewport widths, which is the thing that was wrong. */
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';
import { toCSS } from '../public/dssl/static.js';
import { VERSION } from '../public/dssl/index.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '; ' + extra : ''}`); }
};

const compileDoc = (src, file = 't.dssl') => {
  const { ast, errors } = parse(src, file);
  const doc = resolve(ast, file);
  return { doc, errors: [...errors, ...doc.errors], ast };
};
const declsOf = (doc, i = 0) => doc.rules[i]?.decls || [];
const val = (decls, prop) => decls.find(d => d.prop === prop)?.value;

/** evaluate `clamp(L, calc(I + Wvw), H)` at a viewport width, in px (rem = 16px) */
const evalClamp = (css, vw) => {
  const m = /^clamp\(\s*(-?[\d.]+)(px|rem|em),\s*calc\(\s*(-?[\d.]+)(px|rem|em)\s*\+\s*(-?[\d.]+)vw\s*\),\s*(-?[\d.]+)(px|rem|em)\s*\)$/.exec(css);
  if (!m) return NaN;
  const f = (u) => (u === 'px' ? 1 : 16);
  const lo = parseFloat(m[1]) * f(m[2]);
  const mid = parseFloat(m[3]) * f(m[4]) + parseFloat(m[5]) * vw / 100;
  const hi = parseFloat(m[6]) * f(m[7]);
  return Math.min(hi, Math.max(lo, mid));
};
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;
const fluidOf = (src) => val(declsOf(compileDoc(src).doc), 'font-size');

/* ---- 1: fluid math ---- */
{
  const c = fluidOf('.a { font-size: fluid 16 24 }');
  ok('1a. fluid 16 24 is exactly 16px at the 360px lower bound', near(evalClamp(c, 360), 16), `got ${evalClamp(c, 360)}`);
  ok('1b. fluid 16 24 is exactly 24px at the 1200px upper bound', near(evalClamp(c, 1200), 24), `got ${evalClamp(c, 1200)}`);
  ok('1c. a 375px phone gets 16.14px, not the 19.57px 0.8.0 gave', near(evalClamp(c, 375), 16.143), `got ${evalClamp(c, 375)}`);
  ok('1d. the middle of the range is the middle of the sizes (780px = 20px)', near(evalClamp(c, 780), 20), `got ${evalClamp(c, 780)}`);
  ok('1e. an 800px laptop window gets 20.19px, not 23.6px', near(evalClamp(c, 800), 20.19), `got ${evalClamp(c, 800)}`);
  ok('1f. it is clamped below the lower bound and above the upper bound', near(evalClamp(c, 200), 16) && near(evalClamp(c, 2000), 24));

  const b = fluidOf('.a { font-size: fluid 16 24 400 800 }');
  ok('1g. custom bounds: 16px at 400, 24px at 800, 20px at 600', near(evalClamp(b, 400), 16) && near(evalClamp(b, 800), 24) && near(evalClamp(b, 600), 20));

  const shrink = fluidOf('.a { font-size: fluid 24 16 }');
  ok('1h. a shrinking size works: 24px at 360, 16px at 1200', near(evalClamp(shrink, 360), 24) && near(evalClamp(shrink, 1200), 16), shrink);
  ok('1i. a shrinking size keeps the lower value first in clamp()', /^clamp\(16px,/.test(shrink), shrink);

  const rem = fluidOf('.a { font-size: fluid 1rem 1.5rem }');
  ok('1j. rem sizes interpolate too: 16px at 360, 24px at 1200', near(evalClamp(rem, 360), 16) && near(evalClamp(rem, 1200), 24), rem);

  const legacy = fluidOf('.a { fluid: 16, 24 }');
  ok('1k. the old fluid: 16, 24 form gets the same fix', near(evalClamp(legacy, 375), 16.143), legacy);

  const gap = val(declsOf(compileDoc('.a { gap: fluid 8 16 }').doc), 'gap');
  ok('1l. gap takes fluid with the same math (8px at 360, 16px at 1200)', near(evalClamp(gap, 360), 8) && near(evalClamp(gap, 1200), 16));

  const pct = compileDoc('.a { width: fluid 50% 100% }');
  ok('1m. a percentage is refused with a clear message', pct.errors.some(e => /percentage/.test(e.message)));
  const mixed = compileDoc('.a { font-size: fluid 16px 2rem }');
  ok('1n. mixed units are refused', mixed.errors.some(e => /mixes units/.test(e.message)));
  const backwards = compileDoc('.a { font-size: fluid 16 24 1200 360 }');
  ok('1o. viewport bounds in the wrong order are refused', backwards.errors.some(e => /larger viewport second/.test(e.message)));
}

/* ---- 2: raw { } ---- */
{
  const guide = `raw {
  @font-face {
    font-family: Inter;
    src: url(/fonts/inter.woff2);
  }
}`;
  const g = compileDoc(guide);
  const css = g.doc.raws[0]?.css || '';
  ok('2a. multi-line raw has no "undefined" in front of it', !/undefined/.test(css), css.slice(0, 40));
  ok('2b. multi-line raw starts with the @font-face', /^@font-face\s*\{/.test(css), css.slice(0, 40));
  ok('2c. the guide example compiles with zero errors and zero warnings', g.errors.length === 0 && g.doc.warnings.length === 0);
  ok('2d. the body is kept verbatim, semicolons included', /font-family: Inter;/.test(css) && /src: url\(\/fonts\/inter\.woff2\);/.test(css));

  const sameLine = compileDoc('raw { @font-face {\n  font-family: X;\n  src: local(Arial);\n} }');
  ok('2e. content on the same line as "raw {" is not dropped', /^@font-face/.test(sameLine.doc.raws[0]?.css || ''), sameLine.doc.raws[0]?.css);
  ok('2f. a raw block that closes on the same line as its last rule still works', sameLine.doc.raws.length === 1 && sameLine.errors.length === 0);

  const old = compileDoc(`raw {
  @font-face {
    font-family: Inter
    src: url(/fonts/inter.woff2)
  }
}`);
  const w = old.doc.warnings.filter(x => /needs a ";"/.test(x.message));
  ok('2g. the old no-semicolon style warns on each bare declaration', w.length === 2, JSON.stringify(old.doc.warnings.map(x => x.message)));
  ok('2h. the warning points at the right source line', w.length === 2 && w[0].line === 3 && w[1].line === 4, w.map(x => x.line).join(','));
  ok('2i. the warning explains why', w.length > 0 && /semicolons are required inside raw/.test(w[0].hint));

  const one = compileDoc('raw { @font-face { font-family: X; src: local(Arial) } }');
  ok('2j. single-line raw has no warning (the declarations sit inside braces on one line)', one.doc.warnings.length === 0 && one.errors.length === 0);
  const sel = compileDoc('raw {\n  a:hover,\n  a:focus { color: red; }\n  .grid { grid-template-areas: "a b"\n    "c d"; }\n}');
  ok('2k. selectors with colons and multi-line values are not flagged', sel.doc.warnings.length === 0, JSON.stringify(sel.doc.warnings.map(x => x.message)));
  const cmt = compileDoc('raw {\n  /* color: red */\n  .a { color: blue; }\n}');
  ok('2l. a declaration inside a comment is not flagged', cmt.doc.warnings.length === 0);

  const built = toCSS(g.doc, { file: 't.dssl', banner: false });
  ok('2m. the built CSS carries the raw block clean and valid', !/undefined/.test(built.css) && /font-family: Inter;/.test(built.css));
}

/* ---- 3: dssl build --strict (CLI) ---- */
{
  const here = dirname(fileURLToPath(import.meta.url));
  const cli = join(here, '..', 'cli', 'dssl.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'dssl-v081-'));
  const warnFile = join(dir, 'warn.dssl');
  const cleanFile = join(dir, 'clean.dssl');
  writeFileSync(warnFile, '.a { row: center center }\n');
  writeFileSync(cleanFile, '.a { color: red }\n');
  const run = (args) => {
    try { return { code: 0, out: execFileSync('node', [cli, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
  };
  const plain = run(['build', warnFile, '-o', join(dir, 'a.css')]);
  ok('3a. build with a warning still exits 0 without --strict', plain.code === 0);
  const strict = run(['build', warnFile, '-o', join(dir, 'b.css'), '--strict']);
  ok('3b. build --strict exits 1 on a warning', strict.code === 1);
  const clean = run(['build', cleanFile, '-o', join(dir, 'c.css'), '--strict']);
  ok('3c. build --strict exits 0 when there is nothing to warn about', clean.code === 0);
  const js = JSON.parse(run(['build', warnFile, '--json', '--strict']).out);
  ok('3d. build --json --strict reports ok:false', js.ok === false && js.warnings.length === 1);
  const jn = JSON.parse(run(['build', warnFile, '--json']).out);
  ok('3e. build --json without --strict still reports ok:true', jn.ok === true);
  const v = run(['--version']);
  ok('3f. the CLI reports the engine version', v.out.trim() === VERSION);
  rmSync(dir, { recursive: true, force: true });
}


/* ---- 4: the packaged CLI (dssl-engine.zip layout: cli/ next to dssl/) ---- */
{
  const here = dirname(fileURLToPath(import.meta.url));
  const root = join(here, '..');
  const dir = mkdtempSync(join(tmpdir(), 'dssl-pkg-'));
  mkdirSync(join(dir, 'cli')); mkdirSync(join(dir, 'dssl'));
  copyFileSync(join(root, 'cli', 'dssl.mjs'), join(dir, 'cli', 'dssl.mjs'));
  // the package ships every engine module; a hardcoded list here is how the 0.8.0 package broke
  for (const f of readdirSync(join(root, 'public', 'dssl'))) if (f.endsWith('.js')) copyFileSync(join(root, 'public', 'dssl', f), join(dir, 'dssl', f));
  const src = join(dir, 'a.dssl');
  writeFileSync(src, 'h1 { font-size: fluid 16 24 }\n');
  const run = (args) => {
    try { return { code: 0, out: execFileSync('node', [join(dir, 'cli', 'dssl.mjs'), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; }
  };
  const v = run(['--version']);
  ok('4a. the packaged CLI starts (0.8.0 crashed with module not found)', v.code === 0 && v.out.trim() === VERSION, v.out.slice(0, 120));
  const b = run(['build', src, '-o', join(dir, 'a.css'), '--no-banner']);
  ok('4b. the packaged CLI builds a stylesheet', b.code === 0, b.out.slice(0, 120));
  const css = b.code === 0 ? execFileSync('cat', [join(dir, 'a.css')], { encoding: 'utf8' }) : '';
  ok('4c. and the output has the corrected fluid math', /calc\(12\.571px \+ 0\.952vw\)/.test(css), css.slice(0, 160));
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
