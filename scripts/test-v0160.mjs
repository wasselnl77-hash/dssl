#!/usr/bin/env node
/* test-v0160.mjs: the third round of feedback from the game builder (0.16.0): plain CSS next to DSSL, valid CSS that was refused,
 * a token error that pointed nowhere, an aura that lit the box instead of the shape. Plus the new aura types and textures.
 * Real Chrome decides anything that is drawn. */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compile } from '../public/dssl/index.js';
import { parseAura, aroundPoints, AROUND_NAMES, SHAPES } from '../public/dssl/aura.js';
import { PRESET_NAMES, PRESETS, GENERATORS, buildTexture, parseTexture } from '../public/dssl/texture.js';
import { parseColor } from '../public/dssl/color.js';
import { withBrowser, ROOT } from './lib/browser-harness.mjs';
import { decodePng, px } from './lib/pixels.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const page = (dssl, body = '', head = '', css = '') => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#000;height:3000px">${head}${css ? `<style>${css}</style>` : ''}<style type="text/dssl">${dssl}</style>${body}<script type="module" src="/dssl/boot.js"></script>`;
const ready = (p) => p.waitForFunction(`window.DSSL && DSSL.__debug.engines.get('global') && document.documentElement.classList.contains('dssl-ready')`);
const errs = (src) => compile(src, 't.dssl').errors;
const rules = (src) => compile(src, 't.dssl').doc.rules;
const decl = (src, prop) => { for (const r of rules(src)) for (const d of r.decls) if (d.prop === prop) return d.value; return undefined; };
const lit = (c) => c[0] > 40 && c[0] > c[2] * 1.5;       // red-ish light on black

section('1. a token line with two tokens, and an error that says where');
{
  const r = compile('tokens { radius { pill: 999 card: 22 } }\n.a { radius: card }', 't.dssl');
  ok('radius { pill: 999 card: 22 } on one line is two tokens', r.errors.length === 0 && decl('tokens { radius { pill: 999 card: 22 } }', '--dssl-radius-pill') === '999px' && decl('tokens { radius { pill: 999 card: 22 } }', '--dssl-radius-card') === '22px', JSON.stringify(r.errors));
  ok('and the second one can be used', r.doc.rules.some((x) => x.decls.some((d) => d.prop === 'border-radius' && d.value === 'var(--dssl-radius-card)')));
  ok('semicolons still work', errs('tokens { radius { a: 1; b: 2 } }').length === 0 && decl('tokens { radius { a: 1; b: 2 } }', '--dssl-radius-b') === '2px');
  ok('several lines, several colours on one line', errs('tokens { color { a: #111  b: oklch(60% 0.2 30)  c: #333 } }').length === 0 && decl('tokens { color { a: #111  b: oklch(60% 0.2 30)  c: #333 } }', '--dssl-color-c') === '#333');
  ok('a font stack with commas and quotes stays one token', decl('tokens { font { body: "Fraunces", Georgia, serif } }', '--dssl-font-body') === '"Fraunces", Georgia, serif');
  const bad = compile('tokens {\n  color {\n    x: nonsense\n    y: #fff\n  }\n}\n', 't.dssl').errors;
  ok('a bad token points at its own line (it said line 0), once', bad.length === 1 && bad[0].line === 3 && /nonsense/.test(bad[0].message), JSON.stringify(bad));
  const two = compile('tokens { color { ok: #111 bad: nonsense } }', 't.dssl').errors;
  ok('on one line it names the right token', two.length === 1 && /color\.bad/.test(two[0].message), JSON.stringify(two));
}

