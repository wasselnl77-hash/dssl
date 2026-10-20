/* =========================================================================
 * DSSL v0.7.0 — speed (gates + freeze), selectors, warnings, numeric keys
 * Run: node scripts/test-v070.mjs
 * ========================================================================= */

import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';
import { gateFor, gatePass } from '../public/dssl/engine.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + label); }
};

const compile = (src, file = 'test.dssl') => {
  const { ast, errors } = parse(src, file);
  const doc = resolve(ast, file, Object.fromEntries(new Map(Object.entries(DEFAULT_TOKENS))));
  return { ...doc, errors: [...errors, ...doc.errors] };
};

console.log('1 — numeric token keys');
{
  const doc = compile('tokens { space { 9: 96 } }\n.a { padding: space.9 }');
  ok(doc.errors.length === 0, 'numeric token key compiles clean: ' + JSON.stringify(doc.errors));
  ok(doc.tokens['space.9'] === '96', 'token space.9 stored');
  const reg = doc.registryRule && doc.registryRule.decls.find(d => d.prop === '--dssl-space-9');
  ok(reg && reg.value === '96px', 'registry emits --dssl-space-9: 96px, got ' + JSON.stringify(reg));
  const rule = doc.rules.find(r => r.sel === '.a');
  ok(rule && rule.decls.some(d => d.prop === 'padding' && d.value.includes('var(--dssl-space-9)')), 'space.9 reference resolves to the registry var');

  const doc2 = compile('tokens { color { 5: #ff0000 } }\n.b { color: color.5 }');
  ok(doc2.errors.length === 0, 'numeric color token key compiles');
  ok(doc2.tokens['color.5'] === '#ff0000', 'color.5 stored');

  const bad = compile('.card { 9: 96 }');
  ok(bad.errors.length === 1, 'numeric prop outside tokens errors');
  ok((bad.errors[0].hint || '').includes('tokens'), 'the error hint says where numbers ARE legal');

  const dec = compile('tokens { space { 12: 160 } }\n.c { margin: space.12 }');
  ok(dec.errors.length === 0 && dec.tokens['space.12'] === '160', 'multi-digit keys work');
}

console.log('2 — display ordering linter');
{
  const w = (src) => compile(src).warnings || [];
  const nav = w('.nav-links { display: none; column: gap space.2 }');
  ok(nav.length === 1, 'critic case warns exactly once, got ' + nav.length);
  ok(nav[0] && nav[0].message.includes('"column:"'), 'warning names the shorthand');
  ok(nav[0] && nav[0].message.includes('display: none'), 'warning names the dead line');
  ok(nav[0] && nav[0].line === 1, 'warning points at the shorthand line');

  ok(w('.nav-links { column: gap 2; display: none }').length === 0, 'explicit display after the shorthand is intentional — silent');
  ok(w('.nav-links { display: none } .nav-links.open { column: gap 2 }').length === 0, 'cross-rule overrides are the cascade — silent');
  ok(w('.x { display: flex; row: center }').length === 0, 'shorthand that agrees with the explicit display — silent');
  ok(w('.x { display: none; display: flex }').length === 0, 'explicit vs explicit is the documented model — silent');
  ok(w('.menu { display: none; column: gap 2 } .other { display: block; stack: center }').length === 2, 'grid:/stack: expansions warn too');
  ok(w('.x { column: gap 2; display: none }').length === 0, 'reverse order never warns (state-toggle pattern)');

  // warning does not block compilation and does not leak into errors
  const doc = compile('.a { display: none; column: gap 2 }');
  ok(doc.errors.length === 0, 'warnings are not errors — ok stays ok');
}

console.log('3 — structural selectors compile and ride native matching');
{
  const doc = compile(`
.card:nth-child(2) { color: red }
.b:not(.x) { color: blue }
.c:is(.d, .e) { color: green }
.f:where(.g) { color: teal }
.h:has(> img) { color: gold }
.list { .item:nth-child(odd) { color: pink } }
.a:not(.b, .c) { color: gray }
`);
  ok(doc.errors.length === 0, 'nth-child/not/is/where/has all compile clean: ' + JSON.stringify(doc.errors));
  const sels = doc.rules.map(r => r.sel);
  ok(sels.includes('.card:nth-child(2)'), 'nth-child kept verbatim');
  ok(sels.includes('.b:not(.x)'), 'not kept verbatim');
  ok(sels.includes('.c:is(.d, .e)'), 'is kept verbatim');
  ok(sels.includes('.f:where(.g)'), 'where kept verbatim');
  ok(sels.includes('.h:has(> img)'), 'has kept verbatim');
  ok(sels.includes('.list .item:nth-child(odd)'), 'nested + nth-child combines');
}

