/* v0.6.0 tests — the deform family + gradient tools + pass-through:
 *  1-4   bend / bend-y / bend-up / fold / stretch / bend-around parse + loud errors
 *  5     composeDeform: 3D bake, edge-pinned pivots, squash & stretch, base transform
 *  6     arcLayout: radius math, angle spread, degenerate cases
 *  7     motion keyframes carry composed transforms + transformOrigin
 *  8-11  gradient / gradient-text / gradient-flow: arrow + comma stops, tokens, alpha, positions
 *  12    transition bend/stretch/fold aliases land on transform
 *  13    pointer-events: none — the transparent-overlay sibling feature
 *  14    deform props inside pseudo blocks stay LOUD (no DOM handle)
 *  15    all six site stylesheets chained through the token registry
 */
import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';
import { composeDeform, arcLayout } from '../public/dssl/utils.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '  — ' + extra : ''}`); }
};

function compile(src) {
  const { ast, errors: parseErrors } = parse(src, 'test.dssl');
  const doc = resolve(ast, 'test.dssl', null);
  return { doc, errors: [...parseErrors, ...doc.errors] };
}
const declOf = (doc, sel, prop) =>
  doc.rules.find(r => r.sel === sel)?.decls.find(d => d.prop === prop)?.value;

console.log('1. bend / bend-y / bend-up / fold');
{
  const { doc, errors } = compile(`
    .a { bend: 20 }
    .b { bend-y: -12.5 }
    .c { bend-up: 14deg }
    .d { fold: 30 }
    .e { bend: 0 }
  `);
  check('1 no errors', errors.length === 0, JSON.stringify(errors));
  check('1 bend = 20', declOf(doc, '.a', '@bend') === 20, declOf(doc, '.a', '@bend'));
  check('1 bend-y = -12.5', declOf(doc, '.b', '@bend-y') === -12.5);
  check('1 bend-up accepts deg suffix', declOf(doc, '.c', '@bend-up') === 14);
  check('1 fold = 30', declOf(doc, '.d', '@fold') === 30);
  check('1 bend: 0 emits a resetter', declOf(doc, '.e', '@bend') === 0);

  const bad1 = compile('.x { bend: 12px }');
  check('1 12px is a LOUD error', bad1.errors.length === 1 && /bare number of degrees/.test(bad1.errors[0].message), JSON.stringify(bad1.errors));
  const bad2 = compile('.x { bend: swing }');
  check('2 nonsense is a LOUD error', bad2.errors.length === 1 && /bare number of degrees/.test(bad2.errors[0].message));
  check('2 nothing emitted on error', bad2.doc.rules.length === 0);
}

console.log('3. stretch');
{
  const { doc, errors } = compile(`
    .a { stretch: 1.2 }
    .b { stretch: 1.4 vertical }
    .c { stretch: 0.8 y }
  `);
  check('3 no errors', errors.length === 0, JSON.stringify(errors));
  const a = declOf(doc, '.a', '@stretch');
  check('3 default axis is horizontal', a.factor === 1.2 && a.axis === 'horizontal', JSON.stringify(a));
  check('3 vertical keyword', declOf(doc, '.b', '@stretch').axis === 'vertical');
  check('3 y is an alias', declOf(doc, '.c', '@stretch').axis === 'vertical');

  const z = compile('.x { stretch: 0 }');
  check('3 zero is a LOUD error', z.errors.length === 1 && /flatten/.test(z.errors[0].message), JSON.stringify(z.errors));
  const neg = compile('.x { stretch: -2 }');
  check('3 negative is a LOUD error', neg.errors.length === 1 && /positive factor/.test(neg.errors[0].message));
  const word = compile('.x { stretch: rubber }');
  check('3 words are a LOUD error', word.errors.length === 1 && /positive factor/.test(word.errors[0].message));
}