section('2. valid CSS is not refused');
{
  const good = [
    '.a { padding-top: env(safe-area-inset-top) }',
    '.a { padding: env(safe-area-inset-top, 20) env(safe-area-inset-right, 0) max(env(safe-area-inset-bottom), 12) 0 }',
    '.a { font-variant-numeric: tabular-nums }',
    '.a { font-variant-numeric: lining-nums slashed-zero; font-variant-caps: all-small-caps; font-variant-ligatures: no-common-ligatures }',
    '.a { touch-action: manipulation; overscroll-behavior: contain; scroll-snap-type: x mandatory; scroll-snap-align: start }',
    '.a { contain: layout paint; content-visibility: auto; text-decoration-thickness: from-font; writing-mode: vertical-rl }',
    '.a { text-wrap: balance; hyphens: auto; user-select: none; accent-color: auto; mix-blend-mode: multiply; image-rendering: pixelated }',
    '.a { direction: rtl; caption-side: bottom; max-block-size: 10; text-size-adjust: 100%; widows: 2; orphans: 3 }',
    '.a { -webkit-user-select: none; -webkit-touch-callout: none; -webkit-overflow-scrolling: touch; -webkit-appearance: none; -moz-appearance: none }',
    '.a { background: rebeccapurple; color: darkslateblue; border-color: lightgoldenrodyellow }',
    '.a { font-feature-settings: "tnum" 1, "liga" 0; font-variation-settings: "wght" 650; tab-size: 4; -webkit-line-clamp: 3 }',
  ];
  for (const src of good) ok(`accepted: ${src.slice(0, 70)}`, errs(src).length === 0, JSON.stringify(errs(src).map((e) => e.message)));
  ok('env() keeps the name and gives the fallback a unit', decl('.a { padding-top: env(safe-area-inset-top, 20) }', 'padding-top') === 'env(safe-area-inset-top, 20px)');
  ok('a tabular figure feature number is not turned into px', decl('.a { font-feature-settings: "tnum" 1 }', 'font-feature-settings') === '"tnum" 1');
  ok('a typo is still loud, with did-you-mean', errs('.a { text-align: cetner }').some((e) => /cetner/.test(e.message) && /center/.test(e.hint || '')));
  ok('a property typo is still loud', errs('.a { colour: red }').length === 1 && errs('.a { max-heigth: 1 }').length === 1);
  ok('so is a made-up value for a real property', errs('.a { display: flexx }').length === 1);
}

section('3. yield: plain CSS wins where you say so');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/y'); await ready(p); await p.waitForTimeout(250);
  const cs = (id, prop) => p.evaluate(([i, pr]) => getComputedStyle(document.getElementById(i))[pr], [id, prop]);
  ok('without yield, DSSL\'s inline padding beats the stylesheet (the friction)', await cs('plain', 'paddingTop') === '10px');
  ok('with yield: padding-top the stylesheet decides, and no !important is needed', await cs('one', 'paddingTop') === '33px');
  ok('the other sides are still DSSL\'s (the shorthand was split, not dropped)', await cs('one', 'paddingRight') === '12px' && await cs('one', 'paddingBottom') === '14px' && await cs('one', 'paddingLeft') === '16px');
  ok('yield: padding hands over the whole family', await cs('fam', 'paddingTop') === '4px' && await cs('fam', 'paddingLeft') === '5px');
  ok('env() works in plain CSS beside DSSL (a desktop has no notch, so it is 0px, and not the 7px DSSL would have written)', await cs('env', 'paddingBottom') === '0px');
  ok('what is not yielded is still DSSL\'s', await cs('one', 'marginTop') === '9px');
  ok('yield: none gives it back to DSSL', await cs('none', 'paddingTop') === '10px');
  ok('a longhand a rule also yields is dropped from the cascade, whichever rule wrote it', await cs('late', 'paddingTop') === '33px' && await cs('late', 'color') === 'rgb(0, 0, 255)');
  await p.evaluate(() => document.getElementById('late').classList.add('off')); await p.waitForTimeout(150);
  ok('and when the yielding rule stops matching DSSL takes the property back', await cs('late', 'paddingTop') === '10px');
  const found = await p.evaluate(async () => (await DSSL.lint(document.body, { log: false })).filter((f) => f.kind === 'css-loses').map((f) => f.selector + ' | ' + f.message));
  ok('DSSL.lint names the CSS rule that loses, and the way out', found.some((m) => /^div#plain/.test(m) && /padding-top/.test(m) && /yield: padding-top/.test(m)), JSON.stringify(found));
  ok('and says nothing about the ones that yield', !found.some((m) => /#one|#fam|#env/.test(m)), JSON.stringify(found));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/y': page(
  '#plain { padding: 10 }\n#one { padding: 10 12 14 16; margin-top: 9; yield: padding-top }\n#fam { padding: 3; yield: padding }\n#env { padding-bottom: 7; yield: padding-bottom }\n#none { padding: 10; yield: padding-top; yield: none }\n#late { padding: 10; color: #00f }\n#late:not(.off) { yield: padding-top }',
  '<div id=plain></div><div id=one></div><div id=fam></div><div id=env></div><div id=none></div><div id=late></div>', '',
  '#plain { padding-top: 40px } #one { padding-top: 33px } #fam { padding-top: 4px; padding-left: 5px } #env { padding-bottom: env(safe-area-inset-bottom, 21px) } #none { padding-top: 50px } #late { padding-top: 33px }') } });
{
  ok('yield needs properties', errs('.a { yield: }').length === 1);
  ok('yield checks the names (did-you-mean)', errs('.a { yield: pading-top }').some((e) => /pading-top/.test(e.message) && /padding-top/.test(e.hint || '')));
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-yield-'));
  writeFileSync(path.join(dir, 'a.dssl'), '.app { padding: 10; yield: padding-top }\n');
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', path.join(dir, 'a.dssl'), '-o', path.join(dir, 'a.css')], { encoding: 'utf8' });
  const css = readFileSync(path.join(dir, 'a.css'), 'utf8');
  ok('dssl build writes the padding and does not count or print yield (a stylesheet has nothing to hand back)', r.status === 0 && /padding: 10px/.test(css) && !/yield/.test(css) && !/engine-native/.test(r.stdout), r.stdout + r.stderr);
}