console.log('4 — gateFor: the cheap necessary conditions');
{
  const g = (sel) => gateFor(sel);
  ok(g('.a') !== null && g('.a')[0].classes.includes('a'), 'single class gate');
  ok(g('.a.b:hover')[0].classes.join(',') === 'a,b', 'multi-class compound keeps both');
  ok(g('div span')[0].tag === 'SPAN', 'rightmost compound is the gate — tag only');
  ok(g('div > .item')[0].classes.includes('item') && g('div > .item')[0].tag === null, 'child combinator gates the right side');
  ok(g('#hero.x')[0].id === 'hero' && g('#hero.x')[0].classes.includes('x'), 'id + class');
  ok(g('li:nth-child(2)')[0].tag === 'LI', 'nth-child: parens stripped, tag kept');
  ok(JSON.stringify(g('.a:not(.b)')[0].classes) === '["a"]', 'not(): inner classes are NOT requirements');
  ok(g(':is(.a,.b) span')[0].tag === 'SPAN', 'is() head does not poison the rightmost gate');
  ok(g('.h:has(> img)')[0].classes.includes('h'), 'has(): parens stripped, own class kept');
  ok(g('.a, .b') !== null && g('.a, .b').length === 2, 'comma list gates each part');
  ok(gatePass({ tagName: 'DIV', id: '', classList: { contains: (c) => c === 'a' } }, g('.a')), 'gatePass says yes for a real candidate');
  ok(!gatePass({ tagName: 'P', id: '', classList: { contains: () => false } }, g('.a')), 'gatePass says no for a non-candidate');

  // things the gate must NOT pretend to understand
  ok(g('[data-x]') === null, 'attribute selectors bail');
  ok(g('.a[title="hi"]') === null, 'attr inside compound bails');
  ok(g('*') === null, 'universal bails');
  ok(g(':root') === null, 'root bails');
  ok(g(':is(.a, .b)') === null, 'all parts unfilterable → null (no filter), not a fake gate');
  ok(g(':is(.a,.b), span') !== null && g(':is(.a,.b), span').includes(null) && g(':is(.a,.b), span').some(g => g && g.tag === 'SPAN'), 'mixed: unfilterable part stays null, tag part still gates');
  ok(g('.a:hover, span') !== null, 'mixed list with a tag part still gates');
  ok(gatePass({ tagName: 'SPAN', id: '', classList: { contains: () => false } }, g('.a:hover, span')), 'OR semantics: span part passes → rule stays a candidate');
  ok(gatePass({ tagName: 'SPAN', id: '', classList: { contains: () => true } }, g('.a:hover, span')), 'class part passes → candidate');
  ok(g('.a[hidden]') === null, 'brackets always bail');
  ok(g('section .card.x') !== null && g('section .card.x')[0].classes.join(',') === 'card,x', 'deep descendant gates the leaf');
}

console.log('5 — freeze/unfreeze/explain exist as API surface');
{
  const eng = await import('../public/dssl/index.js').catch(() => null);
  // index.js touches window at import — in node it skips the boot branch but
  // the exports still exist. If the import failed entirely, report it.
  ok(eng !== null, 'index.js imports cleanly in node (no syntax errors)');
  if (eng) {
    ok(typeof eng.freeze === 'function', 'freeze exported');
    ok(typeof eng.unfreeze === 'function', 'unfreeze exported');
    ok(typeof eng.explain === 'function', 'explain exported');
    ok(eng.VERSION === '0.7.0', 'VERSION is 0.7.0');
    ok(typeof eng.DSSL.freeze === 'function' && typeof eng.DSSL.explain === 'function', 'DSSL object carries the new API');
  }
  const engMod = await import('../public/dssl/engine.js');
  ok(typeof engMod.DsslEngine === 'function', 'engine class imports cleanly');
  const r = compile('.a { color: red }');
  ok(Array.isArray(r.warnings), 'resolve() returns a warnings array');
}

console.log('6 — the six site stylesheets still compile (registry chained)');
{
  const files = ['tokens.dssl', 'site.dssl', 'home.dssl', 'docs.dssl', 'playground.dssl', 'changelog.dssl'];
  const { readFileSync } = await import('node:fs');
  const registry = new Map(Object.entries(DEFAULT_TOKENS));
  let totalRules = 0, allErrors = [];
  for (const f of files) {
    const src = readFileSync(join(ROOT, 'public/styles', f), 'utf8');
    const { ast, errors } = parse(src, f);
    const doc = resolve(ast, f, Object.fromEntries(registry));
    for (const [k, v] of Object.entries(doc.tokens)) registry.set(k, v);
    allErrors.push(...doc.errors);
    totalRules += doc.rules.length + doc.shadowRules.length;
  }
  ok(allErrors.length === 0, '6 sheets compile 0 errors: ' + JSON.stringify(allErrors.slice(0, 3)));
  ok(totalRules > 200, 'rule volume sane: ' + totalRules);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
