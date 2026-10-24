#!/usr/bin/env node
/* test-browser-v090.mjs: the 0.9.0 features in a real browser.
 *
 * Aura draws on a canvas, textures are SVG filters, and a slider is vendor
 * pseudo-elements, so none of it can be checked in Node. This drives headless
 * Chrome and looks at what was actually drawn. It is written to break things:
 * removal, hidden elements, off-screen elements, freeze, reduced motion, state
 * changes, token changes, resize, device pixel ratio, and a stress load.
 *
 *   node scripts/test-browser-v090.mjs
 */
import { withBrowser } from './lib/browser-harness.mjs';
import { decodePng, px, dist, stats } from './lib/pixels.mjs';
import { galleryPage } from './texture-gallery.mjs';
import { PRESET_NAMES } from '../public/dssl/texture.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); }
};
const section = (t) => console.log(`\n== ${t}`);

/** a page with the engine, a dark body and the given DSSL + markup */
const page = (dssl, body, bg = '#000') => `<!doctype html><meta charset=utf-8>
<body style="margin:0;background:${bg};height:4000px;overflow-x:hidden">
<style type="text/dssl">${dssl}</style>${body}
<script type="module" src="/dssl/boot.js"></script>`;

const engine = `DSSL.__debug.engines.get('global')`;
const dbg = (p) => p.evaluate(`(() => { const e = ${engine}; return e && e.aura ? e.aura.debug() : null; })()`);
const ready = (p) => p.waitForFunction(`window.DSSL && ${engine}`);
const shot = async (p, clip) => decodePng(await p.screenshot({ clip }));
const alive = async (p) => { const d = await dbg(p); return d ? d.stats.particles : 0; };

/* ------------------------------------------------------------------ *
 * AURA
 * ------------------------------------------------------------------ */
