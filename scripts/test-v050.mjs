/* v0.5.0 regression tests - the review complaints, verbatim scenarios:
 *  1. ".card::before { } compiles ok: true and then matches nothing" → now a real shadow rule
 *  2. animate has no infinite → infinite + alternate accepted, WAAPI spec carries them
 *  3. quoted-only font names in tokens → bare names pass in font-family + font.* tokens
 *  4. hyphens: manual rejected → accepted
 *  + loud errors preserved: unknown pseudo, :seen in shadow, mixed lists, still-loud values
 */
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? '  - ' + extra : ''}`); }
};

function compile(src) {
  const { ast, errors: parseErrors } = parse(src, 'test.dssl');
  const doc = resolve(ast, 'test.dssl', null);
  return { doc, errors: [...parseErrors, ...doc.errors] };
}

console.log('1. the pseudo-element trap');
{
  const { doc, errors } = compile(`
    .card::before {
      content: ""
      background: color.accent
      width: 12
    }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  check('inline rules empty (nothing dead)', doc.rules.length === 0);
  check('one shadow rule', doc.shadowRules.length === 1);
  const r = doc.shadowRules[0];
  check('sel split to .card', r.sel === '.card', r.sel);
  check('pseudo = before', r.pseudo === 'before', r.pseudo);
  check('content auto-quoted', r.decls.some(d => d.prop === 'content' && d.value === '""'));
  check('token resolved', r.decls.some(d => d.prop === 'background' && d.value.includes('--dssl-color-accent')));
}