console.log('4. bend-around');
{
  const { doc, errors } = compile(`
    nav { bend-around: -24 }
    .dome { bend-around: 60 }
  `);
  check('4 no errors', errors.length === 0, JSON.stringify(errors));
  check('4 smile arc passes', declOf(doc, 'nav', '@bend-around') === -24);
  check('4 dome arc passes', declOf(doc, '.dome', '@bend-around') === 60);

  const cap = compile('.x { bend-around: 200 }');
  check('4 ±170 cap is LOUD', cap.errors.length === 1 && /±170/.test(cap.errors[0].message), JSON.stringify(cap.errors));
}

console.log('5. composeDeform — one transform to rule them all');
{
  let c = composeDeform({ bend: 20 }, '', { h: 100 });
  check('5 bend = perspective rotateX', c.transform === 'perspective(900px) rotateX(20deg)', c.transform);

  c = composeDeform({ fold: 30 }, '', { h: 100 });
  check('5 fold bakes a top pivot', c.transform === 'perspective(900px) translateY(-50px) rotateX(30deg) translateY(50px)', c.transform);
  check('5 inline mode sets no origin', c.origin === null);

  c = composeDeform({ bendUp: 12 }, '', null);
  check('5 keyframe mode emits origin bottom', c.transform === 'perspective(900px) rotateX(12deg)' && c.origin === '50% 100%', JSON.stringify(c));

  c = composeDeform({ stretch: 2 }, '', {});
  check('5 stretch keeps volume', c.transform === 'scaleX(2) scaleY(0.5)', c.transform);
  c = composeDeform({ stretch: 2, stretchAxis: 'vertical' }, '', {});
  check('5 vertical stretch flips axes', c.transform === 'scaleY(2) scaleX(0.5)', c.transform);

  c = composeDeform({ bend: 10 }, 'rotate(-6deg)', {});
  check('5 user transform runs inside', c.transform === 'perspective(900px) rotateX(10deg) rotate(-6deg)', c.transform);
  c = composeDeform({}, 'none', {});
  check('5 empty deform + none stays none', c.transform === 'none', c.transform);

  c = composeDeform({ bend: 20, stretch: 1.2, fold: 15 }, '', { h: 80 });
  check('5 members compose in order', c.transform ===
    'perspective(900px) rotateX(20deg) translateY(-40px) rotateX(15deg) translateY(40px) scaleX(1.2) scaleY(0.8333)', c.transform);
}

console.log('6. arcLayout — bend-around math');
{
  const a = arcLayout(5, 400, 40);
  check('6 radius from chord + angle', Math.abs(a.R - 200 / Math.sin(20 * Math.PI / 180)) < 0.01, a.R);
  check('6 angles spread evenly', JSON.stringify(a.angles) === JSON.stringify([-20, -10, 0, 10, 20]), JSON.stringify(a.angles));

  const s = arcLayout(3, 400, -30);
  check('6 negative opens a smile', JSON.stringify(s.angles) === JSON.stringify([15, 0, -15]), JSON.stringify(s.angles));

  check('6 one child cannot arc', arcLayout(1, 400, 40) === null);
  check('6 zero degrees cannot arc', arcLayout(3, 400, 0) === null);
  check('6 zero width cannot arc', arcLayout(3, 0, 40) === null);
}

console.log('7. motions: bend keyframes compose into transform frames');
{
  const { doc, errors } = compile(`
    motion wave {
      from { bend: 0 }
      to { bend: 30; fold: 20 }
    }
    .x { animate: wave 500 }
  `);
  check('7 no errors', errors.length === 0, JSON.stringify(errors));
  const spec = declOf(doc, '.x', '@animate');
  const [f0, f1] = spec.frames;
  check('7 from frame is neutral', f0.props.transform === 'none', JSON.stringify(f0));
  check('7 to frame carries both rotations', /rotateX\(30deg\)/.test(f1.props.transform) && /rotateX\(20deg\)/.test(f1.props.transform), JSON.stringify(f1));
  check('7 fold pins the pivot via origin', f1.props.transformOrigin === '50% 0%', JSON.stringify(f1.props));
}