section('aura: glow');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/glow');
  await ready(p); await p.waitForTimeout(500);
  const img = await shot(p, { x: 150, y: 100, width: 420, height: 320 });
  // element is at 300..420 x 200..320 on the page, so in the clip at (150..270, 100..220)
  const inside = px(img, 210, 160);
  ok('the glow never paints over the element itself', dist(inside, [32, 32, 48]) < 6, `inside pixel ${inside}`);
  const near = px(img, 150 - 12, 160);
  ok('the glow lights the area right outside the element', near[0] > 40 && near[0] > near[2] * 1.5, `pixel ${near}`);
  const far = px(img, 5, 5);
  ok('and fades to nothing far away', dist(far, [0, 0, 0]) < 8, `pixel ${far}`);
  const above = px(img, 210, 100 - 12);
  ok('it surrounds the element on every side, not just one', above[0] > 25 && px(img, 210, 220 + 12)[0] > 25 && px(img, 270 + 12, 160)[0] > 25);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/glow': page('.orb { position: absolute; left: 300px; top: 200px; width: 120px; height: 120px; background: #202030; radius: 20; aura-glow: #ff8800 40 }', '<div class="orb"></div>') } });

section('aura: particles');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/p');
  await ready(p); await p.waitForTimeout(1600);
  const d = await dbg(p);
  const n = d.stats.particles;
  ok('particle count settles at about the configured count (40)', n >= 28 && n <= 40, `alive ${n}`);
  const s = d.emitters[0].layers[0].sample;
  ok('speed and direction are what was written (up at 60 px/s, no spread)', s.length && s.every((q) => Math.abs(q.vy + 60) < 1.5 && Math.abs(q.vx) < 1.5), JSON.stringify(s[0]));
  const y1 = s[0].y; await p.waitForTimeout(150);
  const s2 = (await dbg(p)).emitters[0].layers[0].sample;
  ok('particles actually move upward over time', s2.some((q) => q.y < y1 - 3), `${y1} -> ${s2.map((q) => q.y.toFixed(0))}`);
  ok('the loop is running at a healthy frame time', d.stats.frameMs < 10, `${d.stats.frameMs.toFixed(2)}ms`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/p': page('.src { position: absolute; left: 300px; top: 400px; width: 60px; height: 40px; background: #333; aura-particle: #ffffff count 40 size 4 life 1000 speed 60 dir up spread 0 from bottom seed 3 }', '<div class="src"></div>') } });

section('aura: behind');
for (const behind of [true, false]) {
  await withBrowser(async ({ open }) => {
    const p = await open('/b');
    await ready(p); await p.waitForTimeout(1200);
    const img = await shot(p, { x: 280, y: 180, width: 200, height: 160 });
    // element interior is (300..420) x (200..320) minus the clip origin (280,180): (20..140) x (20..140)
    const inner = stats(img, 24, 24, 90, 90, 90);
    if (behind) ok('behind: nothing is drawn over the element\'s face', inner.lit === 0, `lit ${inner.lit}`);
    else ok('control: without behind the particles DO cover the face', inner.lit > 20, `lit ${inner.lit}`);
  }, { pages: { '/b': page(`.src { position: absolute; left: 300px; top: 200px; width: 120px; height: 120px; background: #111; aura-particle: #ffffff count 120 size 22 life 3000 speed 0 from center seed 2 ${behind ? 'behind' : ''} }`, '<div class="src"></div>') } });
}

section('aura: lifecycle');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/l');
  await ready(p); await p.waitForTimeout(1200);
  ok('hidden (display:none) elements emit nothing', (await alive(p)) === 0);
  await p.evaluate(`document.getElementById('h').className = 'src'`); await p.waitForTimeout(1100);
  ok('showing it starts the aura', (await alive(p)) > 5, `alive ${await alive(p)}`);
  // removal by removing the rule's class
  await p.evaluate(`document.getElementById('h').className = 'src off'`); await p.waitForTimeout(2200);
  let d = await dbg(p);
  ok('removing the aura lets what is alive finish, then the emitter is gone', d.emitters.length === 0 && d.stats.particles === 0, JSON.stringify(d.stats));
  const f1 = d.stats.frames; await p.waitForTimeout(300);
  ok('and the animation loop stops instead of spinning forever', (await dbg(p)).stats.frames === f1, 'frames kept increasing');
  // delete the element from the DOM mid-flight
  await p.evaluate(`document.getElementById('h').className = 'src'`); await p.waitForTimeout(700);
  await p.evaluate(`document.getElementById('h').remove()`); await p.waitForTimeout(700);
  d = await dbg(p);
  ok('deleting the element from the DOM drops its emitter', d.emitters.length === 0, JSON.stringify(d.emitters.length));
  ok('no page errors through all of that', errors.length === 0, errors.join(' | '));
}, { pages: { '/l': page(`.src { position: absolute; left: 300px; top: 300px; width: 80px; height: 80px; background: #345; aura-particle: #8cf count 40 life 600 speed 40 dir up from top }
.hide { display: none } .off { aura: none }`, '<div id="h" class="src hide"></div>') } });

section('aura: freeze and unfreeze');
await withBrowser(async ({ open }) => {
  const p = await open('/f');
  await ready(p); await p.waitForTimeout(900);
  await p.evaluate('DSSL.freeze()'); await p.waitForTimeout(200);
  const a = (await dbg(p)).stats.frames; await p.waitForTimeout(300);
  const b = (await dbg(p)).stats.frames;
  ok('freeze() stops the aura loop', a === b, `${a} -> ${b}`);
  const painted = await p.evaluate(`(() => { const c = document.querySelector('canvas[data-dssl-aura]'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; return n; })()`);
  ok('and clears the canvas, so a frozen page is still', painted === 0, `${painted} painted pixels`);
  await p.evaluate('DSSL.unfreeze()'); await p.waitForTimeout(500);
  const c = (await dbg(p)).stats.frames; await p.waitForTimeout(300);
  ok('unfreeze() resumes it', (await dbg(p)).stats.frames > c);
}, { pages: { '/f': page('.src { position: absolute; left: 300px; top: 400px; width: 80px; height: 40px; background: #345; aura: glow #f80 30, particles #fc4 count 40 life 800 speed 50 dir up from top }', '<div class="src"></div>') } });

section('aura: reduced motion');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/rm');
  await ready(p); await p.waitForTimeout(1500);
  ok('particles do not move for visitors who ask for reduced motion', (await alive(p)) === 0, `alive ${await alive(p)}`);
  const img = await shot(p, { x: 230, y: 200, width: 300, height: 200 });
  // element is 300..380 x 250..290; in the clip that is (70..150, 50..90); look just left of its middle
  ok('but the static glow is still drawn', px(img, 58, 70)[0] > 30, `pixel ${px(img, 58, 70)}`);
  const frames = (await dbg(p)).stats.frames; await p.waitForTimeout(400);
  ok('and the loop is not spinning for a still picture', (await dbg(p)).stats.frames - frames < 3, 'loop kept running');
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { reducedMotion: 'reduce', pages: { '/rm': page(`.src { position: absolute; left: 300px; top: 250px; width: 80px; height: 40px; background: #345; aura: glow #ff8800 40, particles #fc4 count 50 life 800 speed 50 dir up from top }`, '<div class="src"></div>') } });
await withBrowser(async ({ open }) => {
  const p = await open('/rme');
  await ready(p); await p.waitForTimeout(1200);
  ok('an `essential` aura ignores the preference', (await alive(p)) > 3, `alive ${await alive(p)}`);
}, { reducedMotion: 'reduce', pages: { '/rme': page(`.e { position: absolute; left: 300px; top: 250px; width: 80px; height: 40px; background: #345; aura-particle: #fc4 count 50 life 800 speed 50 dir up from top essential }`, '<div class="e"></div>') } });

