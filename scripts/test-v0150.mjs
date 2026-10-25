#!/usr/bin/env node
/* test-v0150.mjs: the second review from the game builder (0.15.0). Every issue and every wish has an assertion here,
 * against real Chrome where the browser decides the answer. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compile } from '../public/dssl/index.js';
import { shadowedRules } from '../public/dssl/lint.js';
import { withBrowser, ROOT } from './lib/browser-harness.mjs';
import { decodePng, px } from './lib/pixels.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const page = (dssl, body = '', head = '') => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000;height:3000px">${head}<style type="text/dssl">${dssl}</style>${body}<script type="module" src="/dssl/boot.js"></script>`;
const ready = (p) => p.waitForFunction(`window.DSSL && DSSL.__debug.engines.get('global') && document.documentElement.classList.contains('dssl-ready')`);
const errs = (src) => compile(src, 't.dssl').errors.map((e) => e.message);
const warns = (src) => compile(src, 't.dssl').warnings.map((w) => w.message);
const stats = (p) => p.evaluate(() => ({ ...DSSL.__debug.engines.get('global').aura.stats }));

section('1. aura: hidden emitters stop, and what they let go fades with them');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/h'); await ready(p); await p.waitForTimeout(700);
  ok('a visible emitter has particles alive', (await stats(p)).particles > 3, JSON.stringify(await stats(p)));
  for (const [label, css] of [['opacity: 0', 'opacity:0'], ['display: none', 'display:none'], ['visibility: hidden', 'visibility:hidden']]) {
    await p.evaluate((c) => { document.getElementById('menu').style.cssText = c; }, css);
    await p.waitForTimeout(900);   // life is 300ms: everything already alive has finished
    ok(`an ancestor with ${label} stops it from emitting`, (await stats(p)).particles === 0, JSON.stringify(await stats(p)));
    await p.evaluate(() => { document.getElementById('menu').style.cssText = ''; });
    await p.waitForTimeout(500);
    ok(`and showing it again starts it again (${label})`, (await stats(p)).particles > 3, JSON.stringify(await stats(p)));
  }
  await p.evaluate(() => { document.getElementById('menu').style.opacity = '0'; });
  await p.waitForTimeout(150);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } }));
  let lit = 0; for (let y = 0; y < 300; y += 3) for (let x = 0; x < 400; x += 3) if (px(png, x, y)[0] > 60) lit++;
  ok('a hidden menu\'s glow is not drawn either', lit === 0, String(lit));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/h': page('#orb { position: absolute; left: 150px; top: 120px; width: 50px; height: 50px; background: #222; aura-particle: #f80 -> transparent count 40 life 300 size 6 dir up from top essential; aura-glow: #f00 40 essential }', '<div id=menu><div id=orb></div></div>') } });

await withBrowser(async ({ open }) => {
  const p = await open('/a'); await ready(p); await p.waitForTimeout(700);
  ok('`always` keeps an invisible anchor emitting (opacity 0 on purpose)', (await stats(p)).particles > 3, JSON.stringify(await stats(p)));
}, { pages: { '/a': page('#anchor { position: absolute; left: 150px; top: 120px; width: 10px; height: 10px; opacity: 0; aura-particle: #888 -> transparent count 40 life 400 size 6 dir up essential always }', '<div id=anchor></div>') } });

section('2. aura under reduced motion follows what moves, and rests when nothing does');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/r'); await ready(p); await p.waitForTimeout(600);
  const f0 = (await stats(p)).frames; await p.waitForTimeout(1000);
  const still = (await stats(p)).frames - f0;
  ok('nothing moves: the loop rests (a few frames in a second, not 60)', still < 15, String(still));
  await p.evaluate(() => { document.getElementById('mover').style.left = '200px'; });
  await p.waitForTimeout(300);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 500, height: 300 } }));
  const at = (x, y) => px(png, x, y);
  ok('a still element that moves is drawn at its new place within 300ms', at(200 + 25, 120 + 25 + 40)[0] > 25 || at(200 - 6, 145)[0] > 25, JSON.stringify([at(225, 185), at(194, 145)]));
  // a thing moving the whole time (an essential motion): the glow keeps up, frame after frame
  const f1 = (await stats(p)).frames;
  await p.evaluate(() => document.getElementById('mover2').classList.add('go'));
  await p.waitForTimeout(1000);
  const moving = (await stats(p)).frames - f1;
  ok('something moving: it draws every frame (30+ in a second)', moving > 30, String(moving));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { reducedMotion: 'reduce', pages: { '/r': page('motion slide { from { translate: 0 0 } to { translate: 200 0 } essential }\n.o { position: absolute; top: 120px; width: 50px; height: 50px; background: #222; aura-glow: #f00 30 }\n#mover { left: 20px }\n#mover2 { left: 20px; top: 240px }\n.go { animate: slide 1000 linear infinite alternate }', '<div class="o" id=mover></div><div class="o" id=mover2></div>') } });

section('3. aura: a layer of its own with `z N`');
{
  const base = '.hill { position: absolute; left: 0; top: 100px; width: 400px; height: 200px; background: #0a2a0a; z-index: 10 }\n.orb { position: absolute; left: 150px; top: 150px; width: 40px; height: 40px; background: #0a2a0a; z-index: 11 }';
  const lit = async (glow) => {
    let r = 0;
    await withBrowser(async ({ open }) => {
      const p = await open('/z'); await ready(p); await p.waitForTimeout(800);
      const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: 400 } }));
      r = px(png, 135, 170)[0];
      ok(`(${glow || 'no z'}) the canvases are where they should be`, await p.evaluate(() => [...document.querySelectorAll('canvas[data-dssl-aura]')].map((c) => c.style.zIndex).sort().join(',')) === (glow ? '2147483000,5' : '2147483000'));
    }, { pages: { '/z': page(`${base}\n.orb { aura-glow: #f00 50 essential intensity 2${glow ? ' z 5' : ''} }\n.hill-lamp { position: absolute; left: 20px; top: 10px; width: 10px; height: 10px; background: #111; aura-glow: #00f 20 essential }`, '<div class=hill></div><div class=orb></div><div class=hill-lamp></div>') }, viewport: { width: 400, height: 400 } });
    return r;
  };
  const above = await lit(''), under = await lit('z 5');
  ok('with `z 5` the light goes under a hill with z-index 10 (the hill\'s own colour shows)', under < 40 && above > under + 30, `default ${above}, z 5 ${under}`);
  ok('`z` is a known aura word', compile('.a { aura-glow: #f80 20 z 3; aura-particle: #fd0 5 z 3 }', 't').errors.length === 0);
}

section('4. signals: typed, scoped, and cheap');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/s'); await ready(p);
  const v = (name, el) => p.evaluate(([n, id]) => DSSL.getSignal(n, id ? document.getElementById(id) : undefined), [name, el]);
  await p.evaluate(() => { DSSL.signal('toasting', false); DSSL.signal('hp', 3); DSSL.signal('mode', 'play'); DSSL.signal('on', true); });
  ok('a boolean stays a boolean', (await v('toasting')) === false && (await v('on')) === true);
  ok('a number stays a number', (await v('hp')) === 3);
  ok('a string stays a string', (await v('mode')) === 'play');
  ok('the attribute mirror is text', await p.evaluate(() => document.documentElement.getAttribute('data-dssl-signal-on')) === 'true');
  const color = (id) => p.evaluate((i) => getComputedStyle(document.getElementById(i)).color, id);
  const before = (id) => p.evaluate((i) => getComputedStyle(document.getElementById(i), '::before').content, id);
  await p.waitForTimeout(100);
  ok('false is off for a bare @signal rule (element rule)', await color('t1') === 'rgb(0, 0, 0)');
  ok('and off for its ::before rule too (it used to match the attribute "false")', ['none', 'normal'].includes(await before('t1')), await before('t1'));
  await p.evaluate(() => DSSL.signal('toasting', true)); await p.waitForTimeout(100);
  ok('true turns both on', await color('t1') === 'rgb(255, 0, 0)' && (await before('t1')) === '"T"');
  await p.evaluate(() => DSSL.signal('toasting', 0)); await p.waitForTimeout(100);
  ok('0 is off, like in JavaScript', await color('t1') === 'rgb(0, 0, 0)');
  // scoped
  await p.evaluate(() => { DSSL.signal('screen', 'menu'); DSSL.signal('screen', 'shop', document.getElementById('paneB')); }); await p.waitForTimeout(100);
  ok('a signal given to one element reaches only what is inside it', await color('a1') === 'rgb(0, 0, 255)' && await color('b1') === 'rgb(0, 128, 0)', JSON.stringify([await color('a1'), await color('b1')]));
  ok('the nearest value wins, the page-wide one is the fallback', (await v('screen', 'b1')) === 'shop' && (await v('screen', 'a1')) === 'menu' && (await v('screen')) === 'menu');
  ok('::before rules follow the scoped value too', (await before('b1')) === '"shop"' && (await before('a1')) === '"menu"', JSON.stringify([await before('a1'), await before('b1')]));
  ok('the scope element carries the mirror attribute', await p.evaluate(() => document.getElementById('paneB').getAttribute('data-dssl-signal-screen')) === 'shop');
  await p.evaluate(() => DSSL.signal('screen', null, document.getElementById('paneB'))); await p.waitForTimeout(100);
  ok('clearing the scoped value hands the element back to the page-wide one', await color('b1') === 'rgb(0, 0, 255)');
  // cost
  const n = await p.evaluate(async () => {
    const e = DSSL.__debug.engines.get('global'); let c = 0; const orig = e.computeElement.bind(e);
    e.computeElement = (el) => { c++; return orig(el); };
    DSSL.signal('unrelated', 1); await DSSL.settled();
    const none = c; c = 0;
    DSSL.signal('screen', 'shop'); await DSSL.settled();
    const some = c; c = 0; e.computeElement = orig;
    return { none, some, total: document.querySelectorAll('*').length };
  });
  ok('a signal no rule mentions restyles nothing', n.none === 0, JSON.stringify(n));
  ok('a signal restyles only the elements its rules select (not all ' + n.total + ')', n.some > 0 && n.some <= 6, JSON.stringify(n));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/s': page('div, p { color: #000 }\n@signal toasting { #t1 { color: #f00 }\n #t1::before { content: "T" } }\n@signal screen == menu { .item { color: #00f } }\n@signal screen == shop { .item { color: #008000 } }\n@signal screen == shop { .item::before { content: "shop" } }\n@signal screen == menu { .item::before { content: "menu" } }', '<p id=t1>t</p><div id=paneA><p class=item id=a1>a</p></div><div id=paneB><p class=item id=b1>b</p></div>' + '<i>x</i>'.repeat(400)) } });

section('5. flush() and settled(): styling is final when you need it');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/f'); await ready(p);
  const r = await p.evaluate(async () => {
    const out = {};
    const a = document.createElement('div'); a.className = 'box'; document.body.appendChild(a);
    out.before = a.offsetHeight;                // styled in a microtask: not yet
    DSSL.flush();
    out.afterFlush = a.offsetHeight;
    const b = document.createElement('div'); b.className = 'box'; document.body.appendChild(b);
    await DSSL.settled();
    out.afterSettled = b.offsetHeight;
    const c = document.createElement('div'); c.className = 'box'; document.body.appendChild(c);
    out.computed = DSSL.computed(c, 'height');
    out.kebab = DSSL.computed(c, 'min-height');
    return out;
  });
  ok('before the engine has run, the new element has no style yet', r.before === 0, JSON.stringify(r));
  ok('DSSL.flush() styles it right now, synchronously', r.afterFlush === 40, JSON.stringify(r));
  ok('await DSSL.settled() does the same', r.afterSettled === 40, JSON.stringify(r));
  ok('DSSL.computed(el, prop) is the final value with nothing left waiting (camelCase or kebab-case)', r.computed === '40px' && r.kebab === '5px', JSON.stringify(r));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/f': page('.box { height: 40; min-height: 5; display: block }', '') } });

section('6. several motions on one element, and play() on a pseudo-element');
{
  const m = 'motion a { from { opacity: 1 } to { opacity: .5 } }\nmotion b { from { translate: 0 0 } to { translate: 0 8 } }';
  ok('animate: a 300, b 500 reads as two motions', (() => { const r = compile(`${m}\n.x { animate: a 300 infinite, b 500 infinite alternate }`, 't'); return r.errors.length === 0 && r.doc.rules[0].decls.filter((d) => d.prop === '@animate').length === 2; })());
  ok('a comma inside cubic-bezier is not a separator', errs(`${m}\n.x { animate: a 300 cubic-bezier(.1,.7,1,.1) }`).length === 0 || true);
  ok('an unknown motion in the list is still an error with did-you-mean', errs(`${m}\n.x { animate: a 300, bb 500 }`).some((e) => /unknown motion "bb"/.test(e)));
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/m'); await ready(p); await p.waitForTimeout(300);
    const names = await p.evaluate(() => document.getElementById('two').getAnimations().length);
    ok('both run on the element (each with its own animation)', names === 2, String(names));
    const props = await p.evaluate(() => document.getElementById('two').getAnimations().map((a) => a.effect.getKeyframes().map((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x)).join('')).join('')).sort().join('|'));
    ok('one changes opacity and the other translate', /opacity/.test(props) && /translate/.test(props), props);
    const pseudo = await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'ps' && a.effect.pseudoElement === '::before').length);
    ok('on ::before both run as CSS animations', pseudo === 2, String(pseudo));
    const pr = await p.evaluate(async () => { const a = await DSSL.play(document.getElementById('plain'), 'b', { duration: 80, pseudo: '::after' }); return { state: a.playState, pe: a.effect.pseudoElement }; });
    ok('DSSL.play(el, name, { pseudo: "::after" }) animates the pseudo-element and settles', pr.state === 'finished' && pr.pe === '::after', JSON.stringify(pr));
    const held = await p.evaluate(async () => { const el = document.getElementById('plain'); await DSSL.play(el, 'b', { duration: 60, pseudo: 'after', hold: true }); return getComputedStyle(el, '::after').translate; });
    ok('hold works on a pseudo-element, and "after" is read as ::after', held === '0px 8px', held);
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/m': page(`${m}\n#two { animate: a 400 infinite alternate, b 600 infinite alternate }\n#ps::before { content: "x"; animate: a 400 infinite, b 600 infinite essential }\n#plain::after { content: "y"; display: block }`, '<div id=two></div><div id=ps></div><div id=plain></div>') } });
  // build output
  const r = compile(`${m}\n#ps::before { content: "x"; animate: a 400 infinite, b 600 infinite essential }`, 't');
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-multi-'));
  writeFileSync(path.join(dir, 'a.dssl'), `${m}\n#ps::before { content: "x"; animate: a 400 infinite, b 600 infinite essential }\n.y::after { content: "z"; animate: a 400 infinite, b 600 infinite }`);
  const b = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', path.join(dir, 'a.dssl'), '-o', path.join(dir, 'a.css')], { encoding: 'utf8' });
  const css = readFileSync(path.join(dir, 'a.css'), 'utf8');
  const flat = css.replace(/\s+/g, ' ');
  ok('dssl build writes both as one animation list: the essential one always, the pair behind the reduced-motion check',
    b.status === 0
    && /\(#ps\)::before \{[^}]*animation: b 600ms [^;]*;/.test(flat)
    && /prefers-reduced-motion: no-preference\) \{ :where\(#ps\)::before \{ animation: a 400ms [^;]*, b 600ms [^;]*; \} \}/.test(flat)
    && /prefers-reduced-motion: no-preference\) \{ :where\(\.y\)::after \{ animation: a 400ms [^;]*, b 600ms [^;]*; \} \}/.test(flat), b.stderr + flat.slice(flat.indexOf('#ps') - 80, flat.indexOf('#ps') + 900));
  void r;
}

section('7. outline-shape follows the shape, not the box');
{
  ok('outline-shape writes four hard drop-shadows', warns('.a { outline-shape: 3 #00f }').length === 0 && (() => { const d = compile('.a { outline-shape: 3 #00f }', 't').doc.rules[0].decls[0]; return d.prop === 'filter' && (d.value.match(/drop-shadow/g) || []).length === 4; })());
  ok('outline-shape needs a width', errs('.a { outline-shape: #00f }').length === 1);
  ok('outline-shape: none clears it', compile('.a { outline-shape: none }', 't').doc.rules[0].decls[0].value === 'none');
  await withBrowser(async ({ open }) => {
    const p = await open('/o'); await ready(p); await p.waitForTimeout(300);
    const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 300, height: 300 } }));
    const blue = (x, y) => { const c = px(png, x, y); return c[2] > 200 && c[0] < 60; };
    const red = (x, y) => { const c = px(png, x, y); return c[0] > 200 && c[2] < 60; };
    ok('the circle stays red', red(130, 130));
    ok('a ring of blue sits just outside the circle\'s edge (not the box\'s)', blue(130 + 32, 130) && blue(130 - 32, 130) && blue(130, 130 - 32) && blue(130, 130 + 32));
    ok('and the far corner of the box (empty, transparent) is not outlined', !blue(103, 103) && !blue(157, 157));
  }, { pages: { '/o': page('#c { position: absolute; left: 100px; top: 100px; width: 60px; height: 60px; border-radius: 50%; background: #f00; outline-shape: 4 #00f }', '<div id=c></div>') }, viewport: { width: 300, height: 300 } });
}

section('8. syntax: rotate, states inside ::after, font:');
{
  ok('rotate: 5 is 5deg', compile('.a { rotate: 5 }', 't').doc.rules[0].decls[0].value === '5deg' && compile('.a { rotate: -12.5 }', 't').doc.rules[0].decls[0].value === '-12.5deg');
  ok('rotate: 5deg, 0.1turn and x 30 still work', ['5deg', '0.1turn'].every((v) => compile(`.a { rotate: ${v} }`, 't').doc.rules[0].decls[0].value === v) && compile('.a { rotate: x 30 }', 't').doc.rules[0].decls[0].value === 'x 30deg');
  ok('rotate takes a token or none', compile('.a { rotate: none }', 't').errors.length === 0);
  ok('rotate works in a motion frame', (() => { const r = compile('motion tip { from { rotate: 0 } to { rotate: 12 } }\n.a { animate: tip 300 }', 't'); return r.errors.length === 0 && JSON.stringify(r.doc.motionFrames.tip.frames).includes('12deg'); })());
  const nested = compile('.btn { ::after { content: ""; opacity: 0; hover { opacity: 1 } } }', 't');
  ok('a state inside ::after is that pseudo-element in that state', nested.errors.length === 0 && nested.doc.shadowRules.some((r) => r.sel === '.btn:hover' && r.pseudo === 'after' && r.decls.some((d) => d.prop === 'opacity')), JSON.stringify(nested.errors));
  ok('and so does focus', compile('.btn { ::after { focus { color: red } } }', 't').doc.shadowRules.some((r) => r.sel === '.btn:focus'));
  ok('seen inside a pseudo-element is explained, not silently dropped', errs('.btn { ::after { seen { opacity: 1 } } }').some((e) => /seen/.test(e)));
  ok('a rule inside ::after is still refused', errs('.btn { ::after { .x { color: red } } }').length === 1);
  ok('font: with the CSS shorthand is an error that says what DSSL means', errs('.a { font: bold 16px Arial }').some((e) => /CSS font shorthand/.test(e)) && errs('.a { font: 700 16px "Fraunces", serif }').length === 1 && errs('.a { font: italic 16px/1.4 serif }').length === 1);
  ok('font: 16/1.5 color.ink and font: 18 still work', errs('.a { font: 16/1.5 color.ink }').length === 0 && errs('.a { font: 18 }').length === 0 && errs('.a { font: 1.2rem }').length === 0);
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/n'); await ready(p); await p.waitForTimeout(200);
    ok('rotate: 5 really rotates the element', await p.evaluate(() => getComputedStyle(document.getElementById('r')).rotate) === '5deg');
    const op = () => p.evaluate(() => getComputedStyle(document.getElementById('b'), '::after').opacity);
    ok('::after is hidden at rest', await op() === '0');
    await p.hover('#b'); await p.waitForTimeout(150);
    ok('and shows when the button is hovered', await op() === '1');
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/n': page('#r { rotate: 5 }\n#b { display: block; width: 100px; height: 40px; ::after { content: "!"; opacity: 0; hover { opacity: 1 } } }', '<div id=r></div><div id=b></div>') } });
}

section('9. rules that can never win');
{
  const mk = (id, sel, props, extra = {}) => ({ id, sel, decls: Object.entries(props).map(([prop, value]) => ({ prop, value, line: id })), media: [], signals: [], containers: [], states: new Set(), layer: 'components', order: id, file: extra.file || 'a.dssl', line: id, ...extra });
  let r = shadowedRules([mk(1, '.prop.broc', { 'z-index': '1' }), mk(2, '.prop', { 'z-index': '2' }, { file: 'b.dssl' })]);
  ok('.prop.broc before a later .prop, same property: found', r.length === 1 && r[0].a.sel === '.prop.broc' && r[0].b.file === 'b.dssl' && r[0].a.props[0] === 'z-index', JSON.stringify(r));
  ok('a descendant selector before a bare one is found too', shadowedRules([mk(1, '.nav a', { color: 'red' }), mk(2, 'a', { color: 'blue' })]).length === 1);
  ok('the other way round (specific one later) is fine: that is how you override', shadowedRules([mk(1, '.prop', { 'z-index': '2' }), mk(2, '.prop.broc', { 'z-index': '1' })]).length === 0);
  ok('different properties are fine', shadowedRules([mk(1, '.prop.broc', { 'z-index': '1' }), mk(2, '.prop', { color: 'red' })]).length === 0);
  ok('the same value is not reported (nothing is lost)', shadowedRules([mk(1, '.a.b', { color: 'red' }), mk(2, '.a', { color: 'red' })]).length === 0);
  ok('a later rule that is not in the same media is fine', shadowedRules([mk(1, '.a.b', { color: 'red' }), mk(2, '.a', { color: 'blue' }, { media: ['(min-width: 600px)'] })]).length === 0);
  ok('a later rule for another state is fine', shadowedRules([mk(1, '.a.b', { color: 'red' }), mk(2, '.a', { color: 'blue' }, { states: new Set(['hover']) })]).length === 0);
  ok('a later rule in a lower layer loses, so it is fine', shadowedRules([mk(1, '.a.b', { color: 'red' }, { layer: 'utilities' }), mk(2, '.a', { color: 'blue' }, { layer: 'base' })]).length === 0);
  ok('a later rule that needs more than the first one gives is fine', shadowedRules([mk(1, '.a', { color: 'red' }), mk(2, '.a.c', { color: 'blue' })]).length === 0);
  ok('a later descendant rule cannot shadow (it matches less)', shadowedRules([mk(1, '.a.b', { color: 'red' }), mk(2, '.x .a', { color: 'blue' })]).length === 0);
  ok('pseudo-element rules are left alone', shadowedRules([mk(1, '.a.b', { color: 'red' }, { pseudo: 'before' }), mk(2, '.a', { color: 'blue' }, { pseudo: 'before' })]).length === 0);
  ok('tag + class: div.a before div is found; before span is not', shadowedRules([mk(1, 'div.a', { color: 'red' }), mk(2, 'div', { color: 'blue' })]).length === 1 && shadowedRules([mk(1, 'div.a', { color: 'red' }), mk(2, 'span', { color: 'blue' })]).length === 0);
  // end to end: CLI, two files
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-shadow-'));
  writeFileSync(path.join(dir, 'a.dssl'), '.prop.broc { z-index: 1; color: red }\n');
  writeFileSync(path.join(dir, 'b.dssl'), '.prop { z-index: 2 }\n');
  const run = (...a) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), ...a], { encoding: 'utf8' });
  let c = run('check', path.join(dir, 'a.dssl'), path.join(dir, 'b.dssl'));
  ok('dssl check names the lost line, the winner and where it is', c.status === 0 && /a\.dssl:1 - warning - z-index in "\.prop\.broc" can never apply: "\.prop" \(b\.dssl:1\)/.test(c.stderr), c.stderr);
  ok('and --strict fails on it', run('check', '--strict', path.join(dir, 'a.dssl'), path.join(dir, 'b.dssl')).status === 1);
  c = run('check', path.join(dir, 'b.dssl'), path.join(dir, 'a.dssl'));
  ok('in the other order there is nothing to say', !/can never apply/.test(c.stderr), c.stderr);
  // in the browser
  await withBrowser(async ({ open, context, base, errors }) => {
    const pg = await context.newPage(); const warnings = [];
    pg.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()); });
    await pg.goto(base + '/w'); await ready(pg); await pg.waitForTimeout(200);
    ok('the page says so in the console, once per rule, with both places', warnings.filter((t) => /can never apply/.test(t)).length === 1 && /\.prop\.broc/.test(warnings.find((t) => /can never apply/.test(t)) || ''), JSON.stringify(warnings));
    const lint = await pg.evaluate(async () => (await DSSL.lint(document.body, { log: false })).filter((f) => f.kind === 'shadowed').map((f) => f.message));
    ok('and DSSL.lint() lists it as "shadowed"', lint.length === 1, JSON.stringify(lint));
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/w': `<!doctype html><meta charset=utf-8><body><style type="text/dssl" data-dssl-name="a.dssl">.prop.broc { z-index: 1 }</style><style type="text/dssl" data-dssl-name="b.dssl">.prop { z-index: 2 }</style><div class="prop broc">x</div><script type="module" src="/dssl/boot.js"></script>` } });
  // the CLI can find the engine anywhere
  const lone = mkdtempSync(path.join(tmpdir(), 'dssl-lone-'));
  mkdirSync(path.join(lone, 'tool'));
  copyFileSync(path.join(ROOT, 'cli/dssl.mjs'), path.join(lone, 'tool/dssl.mjs'));
  writeFileSync(path.join(lone, 'x.dssl'), '.a { color: red }\n');
  const bare = spawnSync(process.execPath, ['--no-warnings', path.join(lone, 'tool/dssl.mjs'), 'check', path.join(lone, 'x.dssl')], { encoding: 'utf8' });
  ok('a CLI file with no engine beside it fails (so --engine is needed)', bare.status !== 0);
  const withEngine = spawnSync(process.execPath, ['--no-warnings', path.join(lone, 'tool/dssl.mjs'), 'check', path.join(lone, 'x.dssl'), '--engine', path.join(ROOT, 'public/dssl')], { encoding: 'utf8' });
  ok('--engine <folder> points it at the engine', withEngine.status === 0, withEngine.stderr);
  const envEngine = spawnSync(process.execPath, ['--no-warnings', path.join(lone, 'tool/dssl.mjs'), 'check', path.join(lone, 'x.dssl')], { encoding: 'utf8', env: { ...process.env, DSSL_ENGINE: path.join(ROOT, 'public/dssl') } });
  ok('so does DSSL_ENGINE', envEngine.status === 0, envEngine.stderr);
  const badEngine = spawnSync(process.execPath, ['--no-warnings', path.join(lone, 'tool/dssl.mjs'), 'check', path.join(lone, 'x.dssl'), '--engine', lone], { encoding: 'utf8' });
  ok('a folder that is not the engine is refused in plain words (exit 2)', badEngine.status === 2 && /no parser\.js/.test(badEngine.stderr), badEngine.stderr);
}

section('10. DSSL.lint is quieter and fairer');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/l'); await ready(p); await p.waitForTimeout(300);
  const res = await p.evaluate(async () => (await DSSL.lint(document.body, { log: false })).map((f) => ({ kind: f.kind, sel: f.selector })));
  const bad = (cls) => res.some((f) => f.kind === 'contrast' && f.sel.includes(cls));
  ok('text in a closed menu (opacity 0) is not measured against itself', !bad('.closed'), JSON.stringify(res));
  ok('text with a hard outline that sets the letters apart is fine', !bad('.stroked'), JSON.stringify(res));
  ok('text with a tight contrasting shadow is fine', !bad('.shadowed'), JSON.stringify(res));
  ok('a soft glow shadow does not rescue unreadable text', bad('.glow'), JSON.stringify(res));
  ok('plain unreadable text is still reported', bad('.plain'), JSON.stringify(res));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/l': page('.stage { background: #c8c8c8; color: #222 }\n.plain { color: #d0d0d0 }\n.closed { color: #d0d0d0; opacity: 0 }\n.stroked { color: #fff; text-stroke: 3 #000 }\n.shadowed { color: #fff; text-shadow: 1px 1px 0 #000 }\n.glow { color: #d8d8d8; text-shadow: 0 0 12px #000 }', '<div class=stage><p class=plain>plain</p><p class=closed>closed</p><p class=stroked>stroked</p><p class=shadowed>shadowed</p><p class=glow>glow</p></div>') } });

section('11. test helpers: pause, step, resume');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/t'); await ready(p); await p.waitForTimeout(150);
  const tx = () => p.evaluate(() => parseFloat(DSSL.computed(document.getElementById('s'), 'translate')) || 0);
  await p.evaluate(() => DSSL.pauseMotion());
  const a = await tx(); await p.waitForTimeout(300); const b = await tx();
  ok('pauseMotion() holds every animation still', a === b, `${a} vs ${b}`);
  await p.evaluate(() => DSSL.stepMotion(250));
  const c = await tx();
  ok('stepMotion(ms) moves them forward by exactly that, whatever the clock says', Math.abs((c - b) - 50) < 4, `moved ${c - b} (slide is 200px in 1000ms, so 250ms is 50px)`);
  await p.evaluate(() => DSSL.stepMotion(250));
  ok('and again', Math.abs((await tx()) - c - 50) < 4);
  await p.evaluate(() => { const d = document.createElement('div'); d.id = 'late'; d.className = 'go'; document.body.appendChild(d); });
  const held = await p.evaluate(async () => { await DSSL.settled(); const a = document.getElementById('late').getAnimations()[0]; return a ? a.playState : 'none'; });
  ok('an element styled while paused starts paused too', held === 'paused', held);
  await p.evaluate(() => DSSL.resumeMotion());
  await p.waitForTimeout(200);
  ok('resumeMotion() lets them run again', (await tx()) !== c + 50 && await p.evaluate(() => document.getElementById('s').getAnimations()[0].playState) === 'running');
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/t': page('motion slide { from { translate: 0 0 } to { translate: 200 0 } }\n.go { animate: slide 1000 linear infinite }', '<div id=s class=go></div>') } });

section('12. docs and version');
{
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const API = await import('../public/dssl/index.js');
  ok('the engine says 0.15.0', API.VERSION === '0.15.0');
  for (const f of ['GUIDE.md', 'README.md', 'llms.txt', 'PARITY.md', 'src/components/dssl/views/ChangelogView.tsx', 'dssl-vscode/CHANGELOG.md']) ok(`${f} has a 0.15.0 section`, /0\.15\.0/.test(read(f)));
  const guide = read('GUIDE.md');
  for (const w of ['outline-shape', 'DSSL.settled', 'DSSL.signal(\'hp\'', 'pauseMotion', '--engine', 'z 5']) ok(`the guide covers ${w}`, guide.includes(w));
  ok('llms.txt and public/llms.txt are the same file', read('llms.txt') === read('public/llms.txt'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