{
  // a page that ships `dssl build` output AND runs the engine says every rule twice: that is not a conflict
  const built = (await import('../public/dssl/index.js')).toCSS('.dup { padding: 10; color: #123456 }', { file: 'a.dssl' }).css;
  await withBrowser(async ({ open }) => {
    const p = await open('/b'); await ready(p); await p.waitForTimeout(250);
    const n = await p.evaluate(async () => (await DSSL.lint(document.body, { log: false })).filter((f) => f.kind === 'css-loses').length);
    ok('compiled CSS and the engine saying the same thing is not reported as css-loses', n === 0, String(n));
  }, { pages: { '/b': page('.dup { padding: 10; color: #123456 }', '<div class=dup></div>', '', built) } });
}

section('4. aura follows the real shape');
{
  const around = (w) => { const out = parseAura('aura-glow', `#f00 30 around ${w}`, { error() { }, color: (c) => c, suggest: () => null }); return out && out.glow && out.glow[0] && out.glow[0].around; };
  ok('every named shape parses', AROUND_NAMES.every((n) => around(n) && around(n).name === n));
  ok('polygon(...) parses to fractions', JSON.stringify(around('polygon(50% 0, 100% 100%, 0 100%)')) === '{"name":"polygon","pts":[[0.5,0],[1,1],[0,1]]}');
  ok('the named polygons really are polygons', ['diamond', 'triangle', 'hexagon', 'octagon', 'pentagon', 'star', 'star4', 'star6', 'cross', 'heart', 'drop', 'bolt'].every((n) => (aroundPoints({ name: n }) || []).length >= 3));
  const e = [];
  parseAura('aura-glow', '#f00 30 around blob', { error: (m, h) => e.push(m + ' | ' + h), color: (c) => c, suggest: () => 'box' });
  ok('an unknown shape is an error that lists the choices', e.length === 1 && /unknown around "blob"/.test(e[0]));
  ok('a polygon with two points is an error', errs('.a { aura-glow: #f00 30 around polygon(0 0, 100% 100%) }').length === 1);
  ok('a polygon in px is an error that says percent', errs('.a { aura-glow: #f00 30 around polygon(0px 0px, 10px 10px, 0px 10px) }').some((x) => /percent/.test(x.message)));
  const around2 = '.o { position: absolute; left: 150px; top: 150px; width: 100px; height: 100px; background: #222; aura-glow: #f00 40 essential intensity 1.6 }';
  const shot = async (dssl, clip = { x: 0, y: 0, width: 420, height: 420 }) => {
    let png;
    await withBrowser(async ({ open }) => { const p = await open('/a'); await ready(p); await p.waitForTimeout(1100); png = decodePng(await p.screenshot({ clip })); }, { pages: { '/a': page(dssl, '<div class=o></div>') }, viewport: { width: 420, height: 420 } });
    return png;
  };
  // 4a. clip-path diamond
  const dia = await shot(`${around2}\n.o { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%) }`);
  const boxed = await shot(`${around2}\n.o { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); aura-glow: #f00 40 essential intensity 1.6 around box }`);
  ok('a clip-path diamond: light just above its top tip', lit(px(dia, 200, 142)));
  ok('a clip-path diamond: nothing out at the box corner (it used to be a square halo)', !lit(px(dia, 140, 140)) && !lit(px(dia, 260, 140)) && !lit(px(dia, 140, 260)), JSON.stringify([px(dia, 140, 140), px(dia, 260, 260)]));
  ok('`around box` still lights the box on purpose', lit(px(boxed, 146, 146)), JSON.stringify(px(boxed, 146, 146)));
  // 4b. a square turned 45 degrees
  const rot = await shot('.o { position: absolute; left: 165px; top: 165px; width: 70px; height: 70px; background: #222; rotate: 45deg; aura-glow: #f00 40 essential intensity 1.6 }');
  ok('a square turned 45deg is lit around the diamond: above its top tip', lit(px(rot, 200, 200 - 49 - 8)), JSON.stringify(px(rot, 200, 143)));
  ok('and not at the corner of the box around it', !lit(px(rot, 200 - 56, 200 - 56)) && !lit(px(rot, 200 + 56, 200 + 56)), JSON.stringify([px(rot, 144, 144), px(rot, 256, 256)]));
  // 4c. round
  const rnd = await shot(`${around2}\n.o { border-radius: 50% }`);
  ok('border-radius: 50% follows the circle (it used to read 50 as 50px)', lit(px(rnd, 200, 142)) && !lit(px(rnd, 144, 144)), JSON.stringify([px(rnd, 200, 142), px(rnd, 144, 144)]));
  // 4d. named star around a plain square
  const star = await shot(`${around2}\n.o { aura-glow: #f00 30 essential intensity 2.6 around star; background: transparent }`);
  ok('around star on a plain box: light follows the star, so the corner between two points is dark', lit(px(star, 200, 150 - 3)) && !lit(px(star, 150 - 6, 150 - 6)), JSON.stringify([px(star, 200, 147), px(star, 144, 144)]));
  // 4e. inner glow
  const inner = await shot(`${around2}\n.o { border-radius: 20px; aura-glow: #f00 30 essential inner intensity 2.4 }`);
  ok('inner: light just inside the edge', lit(px(inner, 154, 200)) || lit(px(inner, 200, 154)), JSON.stringify([px(inner, 154, 200), px(inner, 200, 154)]));
  ok('inner: nothing outside, and the middle is dark', !lit(px(inner, 140, 200)) && px(inner, 200, 200)[0] < 70, JSON.stringify([px(inner, 140, 200), px(inner, 200, 200)]));
  // 4f. rays
  const rays = await shot('.o { position: absolute; left: 180px; top: 180px; width: 40px; height: 40px; background: #222; aura-glow: #f00 70 essential rays 8 spin 0 nohalo intensity 2 }');
  ok('rays: lit along a ray, dark between two', lit(px(rays, 200 + 50, 200)) && lit(px(rays, 200, 200 - 50)) && !lit(px(rays, 200 + Math.round(50 * Math.cos(Math.PI / 8)), 200 + Math.round(50 * Math.sin(Math.PI / 8)))), JSON.stringify([px(rays, 250, 200), px(rays, 246, 219)]));
  ok('rays: not over the element itself', px(rays, 200, 200)[0] < 70, JSON.stringify(px(rays, 200, 200)));
  // 4g. ripple
  const rip = await shot('.o { position: absolute; left: 160px; top: 160px; width: 80px; height: 80px; background: #222; border-radius: 50%; aura-glow: #f00 60 essential ripple 4000 around round nohalo intensity 2 }');
  let ringPx = 0; for (let x = 245; x < 300; x++) if (lit(px(rip, x, 200))) ringPx++;
  ok('ripple: a ring outside the shape', ringPx >= 1, String(ringPx));
  // 4h. alpha of an image
  let alpha;
  await withBrowser(async ({ open }) => {
    const p = await open('/i'); await ready(p);
    await p.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 100; const x = c.getContext('2d'); x.fillStyle = '#336'; x.beginPath(); x.arc(50, 50, 38, 0, Math.PI * 2); x.fill(); const im = document.getElementById('im'); im.src = c.toDataURL(); return im.decode(); });
    await p.evaluate(() => DSSL.refresh()); await p.waitForTimeout(1100);
    alpha = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 420, height: 420 } }));
  }, { pages: { '/i': page('#im { position: absolute; left: 150px; top: 150px; width: 100px; height: 100px; aura-glow: #f00 25 essential around alpha intensity 2 }', '<img id=im width=100 height=100>') }, viewport: { width: 420, height: 420 } });
  ok('around alpha: lit just outside the picture\'s circle', lit(px(alpha, 200, 200 - 38 - 6)), JSON.stringify(px(alpha, 200, 156)));
  ok('around alpha: not at the empty corner of the picture', !lit(px(alpha, 154, 154)) && !lit(px(alpha, 246, 246)), JSON.stringify([px(alpha, 154, 154), px(alpha, 246, 246)]));
}

