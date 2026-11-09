#!/usr/bin/env node
/* test-native-spec.mjs: keep native/spec honest.
 *
 *   1. every ```dssl block in the spec compiles with no errors, and every ```dssl error block has at least one
 *   2. the numbers and strings the prose promises are what the engine produces
 *   3. the divergences of chapter 12 stay fixed
 *   4. the generated appendices and data file are up to date
 *
 * Exit code is 0 only when every check passed. */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const specDir = join(root, 'native/spec');

let pass = 0, fail = 0;
const ok = (name) => { pass++; };
const bad = (name, why) => { fail++; console.error('FAIL ' + name + (why ? '\n     ' + why : '')); };

function run(src, file = 'spec.dssl') {
  const p = parse(src, file);
  const d = resolve(p.ast, file, { ...DEFAULT_TOKENS });
  return { doc: d, errors: [...p.errors, ...d.errors], warnings: d.warnings || [] };
}
const rule = (doc, sel) => doc.rules.find((r) => r.sel === sel);
const val = (doc, sel, prop) => { const r = rule(doc, sel); const d = r && r.decls.find((x) => x.prop === prop); return d ? d.value : undefined; };

/* 1. fenced examples */
const chapters = readdirSync(specDir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
let blocks = 0;
for (const f of chapters) {
  const text = readFileSync(join(specDir, f), 'utf8');
  let i = 0;
  for (const m of text.matchAll(/```dssl( error)?\n([\s\S]*?)```/g)) {
    i++; blocks++;
    const expectError = !!m[1];
    const { errors } = run(m[2], `${f} block ${i}`);
    if (expectError && errors.length) ok();
    else if (expectError) bad(`${f} block ${i}`, 'is marked "error" but compiled cleanly');
    else if (errors.length) bad(`${f} block ${i}`, errors.map((e) => `line ${e.line}: ${e.message}`).join('; '));
    else ok();
  }
}
if (blocks < 20) bad('spec examples', `only ${blocks} fenced blocks found, expected the chapters to carry many more`);

/* 2. promises made in the prose */
const eq = (name, got, want) => (JSON.stringify(got) === JSON.stringify(want) ? ok() : bad(name, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`));

{ // 3.2 numbers
  const { doc } = run('.a { padding: 0; margin: 0 auto; opacity: 0.5; line-height: 1.5; transition-delay: 200 }');
  eq('VAL-3 padding', val(doc, '.a', 'padding'), '0px');
  eq('VAL-3 margin', val(doc, '.a', 'margin'), '0px auto');
  eq('VAL-3 opacity', val(doc, '.a', 'opacity'), '0.5');
  eq('VAL-3 line-height', val(doc, '.a', 'line-height'), '1.5');
  eq('3.2 time prop', val(doc, '.a', 'transition-delay'), '200ms');
}
{ // 3.3 functions
  const { doc } = run('.a { width: calc(100% - 24); background: oklch(62% 0.19 35); grid-template-columns: repeat(4, 1fr); transform: scale(1.2) }');
  eq('VAL-7 calc', val(doc, '.a', 'width'), 'calc(100% - 24px)');
  eq('VAL-7 oklch', val(doc, '.a', 'background'), 'oklch(62% 0.19 35)');
  eq('VAL-6 repeat', val(doc, '.a', 'grid-template-columns'), 'repeat(4, 1fr)');
  eq('VAL-7 scale', val(doc, '.a', 'transform'), 'scale(1.2)');
}
{ // 3.4 alpha
  const { doc } = run('tokens { color { x: #123456 } }\n.a { color: color.x/50; background: #ff0000/50; border-color: white/12 }');
  eq('VAL-8 token alpha', val(doc, '.a', 'color'), 'color-mix(in oklab, var(--dssl-color-x) 50%, transparent)');
  eq('VAL-8 hex alpha', val(doc, '.a', 'background'), 'color-mix(in oklab, #ff0000 50%, transparent)');
  eq('VAL-8 named alpha', val(doc, '.a', 'border-color'), 'color-mix(in oklab, white 12%, transparent)');
}
{ // 3.7 fluid
  const { doc } = run('h1 { font-size: fluid 16 24 }');
  eq('VAL-13 fluid', val(doc, 'h1', 'font-size'), 'clamp(16px, calc(12.571px + 0.952vw), 24px)');
}
{ // 5.2 layers
  const { doc } = run('.a { color: red }\npin { .a { color: blue } }\n@layer base { .a { color: green } }');
  eq('CAS-2/5 layer ranks', doc.rules.filter((r) => r.sel === '.a').map((r) => [r.layer, val(doc.rules.length ? { rules: [r] } : doc, '.a', 'color')]), [['components', 'red'], ['pin', 'blue'], ['base', 'green']]);
}
{ // 5.4 fragments
  const { doc } = run('.a {\n color: red\n hover { color: blue }\n padding: 4\n}');
  eq('CAS-12 fragments', doc.rules.filter((r) => r.sel.startsWith('.a')).map((r) => [r.sel, r.decls[0].prop]), [['.a', 'color'], ['.a:hover', 'color'], ['.a', 'padding']]);
  const orders = doc.rules.filter((r) => r.sel.startsWith('.a')).map((r) => r.order);
  eq('CAS-11 orders 1,2,3', orders, [1, 2, 3]);
  eq('TOK-9 registry order 0', doc.registryRule.order, 0);
}
{ // 5.5 media
  const { doc } = run('.a { @media 768 { padding: 24 } @media <= 480 { padding: 12 } @media 480..960 { gap: 4 } @media dark { gap: 1 } }');
  eq('CAS-19 media', doc.rules.filter((r) => r.sel === '.a').map((r) => r.media), [['(min-width: 768px)'], ['(max-width: 480px)'], ['(min-width: 480px) and (max-width: 960px)'], ['(prefers-color-scheme: dark)']]);
}
{ // 5.9 signals
  const { doc } = run('.a { @signal theme == dark { color: red } @signal screen in (a, b) { color: blue } @signal on { color: green } }');
  eq('CAS-37 signals', doc.rules.filter((r) => r.sel === '.a').map((r) => r.signals[0]), [
    { name: 'theme', op: '==', value: 'dark' }, { name: 'screen', op: 'in', value: 'a,b', values: ['a', 'b'] }, { name: 'on', op: 'truthy', value: null }]);
}
{ // 6.3 row
  const { doc } = run('.toolbar { row: gap 8 between center }');
  eq('PRP-8 row', rule(doc, '.toolbar').decls.map((d) => d.prop + ':' + d.value), ['display:flex', 'flex-direction:row', 'gap:8px', 'justify-content:space-between', 'align-items:center']);
}
{ // 4.3 conditional tokens
  const { doc } = run('tokens { color { bg: white } }\n@media dark { tokens { color { bg: black } } }\n.a { background: color.bg }');
  const toks = doc.rules.filter((r) => r.layer === 'tokens');
  eq('TOK-8 two token rules', toks.map((r) => [r.media, r.decls[0].value]), [[[], 'white'], [['(prefers-color-scheme: dark)'], 'black']]);
  eq('TOK-9 registry carries the last definition', doc.registryRule.decls.find((d) => d.prop === '--dssl-color-bg').value, 'black');
}
{ // 3.8, 6.1
  const { errors } = run('.a { color: red !important }');
  eq('VAL-15 important', errors.length === 1 && /^!important does not exist in DSSL/.test(errors[0].message), true);
}

/* 3. the divergences of chapter 12 stay fixed (0.16.3). D-6 is open and needs a browser test, so it is not checked here. */
{ // D-1, SYN-6
  const { errors, doc } = run('.a { background: url(http://x.com/a.png) }');
  eq('D-1 unquoted url keeps its //', [errors.length, val(doc, '.a', 'background')], [0, 'url(http://x.com/a.png)']);
}
{ // D-2, TOK-12
  const { errors } = run('tokens { color { ink2: #111 } }\n.a { color: color.ink2.bogus }');
  eq('D-2 a typo in a token path is an error', errors.some((e) => /unknown value "color.ink2.bogus"/.test(e.message)), true);
}
{ // D-3, CAS-2
  const { errors, warnings } = run('@layer weird { .a { color: red } }');
  eq('D-3 unknown layer warns', [errors.length, warnings.some((w) => /^unknown layer "weird", treated as "components"/.test(w.message))], [0, true]);
}
{ // D-4, TOK-18
  const { doc, errors, warnings } = run('.a { radius: xl }');
  eq('D-4 radius xl warns, same output', [errors.length, warnings.some((w) => /^radius "xl" is not defined/.test(w.message)), val(doc, '.a', 'border-radius')], [0, true, 'var(--dssl-radius-xl)']);
}
{ // D-5, VAL string rule
  const { errors } = run('.a { content: "a\\"b" }');
  eq('D-5 an escaped quote stays inside the string', errors.length, 0);
}
{ // D-7, CAS-7, CAS-24
  const sels = (src, hit) => run(src).doc.rules.filter((r) => hit.test(r.sel)).map((r) => r.sel);
  eq('D-7 parent list', sels('.a, .b { .c { color: red } }', /\.c/), ['.a .c, .b .c']);
  eq('D-7 state on a list', sels('.a, .b { hover { color: red } }', /hover/), ['.a:hover, .b:hover']);
  eq('D-7 child list', sels('.a { .c, .d { color: red } }', /\.c/), ['.a .c, .a .d']);
}
{ // D-8, CAS-8
  const { warnings } = run('.menu { li { color: red } hove { color: red } }');
  eq('D-8 li is quiet, hove still warns', [warnings.some((w) => /"li" compiled/.test(w.message)), warnings.some((w) => /"hove" compiled/.test(w.message))], [false, true]);
}

/* 4. generated files */
{
  const r = spawnSync(process.execPath, ['--no-warnings', join(root, 'scripts/gen-native-vocab.mjs'), '--check'], { encoding: 'utf8' });
  if (r.status === 0) ok(); else bad('generated vocabulary files are up to date', (r.stderr || r.stdout || '').trim());
}

console.log(`${blocks} spec examples checked`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
