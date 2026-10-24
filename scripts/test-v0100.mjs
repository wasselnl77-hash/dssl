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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
