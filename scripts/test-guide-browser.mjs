#!/usr/bin/env node
/* test-guide-browser.mjs — DOM-level tests for the docs (review item 3).
 *
 * The between-center bug compiled clean and laid out wrong, which is exactly
 * the gap "it compiles" cannot cover. This harness serves the repo over a
 * local port, boots the REAL engine in headless Chromium, applies every
 * GUIDE.md example via the documented <script type="text/dssl"> boot path,
 * and asserts the computed styles the guide promises. Run before any release. */
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const PORT = 8931 + Math.floor(Math.random() * 200);

const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = req.url.split('?')[0];
  if (p === '/favicon.ico') { res.writeHead(204); return res.end(); }
  // the site serves /dssl/* out of public/ — mirror that mapping
  const file = p.startsWith('/dssl/')
    ? join(ROOT, 'public', p.slice(1))
    : join(ROOT, p === '/' ? 'index.html' : p.slice(1));
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise(r => server.listen(PORT, '127.0.0.1', r));

// the five GUIDE.md blocks, verbatim, applied through the auto-boot path
const guide = readFileSync(join(ROOT, 'GUIDE.md'), 'utf8');
const blocks = [...guide.matchAll(/```dssl\n([\s\S]*?)```/g)].map(m => m[1]);
if (blocks.length < 5) { console.error('expected 5 guide blocks, found ' + blocks.length); process.exit(1); }

const html = `<!doctype html><html><head><meta charset="utf8">
<style>body { margin: 0 } .board { width: 600px; container-type: inline-size } .gallery { width: 400px }</style>
</head><body>
<div class="card">card</div>
<div class="toolbar"><span>a</span><span>b</span></div>
<div class="sidebar"><span>a</span><span>b</span></div>
<div class="board"><span>1</span><span>2</span><span>3</span><span>4</span></div>
<div class="gallery"><span>1</span><span>2</span><span>3</span></div>
<div class="modal"><span>mid</span></div>
<div class="hero"><span>hero</span></div>
${blocks.map(b => `<script type="text/dssl">\n${b}\n</script>`).join('\n')}
<script type="module">
  import '/dssl/index.js';
</script>
</body></html>`;

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
};

// served over the local server so module imports are same-origin
const harnessPath = join(ROOT, '.guide-harness.html');
writeFileSync(harnessPath, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(m.type() + ': ' + m.text()); });
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));

await page.goto(`http://127.0.0.1:${PORT}/.guide-harness.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.DSSL && window.__dsslBooted, { timeout: 8000 }).catch(() => {});
await page.waitForTimeout(600); // IntersectionObserver + animations settle

const cs = (sel, prop, pseudo) => page.evaluate(([sel, prop, pseudo]) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  return getComputedStyle(el, pseudo || null).getPropertyValue(prop).trim();
}, [sel, prop, pseudo]);

/* block 1 — tokens + card base. Note: the guide composes — block 4 adds
 * @media 768 { padding: 24 }, which legitimately wins at 1200px wide. */
ok('B1 card background is the token ink value', (await cs('.card', 'background-color')) === 'rgb(22, 22, 29)', await cs('.card', 'background-color'));
ok('B1 card padding at 1200px is block 4\'s @media 768 value (24px)', (await cs('.card', 'padding')) === '24px', await cs('.card', 'padding'));
ok('B1 card radius is radius.md (14px)', (await cs('.card', 'border-radius')) === '14px', await cs('.card', 'border-radius'));
ok('B1 card shadow resolves the md token (0 2 4 + alpha)', (await cs('.card', 'box-shadow')).includes('0px 2px 4px'), await cs('.card', 'box-shadow'));

/* block 2 — the layout words (the between-center bug lives here) */
ok('B2 toolbar justify-content space-between (the review bug)', (await cs('.toolbar', 'justify-content')) === 'space-between', await cs('.toolbar', 'justify-content'));
ok('B2 toolbar align-items center survives the same line', (await cs('.toolbar', 'align-items')) === 'center', await cs('.toolbar', 'align-items'));
ok('B2 toolbar is flex row with 8px gap', (await cs('.toolbar', 'display')) === 'flex' && (await cs('.toolbar', 'gap')) === '8px');
ok('B2 sidebar is a column with 16px gap', (await cs('.sidebar', 'flex-direction')) === 'column' && (await cs('.sidebar', 'gap')) === '16px');
const boardCols = await cs('.board', 'grid-template-columns');
ok('B2 board is a grid (auto-fill 220 form wins as the later rule)', (await cs('.board', 'display')) === 'grid' && boardCols.split(' ').length >= 2, boardCols);
ok('B2 gallery grid: 2 cols, rows 3, gap 8', (await cs('.gallery', 'grid-template-columns')).split(' ').length === 2 && (await cs('.gallery', 'gap')) === '8px', `${await cs('.gallery', 'grid-template-columns')} / ${await cs('.gallery', 'gap')}`);
const modalAI = await cs('.modal', 'align-items'), modalJI = await cs('.modal', 'justify-items');
ok('B2 modal stack centers both axes', modalAI === 'center' && modalJI === 'center', `${modalAI} / ${modalJI}`);
const heroPlace = await cs('.hero', 'place-items');
ok('B2 hero center: both centers everything', (heroPlace === 'center center') || (await cs('.hero', 'display')) === 'grid', heroPlace);

/* block 3 — hover beats base, by order (the 0.7.2 headline fix) */
const before = await cs('.card', 'background-color');
await page.hover('.card');
await page.waitForTimeout(120);
const after = await cs('.card', 'background-color');
ok('B3 hover changes the card background (real mouse)', before !== after && after === 'rgb(58, 47, 38)', `${before} -> ${after}`);
await page.mouse.move(0, 0);
await page.waitForTimeout(120);
ok('B3 un-hoving restores the base', (await cs('.card', 'background-color')) === before);

/* block 4 — media conditions */
await page.emulateMedia({ colorScheme: 'dark' });
await page.waitForTimeout(150);
ok('B4 dark mode applies (#181310)', (await cs('.card', 'background-color')) === 'rgb(24, 19, 16)', await cs('.card', 'background-color'));
await page.setViewportSize({ width: 700, height: 900 });
await page.waitForTimeout(150);
ok('B4 below 768 the wide padding is gone', (await cs('.card', 'padding')) === '16px', await cs('.card', 'padding'));
await page.setViewportSize({ width: 900, height: 900 });
await page.waitForTimeout(150);
ok('B4 at 900px padding: 24 applies', (await cs('.card', 'padding')) === '24px', await cs('.card', 'padding'));
await page.emulateMedia({ colorScheme: 'light' });
await page.setViewportSize({ width: 1200, height: 900 });
await page.waitForTimeout(150);

/* block 5 — seen + hover animations (WAAPI) */
const animCount = await page.evaluate(() => {
  const el = document.querySelector('.card');
  el.scrollIntoView();
  return new Promise(res => setTimeout(() => res(el.getAnimations().length), 400));
});
ok('B5 seen fires a real animation on the card', animCount > 0, 'animations: ' + animCount);
await page.hover('.card');
await page.waitForTimeout(120);
const liftAnims = await page.evaluate(() => document.querySelector('.card').getAnimations().length);
ok('B5 hover plays the lift motion', liftAnims > 0, 'animations on hover: ' + liftAnims);

ok('no console errors or warnings during the whole run', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
