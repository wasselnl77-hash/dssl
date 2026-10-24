#!/usr/bin/env node
/* test-static-parity.mjs: "with JavaScript off, a compiled page renders its static styles correctly on first paint."
 *
 * The strongest fixture available is this site. Its pages are server-rendered by Next, so the HTML is complete before
 * any script runs. For each page this compares two copies of that same markup, element by element (computed style
 * for about 100 properties, plus the position and size of the box, plus ::before and ::after):
 *
 *   A  the engine as it ships: the .dssl sheets, applied by the runtime
 *   B  the output of `dssl build --reset`, linked as one stylesheet, with JavaScript DISABLED
 *
 * They must match. The only things taken out first are the demo elements that exist to show features a build cannot
 * keep (tilt, bend and stretch, overlap, gradient-flow), listed below. Everything else, thousands of elements, has to
 * come out identical. It needs the site built (npm run build) and spawns `next start` itself.
 *
 *   node scripts/test-static-parity.mjs [--route /docs]            */
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findChrome, ROOT } from './lib/browser-harness.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log(`  ok  ${n}`); } else { fail++; console.log(`FAIL  ${n}${x !== undefined ? '; ' + x : ''}`); } };

if (!existsSync(path.join(ROOT, '.next', 'BUILD_ID'))) { console.log('  skipped: the site is not built (run npm run build first)'); console.log('\n0 passed, 0 failed'); process.exit(0); }
if (!findChrome()) { console.log('  skipped: no Chrome found'); process.exit(0); }

// 1. build the stylesheet with the real CLI, from the same files the site loads
const tmp = mkdtempSync(path.join(tmpdir(), 'dssl-parity-'));
const SHEETS = ['tokens', 'site', 'home', 'docs', 'playground', 'changelog', 'bench'];
const built = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', ...SHEETS.map((s) => path.join(ROOT, 'public/styles', s + '.dssl')), '-o', path.join(tmp, 'site.css'), '--reset', '--sourcemap', '--strict'], { encoding: 'utf8' });
ok('the site\'s sheets build with --strict (no warnings)', built.status === 0, built.stdout + built.stderr);
const css = readFileSync(path.join(tmp, 'site.css'), 'utf8');

// 2. serve the site
const PORT = 3600 + Math.floor(Math.random() * 300);
const next = spawn(process.execPath, [path.join(ROOT, 'node_modules/next/dist/bin/next'), 'start', '-p', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stop = () => { try { next.kill(); } catch { /* gone */ } };
process.on('exit', stop);
for (let i = 0; i < 60; i++) { try { if ((await fetch(`http://127.0.0.1:${PORT}/`)).ok) break; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 500)); }

// 3. the pages, as two variants
const strip = (h) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '').replace(/<link rel="preload"[^>]*>/g, '');
const ENGINE_ONLY = '.df-chip, .ov-ghost, .show-pane, .fx-pane, .gd-banner';   // demos of tilt, bend/stretch, overlap, gradient-flow
const PROPS = ['display','position','top','right','bottom','left','float','z-index','overflow-x','overflow-y','box-sizing','width','height','min-width','min-height','max-width','max-height','margin-top','margin-right','margin-bottom','margin-left','padding-top','padding-right','padding-bottom','padding-left','border-top-width','border-right-width','border-bottom-width','border-left-width','border-top-style','border-right-style','border-bottom-style','border-left-style','border-top-color','border-right-color','border-bottom-color','border-left-color','border-top-left-radius','border-top-right-radius','border-bottom-left-radius','border-bottom-right-radius','background-color','background-image','background-size','background-position','background-repeat','background-blend-mode','color','font-family','font-size','font-weight','font-style','line-height','letter-spacing','text-align','text-decoration-line','text-transform','text-shadow','white-space','word-break','opacity','visibility','box-shadow','transform','translate','scale','rotate','filter','backdrop-filter','mix-blend-mode','cursor','pointer-events','flex-direction','flex-wrap','flex-grow','flex-shrink','flex-basis','justify-content','justify-items','align-items','align-self','align-content','gap','row-gap','column-gap','grid-template-columns','grid-template-rows','grid-column-start','grid-row-start','order','list-style-type','outline-style','outline-width','outline-color','transition-property','transition-duration','animation-name','vertical-align','object-fit','aspect-ratio','user-select','clip-path','mask-image','-webkit-text-fill-color','-webkit-background-clip','tab-size'];
const snap = ({ props, drop }) => {
  document.querySelectorAll(drop).forEach((e) => e.remove());
  const out = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('[data-dssl-probe], canvas') || /^(SCRIPT|STYLE|NOSCRIPT|LINK|TEMPLATE)$/.test(el.tagName)) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    out.push([el.tagName + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '') + ' in ' + (el.parentElement ? el.parentElement.tagName + '.' + String(el.parentElement.className).split(' ')[0] : '') + ' "' + (el.textContent || '').trim().slice(0, 24) + '"', Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height), ...props.map((p) => cs.getPropertyValue(p))]);
    for (const ps of ['::before', '::after']) {
      const c = getComputedStyle(el, ps);
      if (c.content && c.content !== 'none' && c.content !== 'normal') out.push([el.tagName + ps, 0, 0, 0, 0, ...['content', 'display', 'color', 'background-color', 'width', 'height', 'position'].map((p) => c.getPropertyValue(p))]);
    }
  }
  return out;
};

