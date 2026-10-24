#!/usr/bin/env node
// v0.7.2 - regression suite for the external-review findings.
// Every assertion maps to a reported bug or a fixed behavior.
import { parse, STATE_WORDS } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';
import { VERSION } from '../public/dssl/index.js';
import { stateReach, gatePass } from '../public/dssl/engine.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error('FAIL:', msg); } };

function compile(src) {
  const { ast, errors } = parse(src, 't.dssl');
  const doc = resolve(ast, 't.dssl', {});
  return { doc, parseErrors: errors };
}
const declsOf = (doc, sel) => doc.rules.filter(r => r.sel === sel).flatMap(r => r.decls);

/* 1 - THE headline: nested state must sort AFTER the base rule */
{
  const { doc } = compile('.card {\n  background: #26201a\n  hover { background: #c0392b }\n}');
  const base = doc.rules.find(r => r.sel === '.card');
  const hov = doc.rules.find(r => r.sel === '.card:hover');
  ok(base && hov, 'nested hover: both rules exist');
  ok(hov.order > base.order, 'nested hover sorts after base (cascade fix)');
  ok(declsOf(doc, '.card').some(d => d.value === '#26201a'), 'base declaration survives');
  ok(declsOf(doc, '.card:hover').some(d => d.value === '#c0392b'), 'hover declaration survives');
}
/* 1b - nested media keeps its condition AND sorts after base */
{
  const { doc } = compile('.card {\n  color: red\n  @media dark { color: blue }\n}');
  const dark = doc.rules.find(r => r.sel === '.card' && r.media.length);
  ok(dark && dark.media.length === 1, 'nested @media keeps its condition');
  const base = doc.rules.find(r => r.sel === '.card' && !r.media.length);
  ok(dark && base && dark.order > base.order, 'nested @media sorts after base');
}
/* 1c - nested signal keeps its condition */
{
  const { doc } = compile('.card {\n  color: red\n  @signal on(true) { color: blue }\n}');
  const sig = doc.rules.find(r => r.sel === '.card' && r.signals.length);
  ok(sig && sig.signals.length === 1, 'nested @signal keeps its condition');
}
/* 1d - nested layer keeps its layer */
{
  const { doc } = compile('.card {\n  color: red\n  @layer utilities { color: blue }\n}');
  const lay = doc.rules.find(r => r.sel === '.card' && r.layer === 'utilities');
  ok(lay, 'nested @layer keeps its layer');
}
/* 1e - decls AFTER a nested block become a later fragment (later wins) */
{
  const { doc } = compile('.card {\n  color: red\n  hover { color: green }\n  color: blue\n}');
  ok(declsOf(doc, '.card').some(d => d.value === 'red'), 'pre-block decl kept');
  ok(declsOf(doc, '.card').some(d => d.value === 'blue'), 'post-block decl kept');
  ok(declsOf(doc, '.card:hover').some(d => d.value === 'green'), 'nested decl kept');
}
/* 2 - raw hex alpha: #ff0000/50 is color-mix, never /50px */
{
  const { doc } = compile('.card { background: #ff0000/50 }');
  const v = declsOf(doc, '.card')[0]?.value;
  ok(v === 'color-mix(in oklab, #ff0000 50%, transparent)', 'raw hex /50 becomes color-mix, got: ' + v);
}
/* 3 - time properties: bare numbers are ms */
{
  const { doc } = compile('.card { transition-delay: 200; animation-duration: 0.5 }');
  const d = declsOf(doc, '.card');
  ok(d.some(x => x.prop === 'transition-delay' && x.value === '200ms'), 'transition-delay: 200 -> 200ms');
  ok(d.some(x => x.prop === 'animation-duration' && x.value === '0.5ms' || x.prop === 'animation-duration' && x.value === '500ms'), 'animation-duration bare -> ms, got: ' + JSON.stringify(d));
}
/* 4 - grid shorthand: gap is a first-class word */
{
  const { doc } = compile('.grid { grid: 3 gap 12 }');
  const d = declsOf(doc, '.grid');
  ok(d.some(x => x.prop === 'grid-template-columns' && x.value === 'repeat(3, 1fr)'), 'grid: 3 -> repeat(3, 1fr)');
  ok(d.some(x => x.prop === 'gap' && x.value === '12px'), 'grid gap 12 -> gap: 12px');
  const { doc: d2 } = compile('.grid { grid: 2 rows 3 gap 8 }');
  const d2l = declsOf(d2, '.grid');
  ok(d2l.some(x => x.prop === 'grid-template-rows' && x.value === 'repeat(3, 1fr)'), 'grid rows 3 -> template rows');
}
/* 5 - seen { } with arrow is a LOUD error pointing at the real patterns */
{
  const { doc } = compile('.card { seen { opacity: 0 -> 1 } }');
  ok(doc.errors.some(e => e.message.includes('->') && e.hint.includes('animate')), 'seen arrow -> loud error with animate hint');
  const { doc: d2 } = compile('motion rise { from { opacity: 0 } }\n.card { seen { animate: rise 400 } }');
  ok(d2.errors.length === 0, 'seen { animate } stays legal');
}
/* 6 - unknown nested state word warns instead of silently becoming a descendant */
{
  const { doc } = compile('.card { hovr { background: red } }');
  ok(doc.warnings.some(w => w.message.includes('hovr') && w.hint.includes('hover')), 'hovr typo warns with did-you-mean');
  const { doc: d2 } = compile('.card { title { color: red } }');
  ok(!d2.warnings.some(w => w.message.includes('title')), 'legit descendant word does not warn');
}
/* 7 - SVG + modern properties pass through */
{
  const { doc } = compile('.card { fill: red; stroke: blue; stroke-width: 2; text-wrap: balance; content-visibility: auto }');
  const d = declsOf(doc, '.card');
  for (const [p, v] of [['fill', 'red'], ['stroke', 'blue'], ['stroke-width', '2px'], ['text-wrap', 'balance'], ['content-visibility', 'auto']]) {
    ok(d.some(x => x.prop === p && x.value === v), `property ${p}: ${v} resolves`);
  }
}
/* 8 - ::part() rides the shadow pipeline, ::slotted() is a loud error */
{
  const { doc } = compile('my-card::part(header) { background: red }');
  ok(doc.errors.length === 0, '::part() compiles');
  ok(doc.shadowRules.some(r => r.sel === 'my-card' && r.pseudo.includes('part(header)')), '::part() rides shadowRules');
  const { doc: d2 } = compile('my-card::slotted(p) { background: red }');
  ok(d2.errors.some(e => e.message.includes('shadow tree')), '::slotted() gets the shadow-tree explanation');
}
/* 9 - one-line decls + nested block on the same line */
{
  const { doc, parseErrors } = compile('.card { background: red; hover { background: blue } }');
  ok(parseErrors.length === 0, 'one-line mix parses');
  ok(declsOf(doc, '.card').some(d => d.value === 'red'), 'one-line: base decl survives');
  ok(declsOf(doc, '.card:hover').some(d => d.value === 'blue'), 'one-line: hover decl survives');
}
/* 10 - stateReach: the hover scoping math */
{
  ok(stateReach('.card:hover', 'hover') === null, 'subject-state reach = null (chain only)');
  const d = stateReach('.card:hover .title', 'hover');
  ok(d && d.prefix === '.card' && d.rest === '.title', 'descendant reach: prefix .card rest .title');
  const s = stateReach('.tab:hover + .panel', 'hover');
  ok(s && s.sib === '+' && s.firstSeg === '.panel', 'sibling reach: + .panel');
  const f = stateReach('.card:has(:hover) .x', 'hover');
  ok(f && f.fallback === true, ':has() wrapper falls back to page-wide superset');
  const deep = stateReach('.list .card:hover .title', 'hover');
  ok(deep && deep.prefix === '.list .card' && deep.rest === '.title', 'deep ancestor prefix');
}
/* 11 - gatePass still duck-types on fake elements (unchanged contract) */
{
  ok(gatePass({ tagName: 'div', classList: { contains: () => true } }, null) === true, 'gatePass null gate = true');
}
/* 12 - version */
{
  // v0.8.0 - pin loosened the same way v070's was: the suite must survive
  // later releases, but catch an accidental DOWNGRADE below 0.7.2.
  const [maj, min, pat] = String(VERSION).split('.').map(Number);
  ok(maj === 0 && (min > 7 || (min === 7 && pat >= 2)), 'engine VERSION is >= 0.7.2 (got ' + VERSION + ')');
  ok(STATE_WORDS.has('hover') && STATE_WORDS.has('seen'), 'STATE_WORDS exported');
}

console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