console.log('8. gradient — arrow + comma stops');
{
  const { doc, errors } = compile(`
    .a { gradient: linear 135, #ff0055 -> #00d4ff }
    .b { gradient: linear to bottom right, red, blue }
    .c { gradient: linear 90, #ff0055 20% -> #00d4ff 80% }
    .d { gradient: radial circle at center, white -> black }
    .e { gradient: conic from 45 at center, red, blue }
    .f { gradient: linear, cyan, magenta }
  `);
  check('8 no errors', errors.length === 0, JSON.stringify(errors));
  check('8 arrow syntax', declOf(doc, '.a', 'background-image') === 'linear-gradient(135deg, #ff0055, #00d4ff)', declOf(doc, '.a', 'background-image'));
  check('8 direction words', declOf(doc, '.b', 'background-image') === 'linear-gradient(to bottom right, red, blue)');
  check('8 per-stop positions', declOf(doc, '.c', 'background-image') === 'linear-gradient(90deg, #ff0055 20%, #00d4ff 80%)', declOf(doc, '.c', 'background-image'));
  check('8 radial shape', declOf(doc, '.d', 'background-image') === 'radial-gradient(circle at center, white, black)');
  check('8 conic prefix', declOf(doc, '.e', 'background-image') === 'conic-gradient(from 45deg at center, red, blue)');
  check('8 comma-only stops', declOf(doc, '.f', 'background-image') === 'linear-gradient(180deg, cyan, magenta)', declOf(doc, '.f', 'background-image'));
}

console.log('9. gradient — tokens, alpha, loud errors');
{
  const { doc, errors } = compile(`
    tokens { color { flame: #ff5533 } }
    .a { gradient: linear 135, color.flame -> color.ink/40 -> color.paper }
  `);
  check('9 no errors', errors.length === 0, JSON.stringify(errors));
  const img = declOf(doc, '.a', 'background-image');
  check('9 token stop resolves to var()', img.includes('var(--dssl-color-flame)'), img);
  check('9 alpha stop becomes color-mix', img.includes('color-mix(in oklab, var(--dssl-color-ink) 40%, transparent)'), img);
  check('9 three stops survive', img.indexOf('var(--dssl-color-flame)') < img.indexOf('color-mix') && img.indexOf('color-mix') < img.indexOf('var(--dssl-color-paper)'), img);

  const nk = compile('.a { gradient: magenta -> cyan }');
  check('9 missing kind is LOUD', nk.errors.length === 1 && /needs a kind/.test(nk.errors[0].message), JSON.stringify(nk.errors));
  const one = compile('.a { gradient: linear 135, #a }');
  check('9 single stop is LOUD', one.errors.length === 1 && /at least two stops/.test(one.errors[0].message), JSON.stringify(one.errors));
  const dir = compile('.a { gradient: linear sideways, red -> blue }');
  check('9 bad direction is LOUD', dir.errors.length === 1 && /not a linear gradient direction/.test(dir.errors[0].message), JSON.stringify(dir.errors));
  const rad = compile('.a { gradient: radial banana, red -> blue }');
  check('9 bad radial atom is LOUD', rad.errors.length === 1 && /radial gradient shape/.test(rad.errors[0].message), JSON.stringify(rad.errors));
  const typo = compile('.a { gradient: linear sideways, red, blue }');
  check('9 comma-mode typo is still LOUD', typo.errors.length >= 1 && /not a color/.test(typo.errors[0].message), JSON.stringify(typo.errors));
}

console.log('10. gradient-text');
{
  const { doc, errors } = compile('.h { gradient-text: linear 90, #f0f -> #0ff }');
  check('10 no errors', errors.length === 0, JSON.stringify(errors));
  const d = doc.rules[0].decls;
  check('10 five declarations', d.length === 5, JSON.stringify(d.map(x => x.prop)));
  check('10 clip text (std + webkit)', d.some(x => x.prop === 'background-clip' && x.value === 'text') && d.some(x => x.prop === '-webkit-background-clip'));
  check('10 glyphs go transparent', d.some(x => x.prop === 'color' && x.value === 'transparent') && d.some(x => x.prop === '-webkit-text-fill-color'));
}