console.log('2. nested form still works (unchanged)');
{
  const { doc, errors } = compile(`
    .card {
      ::after { content: "→" }
      hover { color: color.accent }
    }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  check('shadow rule via nested', doc.shadowRules.length === 1 && doc.shadowRules[0].pseudo === 'after');
  check('state rule intact', doc.rules.length === 1 && doc.rules[0].sel === '.card:hover');
}

console.log('3. &::before inside a block (also was silently dead)');
{
  const { doc, errors } = compile(`
    .card {
      &::before { content: "" }
    }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  check('routed to shadow CSS', doc.shadowRules.length === 1 && doc.shadowRules[0].sel === '.card' && doc.shadowRules[0].pseudo === 'before');
}

console.log('4. top-level pseudo + vendor + states + media');
{
  const { doc, errors } = compile(`
    @media 768 {
      .nav::-webkit-scrollbar-thumb:hover { background: color.ink/45 }
    }
    .card:hover::before { background: color.accent }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  check('two shadow rules', doc.shadowRules.length === 2, `got ${doc.shadowRules.length}`);
  const vendor = doc.shadowRules.find(r => r.pseudo.startsWith('-webkit-'));
  check('vendor pseudo keeps trailing state', vendor && vendor.pseudo === '-webkit-scrollbar-thumb:hover' && vendor.sel === '.nav', vendor && vendor.pseudo);
  check('media attached to vendor rule', vendor && vendor.media.length === 1);
  const hov = doc.shadowRules.find(r => r.pseudo === 'before');
  check('state before :: survives split', hov && hov.sel === '.card:hover', hov && hov.sel);
}

console.log('5. loud errors stay loud');
{
  const a = compile('.card::befor { content: "" }');
  check('unknown pseudo is a LOUD error', a.errors.length === 1 && /unknown pseudo-element/.test(a.errors[0].message), JSON.stringify(a.errors));
  check('and nothing dead is emitted', a.doc.rules.length === 0 && a.doc.shadowRules.length === 0);

  const b = compile('.card:seen::before { content: "" }');
  check(':seen + pseudo is a LOUD error', b.errors.length === 1 && /seen/.test(b.errors[0].message), JSON.stringify(b.errors));

  const c = compile('.a, .b::before { content: "" }');
  check('mixed selector list is a LOUD error', c.errors.length === 1 && /mixes/.test(c.errors[0].message), JSON.stringify(c.errors));

  const d = compile('.card { color: oops }');
  check('unknown value still loud', d.errors.length === 1 && /unknown value/.test(d.errors[0].message), JSON.stringify(d.errors));
}

console.log('6. infinite + alternate');
{
  const { doc, errors } = compile(`
    motion pulse {
      from { opacity: 1 }
      to { opacity: 0.4 }
    }
    .dot {
      animate: pulse 1600 infinite alternate
    }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  const anim = doc.rules[0].decls.find(d => d.prop === '@animate');
  check('iterations = Infinity', anim && anim.value.iterations === Infinity, JSON.stringify(anim && anim.value));
  check('direction = alternate', anim && anim.value.direction === 'alternate', JSON.stringify(anim && anim.value));
  const one = compile('motion p { from { opacity: 1 } to { opacity: 0 } } .x { animate: p 400 }');
  const a1 = one.doc.rules[0].decls.find(d => d.prop === '@animate');
  check('default stays 1 iteration / normal', a1 && a1.value.iterations === undefined && a1.value.direction === undefined);
  const bad = compile('motion p { from { opacity: 1 } } .x { animate: p 400 forevr }');
  check('typo in animate part still loud', bad.errors.length === 1 && /unknown animate part/.test(bad.errors[0].message), JSON.stringify(bad.errors));
}

console.log('7. bare font names');
{
  const { doc, errors } = compile(`
    tokens {
      font {
        display: JetBrains Mono, monospace
        quote: Iowan Old Style
      }
    }
    .card { font-family: Public Sans, serif }
    .quoted { font-family: "JetBrains Mono", monospace }
  `);
  check('no errors', errors.length === 0, JSON.stringify(errors));
  const fam = doc.rules.find(r => r.sel === '.card').decls.find(d => d.prop === 'font-family');
  check('bare font-family passes verbatim', fam && fam.value === 'Public Sans, serif', fam && fam.value);
  const tok = doc.registryRule.decls.find(d => d.prop === '--dssl-font-display');
  check('bare token font name passes', tok && tok.value === 'JetBrains Mono, monospace', tok && tok.value);
  const q = doc.rules.find(r => r.sel === '.quoted').decls.find(d => d.prop === 'font-family');
  check('quoted still fine', q && q.value === '"JetBrains Mono", monospace', q && q.value);
  const bad = compile('.card { color: steel blue }');
  check('bare words elsewhere still loud', bad.errors.length >= 1 && /unknown value/.test(bad.errors[0].message), JSON.stringify(bad.errors));
}

console.log('8. hyphens: manual');
{
  const { doc, errors } = compile('.prose { hyphens: manual }');
  check('no errors', errors.length === 0, JSON.stringify(errors));
  check('emitted as-is', doc.rules[0].decls[0].prop === 'hyphens' && doc.rules[0].decls[0].value === 'manual');
}

console.log('9. site.dssl regression (the actual site styles, token registry chained like the runtime)');
{
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { DEFAULT_TOKENS } = await import('../public/dssl/resolver.js');
  const here = path.dirname(new URL(import.meta.url).pathname);
  const stylesDir = path.join(here, '..', 'public', 'styles');
  const registry = new Map(Object.entries(DEFAULT_TOKENS));
  for (const name of ['tokens', 'site', 'home', 'docs', 'playground', 'changelog']) {
    const f = path.join(stylesDir, `${name}.dssl`);
    if (!fs.existsSync(f)) { console.log(`  skip ${name}`); continue; }
    const src = fs.readFileSync(f, 'utf8');
    const { doc, errors } = resolveChain(src, registry);
    check(`${name}.dssl compiles clean`, errors.length === 0, JSON.stringify(errors.slice(0, 2)));
    if (name === 'site.dssl') {
      check('site.dssl scrollbar shadow rules present', doc.shadowRules.length >= 4, `got ${doc.shadowRules.length}`);
    }
  }
}

/** compile with a shared registry (like index.js does) and fold tokens back in */
function resolveChain(src, registry) {
  const { ast, errors: parseErrors } = parse(src, 'chain.dssl');
  const doc = resolve(ast, 'chain.dssl', Object.fromEntries(registry));
  for (const [k, v] of Object.entries(doc.tokens)) registry.set(k, v);
  return { doc, errors: [...parseErrors, ...doc.errors] };
}

console.log('10. compile() stats surface the shadow rules');
{
  const { doc, errors } = compile('.card::before { content: "" } .card::after { content: "" } .card { padding: 12 }');
  check('2 shadow + 1 inline', doc.shadowRules.length === 2 && doc.rules.length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);

// 11. bare content: gets auto-quoted in the full-selector path (parity with nested)
{
  const { doc, errors } = compile('.card::before { content: }');
  check('11 no errors', errors.length === 0, JSON.stringify(errors));
  const c = doc.shadowRules[0]?.decls.find(d => d.prop === 'content');
  check('11 bare content auto-quoted', c && c.value === '""', c && c.value);
}

console.log(`${pass} passed, ${fail} failed`);

// 12. overlap policy - the "nothing below 100% opacity overlaps" feature
{
  const { doc, errors } = compile(`
    body { overlap: auto }
    .badge { overlap: deny }
    .scrim { overlap: allow }
    .off { overlap: none }
  `);
  check('12 no errors', errors.length === 0, JSON.stringify(errors));
  const get = (sel) => doc.rules.find(r => r.sel === sel)?.decls.find(d => d.prop === '@overlap')?.value;
  check('12 body policy = auto', get('body') === 'auto', get('body'));
  check('12 deny passes through', get('.badge') === 'deny', get('.badge'));
  check('12 allow passes through', get('.scrim') === 'allow', get('.scrim'));
  check('12 none is an alias of allow', get('.off') === 'allow', get('.off'));

  const bad = compile('.card { overlap: never }');
  check('12 bad policy is a LOUD error', bad.errors.length === 1 && /unknown overlap policy/.test(bad.errors[0].message), JSON.stringify(bad.errors));
  check('12 hint names the vocabulary', /allow|deny|auto/.test(bad.errors[0].hint || ''));

  const dead = compile('.card { overlap: nevr }');
  check('12 nothing emitted on error', dead.doc.rules.length === 0);

  // site.dssl now carries the global switch - regression-guard it
  const fs = await import('node:fs');
  const site = fs.readFileSync(new URL('../public/styles/site.dssl', import.meta.url).pathname, 'utf8');
  check('12 site.dssl body opts in', /overlap:\s*auto/.test(site));
}

// 13. the escape math (overlapNudge) - pure function, no DOM needed
{
  const { overlapNudge } = await import('../public/dssl/engine.js');
  const box = (l, t, r, b) => ({ left: l, top: t, right: r, bottom: b });

  // candidate [0,0,100,100] vs obstacle [50,0,150,100]: push left past the
  // near edge costs 50, push right past the far edge costs 150 → left wins
  let n = overlapNudge(box(0, 0, 100, 100), [box(50, 0, 150, 100)]);
  check('13 shortest escape wins (left 50)', n.x === -50 && n.y === 0, JSON.stringify(n));

  // deep obstacle above, 10px of y-penetration → dropping down 10 beats climbing 200
  n = overlapNudge(box(0, 90, 200, 200), [box(0, 0, 200, 100)]);
  check('13 vertical kiss resolves down 10', n.x === 0 && n.y === 10, JSON.stringify(n));

  // no overlap → no nudge
  n = overlapNudge(box(0, 0, 10, 10), [box(20, 20, 30, 30)]);
  check('13 clear boxes stay put', n.x === 0 && n.y === 0, JSON.stringify(n));

  // touching edges are NOT overlap (the shared-border tremble guard)
  n = overlapNudge(box(0, 0, 100, 100), [box(100, 0, 200, 100)]);
  check('13 touching edges do not count', n.x === 0 && n.y === 0, JSON.stringify(n));

  // two walls with a real gap between them → nudge must land inside the gap
  n = overlapNudge(box(70, 0, 90, 100), [box(0, 0, 80, 100), box(120, 0, 200, 100)]);
  const cleared = (b, obs) => obs.every(o =>
    Math.min(b.right, o.right) - Math.max(b.left, o.left) <= 0.01 ||
    Math.min(b.bottom, o.bottom) - Math.max(b.top, o.top) <= 0.01);
  const moved = box(70 + n.x, 0 + n.y, 90 + n.x, 100 + n.y);
  check('13 box clears both walls into the gap', n.x === 10 && cleared(moved, [box(0, 0, 80, 100), box(120, 0, 200, 100)]), JSON.stringify({ n, moved }));
}

console.log(`${pass} passed, ${fail} failed`);

// 14. engine-native props inside pseudo blocks fail loud (no junk shadow CSS)
{
  const a = compile('.card::before { animate: pop 400 }');
  check('14 nested animate-in-pseudo is LOUD', a.errors.length === 1 && /engine-native/.test(a.errors[0].message), JSON.stringify(a.errors));
  check('14 nothing leaked to shadow CSS', a.doc.shadowRules.length === 0 && a.doc.rules.length === 0);

  const b = compile('.card::before { overlap: deny }');
  check('14 top-level overlap-in-pseudo is LOUD', b.errors.length === 1 && /engine-native/.test(b.errors[0].message), JSON.stringify(b.errors));

  const c = compile('.card { ::after { --x: 1 } }');
  check('14 custom props still pass in pseudo blocks', c.errors.length === 0 && c.doc.shadowRules.length === 1, JSON.stringify(c.errors));
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