section('aura: reduced motion still follows the page');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/rs');
  await ready(p); await p.waitForTimeout(900);
  const at = async () => { const img = await shot(p, { x: 230, y: 0, width: 300, height: 400 }); let top = -1; for (let y = 0; y < 400; y++) { if (px(img, 58, y)[0] > 40) { top = y; break; } } return top; };
  const a = await at();
  await p.evaluate('window.scrollTo(0, 60)'); await p.waitForTimeout(400);
  const b = await at();
  ok('after a scroll the still glow has moved with its element (about 60px up)', a > 0 && b > 0 && Math.abs((a - b) - 60) < 6, `${a} -> ${b}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { reducedMotion: 'reduce', pages: { '/rs': page('.src { position: absolute; left: 300px; top: 250px; width: 80px; height: 40px; background: #345; aura-glow: #ff8800 40 }', '<div class="src"></div>') } });

section('aura: currentColor, textured particles');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/cc');
  await ready(p); await p.waitForTimeout(900);
  const img = await shot(p, { x: 230, y: 180, width: 300, height: 200 });
  const c = px(img, 58, 90); // middle of the element's left edge (it spans y 70..110 in this clip)
  ok('a glow with no colour (or currentColor) takes the element\'s text colour (green)', c[1] > 40 && c[1] > c[0] * 2 && c[1] > c[2] * 2, `pixel ${c}`);
  ok('particles with texture(grain) render without errors', (await alive(p)) > 3);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/cc': page('.src { position: absolute; left: 300px; top: 250px; width: 80px; height: 40px; background: #345; color: #22dd44; aura-glow: currentColor 40, ; }', '<div class="src"></div>').replace(', ; }', ' }').replace('aura-glow: currentColor 40 }', 'aura-glow: currentColor 40\n  aura-particle: color currentColor count 30 life 600 speed 30 dir up from top texture(grain scale 2) }') } });

section('aura: states, tokens, slots');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/s');
  await ready(p); await p.waitForTimeout(700);
  ok('no aura until the pointer is over the element', (await alive(p)) === 0);
  await p.hover('.btn'); await p.waitForTimeout(900);
  ok('a hover { } block turns the aura on', (await alive(p)) > 5, `alive ${await alive(p)}`);
  await p.mouse.move(5, 5); await p.waitForTimeout(1800);
  ok('and moving away lets it die out', (await alive(p)) === 0, `alive ${await alive(p)}`);

  // slots stack through the cascade: glow from one rule, particles from another, then glow cleared
  await p.evaluate(`document.getElementById('slots').className = 'g'`); await p.waitForTimeout(500);
  let d = await dbg(p); let em = d.emitters.find((e) => e.el.id === 'slots') || d.emitters[0];
  ok('aura-glow alone gives a glow and no particles', em && em.glow === 1 && em.layers.length === 0, JSON.stringify(em && { g: em.glow, l: em.layers.length }));
  await p.evaluate(`document.getElementById('slots').className = 'g p'`); await p.waitForTimeout(500);
  d = await dbg(p); em = d.emitters[0];
  ok('adding a rule with aura-particle keeps the glow and adds the particles', em && em.glow === 1 && em.layers.length === 1, JSON.stringify(em && { g: em.glow, l: em.layers.length }));
  await p.evaluate(`document.getElementById('slots').className = 'g p noglow'`); await p.waitForTimeout(500);
  d = await dbg(p); em = d.emitters[0];
  ok('aura-glow: none clears only the glow slot', em && em.glow === 0 && em.layers.length === 1, JSON.stringify(em && { g: em.glow, l: em.layers.length }));

  // a token change retints the aura
  await p.evaluate(`document.getElementById('slots').className = 'tok'`); await p.waitForTimeout(500);
  const rect = await p.evaluate(`(() => { const r = document.getElementById('slots').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const clip = { x: rect.x - 60, y: rect.y - 40, width: rect.w + 120, height: rect.h + 80 };
  let img = await shot(p, clip); let c = px(img, 40, 60);
  ok('a glow written as a token colour draws that colour (red)', c[0] > c[2] * 2, `pixel ${c}`);
  await p.evaluate(`DSSL.apply('tokens { color { aurahue: #0044ff } }', { name: 'retint', replace: true })`); await p.waitForTimeout(500);
  img = await shot(p, clip); c = px(img, 40, 60);
  ok('changing the token retints the glow live (now blue)', c[2] > c[0] * 2, `pixel ${c}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/s': page(`tokens { color { aurahue: #ff2200 } }
.btn { position: absolute; left: 300px; top: 300px; width: 100px; height: 40px; background: #222
  hover { aura-particle: #8cf count 40 life 600 speed 40 dir up from top } }
#slots { position: absolute; left: 500px; top: 300px; width: 100px; height: 60px; background: #222 }
.g { aura-glow: #ff8800 24 } .p { aura-particle: #8cf count 20 life 500 speed 30 dir up from top } .noglow { aura-glow: none }
.tok { aura-glow: color.aurahue 30 }`, '<div class="btn"></div><div id="slots"></div>') } });

section('aura: viewport, scroll, pixel ratio');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/v');
  await ready(p); await p.waitForTimeout(800);
  ok('an element far below the fold emits nothing', (await alive(p)) === 0, `alive ${await alive(p)}`);
  await p.evaluate('window.scrollTo(0, 2900)'); await p.waitForTimeout(900);
  ok('scrolling it into view starts the aura', (await alive(p)) > 5, `alive ${await alive(p)}`);
  await p.setViewportSize({ width: 520, height: 420 }); await p.waitForTimeout(400);
  const dims = await p.evaluate(`(() => { const c = document.querySelector('canvas[data-dssl-aura]'); return [c.width, c.height, innerWidth, innerHeight]; })()`);
  ok('the canvas follows a window resize', dims[0] === dims[2] && dims[1] === dims[3], JSON.stringify(dims));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/v': page('.far { position: absolute; left: 300px; top: 3100px; width: 80px; height: 40px; background: #345; aura-particle: #fc4 count 40 life 800 speed 40 dir up from top }', '<div class="far"></div>') } });
await withBrowser(async ({ open }) => {
  const p = await open('/d');
  await ready(p); await p.waitForTimeout(500);
  const dims = await p.evaluate(`(() => { const c = document.querySelector('canvas[data-dssl-aura]'); return [c.width, innerWidth]; })()`);
  ok('on a 2x display the canvas is drawn at 2x so glow stays sharp', dims[0] === dims[1] * 2, JSON.stringify(dims));
}, { deviceScaleFactor: 2, pages: { '/d': page('.o { position: absolute; left: 200px; top: 200px; width: 80px; height: 40px; background: #345; aura-glow: #f80 20 }', '<div class="o"></div>') } });

section('aura: range slider thumb anchor');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/t');
  await ready(p); await p.waitForTimeout(700);
  const meanX = async () => p.evaluate(`(() => { const L = ${engine}.aura.emitters.get(document.getElementById('r')).layers[0].parts; return L.length ? L.reduce((a, q) => a + q.x, 0) / L.length : -1; })()`);
  await p.fill('#r', '10'); await p.waitForTimeout(1100); const low = await meanX();
  await p.fill('#r', '90'); await p.waitForTimeout(1500); const high = await meanX();
  ok('`from thumb` follows the value: low at 10, high at 90', low > 0 && high > low + 150, `${low.toFixed(0)} vs ${high.toFixed(0)}`);
  ok('and lands within the slider\'s own width (100..400)', low >= 100 && high <= 400, `${low} ${high}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/t': page('#r { position: absolute; left: 100px; top: 300px; width: 300px; aura-particle: #7fe -> transparent count 30 life 400 speed 10 dir up spread 20 from thumb }', '<input id="r" type="range" min="0" max="100" value="50">') } });

section('aura: many glows');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/glows');
  await ready(p); await p.waitForTimeout(2500);
  const d = await dbg(p);
  ok('40 pulsing, flickering glows of different sizes cost under 6ms a frame (the blur is cached, not redone)', d.stats.frameMs < 6, `${d.stats.frameMs.toFixed(2)}ms`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/glows': page('.c { display: inline-block; margin: 14px; background: #223; radius: 6; aura-glow: #ff8800 30 pulse 1200 flicker 0.3 }', '<div style="width:960px">' + Array.from({ length: 40 }, (_, i) => `<div class="c" style="width:${40 + (i % 7) * 13}px;height:${24 + (i % 5) * 9}px"></div>`).join('') + '</div>') }, viewport: { width: 1000, height: 700 } });

section('aura: stress');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/stress');
  await ready(p); await p.waitForTimeout(2500);
  const d = await dbg(p);
  ok('60 emitters x 100 particles are held to the global budget (1800)', d.stats.particles <= 1800, `alive ${d.stats.particles}`);
  ok('and the frame time stays workable under that load', d.stats.frameMs < 25, `${d.stats.frameMs.toFixed(1)}ms`);
  // churn: flip the aura on and off 200 times
  await p.evaluate(`(async () => { const el = document.querySelector('.cell'); for (let i = 0; i < 200; i++) { el.classList.toggle('x'); await new Promise((r) => setTimeout(r, 4)); } })()`);
  await p.waitForTimeout(2200);
  const e = await dbg(p);
  ok('rapid toggling does not leak emitters (60 elements, 60 emitters at most)', e.emitters.length <= 60, `emitters ${e.emitters.length}`);
  // refresh keeps what is flying instead of resetting it
  const before = e.stats.particles; await p.evaluate('DSSL.refresh()'); await p.waitForTimeout(50);
  ok('DSSL.refresh() does not wipe particles in flight', (await dbg(p)).stats.particles >= before * 0.7, `${before} -> ${(await dbg(p)).stats.particles}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/stress': page('.cell { display: inline-block; width: 40px; height: 20px; margin: 4px; background: #345; aura-particle: #fc4 count 100 life 700 speed 30 dir up from top } .cell.x { aura: none }', '<div style="width:900px;padding:10px">' + '<div class="cell"></div>'.repeat(60) + '</div>') } });

/* ------------------------------------------------------------------ *
 * TEXTURE
 * ------------------------------------------------------------------ */
section('texture: layering over the author\'s own background');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/tx');
  await ready(p); await p.waitForTimeout(600);
  const cs = (sel, prop) => p.evaluate(([s, pr]) => getComputedStyle(document.querySelector(s))[pr], [sel, prop]);
  ok('a plain colour keeps its colour', (await cs('#c', 'backgroundColor')) === 'rgb(200, 30, 30)');
  ok('and gains one texture layer', (await cs('#c', 'backgroundImage')).split('url("data:').length === 2);
  const gi = await cs('#g', 'backgroundImage');
  ok('a gradient keeps its gradient UNDER the texture (shorthand form)', gi.includes('linear-gradient') && gi.includes('url('), gi.slice(0, 80));
  ok('the texture layer comes first, so it sits on top', gi.indexOf('url(') < gi.indexOf('linear-gradient'));
  const si = await cs('#s', 'backgroundSize');
  ok('background-image + background-size: cover keeps `cover` for the author\'s layer (list is aligned)', si.endsWith('cover') && si.split(',').length === 2, si);
  const bm = await cs('#s', 'backgroundBlendMode');
  ok('blend modes line up: texture mode first, normal for the author\'s layer', /^overlay, normal$/.test(bm), bm);
  const before = await cs('#r', 'backgroundImage');
  await p.evaluate(`document.getElementById('r').className = 'tex'`); await p.waitForTimeout(300);
  const during = await cs('#r', 'backgroundImage');
  await p.evaluate(`document.getElementById('r').className = ''`); await p.waitForTimeout(300);
  const after = await cs('#r', 'backgroundImage');
  ok('adding then removing a texture leaves the author\'s background exactly as it was', before === after && during !== before, `${before} | ${during.slice(0, 40)} | ${after}`);
  await p.evaluate(`document.getElementById('l').className = 'a b'`); await p.waitForTimeout(300);
  ok('a later texture rule replaces an earlier one (later wins)', (await cs('#l', 'backgroundImage')).includes('repeating-linear-gradient') && !(await cs('#l', 'backgroundImage')).includes('feTurbulence'), (await cs('#l', 'backgroundImage')).slice(0, 80));
  await p.evaluate(`document.getElementById('n').className = 'none'`); await p.waitForTimeout(300);
  ok('`texture: none` removes it', (await cs('#n', 'backgroundImage')) === 'none');
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/tx': page(`#c { texture: grain }
#g { background: linear-gradient(red, blue); texture: noise }
#s { background-image: linear-gradient(red, blue); background-size: cover; texture: grain }
#r { background-image: linear-gradient(red, blue) } #r.tex { texture: grain }
.a { texture: grain } .b { texture: lines }
#n { texture: grain } #n.none { texture: none }
.box { width: 80px; height: 60px; margin: 4px; display: inline-block }`, '<div id="c" class="box" style="background-color: rgb(200, 30, 30)"></div><div id="g" class="box"></div><div id="s" class="box"></div><div id="r" class="box"></div><div id="l" class="box"></div><div id="n" class="box"></div>') } });

section('texture: states, several author layers, freeze');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/th');
  await ready(p); await p.waitForTimeout(500);
  const img = () => p.evaluate(`getComputedStyle(document.getElementById('h')).backgroundImage`);
  const base = await img();
  await p.hover('#h'); await p.waitForTimeout(350);
  const hov = await img();
  ok('a texture can change on hover', hov !== base && hov.includes('repeating-linear-gradient'), hov.slice(0, 60));
  await p.mouse.move(2, 2); await p.waitForTimeout(350);
  ok('and goes back when the pointer leaves', (await img()) === base);
  const multi = await p.evaluate(`getComputedStyle(document.getElementById('m')).backgroundImage`);
  ok('an author background with several layers keeps all of them under the texture', multi.split('linear-gradient').length - 1 >= 3 && multi.includes('url("data:'), multi.slice(0, 120));
  const before = await p.evaluate(`document.getElementById('a').getAnimations().length`);
  await p.evaluate('DSSL.freeze()'); await p.waitForTimeout(150);
  const during = await p.evaluate(`document.getElementById('a').getAnimations().length`);
  await p.evaluate('DSSL.unfreeze()'); await p.waitForTimeout(300);
  const after = await p.evaluate(`document.getElementById('a').getAnimations().length`);
  ok('freeze() stops the texture shimmer and unfreeze() brings it back', before === 1 && during === 0 && after === 1, `${before} ${during} ${after}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/th': page('.b { width: 80px; height: 60px; margin: 4px; display: inline-block } #h { texture: grain } #h:hover { texture: lines } #m { background: linear-gradient(red, blue), linear-gradient(green, yellow), linear-gradient(white, black); texture: noise } #a { texture: grain animate 90 }', '<div id="h" class="b"></div><div id="m" class="b"></div><div id="a" class="b"></div>') } });

section('texture: every preset paints something');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/gallery');
  await p.waitForFunction('window.ready === true'); await p.waitForTimeout(500);
  const boxes = await p.evaluate(`[...document.querySelectorAll('.sw')].map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; })`);
  const full = decodePng(await p.screenshot({ fullPage: true }));
  const flat = [184, 165, 138];
  let bad = [];
  boxes.forEach((b, i) => {
    const name = PRESET_NAMES[i];
    const seen = new Set();
    let far = 0;
    for (let y = Math.round(b.y) + 4; y < b.y + b.h - 4; y++) for (let x = Math.round(b.x) + 4; x < b.x + b.w - 4; x++) {
      const c = px(full, x, y);
      seen.add(`${c[0] >> 4},${c[1] >> 4},${c[2] >> 4}`);
      if (dist(c, flat) > 12) far++;
    }
    if (far < 8) bad.push(`${name}(${seen.size} tones, ${far} px changed)`);
  });
  ok(`all ${PRESET_NAMES.length} presets draw something distinct from the flat colour`, bad.length === 0, bad.join(', '));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/gallery': galleryPage('#b8a58a', 6) }, viewport: { width: 1100, height: 700 } });

section('texture: tokens and motion');
await withBrowser(async ({ open }) => {
  const p = await open('/tt');
  await ready(p); await p.waitForTimeout(600);
  const img = () => p.evaluate(`getComputedStyle(document.getElementById('t')).backgroundImage`);
  const a = await img();
  await p.evaluate(`DSSL.apply('tokens { color { tint: #00ff55 } }', { name: 'x', replace: true })`); await p.waitForTimeout(500);
  const b = await img();
  ok('a texture colour written as a token follows the token', a !== b && decodeURIComponent(a).includes('rgb') !== undefined, 'image did not change');
  const anims = await p.evaluate(`document.getElementById('m').getAnimations().length`);
  ok('`animate` shimmers the texture with a real animation', anims === 1, `animations ${anims}`);
}, { pages: { '/tt': page('tokens { color { tint: #ff0044 } } #t { texture: noise color color.tint color2 #fff } #m { texture: grain animate 90 } .b { width: 80px; height: 60px }', '<div id="t" class="b"></div><div id="m" class="b"></div>') } });
await withBrowser(async ({ open }) => {
  const p = await open('/tm');
  await ready(p); await p.waitForTimeout(600);
  ok('the shimmer is off when the visitor prefers reduced motion', (await p.evaluate(`document.getElementById('m').getAnimations().length`)) === 0);
}, { reducedMotion: 'reduce', pages: { '/tm': page('#m { texture: grain animate 90; width: 80px; height: 60px }', '<div id="m"></div>') } });

/* ------------------------------------------------------------------ *
 * SLIDER
 * ------------------------------------------------------------------ */
section('slider: rendering in Chrome (WebKit/Blink pseudo-elements)');
const FILL = [255, 122, 0], TRACK = [68, 85, 102];
await withBrowser(async ({ open, errors }) => {
  const p = await open('/sl');
  await ready(p); await p.waitForTimeout(600);
  const box = await p.evaluate(`(() => { const r = document.getElementById('s1').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const clip = { x: box.x - 4, y: box.y - 4, width: box.w + 8, height: box.h + 8 };
  const at = async (frac) => { const img = await shot(p, clip); return px(img, 4 + frac * box.w, 4 + box.h / 2); };
  ok('left of the thumb the track is the fill colour', dist(await at(0.2), FILL) < 24, `pixel ${await at(0.2)}`);
  ok('right of the thumb it is the track colour', dist(await at(0.9), TRACK) < 24, `pixel ${await at(0.9)}`);
  await p.fill('#s1', '95'); await p.waitForTimeout(200);
  ok('moving the thumb moves the fill with it', dist(await at(0.8), FILL) < 24, `pixel ${await at(0.8)}`);
  await p.evaluate(`(() => { const e = document.getElementById('s1'); e.value = 10; })()`);
  await p.evaluate('DSSL.refresh()'); await p.waitForTimeout(200);
  ok('a value set from JavaScript is picked up by DSSL.refresh()', dist(await at(0.5), TRACK) < 24, `pixel ${await at(0.5)}`);
  ok('--dssl-p tracks the value (0..1)', Math.abs(Number(await p.evaluate(`getComputedStyle(document.getElementById('s1')).getPropertyValue('--dssl-p')`)) - 0.1) < 0.01);
  ok('native appearance is switched off', (await p.evaluate(`getComputedStyle(document.getElementById('s1')).appearance`)) === 'none');
  const thumb = await (async () => { await p.fill('#s1', '50'); await p.waitForTimeout(150); const img = await shot(p, clip); return px(img, 4 + 0.5 * box.w, 4 + box.h / 2); })();
  ok('the thumb is drawn in its own colour (white)', dist(thumb, [255, 255, 255]) < 30, `pixel ${thumb}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/sl': page('#s1 { width: 300px; margin: 40px; slider: track 8 #445566 radius full, fill #ff7a00, thumb 22 #ffffff }', '<input id="s1" type="range" value="60">', '#101018') }, viewport: { width: 500, height: 200 } });

section('slider: min, max and step');
await withBrowser(async ({ open }) => {
  const p = await open('/mm');
  await ready(p); await p.waitForTimeout(500);
  const pv = () => p.evaluate(`getComputedStyle(document.getElementById('s')).getPropertyValue('--dssl-p')`);
  ok('min 10, max 50, value 30 is exactly half way (0.5)', Math.abs(Number(await pv()) - 0.5) < 0.001, await pv());
  await p.fill('#s', '50'); await p.waitForTimeout(100);
  ok('at the maximum it is 1', Math.abs(Number(await pv()) - 1) < 0.001, await pv());
  await p.fill('#s', '10'); await p.waitForTimeout(100);
  ok('at the minimum it is 0', Math.abs(Number(await pv())) < 0.001, await pv());
}, { pages: { '/mm': page('#s { width: 300px; slider: fill #f80 }', '<input id="s" type="range" min="10" max="50" step="5" value="30">') } });

section('slider: graph (histogram) and shapes');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/g');
  await ready(p); await p.waitForTimeout(600);
  const box = await p.evaluate(`(() => { const r = document.getElementById('g1').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const clip = { x: box.x, y: box.y, width: box.w, height: box.h };
  const img = await shot(p, clip);
  // 12 bars across 300px with 3px gaps: bar i is 22.25px wide and centred at i/11 of the free width
  const n = 12, bw = (box.w - (n - 1) * 3) / n;
  const barX = (i) => Math.round((i / (n - 1)) * (box.w - bw) + bw / 2);
  const topOf = (i) => { for (let y = 0; y < box.h; y++) if (dist(px(img, barX(i), y), [16, 16, 24]) > 40) return y; return -1; };
  ok('bars left of the value are drawn in the fill colour', dist(px(img, barX(1), box.h - 12), [119, 204, 255]) < 30, `pixel ${px(img, barX(1), box.h - 12)}`);
  ok('bars right of the value are drawn in the track colour', dist(px(img, barX(10), box.h - 12), [52, 68, 90]) < 30, `pixel ${px(img, barX(10), box.h - 12)}`);
  const t0 = topOf(0), t7 = topOf(7);
  ok('bar heights follow the numbers: the 95 bar is far taller than the 20 bar', t0 > 0 && t7 > 0 && t0 - t7 > 20, `tops ${t0} vs ${t7}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/g': page('#g1 { width: 300px; margin: 20px; slider: graph 20 40 70 90 60 30 50 95 40 65 80 45, graph-height 56, graph-gap 3, fill #77ccff, track 3 #34445a, thumb 14 #ffffff, shape bar }', '<input id="g1" type="range" value="40">', '#101018') }, viewport: { width: 400, height: 160 } });
await withBrowser(async ({ open, errors }) => {
  const p = await open('/sh');
  await ready(p); await p.waitForTimeout(500);
  const logs = []; p.on('console', (m) => logs.push(m.text()));
  await p.evaluate(`DSSL.apply('.notinput { slider: thumb 20 #fff }', { name: 'misuse', replace: true })`);
  await p.evaluate(`const d = document.createElement('div'); d.className = 'notinput'; document.body.appendChild(d)`); await p.waitForTimeout(400);
  ok('slider: on something that is not a range input says so instead of failing silently', logs.some((l) => /does nothing, it styles <input type="range">/.test(l)), logs.join(' | '));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/sh': page('', '<div></div>') } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