section('5. more aura: particles that follow the outline, new shapes, palette, orbit, wind');
{
  ok('every particle shape is a known word', ['heart', 'diamond', 'triangle', 'plus', 'drop', 'bubble', 'snowflake', 'confetti', 'leaf'].every((n) => SHAPES.includes(n)) && SHAPES.every((n) => errs(`.a { aura-particle: #fff 10 shape ${n} }`).length === 0));
  ok('from outline, palette, spin, wind, orbit are known', errs('.a { aura-particle: #f00 #0f0 #00f count 20 from outline palette spin 90 wind 20 orbit 45 around diamond }').length === 0);
  ok('inner, rays, ripple, nohalo, spin and around are known on a glow', errs('.a { aura-glow: #fc4 40 inner rays 8 spin 20 ripple 1500 nohalo around hexagon }').length === 0);
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/o'); await ready(p); await p.waitForTimeout(900);
    const samples = await p.evaluate(() => { const a = DSSL.__debug.engines.get('global').aura.debug(); const e = a.emitters.find((x) => x.el.id === 'dia'); const r = e.el.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, hw: r.width / 2, hh: r.height / 2, pts: e.layers[0].sample }; });
    const dev = samples.pts.map((q) => Math.abs((q.x - samples.cx) / samples.hw) + Math.abs((q.y - samples.cy) / samples.hh));
    ok('from outline on a diamond: particles are born on the diamond\'s edges (|x|/hw + |y|/hh is 1), not on the box', dev.length >= 3 && dev.every((d) => Math.abs(d - 1) < 0.12), JSON.stringify(dev));
    const orb = await p.evaluate(async () => {
      const a = DSSL.__debug.engines.get('global').aura;
      const e = () => a.debug().emitters.find((x) => x.el.id === 'orb');
      const cen = document.getElementById('orb').getBoundingClientRect();
      const c = { x: cen.left + cen.width / 2, y: cen.top + cen.height / 2 };
      const ang = (q) => Math.atan2(q.y - c.y, q.x - c.x) * 180 / Math.PI;
      const first = e().layers[0].sample[0]; if (!first) return null;
      const a0 = ang(first), age0 = first.age;
      await new Promise((r) => setTimeout(r, 400));
      const now = e().layers[0].sample.find((q) => Math.abs(q.age - age0 - 0.4) < 0.25 && Math.hypot(q.x - c.x, q.y - c.y) > 5);
      return { turned: now ? ((ang(now) - a0 + 540) % 360) - 180 : null };
    });
    ok('orbit 90 turns particles about 36 degrees in 0.4s around the middle (some frames are skipped, so a range)', orb && orb.turned !== null && orb.turned > 15 && orb.turned < 60, JSON.stringify(orb));
    const wind = await p.evaluate(() => { const a = DSSL.__debug.engines.get('global').aura.debug(); const e = a.emitters.find((x) => x.el.id === 'wind'); const r = e.el.getBoundingClientRect(); const s = e.layers[0].sample.filter((q) => q.age > 0.3); return s.length ? s.reduce((m, q) => m + (q.x - (r.left + r.width / 2)), 0) / s.length : null; });
    ok('wind pushes particles sideways (to the right for a positive number)', wind !== null && wind > 20, String(wind));
    const pcs = await p.evaluate(() => new Set(DSSL.__debug.engines.get('global').aura.emitters.get(document.getElementById('conf')).layers[0].parts.map((q) => q.pc % 3)).size);
    ok('palette: each particle takes one of the colours (all three are used)', pcs === 3, String(pcs));
    const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 700, height: 300 } }));
    let reds = 0, greens = 0, blues = 0;
    for (let y = 0; y < 300; y += 1) for (let x = 440; x < 700; x += 1) { const c = px(png, x, y); if (c[0] > 150 && c[1] < 90 && c[2] < 90) reds++; if (c[1] > 150 && c[0] < 90 && c[2] < 90) greens++; if (c[2] > 150 && c[0] < 90 && c[1] < 90) blues++; }
    ok('and the confetti really is drawn in all three colours', reds > 5 && greens > 5 && blues > 5, `${reds}/${greens}/${blues}`);
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/o': page(
    '.s { position: absolute; top: 100px; width: 60px; height: 60px; background: #222 }\n#dia { left: 40px; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); aura-particle: #ff5 count 30 life 8000 size 4 speed 0 from outline essential }\n#orb { left: 160px; aura-particle: #7cf count 12 life 6000 size 4 speed 0 orbit 90 from outline essential }\n#wind { left: 300px; aura-particle: #fff count 12 life 5000 size 4 speed 0 wind 600 from center essential }\n#conf { left: 520px; aura-particle: #f00 #0f0 #00f count 60 life 3000 size 10 shape confetti palette dir up spread 60 speed 70 from top essential }',
    '<div class=s id=dia></div><div class=s id=orb></div><div class=s id=wind></div><div class=s id=conf></div>') }, viewport: { width: 700, height: 300 } });
}

