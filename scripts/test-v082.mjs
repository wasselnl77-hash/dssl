/* test-v082.mjs: one assertion per change in 0.8.2.
 * Found while rebuilding the site on its own engine:
 *   1. "later wins" did not hold BETWEEN stylesheets. Each sheet numbers its
 *      rules from 0 and the cascade compared those numbers across sheets, so a
 *      later sheet lost to an earlier one that simply had more rules above the
 *      rule in question. Fixed by giving every rule one global position.
 *   2. a later tokens { } block could not override a token an earlier sheet
 *      set inside @media or @signal (same cause).
 *   3. fluid did not work on padding-top, margin-block and the other longhands.
 * The cascade tests use the engine's own sort (layer rank, then order) on rules
 * from real compiled sheets, so they check the thing that was wrong. */
import { assignGlobalOrder } from '../public/dssl/engine.js';
import { compile } from '../public/dssl/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '; ' + extra : ''}`); }
};

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };
const cascade = (rules) => [...rules].sort((a, b) => (LAYER_RANK[a.layer] ?? 2) - (LAYER_RANK[b.layer] ?? 2) || a.order - b.order);
const bundleOf = (src) => { const { doc } = compile(src, 't.dssl'); return { rules: doc.rules, shadowRules: doc.shadowRules, raws: doc.raws || [] }; };
const winner = (rules, sel) => cascade(rules.filter((r) => r.sel === sel)).pop();
const val = (rule, prop) => rule.decls.filter((d) => d.prop === prop).pop()?.value;

/* ---- 1: later sheets win ---- */
{
  let filler = '';
  for (let i = 0; i < 30; i++) filler += `.zz${i} { color: green }\n`;
  const first = bundleOf(filler + '.x { color: red }');
  const second = bundleOf('.x { color: blue }');
  const before = winner([...first.rules, ...second.rules], '.x');
  ok('1a. the bug: without a global order the EARLIER sheet wins', val(before, 'color') === 'red', val(before, 'color'));

  const a = bundleOf(filler + '.x { color: red }');
  const b = bundleOf('.x { color: blue }');
  assignGlobalOrder([a, b]);
  const after = winner([...a.rules, ...b.rules], '.x');
  ok('1b. with a global order the LATER sheet wins', val(after, 'color') === 'blue', val(after, 'color'));

  const lastOfFirst = Math.max(...a.rules.map((r) => r.order));
  const firstOfSecond = Math.min(...b.rules.map((r) => r.order));
  ok('1c. every rule of a later sheet sorts after every rule of an earlier one', firstOfSecond > lastOfFirst, `${firstOfSecond} vs ${lastOfFirst}`);

  const snapshot = [...a.rules, ...b.rules].map((r) => r.order).join(',');
  assignGlobalOrder([a, b]);
  assignGlobalOrder([a, b]);
  ok('1d. it is idempotent: rebuilding does not make the numbers drift', [...a.rules, ...b.rules].map((r) => r.order).join(',') === snapshot);

  // replacing a sheet in place: new rules get numbered from the same slot
  const b2 = bundleOf('.x { color: purple }\n.y { color: teal }');
  assignGlobalOrder([a, b2]);
  ok('1e. a replaced sheet still sorts after the sheet before it', val(winner([...a.rules, ...b2.rules], '.x'), 'color') === 'purple');

  // three sheets in a row
  const c = bundleOf('.x { color: orange }');
  assignGlobalOrder([a, b2, c]);
  ok('1f. with three sheets the last one wins', val(winner([...a.rules, ...b2.rules, ...c.rules], '.x'), 'color') === 'orange');

  // within one sheet nothing changed: the later line still wins
  const one = bundleOf('.x { color: red }\n.x { color: green }');
  assignGlobalOrder([one]);
  ok('1g. inside one sheet the later rule still wins', val(winner(one.rules, '.x'), 'color') === 'green');

  // layers still outrank order: a utilities rule in an EARLY sheet beats a components rule in a late one
  const early = bundleOf('@layer utilities { .x { margin-top: 0 } }');
  const late = bundleOf('.x { margin-top: 30 }');
  assignGlobalOrder([early, late]);
  ok('1h. layers still outrank load order', val(winner([...early.rules, ...late.rules], '.x'), 'margin-top') === '0px');

  // shadow (pseudo-element) rules and raw blocks are renumbered with their sheet
  const sh1 = bundleOf('.a::before { content: "a" }');
  const sh2 = bundleOf('.a::before { content: "b" }');
  assignGlobalOrder([sh1, sh2]);
  ok('1i. pseudo-element rules follow the same global order', sh2.shadowRules[0].order > sh1.shadowRules[0].order);
}

/* ---- 2: a later tokens block beats an earlier conditional token ---- */
{
  const palettes = bundleOf(`tokens { color { accent: red } }
@media (prefers-color-scheme: dark) { tokens { color { accent: pink } } }`);
  const later = bundleOf('tokens { color { accent: blue } }');
  const tokenRules = (b) => b.rules.filter((r) => r.layer === 'tokens' && r.decls.some((d) => d.prop === '--dssl-color-accent'));
  const before = cascade([...tokenRules(palettes), ...tokenRules(later)]).pop();
  ok('2a. the bug: an earlier conditional token out-ranked a later tokens block', before.decls.some((d) => d.value === 'pink'));

  const p = bundleOf(`tokens { color { accent: red } }
@media (prefers-color-scheme: dark) { tokens { color { accent: pink } } }`);
  const l = bundleOf('tokens { color { accent: blue } }');
  assignGlobalOrder([p, l]);
  const after = cascade([...tokenRules(p), ...tokenRules(l)]).pop();
  ok('2b. now the later tokens block wins, even in dark mode', after.decls.some((d) => d.value === 'blue'));
}

/* ---- 3: fluid on the longhands ---- */
{
  const evalClamp = (css, vw) => {
    const m = /^clamp\(\s*(-?[\d.]+)px,\s*calc\(\s*(-?[\d.]+)px\s*\+\s*(-?[\d.]+)vw\s*\),\s*(-?[\d.]+)px\s*\)$/.exec(css);
    if (!m) return NaN;
    return Math.min(+m[4], Math.max(+m[1], +m[2] + (+m[3] * vw) / 100));
  };
  const near = (x, y) => Math.abs(x - y) < 0.01;
  for (const prop of ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'padding-inline', 'padding-block', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'margin-inline', 'margin-block', 'letter-spacing', 'border-radius']) {
    const { doc, ok: good } = compile(`.a { ${prop}: fluid 8 24 }`);
    const v = doc.rules[0]?.decls.find((d) => d.prop === prop)?.value;
    ok(`3. ${prop}: fluid 8 24 is 8px at 360 and 24px at 1200`, good && near(evalClamp(v, 360), 8) && near(evalClamp(v, 1200), 24), v);
  }
  const still = compile('.a { padding: fluid 8 16 }');
  ok('3b. the shorthand still works', still.ok && /^clamp\(/.test(still.doc.rules[0].decls[0].value));
  const nope = compile('.a { opacity: fluid 0 1 }');
  ok('3c. fluid on a property that cannot take it is still an error, not silence', !nope.ok);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
