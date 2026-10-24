#!/usr/bin/env node
/* test-v0120.mjs: what 0.12.0 added.
 *   texture: symmetrical     mirrored tiling, so the repeat hides and every edge continues
 *   fonts { }                Google fonts and your own files, no raw CSS
 *   gradient:                repeating, colour spaces, midpoints, hard bands, mesh, layers
 *   DSSL.inspect()           which rule produced which style, in the page
 *   DSSL.watch(), dssl dev   edit a .dssl file and the open page restyles in place
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compile, toCSS, VERSION } from '../public/dssl/index.js';
import { parseTexture, buildTexture } from '../public/dssl/texture.js';
import { withBrowser } from './lib/browser-harness.mjs';
import { decodePng, px, dist } from './lib/pixels.mjs';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); }
};
const section = (t) => console.log(`\n== ${t}`);
const errs = (src) => compile(src, 't.dssl').errors;
const hooks = (list) => ({ error: (m) => list && list.push(m), color: (w) => w, suggest: () => null });
const rcHex = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(String(c)); return m ? { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 } : null; };
const make = (t, list) => { const L = parseTexture(t, hooks(list)); return L && buildTexture(L, rcHex); };

section('symmetrical: parsing');
{
  const bare = parseTexture('oak symmetrical', hooks())[0], x = parseTexture('oak symmetrical x', hooks())[0], y = parseTexture('oak symmetrical y', hooks())[0], b = parseTexture('oak symmetrical both', hooks())[0];
  ok('bare symmetrical means both ways', bare.symmetrical === 'both' && b.symmetrical === 'both');
  ok('x and y are read', x.symmetrical === 'x' && y.symmetrical === 'y');
  ok('it can sit in the middle of the other settings', parseTexture('oak symmetrical scale 8', hooks())[0].scale === 8 && parseTexture('oak symmetrical scale 8', hooks())[0].symmetrical === 'both');
  const e = []; parseTexture('oak symmetrical z', hooks(e));
  ok('a typo after it is still an error, not a silent "both"', e.length === 1 && /unknown texture setting "z"/.test(e[0]), e.join());
}

section('symmetrical: the tile');
{
  const plain = make('oak'), both = make('oak symmetrical'), xo = make('oak symmetrical x'), yo = make('oak symmetrical y');
  ok('both ways doubles the tile in both directions', plain.size === '576px 264px' && both.size === '1152px 528px', both.size);
  ok('x only doubles the width, y only the height', xo.size === '1152px 264px' && yo.size === '576px 528px', `${xo.size} / ${yo.size}`);
  const svg = (t) => decodeURIComponent(t.image.slice(t.image.indexOf(',') + 1, -2));
  ok('the mirrored copies are drawn by flipping one copy, not by repeating the data four times', (svg(both).match(/<use /g) || []).length === 4 && (svg(both).match(/<image /g) || []).length === 1);
  ok('same seed, same bytes', make('oak symmetrical seed 4').image === make('oak symmetrical seed 4').image);
  ok('textures that are plain CSS patterns are left alone', make('lines symmetrical').image === make('lines').image);
  ok('it works on noise, planks and several layers', make('noise symmetrical').count === 1 && make('oak-planks symmetrical').count === 1 && make('grain symmetrical, oak symmetrical').count === 2);
  ok('stays small: one copy of the image, however many flips', make('oak symmetrical').image.length < make('oak').image.length * 1.15 + 1500, `${make('oak').image.length} -> ${make('oak symmetrical').image.length}`);
}

section('symmetrical: pixels');
const tilePage = (image, w, h, size) => `<!doctype html><style>body{margin:0}div{width:${w}px;height:${h}px;background:${image} 0 0 / ${size} repeat}</style><div></div>`;
await withBrowser(async ({ open, errors }) => {
  const t = make('noise symmetrical scale 4 seed 3');
  const p = await open('/m'); await p.waitForTimeout(500);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 600, height: 300 } }));
  const [W, H] = t.size.split(' ').map((v) => parseInt(v));
  // noise is per-pixel random, so allow the mirror to land within a pixel either side of where it should
  const near = (a, b) => dist(a, b) < 14;
  const any = (p, xs, ys) => { for (const dx of [0, -1, 1]) for (const dy of [0, -1, 1]) if (near(p, px(png, xs + dx, ys + dy))) return true; return false; };
  let mx = 0, my = 0, both = 0, n = 0;
  for (let y = 5; y < Math.min(H - 5, 290); y += 17) for (let x = 5; x < Math.min(W - 5, 590); x += 13) {
    n++;
    if (any(px(png, x, y), W - 1 - x, y)) mx++;
    if (any(px(png, x, y), x, H - 1 - y)) my++;
    if (any(px(png, x, y), W - 1 - x, H - 1 - y)) both++;
  }
  ok('the left half is the right half flipped', mx / n > 0.95, `${mx}/${n}`);
  ok('the top half is the bottom half flipped', my / n > 0.95, `${my}/${n}`);
  ok('and the opposite corner is both', both / n > 0.95, `${both}/${n}`);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/m': tilePage(make('noise symmetrical scale 4 seed 3').image, 600, 300, make('noise symmetrical scale 4 seed 3').size) }, viewport: { width: 600, height: 300 } });
await withBrowser(async ({ open }) => {
  const t = make('oak symmetrical');
  const p = await open('/o'); await p.waitForTimeout(600);
  const png = decodePng(await p.screenshot({ clip: { x: 0, y: 0, width: 1400, height: 700 } }));
  const colDiff = (a, b) => { let s = 0, c = 0; for (let y = 0; y < 520; y += 2) { const u = px(png, a, y), v = px(png, b, y); s += Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]); c++; } return s / c; };
  const typical = [100, 300, 700, 900].map((x) => colDiff(x, x + 1)).reduce((a, b) => a + b) / 4;
  ok('across the mirror line (x = 576, the old tile edge) the grain continues', colDiff(575, 576) <= typical * 2 + 3, `${colDiff(575, 576).toFixed(1)} vs ${typical.toFixed(1)}`);
  ok('and across the period (x = 1152)', colDiff(1151, 1152) <= typical * 2 + 3, `${colDiff(1151, 1152).toFixed(1)} vs ${typical.toFixed(1)}`);
}, { pages: { '/o': tilePage(make('oak symmetrical').image, 1400, 700, make('oak symmetrical').size) }, viewport: { width: 1400, height: 700 } });

section('fonts');
{
  const r = toCSS('fonts {\n  Fraunces: 500 700 800\n  "Hanken Grotesk": 400 700 italic\n  Inter: 100..900 display optional\n  Brand: from "/fonts/brand.woff2" 400\n  Brand: from "/fonts/brand-bold.woff" 700 italic\n}\n.a { font-family: "Fraunces", serif }');
  ok('compiles with no errors', r.errors.length === 0, JSON.stringify(r.errors));
  ok('Google families become one @import, first in the CSS (after the banner)', /^\/\*[\s\S]*?\*\/\n@import url\("https:\/\/fonts\.googleapis\.com\/css2\?family=Fraunces:wght@500;700;800&family=Hanken\+Grotesk:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@100\.\.900&display=optional"\);\n/.test(r.css), r.css.slice(0, 500));
  ok('the @import comes before the @layer statement and every rule', r.css.indexOf('@import') < r.css.indexOf('@layer'));
  ok('your own files become @font-face, with the format guessed from the extension', /@font-face \{\s+font-family: "Brand";\s+src: url\("\/fonts\/brand\.woff2"\) format\("woff2"\);\s+font-weight: 400;\s+font-style: normal;/.test(r.css) && /format\("woff"\);\s+font-weight: 700;\s+font-style: italic/.test(r.css));
  ok('the report counts the faces as raw CSS', r.report.raws === 2, String(r.report.raws));
  ok('a variable range is kept as a range', /Inter:wght@100\.\.900/.test(r.css));
  ok('with no weights the family is requested whole, or with its italic', /family=Lora&display=swap/.test(toCSS('fonts { Lora: display swap }').css) && /family=Lora:ital@0;1&display=swap/.test(toCSS('fonts { Lora: italic }').css));
  ok('display defaults to swap', /&display=swap"/.test(toCSS('fonts { Lora: 400 }').css));
  const bad = (src) => errs(src).map((e) => e.message).join(' | ');
  ok('an unknown word is an error with a hint', /unknown font setting "bold"/.test(bad('fonts {\n Lora: 400 bold\n}')));
  ok('a missing colon is an error', /expected "Family: weights"/.test(bad('fonts {\n Lora 400\n}')));
  ok('one file with two weights is refused', /one font file holds one weight/.test(bad('fonts {\n X: from "a.woff2" 400 700\n}')));
  ok('a bad display value is refused', /display needs one of/.test(bad('fonts {\n X: 400 display fast\n}')));
  ok('a weight out of range is refused', /is not a font weight/.test(bad('fonts {\n X: 4000\n}')));
  ok('inside a rule it is refused', /must be top-level/.test(bad('.a { fonts { X: 400 } }')));
  ok('error lines point at the right line', errs('.a { color: red }\n\nfonts {\n  Lora 400\n}')[0].line === 4, String(errs('.a { color: red }\n\nfonts {\n  Lora 400\n}')[0].line));
  ok('comments inside the block are ignored', errs('fonts {\n  // the display face\n  Lora: 400 // regular\n}').length === 0);
}

section('gradients');
{
  const g = (v) => { const r = compile(`.a { gradient: ${v} }`); const d = r.doc.rules[0] && r.doc.rules[0].decls.find((x) => x.prop === 'background-image'); return { v: d && d.value, e: r.errors.map((e) => e.message) }; };
  ok('the original sentence still works', g('linear 135, #ff0055 -> #00d4ff').v === 'linear-gradient(135deg, #ff0055, #00d4ff)');
  ok('repeating stripes with plain numbers as px', g('repeating linear 45, #fff 0 10, #000 10 20').v === 'repeating-linear-gradient(45deg, #fff 0 10px, #000 10px 20px)');
  ok('repeating radial and conic', /^repeating-radial-gradient\(circle, #fff 0 8px/.test(g('repeating radial circle, #fff 0 8, #000 8 16').v) && /^repeating-conic-gradient\(/.test(g('repeating conic, #f00 0 30, #00f 30 60').v));
  ok('conic positions are degrees', /#0f0 120deg/.test(g('conic from 45, #f00 0, #0f0 120, #00f 240').v));
  ok('the colour space of the blend', g('linear 90 in oklch, #f00 -> #00f').v === 'linear-gradient(90deg in oklch, #f00, #00f)' && g('linear 90 in hsl longer hue, #f00, #00f').v === 'linear-gradient(90deg in hsl longer hue, #f00, #00f)');
  ok('a colour space alone, with no angle', g('linear in oklab, #f00 -> #00f').v === 'linear-gradient(180deg in oklab, #f00, #00f)');
  ok('a lone position is a midpoint', g('linear 90, #f00 -> 30% -> #00f').v === 'linear-gradient(90deg, #f00, 30%, #00f)');
  ok('a midpoint at the edge is an error', g('linear 90, 30% -> #f00 -> #00f').e.length === 1);
  ok('hard bands with two positions', g('linear 90, #f00 0 30%, #00f 30% 100%').v === 'linear-gradient(90deg, #f00 0 30%, #00f 30% 100%)');
  ok('layers with +, first on top', /^radial-gradient\(at top left, color-mix\([^)]*\), transparent\), linear-gradient\(135deg, #123, #456\)$/.test(g('radial at top left, #fff/40 -> transparent + linear 135, #123 -> #456').v));
  const mesh = g('mesh #fff4e6, #ff7a1a at 15% 20%, #c2185b at 80% 30% size 40%').v;
  ok('mesh: soft blobs over a base colour', /^radial-gradient\(circle farthest-side at 15% 20%, #ff7a1a, transparent 60%\), radial-gradient\(circle farthest-side at 80% 30%, #c2185b, transparent 40%\), linear-gradient\(#fff4e6, #fff4e6\)$/.test(mesh), mesh);
  ok('mesh needs a base and a blob, and a position per blob', g('mesh #fff').e.length === 1 && g('mesh #fff, #f00 at 10%').e.length === 1);
  ok('a direction is optional: stops can follow the kind straight away', g('conic, #f00 -> #00f').v === 'conic-gradient(#f00, #00f)' && g('linear #f00 -> #00f').v === 'linear-gradient(180deg, #f00, #00f)' && g('radial #fff -> #000').v === 'radial-gradient(#fff, #000)');
  ok('bad colours are still caught inside the new forms', g('repeating linear 45, banana 0 10, #000 10 20').e.length >= 1);
  ok('gradient-text takes the layered form too', compile('.a { gradient-text: linear 90, #f00 -> #00f }').errors.length === 0);
}

section('inspector and hot reload (real browser)');
const page = (extra = '') => `<!doctype html><meta charset=utf-8><body style="margin:0"><style type="text/dssl" data-dssl-name="inline.dssl">.box { position: absolute; left: 40px; top: 40px; width: 200px; height: 120px; background: #345; radius: 12 }\n.box { color: #fff }</style><div class="box">hello</div>${extra}<script type="module" src="/dssl/boot.js"></script>`;
const ready = (p) => p.waitForFunction(`window.DSSL && DSSL.__debug.engines.get('global')`);
await withBrowser(async ({ open, errors }) => {
  const p = await open('/i'); await ready(p); await p.waitForTimeout(300);
  ok('the dev tools are not loaded for a normal visitor', await p.evaluate(() => !document.getElementById('dssl-dev-host')));
  await p.evaluate(() => DSSL.inspect()); await p.waitForTimeout(200);
  ok('DSSL.inspect() opens the panel', await p.evaluate(() => !!document.getElementById('dssl-dev-host')));
  await p.mouse.move(100, 80); await p.waitForTimeout(300);
  const text = await p.evaluate(() => document.getElementById('dssl-dev-host').shadowRoot.querySelector('.body').innerText);
  ok('hovering shows the element, the winning declarations and where they came from', /div\.box/.test(text) && /background: #345/.test(text) && /inline\.dssl:1/.test(text) && /color: #fff/.test(text), text.slice(0, 300));
  ok('and the rules in cascade order', /\.box[\s\S]*\.box/.test(text.split('rules, in cascade order')[1] || ''));
  const box = await p.evaluate(() => { const b = document.getElementById('dssl-dev-host').shadowRoot.querySelector('.box'); return { w: parseFloat(b.style.width), h: parseFloat(b.style.height) }; });
  ok('the element under the pointer is outlined', Math.abs(box.w - 200) < 2 && Math.abs(box.h - 120) < 2, JSON.stringify(box));
  await p.mouse.click(100, 80); await p.mouse.move(600, 500); await p.waitForTimeout(200);
  ok('clicking pins it, so moving away keeps its rules on screen', await p.evaluate(() => /div\.box/.test(document.getElementById('dssl-dev-host').shadowRoot.querySelector('.body').innerText)));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok('Escape releases the pin, then closes', await p.evaluate(() => !!document.getElementById('dssl-dev-host'))); // first Esc only released
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok('the second Escape closes it and leaves nothing behind', await p.evaluate(() => !document.getElementById('dssl-dev-host')));
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/i': page() }, viewport: { width: 800, height: 600 } });

{
  const files = { '/s.dssl': '.w { background: #f00; width: 80px; height: 40px }' };
  const pages = { '/w': `<!doctype html><meta charset=utf-8><body><div class="w">x</div><script type="module" src="/dssl/boot.js" data-watch></script><link rel="stylesheet/dssl" href="/s.dssl">`, '/s.dssl': files['/s.dssl'] };
  await withBrowser(async ({ open, errors }) => {
    const p = await open('/w'); await ready(p); await p.waitForTimeout(500);
    await p.evaluate(() => { window.__marker = 'same page'; });
    const bg = () => p.evaluate(() => getComputedStyle(document.querySelector('.w')).backgroundColor);
    ok('data-watch turns hot reload on from the script tag', (await bg()) === 'rgb(255, 0, 0)');
    pages['/s.dssl'] = '.w { background: #0a0; width: 80px; height: 40px }';
    await p.waitForFunction(`getComputedStyle(document.querySelector('.w')).backgroundColor === 'rgb(0, 170, 0)'`, null, { timeout: 5000 });
    ok('editing the file restyles the page', (await bg()) === 'rgb(0, 170, 0)');
    ok('without reloading it (state survives)', (await p.evaluate(() => window.__marker)) === 'same page');
    ok('and says so', /reloaded s\.dssl/.test(await p.evaluate(() => document.querySelector('div[role=status]') && document.querySelector('div[role=status]').textContent) || ''));
    pages['/s.dssl'] = '.w { backgrond: #00f; width: 80px }';
    await p.waitForFunction(`document.querySelector('div[role=status]') && /error/.test(document.querySelector('div[role=status]').textContent)`, null, { timeout: 5000 });
    const toast = await p.evaluate(() => document.querySelector('div[role=status]').textContent);
    ok('a mistake in the file shows the error and line, on the page', /1 error, line 1: unknown property "backgrond"/.test(toast), toast);
    pages['/s.dssl'] = '.w { background: #00f; width: 80px; height: 40px }';
    await p.waitForFunction(`getComputedStyle(document.querySelector('.w')).backgroundColor === 'rgb(0, 0, 255)'`, null, { timeout: 5000 });
    ok('fixing it recovers', true);
    await p.evaluate(() => DSSL.watch(false)); const before = await bg();
    pages['/s.dssl'] = '.w { background: #fff; width: 80px; height: 40px }'; await p.waitForTimeout(1800);
    ok('DSSL.watch(false) stops following', (await bg()) === before);
    ok('no page errors', errors.length === 0, errors.join(' | '));
  }, { pages, viewport: { width: 400, height: 300 } });
}

section('dssl dev');
{
  const dir = mkdtempSync(join(tmpdir(), 'dssl-dev-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><body><div class="x">hi</div><script type="module" src="/dssl/boot.js"></script><link rel="stylesheet/dssl" href="s.dssl"></body>');
  writeFileSync(join(dir, 's.dssl'), '.x { color: red }');
  const port = 4200 + Math.floor(Math.random() * 500);
  const child = spawn(process.execPath, ['--no-warnings', new URL('../cli/dssl.mjs', import.meta.url).pathname, 'dev', dir, '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; child.stdout.on('data', (d) => { out += d; });
  for (let i = 0; i < 40 && !/localhost/.test(out); i++) await new Promise((r) => setTimeout(r, 100));
  try {
    const res = await fetch(`http://localhost:${port}/`);
    const html = await res.text();
    ok('serves the page and adds DSSL.watch() to it', res.status === 200 && /DSSL\.watch\(\)/.test(html) && /<\/script><\/body>$/.test(html.trim()));
    ok('never caches, so a reload always sees the latest file', res.headers.get('cache-control') === 'no-store');
    ok('serves the engine from the install when the folder has none', (await fetch(`http://localhost:${port}/dssl/boot.js`)).status === 200);
    ok('serves your .dssl files untouched', (await (await fetch(`http://localhost:${port}/s.dssl`)).text()) === '.x { color: red }');
    ok('refuses to leave the folder', (await fetch(`http://localhost:${port}/..%2f..%2fetc%2fpasswd`)).status !== 200);
    ok('404 for a missing file', (await fetch(`http://localhost:${port}/nope.css`)).status === 404);
  } finally { child.kill(); }
}

section('versions');
ok('the engine says 0.12.x or later', /^0\.(1[2-9]|[2-9]\d)\./.test(VERSION), VERSION);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