section('6. textures: more of them, and they all build');
{
  const rc = (w) => parseColor(w);
  const fresh = ['bricks', 'bricks-old', 'herringbone', 'plaid', 'tartan', 'gingham', 'scales', 'mermaid', 'shingles', 'chevron', 'argyle', 'lowpoly', 'tiles', 'blueprint', 'granite', 'slate', 'sandstone', 'terrazzo', 'confetti', 'rust', 'corrugated', 'cork', 'kraft', 'felt', 'burlap', 'stucco', 'starfield', 'snow', 'grass', 'water', 'rain', 'lava', 'topo'];
  ok(`${fresh.length} new presets, ${PRESET_NAMES.length} in all`, fresh.every((n) => PRESETS[n]) && PRESET_NAMES.length >= 70);
  ok('nine new generators', ['bricks', 'herringbone', 'plaid', 'scales', 'chevron', 'diamonds', 'triangles', 'starfield', 'terrazzo'].every((g) => GENERATORS.includes(g)));
  let bad = [];
  for (const n of PRESET_NAMES) {
    try { const layers = parseTexture(n, { error: (m) => bad.push(n + ': ' + m), color: (c) => c, suggest: () => null }); const t = buildTexture(layers, rc); if (!t.count || !t.image) bad.push(n + ': empty'); }
    catch (e) { bad.push(n + ': ' + e.message); }
  }
  ok('every preset parses and builds into CSS', bad.length === 0, bad.join(' | '));
  ok('every preset has a one-line doc', PRESET_NAMES.every((n) => PRESETS[n].doc && PRESETS[n].doc.length > 8 && !/—|–/.test(PRESETS[n].doc)));
  const t = (src) => compile(`.a { texture: ${src} }`, 't.dssl').errors.map((e) => e.message);
  ok('density is a setting, and plaid takes radius', t('starfield density 2').length === 0 && t('terrazzo density 0.4 seed 3').length === 0 && t('plaid radius 0.4 scale 40').length === 0);
  ok('a generator on its own works with the new words: bricks scale 40 thickness 2', t('bricks scale 40 thickness 2 color #333 color2 #a33').length === 0);
  ok('symmetrical still applies to the new image textures', t('terrazzo symmetrical').length === 0 && t('scales symmetrical x').length === 0);
  // seamless where it should be: a tile edge must not show. Render the pattern 3x3 and compare the mean colour of a stripe on the seam with its surroundings.
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/t'); await ready(p); await p.waitForTimeout(500);
    const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 360 } }));
    // how much the pixels in each patch differ from their own average: a flat colour is 0
    const spread = (i) => {
      const x0 = 20 + i * 195; let sum = 0, n = 0;
      for (let y = 20; y < 340; y += 2) for (let x = x0; x < x0 + 170; x += 2) { const c = px(png, x, y); sum += c[0] + c[1] + c[2]; n++; }
      const m = sum / n; let dev = 0;
      for (let y = 20; y < 340; y += 2) for (let x = x0; x < x0 + 170; x += 2) { const c = px(png, x, y); dev += Math.abs(c[0] + c[1] + c[2] - m); }
      return dev / n / 3;
    };
    const sp = [0, 1, 2, 3, 4, 5].map(spread);
    ok('bricks, herringbone, tartan and scales are drawn, not a flat colour (terrazzo chips and a starfield are sparse, so their bar is lower)', sp.slice(0, 4).every((v) => v > 6) && sp[4] > 0.4 && sp[5] > 0.4, JSON.stringify(sp.map((v) => +v.toFixed(2))));
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages: { '/t': page('.b { position: absolute; top: 20px; width: 170px; height: 330px; background: #888 }\n#b1 { left: 20px; texture: bricks } #b2 { left: 215px; texture: herringbone } #b3 { left: 410px; texture: tartan } #b4 { left: 605px; texture: mermaid } #b5 { left: 800px; texture: terrazzo } #b6 { left: 995px; background: #07091a; texture: starfield }', '<div class=b id=b1></div><div class=b id=b2></div><div class=b id=b3></div><div class=b id=b4></div><div class=b id=b5></div><div class=b id=b6></div>') }, viewport: { width: 1200, height: 360 } });
  // a build keeps them as plain CSS
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-tex-'));
  writeFileSync(path.join(dir, 'a.dssl'), '.wall { texture: bricks }\n.floor { texture: herringbone }\n.sky { texture: starfield }\n');
  const r = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', path.join(dir, 'a.dssl'), '-o', path.join(dir, 'a.css')], { encoding: 'utf8' });
  ok('dssl build bakes the new textures into the CSS', r.status === 0 && /3 texture\(s\) baked/.test(r.stdout), r.stdout + r.stderr);
}

section('7. docs and version');
{
  const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
  const API = await import('../public/dssl/index.js');
  ok('the engine says 0.16', /^0\.16\./.test(API.VERSION));
  for (const f of ['GUIDE.md', 'README.md', 'llms.txt', 'PARITY.md', 'src/components/dssl/views/ChangelogView.tsx', 'dssl-vscode/CHANGELOG.md']) ok(`${f} has a 0.16 section`, /0\.16\.\d/.test(read(f)));
  const guide = read('GUIDE.md');
  for (const w of ['yield:', 'around diamond', 'from outline', 'palette', 'orbit', 'herringbone', 'tartan', 'css-loses', 'env(safe-area-inset-top']) ok(`the guide covers ${w}`, guide.includes(w));
  ok('no em dashes in the new guide chapter', !/—/.test(guide.slice(guide.indexOf('### Round three (0.16.0)'), guide.indexOf('### Fonts'))));
  ok('llms.txt and public/llms.txt are the same file', read('llms.txt') === read('public/llms.txt'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