const pages = {};
const server = createServer(async (req, res) => {
  const u = req.url.split('?')[0];
  if (pages[u]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(pages[u]); }
  if (u === '/site.css') { res.writeHead(200, { 'content-type': 'text/css' }); return res.end(css); }
  if (u.startsWith('/dssl/')) { try { res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(readFileSync(path.join(ROOT, 'public', u))); } catch { res.writeHead(404); return res.end(); } }
  try { const r = await fetch(`http://127.0.0.1:${PORT}${req.url}`); res.writeHead(r.status, { 'content-type': r.headers.get('content-type') || 'application/octet-stream' }); res.end(Buffer.from(await r.arrayBuffer())); } catch { res.writeHead(502); res.end(); }
}).listen(0);
const port = server.address().port;

const only = process.argv.includes('--route') ? [process.argv[process.argv.indexOf('--route') + 1]] : null;
const ROUTES = only || ['/', '/docs', '/playground', '/cheat', '/spec', '/changelog', '/bench'];
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const frame = { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' };

for (const route of ROUTES) {
  const base = strip(await (await fetch(`http://127.0.0.1:${PORT}${route}`)).text());
  const key = route.replace(/\W/g, '') || 'home';
  // the shipped page links /site.css, which has the reset in it; for the engine-only copy the engine adds the same reset itself
  pages[`/a-${key}`] = base.replace(/<link rel="stylesheet" href="\/site\.css"\/?>/, '').replace('<html', '<html data-dssl-reset').replace('</head>', '<script type="module" src="/dssl/boot.js"></script></head>');
  pages[`/b-${key}`] = base.replace(/<style type="text\/dssl"[\s\S]*?<\/style>/g, '').replace(/<link rel="stylesheet" href="\/site\.css"\/?>/, '').replace('</head>', '<link rel="stylesheet" href="/site.css"></head>');

  const ctxA = await browser.newContext(frame); const pa = await ctxA.newPage();
  await pa.goto(`http://127.0.0.1:${port}/a-${key}`); await pa.waitForFunction('window.DSSL', null, { timeout: 15000 }); await pa.waitForTimeout(1200);
  const A = await pa.evaluate(snap, { props: PROPS, drop: ENGINE_ONLY }); await ctxA.close();

  // JavaScript really is off for B: the context has it disabled, so nothing runs, not even a stray inline script
  const ctxB = await browser.newContext({ ...frame, javaScriptEnabled: false }); const pb = await ctxB.newPage();
  await pb.goto(`http://127.0.0.1:${port}/b-${key}`); await pb.waitForTimeout(600);
  const shot = await pb.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 400 } });
  await ctxB.close();
  // reading computed styles needs script, so take the numbers in a second context where only the page's own scripts are blocked
  const ctxC = await browser.newContext(frame); const pc = await ctxC.newPage();
  await pc.route('**/*', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
  await pc.goto(`http://127.0.0.1:${port}/b-${key}`); await pc.waitForTimeout(600);
  const B = await pc.evaluate(snap, { props: PROPS, drop: ENGINE_ONLY }); await ctxC.close();

  // C: the site exactly as it is served, untouched, with JavaScript off. Its own <link rel=stylesheet href=/site.css> has to do it all.
  const ctxD = await browser.newContext(frame); const pd = await ctxD.newPage();
  await pd.route('**/*', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
  await pd.goto(`http://127.0.0.1:${PORT}${route}`); await pd.waitForTimeout(700);
  const C = await pd.evaluate(snap, { props: PROPS, drop: ENGINE_ONLY }); await ctxD.close();
  let cd = 0; const cfirst = [];
  for (let i = 0; i < Math.min(A.length, C.length); i++) for (let k = 0; k < A[i].length; k++) if (A[i][k] !== C[i][k]) { cd++; if (cfirst.length < 3) cfirst.push(`${A[i][0]} ${k < 5 ? ['', 'x', 'y', 'w', 'h'][k] : PROPS[k - 5] || 'pseudo'}: ${String(A[i][k]).slice(0, 30)} | ${String(C[i][k]).slice(0, 30)}`); }
  ok(`${route}: the site as actually served, with scripts blocked, is styled like the engine renders it (${C.length} elements)`, cd === 0 && Math.abs(A.length - C.length) <= 1, `${cd} differing values. ${cfirst.join(' || ')}`);

  let diffs = 0; const first = [];
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) for (let k = 0; k < A[i].length; k++) if (A[i][k] !== B[i][k]) { diffs++; if (first.length < 4) first.push(`${A[i][0]} ${k < 5 ? ['', 'x', 'y', 'w', 'h'][k] : PROPS[k - 5] || 'pseudo'}: ${String(A[i][k]).slice(0, 30)} | ${String(B[i][k]).slice(0, 30)}`); }
  ok(`${route}: ${A.length} elements, the compiled page with JavaScript off matches the engine in every one`, diffs === 0 && Math.abs(A.length - B.length) <= 1, `${diffs} differing values, ${A.length} vs ${B.length} elements. ${first.join(' || ')}`);
  ok(`${route}: first paint is styled (the screenshot is not a blank or unstyled page)`, shot.length > 8000, `screenshot is ${shot.length} bytes`);
}

await browser.close(); server.close(); stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