console.log('11. gradient-flow');
{
  const { doc, errors } = compile(`
    .a { gradient-flow: 6s }
    .b { gradient-flow: 900 bounce alternate }
    .c { gradient-flow: none }
  `);
  check('11 no errors', errors.length === 0, JSON.stringify(errors));
  const a = declOf(doc, '.a', '@gradient-flow');
  check('11 bare duration is ms, 6s is 6000', a.duration === 6000 && a.easing === 'linear' && a.direction === 'normal', JSON.stringify(a));
  const b = declOf(doc, '.b', '@gradient-flow');
  check('11 easing + alternate', b.duration === 900 && b.easing.includes('cubic-bezier') && b.direction === 'alternate', JSON.stringify(b));
  check('11 none emits a null (cancels)', declOf(doc, '.c', '@gradient-flow') === null);

  const bad = compile('.a { gradient-flow: soon }');
  check('11 bad duration is LOUD', bad.errors.length === 1 && /takes a duration/.test(bad.errors[0].message), JSON.stringify(bad.errors));
  const part = compile('.a { gradient-flow: 6s wild }');
  check('11 bad part is LOUD', part.errors.length === 1 && /unknown gradient-flow part/.test(part.errors[0].message));
}

console.log('12. transition aliases: bend/stretch/fold ride transform');
{
  const { doc, errors } = compile('.btn { transition: 200 snap bend, 150 stretch, 100 fold }');
  check('12 no errors', errors.length === 0, JSON.stringify(errors));
  const t = declOf(doc, '.btn', 'transition');
  check('12 all three became transform', (t.match(/transform \d+ms/g) || []).length === 3, t);
}

console.log('13. pointer-events — transparent overlays stop eating selection');
{
  const { doc, errors } = compile(`
    .veil { pointer-events: none }
    .hit { pointer-events: auto }
  `);
  check('13 no errors', errors.length === 0, JSON.stringify(errors));
  check('13 none passes through', declOf(doc, '.veil', 'pointer-events') === 'none');
  check('13 auto passes through', declOf(doc, '.hit', 'pointer-events') === 'auto');
}

console.log('14. deform props inside pseudo blocks stay LOUD');
{
  const a = compile('.card::before { bend: 20 }');
  check('14 bend-in-pseudo is LOUD', a.errors.length === 1 && /engine-native/.test(a.errors[0].message), JSON.stringify(a.errors));
  check('14 nothing leaked', a.doc.shadowRules.length === 0 && a.doc.rules.length === 0);
  const b = compile('.card { ::after { gradient-flow: 3s } }');
  check('14 nested gradient-flow-in-pseudo is LOUD', b.errors.length === 1 && /engine-native/.test(b.errors[0].message));
}

console.log('15. six site stylesheets chained through the token registry');
{
  const fs = await import('node:fs');
  const files = ['tokens', 'site', 'home', 'docs', 'playground', 'changelog'];
  let base = { ...DEFAULT_TOKENS };
  let total = 0, ruleCount = 0;
  for (const f of files) {
    const src = fs.readFileSync(new URL(`../public/styles/${f}.dssl`, import.meta.url).pathname, 'utf8');
    const { ast, errors } = parse(src, f + '.dssl');
    const doc = resolve(ast, f + '.dssl', base);
    total += errors.length + doc.errors.length;
    ruleCount += doc.rules.length + doc.shadowRules.length;
    base = { ...base, ...doc.tokens };
  }
  check('15 zero errors across all stylesheets', total === 0, `${total} errors`);
  check('15 rules still compile in bulk', ruleCount > 150, `${ruleCount}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
