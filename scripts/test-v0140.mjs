#!/usr/bin/env node
/* test-v0140.mjs: the fixes and features from a review by someone building a game on DSSL (0.14.0).
 * Every item they listed has an assertion here, run against real Chrome where the browser decides the answer. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compile } from '../public/dssl/index.js';
import * as API from '../public/dssl/index.js';
import { withBrowser, ROOT } from './lib/browser-harness.mjs';
import { decodePng, px, dist } from './lib/pixels.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const page = (dssl, body = '', head = '') => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000;height:3000px">${head}<style type="text/dssl">${dssl}</style>${body}<script type="module" src="/dssl/boot.js"></script>`;
const ready = (p) => p.waitForFunction(`window.DSSL && DSSL.__debug.engines.get('global') && document.documentElement.classList.contains('dssl-ready')`);
const eng = `DSSL.__debug.engines.get('global')`;
const errs = (src) => compile(src, 't.dssl').errors.map((e) => e.message);
const warns = (src) => compile(src, 't.dssl').warnings.map((w) => w.message);

section('1. reduced motion is never silent');
{
  const MOTION = 'motion bob { from { translate: 0 0 } to { translate: 0 10px } }\nmotion boing { from { translate: 0 0 } to { translate: 0 10px } essential }';
  await withBrowser(async ({ open, errors }) => {
    const logs = []; const p = await open('/r'); p.on('console', (m) => logs.push(m.text()));
    await ready(p); await p.waitForTimeout(400);
    ok('with reduced motion on, a plain animate: does not run', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'plain').length) === 0);
    ok('a motion marked essential does', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'ess').length) === 1);
    ok('so does one marked essential on the animate: line', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'line').length) === 1);
    const told = await p.evaluate(() => 0); void told;
    await p.evaluate(() => DSSL.refresh()); await p.waitForTimeout(100);
    // the notice came when the engine skipped it, before the listener above was attached: reload and listen from the start
    const q = await open('/r'); const l2 = []; q.on('console', (m) => l2.push(m.text())); await q.reload(); await ready(q); await q.waitForTimeout(300);
    ok('and it SAYS so, once, in plain words, with the way out', l2.filter((t) => /reduced motion/.test(t)).length === 1 && /essential/.test(l2.find((t) => /reduced motion/.test(t)) || '') && /data-dssl-motion/.test(l2.find((t) => /reduced motion/.test(t)) || ''), JSON.stringify(l2));
    await p.evaluate(() => DSSL.motion('full')); await p.waitForTimeout(300);
    ok('DSSL.motion("full") runs every motion whatever the system asks for', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'plain').length) === 1);
    await p.evaluate(() => DSSL.motion('reduced')); await p.waitForTimeout(300);
    ok('"reduced" holds the plain ones still again', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'plain').length) === 0);
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/r': page(`${MOTION}\n#plain { animate: bob 800 infinite alternate }\n#ess { animate: boing 800 infinite alternate }\n#line { animate: bob 800 infinite alternate essential }`, '<div id=plain></div><div id=ess></div><div id=line></div>') }, reducedMotion: 'reduce' });
  await withBrowser(async ({ open }) => {
    const p = await open('/f'); await ready(p); await p.waitForTimeout(300);
    ok('<html data-dssl-motion="full"> in the markup overrides the system from the first frame', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'plain').length) === 1);
  }, { pages: { '/f': page(`${MOTION}\n#plain { animate: bob 800 infinite alternate }`, '<div id=plain></div>').replace('<body', '<script>document.documentElement.setAttribute("data-dssl-motion","full")</script><body') }, reducedMotion: 'reduce' });
}

section('2. motion: words, registry, keyframes, play');
{
  const spec = (src) => compile(src, 't').doc.rules.map((r) => r.decls.find((d) => d.prop === '@animate')).filter(Boolean).map((d) => d.value)[0];
  const s = spec('motion w { from { opacity: 0 } to { opacity: 1 } }\n.x { animate: w 300 delay 100 jitter 200 iterations 3 essential }');
  ok('animate: reads delay, jitter, iterations and essential', s.delay === 100 && s.jitter === 200 && s.iterations === 3 && s.essential === true, JSON.stringify(s));
  ok('a bare number after the duration is still the delay', spec('motion w { from { opacity: 0 } to { opacity: 1 } }\n.x { animate: w 300 250 }').delay === 250);
  ok('delay without a number is an error that shows the form', errs('motion w { from { opacity: 0 } to { opacity: 1 } }\n.x { animate: w 300 delay }').some((m) => /delay needs a number/.test(m)));
  const fr = compile('motion w { 0%, 100% { opacity: 1 } 40% { opacity: 0 } }', 't').doc.motionFrames.w.frames.map((f) => f.offset);
  ok('keyframes accept 0%, 40% and a list, next to from, to and at 40%', JSON.stringify(fr) === '[0,40,100]', JSON.stringify(fr));
  ok('a keyframe past 100% is refused', errs('motion w { 120% { opacity: 1 } }\n.x { animate: w 1 }').some((m) => /bad keyframe selector/.test(m)));
  const w = warns('motion w { from { opacity: 0 } to { opacity: 1 } }\n.y { animate: w 400; animation-delay: 200ms }');
  ok('animation-delay on a rule that uses animate: gets a warning that names the replacement', w.length === 1 && /does nothing here/.test(w[0]), JSON.stringify(w));
  ok('but not when the rule has a CSS animation to tune', warns('.y { animation: foo 400ms; animation-delay: 200ms }').filter((m) => /does nothing/.test(m)).length === 0);
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/m'); await ready(p); await p.waitForTimeout(300);
    ok('a motion defined in one stylesheet runs from another (shared registry)', await p.evaluate(() => document.getAnimations().filter((a) => a.effect.target.id === 'b').length) === 1);
    const e = await p.evaluate(() => DSSL.errors().map((x) => x.message));
    ok('with no unknown-motion error', !e.some((m) => /unknown motion/.test(m)), JSON.stringify(e));
    ok('the pseudo-element animation really runs (a CSS animation, in the engine\'s stylesheet)', await p.evaluate(() => document.getAnimations().some((a) => a.effect.target.id === 'c' && a.effect.pseudoElement === '::before')));
    ok('every motion is also a real @keyframes, so animation: bob 300ms works too', await p.evaluate(() => document.getAnimations().some((a) => a.effect.target.id === 'css' && a.animationName === 'bob')));
    // play()
    const t0 = Date.now();
    const r = await p.evaluate(async () => { const el = document.getElementById('c'); const a = await DSSL.play(el, 'bob', { duration: 120 }); return { state: a.playState, id: a.effect.target.id }; });
    ok('DSSL.play returns a promise that settles when the motion ends', r.state === 'finished' && r.id === 'c' && Date.now() - t0 >= 100, JSON.stringify(r));
    const held = await p.evaluate(async () => { const el = document.getElementById('c'); await DSSL.play(el, 'bob', { duration: 80, hold: true }); return getComputedStyle(el).translate; });
    ok('hold: true keeps the final frame', held === '0px 10px', held);
    const unheld = await p.evaluate(async () => { const el = document.body.appendChild(document.createElement('div')); await DSSL.play(el, 'bob', { duration: 80 }); return getComputedStyle(el).translate; });
    ok('without it the element snaps back', unheld === 'none' || unheld === '0px', unheld);
    const bad = await p.evaluate(async () => { try { await DSSL.play(document.body, 'bobb'); return 'resolved'; } catch (e) { return e.message; } });
    ok('an unknown motion rejects, with did-you-mean', /unknown motion "bobb"/.test(bad) && /did you mean "bob"/.test(bad), bad);
    const cancelled = await p.evaluate(async () => { const el = document.getElementById('c'); const pr = DSSL.play(el, 'bob', { duration: 5000 }); el.getAnimations().forEach((a) => a.cancel()); const a = await pr; return a.playState; });
    ok('a cancelled animation settles the promise too, so awaiting never hangs', cancelled === 'idle');
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/m': `<!doctype html><meta charset=utf-8><body style="margin:0"><style type="text/dssl" data-dssl-name="a.dssl">motion bob { from { translate: 0 0 } to { translate: 0 10px } }</style><style type="text/dssl" data-dssl-name="b.dssl">#b { animate: bob 800 infinite alternate }\n#c::before { content: "x"; animate: bob 800 infinite alternate }\n#css { animation: bob 800ms infinite alternate }</style><div id=b></div><div id=c></div><div id=css></div><script type="module" src="/dssl/boot.js"></script>` }, reducedMotion: 'no-preference' });
  await withBrowser(async ({ open }) => {
    const p = await open('/j'); await ready(p); await p.waitForTimeout(300);
    const delays = await p.evaluate(() => [...document.getAnimations()].map((a) => a.effect.getTiming().delay));
    ok('jitter gives every element its own delay (not one shared value)', new Set(delays).size > 3 && delays.every((d) => d >= 0 && d <= 600), JSON.stringify(delays));
    await p.reload(); await ready(p); await p.waitForTimeout(300);
    const again = await p.evaluate(() => [...document.getAnimations()].map((a) => a.effect.getTiming().delay));
    ok('and the same page gets the same delays every time', JSON.stringify(delays) === JSON.stringify(again));
  }, { pages: { '/j': page('motion bob { from { translate: 0 0 } to { translate: 0 10px } }\n.coin { animate: bob 800 infinite alternate jitter 600 }', Array.from({ length: 8 }, () => '<i class="coin"></i>').join('')) } });
}

section('3. values and gradients');
{
  const decls = (src) => { const r = compile(src, 't'); return { e: r.errors.map((x) => x.message), d: r.doc.rules.flatMap((x) => x.decls.filter((y) => !y.prop.startsWith('--')).map((y) => `${y.prop}: ${y.value}`)) }; };
  let r = decls('tokens { shadow { pop: 0 4 0 #000 } radius { pill: 99 } }\n.a { shadow: pop; radius: pill }');
  ok('shadow: pop and radius: pill work for your own tokens', r.e.length === 0 && r.d.includes('box-shadow: var(--dssl-shadow-pop)') && r.d.includes('border-radius: var(--dssl-radius-pill)'), JSON.stringify(r));
  ok('and the built-in names still do', decls('.a { shadow: sm; radius: lg }').d.join().includes('--dssl-shadow-sm'));
  ok('a name that is not a token is still an error, not a CSS keyword guess', decls('.a { shadow: nothing }').e.length === 1);
  r = decls('.a { paint-order: stroke fill; background: conic-gradient(from 0deg, red, blue) }');
  ok('paint-order: stroke fill and conic-gradient(from 0deg, ...) are accepted', r.e.length === 0, JSON.stringify(r.e));
  r = decls('.a { text-stroke: 6 color.ink }');
  ok('text-stroke writes the outline and paint-order', r.e.length === 0 && r.d.some((x) => /^-webkit-text-stroke: 6px /.test(x)) && r.d.includes('paint-order: stroke fill'), JSON.stringify(r));
  ok('text-stroke inside keeps a centred stroke; none clears it', !decls('.a { text-stroke: 2 #fff inside }').d.includes('paint-order: stroke fill') && decls('.a { text-stroke: none }').d.includes('-webkit-text-stroke: 0'));
  ok('text-stroke needs a width', decls('.a { text-stroke: color.ink }').e.length === 1);
  r = decls('.t { gradient: linear 180, #e33 -> #a11 + radial-gradient(circle, #fff4 20%, transparent 21%) tile 24 offset 4 4 no-repeat }');
  ok('gradient: layers a sentence and a plain CSS gradient, with tile, offset and no-repeat for the second', r.e.length === 0 && r.d[0].startsWith('background-image: linear-gradient(180deg, #e33, #a11), radial-gradient(circle') && r.d.includes('background-size: auto, 24px 24px') && r.d.includes('background-position: 0 0, 4px 4px') && r.d.includes('background-repeat: repeat, no-repeat'), JSON.stringify(r));
  ok('a layer with no tile leaves size alone', !decls('.t { gradient: linear 90, #f00 -> #00f }').d.some((x) => /background-size/.test(x)));
  const w = warns('.u { gradient: linear 90, #f00 -> #00f; background-image: radial-gradient(red, blue) }');
  ok('gradient: and background-image: in one rule is a warning that says how to layer', w.length === 1 && /sets the background image twice/.test(w[0]), JSON.stringify(w));
  ok('gradient: then a background shorthand with an image warns too', warns('.u { gradient: linear 90, #f00 -> #00f; background: url(x.png) }').some((m) => /twice/.test(m)));
  ok('a rule with just one of them does not', warns('.u { gradient: linear 90, #f00 -> #00f; background-color: #fff }').length === 0);
}

section('4. your inline styles win');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/i'); await ready(p); await p.waitForTimeout(300);
  const get = (sel, prop) => p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s))[pr], [sel, prop]);
  ok('a style="" attribute beats a rule that sets the same property', await get('#attr', 'left') === '33px');
  ok('and the rule still sets what the attribute did not say', await get('#attr', 'top') === '5px');
  await p.evaluate(() => { document.querySelector('#js').style.left = '71px'; DSSL.refresh(); });
  await p.waitForTimeout(150);
  ok('a script that moves an element after the engine styled it keeps winning, even through a refresh', await get('#js', 'left') === '71px');
  ok('a margin-top written inline survives a rule\'s margin shorthand', await get('#short', 'marginTop') === '14px' && await get('#short', 'marginLeft') === '0px');
  await p.evaluate(() => { document.querySelector('#js').style.left = ''; DSSL.refresh(); });
  await p.waitForTimeout(150);
  ok('clearing it hands the property back to the rule', await get('#js', 'left') === '0px');
  const logs = await p.evaluate(() => window.__logs.join('|'));
  ok('no "folded border-color into border" noise', !/folded/.test(logs), logs);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/i': page('div { position: absolute }\n#attr { left: 0; top: 5px }\n#js { left: 0; top: 40px }\n#short { margin: 0 }\n#brd { border: 1 solid #fff; border-color: color.ink }\n#brd.on { border-color: red }', '<div id=attr style="left:33px"></div><div id=js></div><div id=short style="margin-top:14px;position:static"></div><div id=brd></div>', '<script>window.__logs=[];for (const k of ["log","info","warn"]) { const o=console[k]; console[k]=(...a)=>{window.__logs.push(a.join(" ")); o.apply(console,a)} }; addEventListener("load",()=>{ document.getElementById("brd").classList.toggle("on") })</script>') } });

section('5. static subtrees');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/s'); await ready(p);
  await p.evaluate(() => { const e = DSSL.__debug.engines.get('global'); window.__n = 0; const orig = e.touched.add.bind(e.touched); e.touched.add = (el) => { window.__n++; return orig(el); }; });
  await p.evaluate(() => { document.getElementById('live').classList.add('hot'); });
  await p.waitForTimeout(300);
  const liveN = await p.evaluate(() => window.__n);
  await p.evaluate(() => { window.__n = 0; });
  await p.evaluate(() => { DSSL.freeze(document.getElementById('world')); document.getElementById('world').classList.add('hot'); });
  await p.waitForTimeout(300);
  const staticN = await p.evaluate(() => window.__n);
  ok('toggling a class on a normal subtree restyles it (a lot of elements)', liveN > 200, String(liveN));
  ok('on a frozen subtree it restyles almost nothing (the root and no more)', staticN < 20, String(staticN));
  ok('and the frozen children keep the look they had', await p.evaluate(() => getComputedStyle(document.querySelector('#world i')).color) === 'rgb(255, 0, 0)');
  await p.evaluate(() => DSSL.refresh(document.getElementById('world'))); await p.waitForTimeout(150);
  ok('DSSL.refresh(el) restyles it on demand', await p.evaluate(() => getComputedStyle(document.querySelector('#world i')).color) === 'rgb(0, 128, 0)');
  await p.evaluate(() => { DSSL.unfreeze(document.getElementById('world')); document.getElementById('world').classList.remove('hot'); }); await p.waitForTimeout(250);
  ok('unfreeze(el) makes it live again', await p.evaluate(() => getComputedStyle(document.querySelector('#world i')).color) === 'rgb(255, 0, 0)');
  ok('DSSL.freeze() with no argument still parks the whole page', await p.evaluate(() => { const r = DSSL.freeze(); DSSL.unfreeze(); return r !== undefined; }));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/s': page('i { color: red }\n.hot i { color: green }', `<div id=world>${'<i>x</i>'.repeat(250)}</div><div id=live>${'<i>x</i>'.repeat(250)}</div>`) } });
await withBrowser(async ({ open }) => {
  const p = await open('/s2'); await ready(p);
  ok('data-dssl-static in the markup works from the first paint', await p.evaluate(() => { const e = DSSL.__debug.engines.get('global'); return e.staticSeen === true; }));
}, { pages: { '/s2': page('i { color: red }', '<div data-dssl-static><i>x</i></div>') } });

section('6. aura: clipped to its stage, scaled with it, and placed in the stack');
{
  const AURA = '.stage { position: absolute; left: 100px; top: 100px; width: 200px; height: 200px; overflow: hidden; background: #000 }\n.orb { position: absolute; left: 70px; top: 70px; width: 60px; height: 60px; background: #111; aura-glow: #ff0000 60 essential intensity 1 }';
  const redAt = (png, x, y) => px(png, x, y)[0] > 40 && px(png, x, y)[0] > px(png, x, y)[2] * 1.5;
  await withBrowser(async ({ open }) => {
    const p = await open('/a'); await ready(p); await p.waitForTimeout(900);
    const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 420, height: 420 } }));
    ok('the glow lights the area inside the stage', redAt(png, 100 + 70 - 10, 100 + 100), JSON.stringify(px(png, 160, 200)));
    ok('and is cut at the stage edge (overflow: hidden): nothing outside it', !redAt(png, 100 - 8, 200) && !redAt(png, 300 + 8, 200) && !redAt(png, 200, 100 - 8), JSON.stringify([px(png, 92, 200), px(png, 308, 200), px(png, 200, 92)]));
  }, { pages: { '/a': page(AURA, '<div class=stage><div class=orb></div></div>') }, viewport: { width: 420, height: 420 } });
  await withBrowser(async ({ open }) => {
    const p = await open('/a'); await ready(p); await p.waitForTimeout(900);
    const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 420, height: 420 } }));
    ok('with `unclipped` the light spills over the edge, as asked', redAt(png, 100 - 6, 100 + 100) || redAt(png, 100 - 6, 100 + 90) || redAt(png, 100 - 4, 100 + 100), JSON.stringify([px(png, 94, 200), px(png, 96, 200)]));
  }, { pages: { '/a': page(AURA.replace('essential intensity 1', 'essential unclipped'), '<div class=stage><div class=orb style="left:0;top:70px"></div></div>') }, viewport: { width: 420, height: 420 } });
  // scale: the same glow, on a stage drawn at twice the size, reaches about twice as far
  const reach = async (scale) => {
    let r = 0;
    await withBrowser(async ({ open }) => {
      const p = await open('/a'); await ready(p); await p.waitForTimeout(900);
      const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 800, height: 800 } }));
      const cx = 400, cy = 400;
      for (let d = 0; d < 380; d++) if (px(png, cx + d, cy)[0] > 12 && px(png, cx + d, cy)[0] > px(png, cx + d, cy)[2] * 1.3) r = d;
    }, { pages: { '/a': page(`.wrap { position: absolute; left: 400px; top: 400px; width: 0; height: 0; transform: scale(${scale}); transform-origin: 0 0 }\n.orb { position: absolute; left: -20px; top: -20px; width: 40px; height: 40px; background: #111; aura-glow: #ff0000 30 essential }`, '<div class=wrap><div class=orb></div></div>') }, viewport: { width: 800, height: 800 } });
    return r;
  };
  const r1 = await reach(1), r2 = await reach(2);
  ok('inside a transform: scale(2) stage the glow reaches about twice as far', r1 > 10 && r2 > r1 * 1.6 && r2 < r1 * 2.6, `scale 1 reaches ${r1}px, scale 2 reaches ${r2}px`);
  await withBrowser(async ({ open }) => {
    const p = await open('/z'); await ready(p); await p.waitForTimeout(500);
    ok('the canvas is above everything by default', await p.evaluate(() => getComputedStyle(document.querySelector('canvas[data-dssl-aura]')).zIndex) === '2147483000');
    await p.evaluate(() => DSSL.auraZ(20));
    ok('DSSL.auraZ(20) lowers it, so a menu with z-index above 20 covers the light', await p.evaluate(() => getComputedStyle(document.querySelector('canvas[data-dssl-aura]')).zIndex === '20' && document.documentElement.getAttribute('data-dssl-aura-z') === '20'));
    await p.evaluate(() => DSSL.auraZ(null));
    ok('and null puts it back', await p.evaluate(() => getComputedStyle(document.querySelector('canvas[data-dssl-aura]')).zIndex) === '2147483000');
  }, { pages: { '/z': page('.o { aura-glow: #f00 20 essential }', '<div class=o style="width:20px;height:20px"></div>') } });
  ok('`unclipped` is a known aura word, with a description', compile('.a { aura-glow: #f80 20 unclipped; aura-particle: #fd0 5 up unclipped }', 't').errors.length === 0);
}

section('7. signals: in, not in, !=');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/g'); await ready(p);
  const color = (id) => p.evaluate((i) => getComputedStyle(document.getElementById(i)).color, id);
  const pre = (id) => p.evaluate((i) => getComputedStyle(document.getElementById(i), '::before').content, id);
  await p.evaluate(() => DSSL.signal('screen', 'menu')); await p.waitForTimeout(150);
  ok('in (...) matches a listed value', await color('a') === 'rgb(255, 0, 0)');
  ok('not in (...) is false for a listed value', await color('b') === 'rgb(0, 0, 0)');
  await p.evaluate(() => DSSL.signal('screen', 'playing')); await p.waitForTimeout(150);
  ok('in (...) stops matching for another value', await color('a') === 'rgb(0, 0, 0)');
  ok('not in (...) matches it', await color('b') === 'rgb(0, 0, 255)');
  await p.evaluate(() => DSSL.signal('screen', 'shop')); await p.waitForTimeout(150);
  ok('the second listed value matches too', await color('a') === 'rgb(255, 0, 0)');
  ok('!= works on a pseudo-element rule (the shadow stylesheet gets the right selector)', await pre('c') === '"neq"');
  await p.evaluate(() => DSSL.signal('screen', 'menu')); await p.waitForTimeout(150);
  ok('and stops when equal', (await pre('c')) === 'none' || (await pre('c')) === 'normal');
  ok('an empty list is an error', errs('@signal screen in () { .a { color: red } }').length === 1);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/g': page('div { color: #000 }\n@signal screen in (menu, shop) { #a { color: #f00 } }\n@signal screen not in (menu, shop) { #b { color: #00f } }\n@signal screen != menu { #c::before { content: "neq" } }', '<div id=a>a</div><div id=b>b</div><div id=c>c</div>') } });

section('8. DSSL.lint(): what only a live page shows');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/l'); await ready(p); await p.waitForTimeout(300);
  const res = await p.evaluate(async () => (await DSSL.lint(document.body, { log: false })).map((f) => ({ kind: f.kind, sel: f.selector, ratio: f.ratio })));
  const contrast = res.filter((f) => f.kind === 'contrast');
  ok('cream text on a cream card (two rules, no warning from check) is found', contrast.some((f) => /\.card/.test(f.sel) || /\bp\b/.test(f.sel)) && contrast.every((f) => f.ratio < 4.5), JSON.stringify(res));
  ok('text that is readable is not reported', !contrast.some((f) => /\.fine/.test(f.sel)), JSON.stringify(contrast));
  ok('translucent backgrounds are composited: dark text on a 10% white wash over a dark page fails, light passes', contrast.some((f) => /\.wash-bad/.test(f.sel)) && !contrast.some((f) => /\.wash-ok/.test(f.sel)), JSON.stringify(contrast));
  ok('text over an image or gradient is not guessed at', !contrast.some((f) => /\.pic/.test(f.sel)));
  ok('large text gets the lower limit (3:1)', !contrast.some((f) => /\.big/.test(f.sel)), JSON.stringify(contrast));
  ok('an element the engine made into a grid is reported', res.some((f) => f.kind === 'promoted' && /\.promo/.test(f.sel)), JSON.stringify(res));
  ok('a flex box that says display is not', !res.some((f) => f.kind === 'promoted' && /\.flexy/.test(f.sel)));
  const quiet = await p.evaluate(async () => { const logs = []; const o = console.groupCollapsed; console.groupCollapsed = (...a) => logs.push(a.join(' ')); await DSSL.lint(document.body, { log: false }); console.groupCollapsed = o; return logs.length; });
  ok('{ log: false } stays quiet', quiet === 0);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/l': page('body { background: #14102a; color: #eee }\n.card { background: #f5efe0; padding: 10 }\n.fine { color: #222 }\n.wash-bad { background: #ffffff1a; color: #333 }\n.wash-ok { background: #ffffff1a; color: #fff }\n.pic { background-image: linear-gradient(red, blue); color: #801 }\n.big { color: #888; font-size: 30; background: #fff }\n.promo { place-items: center }\n.flexy { display: flex; place-items: center }', '<div class=card style="color:#f0e6d0"><p>cream on cream</p></div><div class=card><p class=fine>fine</p></div><div class=wash-bad>bad</div><div class=wash-ok>ok</div><div class=pic>pic</div><div class=big>BIG</div><div class=promo><span>p</span></div><div class=flexy>f</div>') } });

section('9. dssl check and build read the page');
{
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-page-'));
  mkdirSync(path.join(dir, 'css'));
  writeFileSync(path.join(dir, 'css/a.dssl'), 'tokens { color { c: #123456 } }\nmotion pop { from { opacity: 0 } to { opacity: 1 } }\n');
  writeFileSync(path.join(dir, 'css/b.dssl'), '.x { color: color.c; animate: pop 300 }\n');
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><link rel="stylesheet/dssl" href="css/a.dssl"><link rel="stylesheet/dssl" href="/css/b.dssl"><style type="text/dssl">.y { opacity: .5 }</style><link rel="stylesheet" href="x.css">');
  const run = (...a) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), ...a], { encoding: 'utf8' });
  let r = run('check', path.join(dir, 'index.html'));
  ok('check index.html finds three stylesheets in page order and they pass (a token and a motion from the first file, used in the second)', r.status === 0, r.stderr + r.stdout);
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><link rel="stylesheet/dssl" href="css/b.dssl"><link rel="stylesheet/dssl" href="css/a.dssl">');
  r = run('check', path.join(dir, 'index.html'));
  ok('in the WRONG order it fails, as the browser would (the page order is what counts)', r.status === 1 && /unknown/.test(r.stderr), r.stderr);
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><link rel="stylesheet/dssl" href="css/a.dssl"><link rel="stylesheet/dssl" href="css/b.dssl"><style type="text/dssl">.y { opacity: .5 }</style>');
  r = run('build', path.join(dir, 'index.html'), '-o', path.join(dir, 'out.css'));
  ok('build index.html compiles them together', r.status === 0 && /--dssl-color-c: #123456/.test(readFileSync(path.join(dir, 'out.css'), 'utf8')) && /@keyframes pop/.test(readFileSync(path.join(dir, 'out.css'), 'utf8')), r.stderr);
  writeFileSync(path.join(dir, 'empty.html'), '<!doctype html><p>none</p>');
  r = run('check', path.join(dir, 'empty.html'));
  ok('a page with no DSSL says so (exit 2)', r.status === 2 && /no <link rel="stylesheet\/dssl">/.test(r.stderr), r.stderr);
  writeFileSync(path.join(dir, 'missing.html'), '<link rel="stylesheet/dssl" href="nope.dssl">');
  r = run('check', path.join(dir, 'missing.html'));
  ok('a link to a file that is not there is reported with where it looked', r.status === 2 && /not on disk/.test(r.stderr), r.stderr);
}

section('10. the docs match the code');
{
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const V = API.VERSION;
  const guide = read('GUIDE.md'), readme = read('README.md'), llms = read('llms.txt'), usage = read('engine-package/USAGE.md');
  ok('llms.txt names the engine version', new RegExp(`Version: ${V.replace(/\./g, '\\.')} \\(engine\\)`).test(llms), llms.match(/Version: [\d.]+/)?.[0]);
  ok('the guide\'s API block shows the real version, and calls it a string', guide.includes(`DSSL.version                          // "${V}"`), guide.match(/DSSL\.version.*/)?.[0]);
  ok('the README\'s API block does too', readme.includes(`DSSL.version                           // "${V}"`));
  ok('README sections say the current version, not an old one', readme.includes(`What works today (v${V})`) && readme.includes(`v${V}, experimental`));
  ok('llms.txt and public/llms.txt are the same file', llms === read('public/llms.txt'));
  const keys = Object.keys(API.DSSL).filter((k) => !k.startsWith('__'));
  for (const [label, text] of [['the guide', guide], ['the README', readme], ['USAGE.md', usage], ['llms.txt', llms]]) {
    const missing = keys.filter((k) => !new RegExp(`DSSL\\.${k}\\b|\\b${k}\\(`).test(text));
    ok(`${label} documents every function on DSSL (${keys.length})`, missing.length === 0, 'missing: ' + missing.join(', '));
  }
  ok('DSSL.errors is documented as a function and DSSL.version as a string', /DSSL\.errors\(\)/.test(usage) && /DSSL\.version`? .*string|a string/.test(usage));
  ok('the guide does not call version() a function', !/DSSL\.version\(\)/.test(guide));
  const files = readdirSync(path.join(ROOT, 'public/dssl')).filter((f) => f.endsWith('.js'));
  const table = guide.split('\n').find((l) => l.startsWith('| `public/dssl/`')) || '';
  ok(`the guide's engine file table names all ${files.length} modules, so it cannot say "six" again`, files.every((f) => table.includes('`' + f + '`')), files.filter((f) => !table.includes('`' + f + '`')).join(', '));
  ok('the docs site does not say the engine is two files', !/engine is two static files/.test(read('src/components/dssl/views/DocsView.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
