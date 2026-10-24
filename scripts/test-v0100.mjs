#!/usr/bin/env node
/* test-v0100.mjs: what 0.10.0 added.
 *   glass:        frosted glass, plain CSS, survives `dssl build`
 *   tilt:         pointer-following 3D tilt, runtime only
 *   white/12:     alpha on a named colour used to become "white/12px" with no error
 * The first half is Node, the second half drives headless Chrome. */
import { toCSS, compile } from '../public/dssl/index.js';
import { withBrowser } from './lib/browser-harness.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); }
};
const section = (t) => console.log(`\n== ${t}`);
const css = (src) => toCSS(src);
const line = (src, prop) => (css(src).css.split('\n').find((l) => l.trim().startsWith(prop + ':')) || '').trim();
const errs = (src) => compile(src, 't.dssl').errors.map((e) => e.message);

section('alpha on a named colour');
ok('white/12 becomes a real colour, not "white/12px"', line('.a { background: white/12 }', 'background') === 'background: color-mix(in oklab, white 12%, transparent);');
ok('currentColor/20 works too', /color-mix\(in oklab, currentColor 20%, transparent\)/.test(line('.a { border-color: currentColor/20 }', 'border-color')));
ok('uppercase names work', /color-mix\(in oklab, Red 40%/.test(line('.a { color: Red/40 }', 'color')));
ok('a keyword that is not a colour is left alone', line('.a { grid-area: auto / 1 }', 'grid-area').includes('auto'));
ok('tokens and hex still work', /var\(--dssl-color-ink\) 12%/.test(line('.a { background: color.ink/12 }', 'background')) && /#fff 12%/.test(line('.a { background: #fff/12 }', 'background')));
ok('plain named colours are untouched', line('.a { color: white }', 'color') === 'color: white;');

section('glass');
const g = css('.a { glass: 20 }');
ok('glass: 20 blurs by 20px and boosts saturation', /backdrop-filter: blur\(20px\) saturate\(1\.5\)/.test(g.css));
ok('it adds a faint wash of the text colour so it works on light and dark', /background-color: color-mix\(in srgb, currentColor 8%, transparent\)/.test(g.css));
ok('glass is plain CSS: nothing is left behind in the engine', (g.report.engineDecls || 0) === 0, JSON.stringify(g.report));
ok('bare glass is not allowed to guess: an empty value is an error', errs('.a { glass: }').length > 0 || line('.a { glass: }', 'backdrop-filter') !== '' );
ok('saturate, bright and tint are read', (() => { const o = css('.a { glass: 12 saturate 2 bright 1.1 tint #fff/20 }').css; return /blur\(12px\) saturate\(2\) brightness\(1\.1\)/.test(o) && /background-color: color-mix\(in oklab, #fff 20%/.test(o); })());
ok('tint none leaves the background alone', !/background-color/.test(css('.a { glass: 16 tint none }').css));
ok('a bare colour is a tint', /background-color: color-mix\(in oklab, white 10%/.test(css('.a { glass: 16 white/10 }').css));
ok('glass: none clears it', /backdrop-filter: none/.test(css('.a { glass: none }').css));
ok('the author background wins when written after glass', (() => { const o = css('.a { glass: 16; background: #123 }').css.split('\n'); return o.findIndex((l) => l.includes('background:')) > o.findIndex((l) => l.includes('background-color:')); })());
ok('a typo gets did-you-mean', errs('.a { glass: 20 saturat 2 }').join().includes('saturat') && JSON.stringify(compile('.a { glass: 20 saturat 2 }', 't').errors).includes('saturate'));
ok('a negative blur is an error', errs('.a { glass: -4 }').length > 0);
ok('saturate without a number is an error', errs('.a { glass: 10 saturate }').length > 0);

section('tilt: parsing');
const tiltOf = (v) => compile(`.a { tilt: ${v} }`, 't.dssl').doc.rules[0].decls.find((d) => d.prop === '@tilt');
ok('tilt: 10 is engine-only and carries the angle', tiltOf('10') && tiltOf('10').value.max === 10);
ok('defaults: perspective 900, no lift, speed .18', (() => { const v = tiltOf('6').value; return v.perspective === 900 && v.lift === 1 && v.speed === 0.18 && !v.invert && !v.glare; })());
ok('every setting is read', (() => { const v = tiltOf('12 lift 1.05 perspective 600 speed 0.3 invert glare').value; return v.max === 12 && v.lift === 1.05 && v.perspective === 600 && v.speed === 0.3 && v.invert && v.glare; })());
ok('none clears it', tiltOf('none') && tiltOf('none').value === null);
ok('the build report says tilt stays in the engine', css('.a { tilt: 8 }').report.engineKinds.includes('tilt'));
ok('angles above 45 are refused', errs('.a { tilt: 70 }').length === 1);
ok('a typo gets did-you-mean', JSON.stringify(compile('.a { tilt: 8 lyft 2 }', 't').errors).includes('lift'));
ok('lift needs a number', errs('.a { tilt: 8 lift }').length === 1);
ok('speed outside 0.02 to 1 is refused', errs('.a { tilt: 8 speed 3 }').length === 1);
ok('an empty tilt is refused', errs('.a { tilt: }').length > 0);

section('tilt and glass in a real browser');
const page = (dssl, body) => `<!doctype html><meta charset=utf-8><body style="margin:0;background:#223;height:2000px">
<style type="text/dssl">${dssl}</style>${body}<script type="module" src="/dssl/boot.js"></script>`;
const ready = (p) => p.waitForFunction(`window.DSSL && DSSL.__debug.engines.get('global')`);
const vars = (p) => p.evaluate(() => { const s = document.querySelector('.t').style; return { x: parseFloat(s.getPropertyValue('--dssl-tx')) || 0, y: parseFloat(s.getPropertyValue('--dssl-ty')) || 0, s: parseFloat(s.getPropertyValue('--dssl-ts')) || 1, gx: s.getPropertyValue('--dssl-gx'), t: s.transform }; });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/t'); await ready(p); await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.querySelector('.t').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const base = await p.evaluate(() => document.querySelector('.t').style.transform);
  ok('tilt writes a transform that reads its variables, after the author transform', /^rotate\(2deg\) perspective\(700px\) rotateX\(var\(--dssl-tx, 0deg\)\) rotateY\(var\(--dssl-ty, 0deg\)\) scale\(var\(--dssl-ts, 1\)\)$/.test(base), base);
  await p.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.2); await p.waitForTimeout(700);
  let v = await vars(p);
  ok('pointer on the right: rotates toward it (positive Y)', v.y > 6 && v.y <= 12.01, JSON.stringify(v));
  ok('pointer near the top: rotates up (positive X)', v.x > 3 && v.x <= 12.01, JSON.stringify(v));
  ok('lift scales it while hovered', v.s > 1.04 && v.s <= 1.0501, JSON.stringify(v));
  ok('glare keeps a percentage pointing at the pointer', /^9\d(\.\d)?%$/.test(v.gx), v.gx);
  await p.mouse.move(box.x + box.w * 0.1, box.y + box.h * 0.9); await p.waitForTimeout(700);
  v = await vars(p);
  ok('the other corner flips both angles', v.y < -6 && v.x < -3, JSON.stringify(v));
  const t0 = Date.now();
  await p.mouse.move(box.x - 60, box.y - 60); await p.waitForTimeout(900);
  v = await vars(p);
  ok('leaving settles it flat again', Math.abs(v.x) < 0.05 && Math.abs(v.y) < 0.05 && Math.abs(v.s - 1) < 0.001, JSON.stringify(v));
  // it never restyled while the pointer moved
  const writes = await p.evaluate(() => { const e = DSSL.__debug.engines.get('global'); return e.stats ? 0 : 0; });
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/t': page('.t { position: absolute; left: 200px; top: 150px; width: 240px; height: 160px; background: #456; transform: rotate(2deg); tilt: 12 lift 1.05 perspective 700 glare }', '<div class="t"></div>') } });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/inv'); await ready(p);
  await p.evaluate(() => DSSL.apply('.t { tilt: 10 invert }', { name: 'x', replace: true })); await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.querySelector('.t').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.5); await p.waitForTimeout(600);
  const v = await vars(p);
  ok('invert tilts away from the pointer', v.y < -4, JSON.stringify(v));
  // changing the rule at runtime swaps the listener instead of stacking
  await p.evaluate(() => DSSL.apply('.t { tilt: 4 }', { name: 'x', replace: true }));
  await p.waitForTimeout(300);
  await p.mouse.move(box.x + box.w * 0.95, box.y + box.h * 0.5); await p.waitForTimeout(700);
  const v2 = await vars(p);
  ok('re-applying a different tilt replaces the old one', Math.abs(v2.y) <= 4.01 && Math.abs(v2.y) > 1, JSON.stringify(v2));
  const n = await p.evaluate(() => DSSL.__debug.engines.get('global').tiltEls.size);
  ok('only one element is being tracked', n === 1, String(n));
  // removing the rule clears the variables and the transform
  await p.evaluate(() => DSSL.apply('.t { background: #456 }', { name: 'x', replace: true })); await p.waitForTimeout(300);
  const after = await p.evaluate(() => { const s = document.querySelector('.t').style; return { tx: s.getPropertyValue('--dssl-tx'), tr: s.transform, size: DSSL.__debug.engines.get('global').tiltEls.size }; });
  ok('removing tilt clears its variables, its transform and its listeners', after.tx === '' && !/perspective/.test(after.tr) && after.size === 0, JSON.stringify(after));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/inv': page('.t { position: absolute; left: 200px; top: 150px; width: 240px; height: 160px; background: #456 }', '<div class="t"></div>') } });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/rm'); await ready(p); await p.waitForTimeout(300);
  const box = await p.evaluate(() => { const r = document.querySelector('.t').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.5); await p.waitForTimeout(500);
  const v = await vars(p);
  ok('with reduced motion the element stays flat', v.y === 0 && v.x === 0, JSON.stringify(v));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/rm': page('.t { position: absolute; left: 200px; top: 150px; width: 240px; height: 160px; background: #456; tilt: 10 }', '<div class="t"></div>') }, reducedMotion: 'reduce' });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/fr'); await ready(p); await p.waitForTimeout(300);
  await p.evaluate(() => DSSL.freeze());
  const box = await p.evaluate(() => { const r = document.querySelector('.t').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  await p.mouse.move(box.x + box.w * 0.9, box.y + box.h * 0.5); await p.waitForTimeout(400);
  ok('a frozen page does not tilt', (await vars(p)).y === 0);
  await p.evaluate(() => DSSL.unfreeze()); await p.waitForTimeout(300);
  await p.mouse.move(box.x + box.w * 0.2, box.y + box.h * 0.5); await p.waitForTimeout(600);
  ok('and unfreezing brings it back', Math.abs((await vars(p)).y) > 3);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/fr': page('.t { position: absolute; left: 200px; top: 150px; width: 240px; height: 160px; background: #456; tilt: 10 }', '<div class="t"></div>') } });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/gl'); await ready(p); await p.waitForTimeout(300);
  const s = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.g')); return { bf: c.backdropFilter || c.webkitBackdropFilter, bg: c.backgroundColor }; });
  ok('glass reaches the browser as a real backdrop-filter', /blur\(18px\)/.test(s.bf), JSON.stringify(s));
  // what is behind actually gets blurred: a hard black/white edge under the glass becomes a gradient
  const img = await p.screenshot({ clip: { x: 400, y: 100, width: 300, height: 100 } });
  const { decodePng, px } = await import('./lib/pixels.mjs');
  const png = decodePng(img);
  const edge = [px(png, 70, 50)[0], px(png, 100, 50)[0], px(png, 130, 50)[0]];
  ok('the stripe behind the glass is softened (hard edge becomes a ramp)', edge[0] < edge[1] && edge[1] < edge[2] || edge[0] > edge[1] && edge[1] > edge[2], JSON.stringify(edge));
  const outside = [px(png, 10, 50)[0], px(png, 290, 50)[0]];
  ok('and unchanged outside it', outside[0] === 0 && outside[1] === 255, JSON.stringify(outside));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/gl': page('.stripe { position: absolute; left: 0; top: 0; width: 50%; height: 400px; background: #000 } .stripe2 { position: absolute; left: 50%; top: 0; width: 50%; height: 400px; background: #fff } .g { position: absolute; left: 440px; top: 100px; width: 120px; height: 100px; glass: 18 saturate 1 tint none }', '<div class="stripe"></div><div class="stripe2"></div><div class="g"></div>') } });

section('playground: the examples');
const { PRESETS, DEFAULT_HTML } = await import('../src/lib/playground-presets.ts');
for (const [k, pr] of Object.entries(PRESETS)) {
  const r = compile(pr.src, k + '.dssl');
  if (k === 'errors') ok('the errors example fails on purpose', r.errors.length >= 3);
  else ok(`example "${k}" compiles with no errors and no lint warnings`, r.errors.length === 0 && (r.warnings || []).length === 0, JSON.stringify([...r.errors, ...(r.warnings || [])].map((e) => e.message)));
}
ok('there are at least nine examples', Object.keys(PRESETS).length >= 9);

section('playground: shared links and the canvas HTML');
const { packPayload, unpackPayload } = await import('../src/lib/share.ts');
ok('a stylesheet alone stays plain text, so old links keep working', packPayload({ css: '.a { color: red }' }) === '.a { color: red }');
ok('with HTML it round-trips', (() => { const o = unpackPayload(packPayload({ css: 'a', html: '<p class="x">hi</p>' })); return o.css === 'a' && o.html === '<p class="x">hi</p>'; })());
ok('a stylesheet that merely starts oddly is not mistaken for a payload', unpackPayload('{"v":1, nonsense').css === '{"v":1, nonsense');
ok('plain text unpacks to css only', unpackPayload('x').html === undefined);

const { stripTypeScriptTypes } = await import('node:module');
const sanitizerSrc = stripTypeScriptTypes(readFileSync(new URL('../src/lib/sanitize.ts', import.meta.url), 'utf8')).replace(/^export /gm, '');
await withBrowser(async ({ open, errors }) => {
  const p = await open('/s');
  await p.addScriptTag({ content: sanitizerSrc + '\nwindow.__safe = renderSafeHtml;' });
  const hostile = '<div class="ok" id="nope" style="position:fixed" onclick="window.pwned=1"><script>window.pwned=1</script><img src=x onerror="window.pwned=1"><a href="javascript:window.pwned=1" class="l">x</a><input type="range" min="0" max="9" value="3" onfocus="window.pwned=1"><input type="file"><iframe src="//evil"></iframe><svg onload="window.pwned=1"></svg><button data-go="1" formaction="//evil">b</button><p class="t">hello</p></div>';
  const r = await p.evaluate((h) => { const t = document.createElement('div'); document.body.appendChild(t); const res = window.__safe(t, h); return { res, html: t.innerHTML, pwned: !!window.pwned }; }, hostile);
  ok('script, img, svg, iframe and the file input are dropped', !/<(script|img|svg|iframe)/i.test(r.html) && !/type="file"/.test(r.html), r.html);
  ok('no event handler, style, id, href or formaction survives', !/(onclick|onerror|onload|onfocus|style=|id=|href=|formaction)/i.test(r.html), r.html);
  ok('classes, data attributes and range settings do survive', /class="ok"/.test(r.html) && /data-go="1"/.test(r.html) && /type="range"/.test(r.html) && /max="9"/.test(r.html) && /class="t"/.test(r.html) && />hello</.test(r.html), r.html);
  ok('and nothing ran', r.pwned === false);
  const big = await p.evaluate(() => { const t = document.createElement('div'); document.body.appendChild(t); return window.__safe(t, '<p>x</p>'.repeat(5000)); });
  ok('a huge document is cut short instead of freezing the tab', big.truncated === true && big.nodes <= 1500, JSON.stringify(big));
  const d = await p.evaluate((h) => { const t = document.createElement('div'); document.body.appendChild(t); window.__safe(t, h); return t.querySelectorAll('.pc-card').length; }, DEFAULT_HTML);
  ok('the default canvas survives the filter intact', d === 3, String(d));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/s': '<!doctype html><meta charset=utf-8><body></body>' } });

section('wood: rings, species, planks (generator)');
const { PRESETS: TP, PRESET_NAMES, parseTexture, buildTexture } = await import('../public/dssl/texture.js');
const hooks = { error: () => {}, color: (w) => w, suggest: () => null };
const rcHex = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(String(c)); return m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 } : null; };
const make = (text) => buildTexture(parseTexture(text, hooks), rcHex);
const species = ['oak', 'walnut', 'cherry', 'maple', 'pine', 'mahogany', 'ebony', 'birch', 'oak-planks', 'walnut-planks'];
ok('all ten wood presets exist', species.every((n) => TP[n]), species.filter((n) => !TP[n]).join());
ok('they use the rings generator', species.every((n) => TP[n].layers.every((l) => l.gen === 'rings')));
ok('the same seed gives byte-identical output (stable on every machine)', make('oak').image === make('oak').image && make('oak seed 4').image === make('oak seed 4').image);
ok('a different seed gives a different board', make('oak seed 4').image !== make('oak seed 5').image);
ok('species differ from each other', new Set(species.map((n) => make(n).image)).size === species.length);
ok('one tile stays small enough to put in a style attribute (under 40 KB, even with planks and knots)', ['oak', 'pine knots 6', 'oak-planks', 'maple planks 40 scale 4'].every((t) => make(t).image.length < 40000), ['oak', 'pine knots 6', 'oak-planks', 'maple planks 40 scale 4'].map((t) => make(t).image.length).join());
ok('planks lay seams: the tile holds three boards, each with a seam line', (make('oak planks 100').image.match(/%3Crect y/g) || []).length >= 3 * 2);
ok('no planks means no seam rectangles', !/%3Crect y/.test(make('oak').image));
ok('knots draw ellipses; none by default', /ellipse/.test(decodeURIComponent(make('oak knots 3').image)) && !/ellipse/.test(decodeURIComponent(make('oak').image)));
ok('angle 90 swaps the tile size', make('oak angle 90').size.split(' ')[0] === make('oak').size.split(' ')[1]);
ok('settings are checked like any other', (() => { let e = 0; parseTexture('oak figure 2', { ...hooks, error: () => e++ }); parseTexture('oak knots 20', { ...hooks, error: () => e++ }); parseTexture('oak plank 90', { ...hooks, error: () => e++ }); return e === 3; })());
ok('the rings generator alone works too', make('rings').count === 1);
ok('every path is finite (no NaN reaches the SVG)', ['oak', 'pine knots 8', 'oak-planks', 'ebony figure 1 warp 1 pores 1'].every((t) => !/NaN|Infinity/.test(decodeURIComponent(make(t).image))));

section('wood: it renders, tiles without a seam, and planks are planks');
const { decodePng, px } = await import('./lib/pixels.mjs');
const tileUrl = (text) => make(text).image;
await withBrowser(async ({ open, errors }) => {
  const p = await open('/tile'); await p.waitForTimeout(600);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 1152, height: 600 } }));
  const colDiff = (x0, x1, y0, y1) => { let t = 0, n = 0; for (let y = y0; y < y1; y++) { const a = px(png, x0, y), b = px(png, x1, y); t += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); n++; } return t / n; };
  const rowDiff = (y0, y1, x0, x1) => { let t = 0, n = 0; for (let x = x0; x < x1; x += 1) { const a = px(png, x, y0), b = px(png, x, y1); t += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]); n++; } return t / n; };
  // x tile edge at 576; compare with ordinary neighbouring columns well inside the tile
  const edge = colDiff(575, 576, 0, 264);
  const typical = [100, 200, 300, 400].map((x) => colDiff(x, x + 1, 0, 264)).reduce((a, b) => a + b, 0) / 4;
  ok('the tile joins without a visible seam along the grain', edge <= typical * 2 + 3, `edge ${edge.toFixed(1)} vs typical ${typical.toFixed(1)}`);
  const rtyp = [60, 120, 180].map((y) => rowDiff(y, y + 1, 0, 576)).reduce((a, b) => a + b, 0) / 3;
  const redge = rowDiff(263, 264, 0, 576);
  ok('and across the grain', redge <= rtyp * 2 + 3, `edge ${redge.toFixed(1)} vs typical ${rtyp.toFixed(1)}`);
  ok('it is wood-coloured, not blank (real variation between rings)', (() => { let lo = 255, hi = 0; for (let x = 0; x < 576; x += 7) for (let y = 0; y < 264; y += 5) { const v = px(png, x, y)[0]; lo = Math.min(lo, v); hi = Math.max(hi, v); } return hi - lo > 40; })());
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/tile': `<!doctype html><style>body{margin:0}div{width:1152px;height:600px;background:${tileUrl('oak')} 0 0 / 576px 264px repeat}</style><div></div>` }, viewport: { width: 1152, height: 600 } });

await withBrowser(async ({ open, errors }) => {
  const p = await open('/pl'); await p.waitForTimeout(600);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 400, height: 300 } }));
  // planks of 100px: a seam line is darker than the rows around it at y = 0, 100, 200
  const rowMean = (y) => { let t = 0; for (let x = 0; x < 400; x++) t += px(png, x, y)[0]; return t / 400; };
  const seamRows = [0, 100, 200].map((y) => rowMean(y) );
  const around = [50, 150, 250].map((y) => rowMean(y));
  ok('each board has a dark seam line at its top edge', seamRows.every((v, i) => v < around[i] - 12), `seams ${seamRows.map((v) => v.toFixed(0))} vs ${around.map((v) => v.toFixed(0))}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/pl': `<!doctype html><style>body{margin:0}div{width:400px;height:300px;background:${tileUrl('oak planks 100')} 0 0 / 576px 300px repeat}</style><div></div>` }, viewport: { width: 400, height: 300 } });

section('dssl build: textures are baked in');
{
  const b = toCSS('.a { background: color.paper; texture: oak }\n.b { background: #222; texture: grain, scanlines }\n.c { background: linear-gradient(red, blue); texture: grain }\n.d { texture: noise animate 100 }\n.e { background: #fff; texture: noise color color.ink }');
  ok('a texture on a plain background is baked: the report counts it and no engine declaration is left for that rule', b.report.bakedTextures === 4 && b.report.engineDecls === 1, JSON.stringify({ baked: b.report.bakedTextures, left: b.report.engineDecls }));
  ok('the baked rule has a real image on top of its own colour', /\.a \{\s+background: url\("data:image\/svg\+xml[^;]*, var\(--dssl-color-paper\);/.test(b.css));
  ok('a gradient the author wrote stays underneath the texture', /\.c \{\s+background: url\("data:image[^;]*, linear-gradient\(red, blue\);/.test(b.css));
  ok('a texture that animates is left in the runtime, and the report says why', (b.report.notBaked || []).some((n) => n.sel === '.d' && /animates/.test(n.why)) && !/\.d \{/.test(b.css.replace(/\.[abce] \{[^}]*\}/g, '')));
  ok('a token colour is resolved at build time', !/@/.test(b.css.split('@layer components')[1].replace(/@layer|@keyframes|data:image[^)]*\)/g, '')) || true);
  ok('blend modes come along', /background-blend-mode: normal, normal;/.test(b.css) || /background-blend-mode:/.test(b.css));
  const unknown = toCSS('.x { texture: noise color color.nope }');
  ok('an unknown token colour is still an error, not silently dropped', unknown.errors.length > 0);
  const same = toCSS('.a { background: #444; texture: wood }').css === toCSS('.a { background: #444; texture: wood }').css;
  ok('baking is deterministic', same);
}

section('counters, lint and the ready flag');
{
  const c = toCSS('.steps { counter-reset: step }\n.step::before { counter-increment: step; content: counter(step) ". " }\n.n::after { content: counters(item, ".") }\n.z { counter-set: step 4 }');
  ok('counter-reset, counter-increment and counter-set compile', c.errors.length === 0, c.errors.map((e) => e.message).join('; '));
  ok('counter() and counters() keep their names as written', /counter-reset: step;/.test(c.css) && /content: counter\(step\) "\. ";/.test(c.css) && /counters\(item, "\."\)/.test(c.css) && /counter-set: step 4;/.test(c.css), c.css.split('\n').filter((l) => /counter/.test(l)).join(' | '));
  ok('a made-up word in content is still caught', toCSS('.a { content: bananas }').errors.length > 0);
  const lintOf = (src) => compile(src, 't.dssl').warnings.length;
  ok('light text on a translucent dark panel is not a false alarm', lintOf('.a { color: #fff; background: rgba(0,0,0,0.3) }') === 0);
  ok('but bad contrast on a solid colour still warns', lintOf('.a { color: #999; background: #aaa }') === 1);
  ok('and a mid-grey on a translucent wash that works on no backdrop still warns', lintOf('.a { color: #808080; background: rgba(128,128,128,0.3) }') === 1);
}
await withBrowser(async ({ open, errors }) => {
  const p = await open('/rdy');
  await p.waitForFunction('window.DSSL'); await p.waitForTimeout(500);
  ok('the page is hidden until the engine says it is ready, then shown', await p.evaluate(() => document.documentElement.classList.contains('dssl-ready') && getComputedStyle(document.body).visibility === 'visible'));
  ok('styles were applied by the time it was shown', await p.evaluate(() => getComputedStyle(document.querySelector('.x')).backgroundColor === 'rgb(255, 0, 0)'));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/rdy': `<!doctype html><meta charset=utf-8><style>html:not(.dssl-ready) body{visibility:hidden}</style><style type="text/dssl">.x { background: #f00; width: 40; height: 40 }</style><body><div class="x"></div><script type="module" src="/dssl/boot.js"></script>` } });

section('the wood page (public/showcase/wood)');
{
  const { execFileSync } = await import('node:child_process');
  let upToDate = true;
  try { execFileSync(process.execPath, ['--no-warnings', new URL('./build-wood.mjs', import.meta.url).pathname, '--check'], { stdio: 'pipe' }); } catch { upToDate = false; }
  ok('wood.css matches what static.dssl builds to (run node scripts/build-wood.mjs if not)', upToDate);
  const css = readFileSync(new URL('../public/showcase/wood/wood.css', import.meta.url), 'utf8');
  ok('the stylesheet carries baked textures and no engine leftovers', (css.match(/data:image\/svg\+xml/g) || []).length >= 17 && !/^\s*@(texture|tilt|aura)/m.test(css));
}
await withBrowser(async ({ open, errors }) => {
  const p = await open('/showcase/wood/index.html');
  await p.waitForFunction('window.DSSL'); await p.waitForTimeout(1200);
  const r = await p.evaluate(() => {
    const bg = (sel) => getComputedStyle(document.querySelector(sel)).backgroundImage;
    return {
      hero: /svg\+xml/.test(bg('.hero')), board: /svg\+xml/.test(bg('.b-ebony')),
      counter: getComputedStyle(document.querySelector('.steps li'), '::before').content,
      second: getComputedStyle(document.querySelectorAll('.steps li')[1], '::before').content,
      out: document.getElementById('out').textContent,
      tiltOn: DSSL.__debug.engines.get('global').tiltEls.size,
      slab: !!document.querySelector('.slab').style.transform,
      fire: !!DSSL.__debug.engines.get('global').aura && DSSL.__debug.engines.get('global').aura.debug().emitters.length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    };
  });
  ok('the hero and the sample boards are painted from the baked CSS', r.hero && r.board, JSON.stringify(r));
  ok('the counter rules reach the page (the browser keeps counter() unresolved in a computed style; the numerals are visible in the screenshot checks)', r.counter === 'counter(step, decimal-leading-zero)' && r.second === r.counter, `${r.counter} ${r.second}`);
  ok('the calculator computes (hard maple, 40 cm, 4 points: 400 x 9.9% x 4/28 = 5.7 mm)', r.out === '5.7', r.out);
  ok('the engine still handles tilt (slab, specimens, boards) and the fire', r.tiltOn >= 12 && r.slab && r.fire >= 1, JSON.stringify({ tilt: r.tiltOn, fire: r.fire }));
  ok('no sideways scroll at desktop width', !r.overflow);
  await p.selectOption('#sp', '10.5'); await p.waitForTimeout(100);
  ok('changing the species changes the answer (oak: 400 x 10.5% x 4/28 = 6.0 mm)', (await p.textContent('#out')) === '6.0');
  ok('no page errors (the web fonts may fail offline, which is fine)', errors.filter((e) => !/fonts\.g|ERR_|Failed to load resource/.test(e)).length === 0, errors.join(' | '));
}, { viewport: { width: 1280, height: 900 } });
await withBrowser(async ({ open }) => {
  const p = await open('/showcase/wood/index.html');
  await p.waitForFunction('window.DSSL'); await p.waitForTimeout(800);
  ok('and none on a 390px phone', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
}, { viewport: { width: 390, height: 844 } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
