#!/usr/bin/env node
/* bench-compiled.mjs: is a compiled DSSL page as fast as the same page written as plain CSS?
 *
 * "Startup within 10% of equivalent CSS; churn at parity." The page is 4000 cards, each with a title, a paragraph and a tag.
 * Three versions of it are measured in real Chrome, interleaved (so drift hits all three the same), many times each:
 *
 *   hand      CSS written by hand, literal values, no custom properties: the best plain CSS can do
 *   compiled  the same design as DSSL, through `dssl build` (zero-specificity :where() selectors, var() tokens)
 *   inlined   the same, built with --inline-tokens (each token's value written in place of var())
 *   engine    the same DSSL, applied by the runtime engine (inline styles). Reported, never asserted: it is the slow lane.
 *
 * startup  = navigation start to the first paint of the finished page. For the engine that is the moment it says it is ready,
 *            because its first paint is the unstyled page
 * load     = the load event
 * churn    = flip a class on every card, then force style recalculation and layout; median of 60 flips
 * restyle  = change something on <body> that every card inherits from, then force style and layout
 *
 *   node scripts/bench-compiled.mjs [--runs 21] [--cards 4000]        exit 1 if the inlined build is more than 10% behind hand */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { toCSS } from '../public/dssl/index.js';
import { findChrome, ROOT } from './lib/browser-harness.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? Number(process.argv[i + 1]) : d; };
const RUNS = arg('--runs', 21), CARDS = arg('--cards', 4000), FLIPS = 60;   // the engine gets 8 flips: it is far slower per flip and would take an hour

const DSSL = `tokens { color { ink: #1a1426; card: #ffffff; line: #dcd7e6; accent: #d1006f; muted: #5d5570 } }
.grid { grid: auto-fill 180; gap: space.3; padding: space.3 }
.card { background: color.card; border: 1 solid color.line; radius: md; padding: space.3; shadow: sm; column: gap 6; transition: 150 }
.card:hover { shadow: md; translate: 0 -2 }
.card.on { background: color.accent; color: white }
.title { font-weight: 700; font-size: 15; color: color.ink }
.text { color: color.muted; font-size: 13; line-height: 1.5 }
.tag { padding: 2 8; radius: full; background: color.accent/12; color: color.accent; font-size: 11 }
@media (width < 700) { .grid { grid-template-columns: 1fr } }`;

// the same design, by hand: literal values, the way a person writes CSS who has no tokens
const HAND = `.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; padding: 12px }
.card { background: #ffffff; border: 1px solid #dcd7e6; border-radius: 14px; padding: 12px; box-shadow: 0 1px 2px color-mix(in oklab, #1a1426 8%, transparent), 0 1px 3px color-mix(in oklab, #1a1426 6%, transparent); display: flex; flex-direction: column; gap: 6px; transition: all 150ms ease }
.card:hover { box-shadow: 0 4px 8px color-mix(in oklab, #1a1426 10%, transparent); translate: 0 -2px }
.card.on { background: #d1006f; color: white }
.title { font-weight: 700; font-size: 15px; color: #1a1426 }
.text { color: #5d5570; font-size: 13px; line-height: 1.5 }
.tag { padding: 2px 8px; border-radius: 9999px; background: color-mix(in oklab, #d1006f 12%, transparent); color: #d1006f; font-size: 11px }
@media (width < 700px) { .grid { grid-template-columns: 1fr } }`;
const compiled = toCSS(DSSL, { banner: false }).css;
const inlined = toCSS(DSSL, { banner: false, inlineTokens: true }).css;

const cards = Array.from({ length: CARDS }, (_, i) => `<div class="card"><div class="title">Card ${i}</div><p class="text">Some text that wraps onto a second line when the column is narrow enough, to give layout real work.</p><span class="tag">tag ${i % 9}</span></div>`).join('');
const doc = (head) => `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width"><title>bench</title>${head}<body style="margin:0;font:14px system-ui"><div class="grid">${cards}</div>`;
const pages = {
  '/hand': doc(`<style>${HAND}</style>`),
  '/compiled': doc(`<style>${compiled}</style>`),
  '/inlined': doc(`<style>${inlined}</style>`),
  '/engine': doc(`<style type="text/dssl">${DSSL}</style><script type="module" src="/dssl/boot.js"></script>`),
};
const server = createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (pages[u]) { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(pages[u]); }
  if (u.startsWith('/dssl/')) { try { const b = readFileSync(path.join(ROOT, 'public', u)); res.writeHead(200, { 'content-type': 'text/javascript' }); return res.end(b); } catch { /* 404 */ } }
  res.writeHead(404); res.end();
}).listen(0);
const port = server.address().port;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });

async function once(kind) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.addEventListener('dssl-ready', () => { window.__ready = performance.now(); }); });
  await p.goto(`http://127.0.0.1:${port}/${kind}`, { waitUntil: 'load' });
  if (kind === 'engine') { await p.waitForFunction('window.DSSL && document.documentElement.classList.contains("dssl-ready")'); await p.waitForTimeout(150); }
  const r = await p.evaluate(async ({ flips, engine }) => {
    const out = {};
    const frame0 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frame0(); await new Promise((r) => setTimeout(r, 60));
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const nav = performance.getEntriesByType('navigation')[0];
    out.fcp = engine ? (window.__ready || NaN) : (fcp ? fcp.startTime : NaN); out.load = nav.loadEventEnd;
    const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const els = [...document.querySelectorAll('.card')];
    const flip = [], inh = [];
    for (let i = 0; i < flips; i++) {
      const t0 = performance.now();
      for (const el of els) el.classList.toggle('on');
      if (engine) await frame(); else void document.body.offsetHeight;      // the engine restyles on a later frame; CSS restyles at the read
      void document.body.offsetHeight;
      flip.push(performance.now() - t0);
    }
    for (let i = 0; i < flips; i++) {
      const t0 = performance.now();
      document.body.style.fontSize = i % 2 ? '14px' : '15px';
      void document.body.offsetHeight;
      inh.push(performance.now() - t0);
    }
    const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
    out.flip = med(flip.slice(Math.min(5, flips - 3))); out.restyle = med(inh.slice(Math.min(5, flips - 3)));
    return out;
  }, { flips: kind === 'engine' ? 8 : FLIPS, engine: kind === 'engine' });
  await ctx.close();
  return r;
}

const results = { hand: [], compiled: [], inlined: [], engine: [] };
await once('hand');                                                                  // warm the browser, discard
for (let i = 0; i < RUNS; i++) for (const k of i % 2 ? ['engine', 'inlined', 'compiled', 'hand'] : ['hand', 'compiled', 'inlined', 'engine']) results[k].push(await once(k));
await browser.close(); server.close();

const col = (k, f) => { const v = results[k].map((r) => r[f]).filter((x) => Number.isFinite(x)); return v.length ? median(v) : NaN; };
const rows = [['startup (first paint, ms)', 'fcp'], ['load event (ms)', 'load'], ['churn: flip a class on every card (ms)', 'flip'], ['restyle: change an inherited value (ms)', 'restyle']];
console.log(`\n${CARDS} cards, ${RUNS} runs each, medians, interleaved. Chrome ${browser.version()}\n`);
console.log('                                              hand   compiled  vs hand   inlined  vs hand    engine  vs hand');
let worst = 0, worstInl = 0;
const pct = (a, b) => ((a / b) - 1) * 100;
const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
for (const [label, f] of rows) {
  const h = col('hand', f), c = col('compiled', f), n = col('inlined', f), e = col('engine', f);
  if (f === 'fcp' || f === 'flip' || f === 'restyle') { worst = Math.max(worst, pct(c, h)); worstInl = Math.max(worstInl, pct(n, h)); }
  console.log(`${label.padEnd(42)} ${h.toFixed(1).padStart(7)} ${c.toFixed(1).padStart(9)} ${fmt(pct(c, h)).padStart(8)} ${n.toFixed(1).padStart(9)} ${fmt(pct(n, h)).padStart(8)} ${e.toFixed(1).padStart(9)} ${(pct(e, h) >= 0 ? '+' : '') + pct(e, h).toFixed(0) + '%'}`);
}
const bytes = (s) => Buffer.byteLength(s);
console.log(`\nstylesheet size: hand ${bytes(HAND)} B, compiled ${bytes(compiled)} B, inlined ${bytes(inlined)} B (the build also carries the token table and every default token)`);
console.log(`\nworst gap to hand-written CSS on startup, churn and restyle:  compiled ${fmt(worst)}   inlined ${fmt(worstInl)}`);
const verdict = worstInl <= 10;
console.log(`inlined build: ${verdict ? 'within 10%' : 'MORE than 10% behind'} (the claim is about the compiled page at its fastest; the default build keeps tokens as variables so they can change)`);
process.exit(verdict ? 0 : 1);
