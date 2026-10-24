/* test-v073.mjs - one assertion per fix in the 0.8.0 "the exit drop".
 * Source: the 2026-10-23 Claude review (5 bugs) + wishlist items 1/3/4/6/8.
 * Every claim was reproduced first (scripts/repro-v073.mjs), these assert the
 * fixes and the new features against the real compiler. */
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';
import { toCSS } from '../public/dssl/static.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VERSION } from '../public/dssl/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' - ' + extra : ''}`); }
};

const compileDoc = (src, file = 't.dssl') => {
  const { ast, errors } = parse(src, file);
  const doc = resolve(ast, file);
  return { doc, errors: [...errors, ...doc.errors] };
};
const declsOf = (doc, i = 0) => doc.rules[i]?.decls || [];
const count = (decls, prop) => decls.filter(d => d.prop === prop).length;
const val = (decls, prop) => decls.find(d => d.prop === prop)?.value;
const lastVal = (decls, prop) => decls.filter(d => d.prop === prop).pop()?.value;

/* ---- bug 1: row/column axis roles ---- */
{
  const { doc, errors } = compileDoc('toolbar { row: gap 8 between center }');
  const d = declsOf(doc);
  ok('1a. between center: justify-content is space-between, written once', count(d, 'justify-content') === 1 && val(d, 'justify-content') === 'space-between');
  ok('1b. between center: align-items is center', val(d, 'align-items') === 'center');
  ok('1c. between center: zero errors', errors.length === 0);
  const w = compileDoc('toolbar { row: gap 8 center between }');
  ok('1d. center between: warns about the justify-content override', w.doc.warnings.some(x => /overrides "center"/.test(x.message)));
  ok('1e. center between: space-between still wins (later word, cascade takes last)', lastVal(declsOf(w.doc), 'justify-content') === 'space-between');
  const dupe = compileDoc('toolbar { row: center center }');
  ok('1f. center center: duplicate-word warning', dupe.doc.warnings.some(x => /written twice/.test(x.message)));
  const nowhere = compileDoc('toolbar { row: start end }');
  ok('1g. start end: "end" has nowhere to go, loudly', nowhere.doc.warnings.some(x => /nowhere to go/.test(x.message)));
  const stretch = compileDoc('toolbar { row: gap 8 stretch }');
  ok('1h. row: stretch sets align-items only (no justify-content filler)', count(declsOf(stretch.doc), 'align-items') === 1 && count(declsOf(stretch.doc), 'justify-content') === 0);
  const stack = compileDoc('.wrap { stack: center }');
  ok('1i. stack: center unchanged (place-items center center)', val(declsOf(stack.doc), 'place-items') === 'center center');
  const col = compileDoc('.list { column: gap 2 evenly stretch }');
  const cd = declsOf(col.doc);
  ok('1j. column evenly stretch: main space-evenly + cross stretch', val(cd, 'justify-content') === 'space-evenly' && val(cd, 'align-items') === 'stretch');
}

/* ---- bug 2: @font-face must not throw ---- */
{
  let threw = null, doc = null, errors = [];
  try {
    const r = compileDoc('@font-face { font-family: X; src: url(x.woff2) }');
    doc = r.doc; errors = r.errors;
  } catch (e) { threw = e; }
  ok('2a. @font-face does not throw', !threw, threw && threw.message);
  ok('2b. @font-face reports exactly one clean error', errors.length === 1 && /@font-face/.test(errors[0].message));
  ok('2c. @font-face inner decls leak nowhere', !doc.rules.some(r => r.decls?.some(d => d.prop === 'src' || d.prop === 'font-family')));
}

/* ---- bug 3: unknown at-rules skip their whole block ---- */
{
  const { doc, errors } = compileDoc('@supports (display:grid) { .a { display: grid } }\n.b { color: blue }');
  ok('3a. @supports inner rule does NOT apply unconditionally', !doc.rules.some(r => r.sel === 'a' || r.sel === '.a'));
  ok('3b. one clean error for @supports (no stray unexpected })', errors.length === 1 && /@supports/.test(errors[0].message));
  ok('3c. the rule after the block still parses', doc.rules.some(r => (r.sel || '').includes('b')));
  ok('3d. the hint points at raw { }', /raw \{ \}/.test(errors[0].hint || ''));
  const unclosed = compileDoc('@font-face { font-family: X');
  ok('3e. unclosed unknown block says so instead of eating the file', unclosed.errors.some(e => /never closed/.test(e.message)));
}

/* ---- bug 4: url() is atomic ---- */
{
  const { doc, errors } = compileDoc('.a { background: url(a.png) no-repeat }');
  ok('4a. unquoted url() + no-repeat: zero errors', errors.length === 0);
  ok('4b. value passes through untouched', val(declsOf(doc), 'background') === 'url(a.png) no-repeat');
  const q = compileDoc('.a { background: url("a.png") no-repeat center / cover }');
  ok('4c. quoted url + position/size also clean', q.errors.length === 0 && /url\("a\.png"\) no-repeat center \/ cover/.test(val(declsOf(q.doc), 'background')));
  const s = compileDoc('.a { background-image: url(img/hero.png), linear-gradient(90, red -> blue) }');
  ok('4d. unquoted url inside a list with a gradient: clean', s.errors.length === 0);
}

/* ---- bug 5a: animation gets motion guidance, not "span" ---- */
{
  const defined = compileDoc('motion spin { from { opacity: 0 } to { opacity: 1 } }\n.a { animation: spin 1s infinite }');
  ok('5a-1. animation with a defined motion: silent', defined.errors.length === 0 && defined.doc.warnings.length === 0);
  const missing = compileDoc('.a { animation: ghost 1s infinite }');
  ok('5a-2. animation with an undefined motion: warning names the DSSL way', missing.doc.warnings.some(w => /motion/.test(w.message) && /animate/.test(w.hint || '')));
  ok('5a-3. no "span" suggestion anywhere', !JSON.stringify(missing.errors).includes('span'));
  ok('5a-4. bare duration becomes ms, not px', /400ms/.test((() => { const r = compileDoc('.a { animation: ghost 400 }'); return val(declsOf(r.doc), 'animation'); })()));
  const animateHint = compileDoc('.a { animate: spin 400 }');
  ok('5a-5. unknown motion hint teaches the motion block', /motion spin \{/.test(animateHint.errors[0].hint || ''));
}

/* ---- bug 5b: !important is loud and NOT emitted ---- */
{
  const { doc, errors } = compileDoc('.a { color: red !important }');
  ok('5b-1. !important errors', errors.length === 1 && /!important does not exist/.test(errors[0].message));
  ok('5b-2. the error names pin { } as the answer', /pin \{ \}/.test(errors[0].hint || ''));
  ok('5b-3. nothing is emitted', declsOf(doc).length === 0);
  const quoted = compileDoc('.a { content: "!important" }');
  ok('5b-4. quoted "!important" is just text, no false trip', quoted.errors.length === 0 && val(declsOf(quoted.doc), 'content') === '"!important"');
}

/* ---- bug 5c: CSS transition form teaches the DSSL form ---- */
{
  const { errors } = compileDoc('.a { transition: color .2s ease }');
  ok('5c-1. CSS transition form errors (not silently dropped)', errors.length === 1);
  ok('5c-2. the hint shows the exact conversion', /transition: 200 ease color/.test(errors[0].hint || ''));
  const dssl = compileDoc('.a { transition: 200 ease color }');
  ok('5c-3. the DSSL form still compiles clean', dssl.errors.length === 0 && val(declsOf(dssl.doc), 'transition') === 'color 200ms ease');
}

/* ---- feature: raw { } / @css { } verbatim passthrough ---- */
{
  const one = compileDoc('raw { @font-face { font-family: X; src: url(x.woff2) } }');
  ok('6a. raw { } captured verbatim', one.doc.raws.length === 1 && one.doc.raws[0].css.includes('@font-face') && one.doc.raws[0].css.includes('url(x.woff2)'));
  const alias = compileDoc('@css { @keyframes x { from { opacity: 0 } } }');
  ok('6b. @css alias works', alias.doc.raws.length === 1 && alias.doc.raws[0].css.includes('@keyframes x'));
  const multi = compileDoc('raw {\n  @supports (display: grid) {\n    .a { display: grid }\n  }\n}\n.b { color: red }');
  ok('6c. multi-line raw captured whole, parsing resumes after', multi.doc.raws.length === 1 && multi.doc.raws[0].css.includes('@supports') && multi.doc.rules.some(r => (r.sel || '').includes('b')));
  const nested = compileDoc('.card { raw { a } }');
  ok('6d. nested raw is a loud error', nested.errors.some(e => /raw \{ \} must be top-level/.test(e.message)));
  const unclosed = compileDoc('raw { @font-face {');
  ok('6e. unclosed raw is a loud error', unclosed.errors.some(e => /raw \{ \} block was never closed/.test(e.message)));
}

/* ---- feature: fluid sugar ---- */
{
  const inline = compileDoc('.a { font-size: fluid 16 24 }');
  ok('7a. font-size: fluid 16 24 → clamp', val(declsOf(inline.doc), 'font-size') === 'clamp(16px, calc(12.571px + 0.952vw), 24px)');
  const bounds = compileDoc('.a { font-size: fluid 16 24 400 800 }');
  ok('7b. custom viewport bounds change the slope', val(declsOf(bounds.doc), 'font-size') === 'clamp(16px, calc(8px + 2vw), 24px)');
  const gap = compileDoc('.a { gap: fluid 8 16 }');
  ok('7c. gap takes inline fluid too', val(declsOf(gap.doc), 'gap') === 'clamp(8px, calc(4.571px + 0.952vw), 16px)');
  const legacy = compileDoc('.a { fluid: 16, 24 }');
  ok('7d. the fluid: 16, 24 form still works', val(declsOf(legacy.doc), 'font-size') === 'clamp(16px, calc(12.571px + 0.952vw), 24px)');
}

/* ---- feature: toCSS - the exit lane ---- */
{
  const src = `tokens { color { ink: #16161d } }
@layer utilities { .toolbar { row: gap 8 between center } }
.card {
  background: color.card
  hover { background: #f5f0e8 }
  seen { opacity: 1 }
  display: grid
  animate: rise 400
  ::before { content: "→" }
}
pin { .legal { color: red } }
@media dark { .card { background: #111 } }
@signal theme == dark { .card { background: #000 } }
motion rise { from { opacity: 0 } to { opacity: 1 } }
raw { @font-face { font-family: X; src: url(x.woff2) } }`;
  const { ast, errors } = parse(src, 'build.dssl');
  const doc = resolve(ast, 'build.dssl');
  const built = toCSS(doc, { file: 'build.dssl', banner: false });
  const css = built.css;
  ok('8a. @layer statement declares the engine order', css.includes('@layer tokens, base, components, utilities, pin;'));
  ok('8b. tokens become :root custom properties', css.includes('--dssl-color-ink: #16161d'));
  ok('8c. nested hover becomes .card:hover', /\.card:hover\s*\{[^}]*#f5f0e8/.test(css));
  ok('8d. seen applies unconditionally in the build', /\.card\s*\{[^}]*opacity: 1/.test(css) && !/\.card:seen/.test(css));
  ok('8e. ::before is native CSS in the build', /\.card::before\s*\{[^}]*content: "→"/.test(css));
  ok('8f. pin becomes !important', /\.legal\s*\{[^}]*color: red !important/.test(css));
  ok('8g. @media dark wraps the rule', css.includes('@media (prefers-color-scheme: dark)'));
  ok('8h. motion becomes @keyframes rise', css.includes('@keyframes rise'));
  ok('8i. raw { } lands verbatim', css.includes('@font-face { font-family: X; src: url(x.woff2) }'));
  ok('8i-2. animate-only decls are dropped, static ones kept', /\.card\s*\{[^}]*display: grid/.test(css) && !css.includes('@animate'));
  ok('8j. @signal rules are skipped and counted', built.report.skippedSignals === 1 && !css.includes('theme == dark'));
  ok('8k. report counts what shipped', built.report.rules >= 5 && built.report.keyframes === 1 && built.report.raws === 1 && built.report.seenStripped === 1);
}

/* ---- feature: the CLI ---- */
{
  const dir = mkdtempSync(join(tmpdir(), 'dssl-cli-'));
  const cleanFile = join(dir, 'clean.dssl');
  const badFile = join(dir, 'bad.dssl');
  const warnFile = join(dir, 'warn.dssl');
  writeFileSync(cleanFile, '.a { color: red\n  hover { color: blue } }\n');
  writeFileSync(badFile, '.a { color: red !important }\n');
  writeFileSync(warnFile, '.a { animation: ghost 400 }\n');
  const cli = join(import.meta.dirname, '..', 'cli', 'dssl.mjs');
  const run = (args) => {
    try { return { out: execFileSync('node', [cli, ...args], { encoding: 'utf8' }), code: 0 }; }
    catch (e) { return { out: (e.stdout || '') + (e.stderr || ''), code: e.status }; }
  };
  const c0 = run(['check', cleanFile]);
  ok('9a. check clean file exits 0', c0.code === 0);
  const c1 = run(['check', badFile]);
  ok('9b. check file with errors exits 1', c1.code === 1 && /!important/.test(c1.out));
  const cj = JSON.parse(run(['check', badFile, '--json']).out);
  ok('9c. check --json is machine-readable', cj.files[0].ok === false && cj.files[0].errors[0].line === 1);
  const cs = run(['check', warnFile, '--strict']);
  ok('9d. check --strict makes warnings fatal', cs.code === 1);
  const cw = run(['check', warnFile]);
  ok('9e. check without --strict: warnings are not fatal', cw.code === 0);
  const cssOut = join(dir, 'out.css');
  const b = run(['build', cleanFile, '-o', cssOut]);
  ok('9f. build writes a .css file and reports', b.code === 0 && /\.css/.test(b.out));
  const built = readFileSync(cssOut, 'utf8');
  ok('9g. built CSS contains the hover rule', /\.a:hover\s*\{[^}]*blue/.test(built));
  const bj = JSON.parse(run(['build', cleanFile, '--json']).out);
  ok('9h. build --json carries css + report', typeof bj.css === 'string' && bj.report.rules >= 1);
  const missing = run(['check', join(dir, 'nope.dssl')]);
  ok('9i. missing file exits 2', missing.code === 2);
  const v = run(['--version']);
  ok('9j. --version prints the engine version', v.out.trim() === VERSION);
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
