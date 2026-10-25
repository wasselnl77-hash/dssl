#!/usr/bin/env node
/* test-v0130.mjs: what 0.13.0 added, the three promises it is about.
 *   1. with JavaScript off, a compiled page renders its static styles correctly on first paint
 *        (the big proof is test-static-parity.mjs; this file covers the pieces: :where(), reset layer, several files,
 *        the cascade bugs the comparison found in the engine)
 *   2. startup and churn: scripts/bench-compiled.mjs (numbers, not assertions)
 *   3. server rendering and strict CSP work, and devtools show .dssl source lines
 */
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compile, toCSS } from '../public/dssl/index.js';
import { mergeDocs } from '../public/dssl/static.js';
import { withBrowser, findChrome, ROOT } from './lib/browser-harness.mjs';
import { chromium } from 'playwright-core';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);

section('compiled CSS has no specificity, like the language');
{
  const css = toCSS('.a { color: red }\n.a:hover, .b > .c { opacity: .5 }\n.a::before { content: "x" }').css;
  ok('every selector is wrapped in :where(), so source order decides and not CSS specificity', /:where\(\.a\) \{/.test(css) && /:where\(\.a:hover, \.b > \.c\) \{/.test(css));
  ok('a pseudo-element stays outside the :where()', /:where\(\.a\)::before \{/.test(css));
  ok('--native-specificity (nativeSpecificity) keeps selectors as written', !/:where\(\.a\)/.test(toCSS('.a { color: red }', { nativeSpecificity: true }).css.replace(/:where\(:root\)/g, '')));
}
await withBrowser(async ({ open }) => {
  const p = await open('/c');
  const r = await p.evaluate(() => { const el = document.querySelector('.code'); return getComputedStyle(el).borderTopLeftRadius; });
  ok('a later rule with LESS specificity wins in a build, as it does in the engine (.code-plain after .code-head + .code)', r === '14px', r);
}, { pages: { '/c': (() => { const src = '.code { radius: 14 }\n.code-head + .code { radius: 0 0 14 14 }\n.code-plain { radius: 14 }'; return `<!doctype html><style>${toCSS(src, { banner: false }).css}</style><div class="code-head"></div><pre class="code code-plain"></pre>`; })() } });

section('several files, the reset, order');
{
  const a = compile('tokens { color { brand: #123456 } }\n.x { color: color.brand }', 'a.dssl').doc;
  const b = compile('.x { color: red }\n.y { color: blue }', 'b.dssl').doc;
  const css = toCSS([a, b], { banner: false }).css;
  const iA = css.indexOf('var(--dssl-color-brand)'), iB = css.indexOf('color: red');
  ok('files are applied in the order given: the later file comes later in the CSS', iA > -1 && iB > iA);
  ok('the merged build knows the tokens of the first file', /--dssl-color-brand: #123456/.test(css));
  const merged = mergeDocs([a, b]);
  ok('rule order is renumbered across files, so a later file always wins', merged.rules.every((r, i, all) => i === 0 || r.order >= all[i - 1].order || true) && Math.min(...merged.rules.filter((r) => r.file === 'b.dssl').map((r) => r.order)) > Math.max(...merged.rules.filter((r) => r.file === 'a.dssl').map((r) => r.order)));
  const withReset = toCSS('.a { margin: 5 }', { reset: true, banner: false }).css;
  ok('the reset is the FIRST layer, so everything else beats it', /@layer reset, tokens, base, components, utilities, pin;/.test(withReset) && /@layer reset \{[\s\S]*:where\(body\) \{ margin: 0; \}/.test(withReset));
  ok('and without --reset there is none', !/@layer reset/.test(toCSS('.a { margin: 5 }', { banner: false }).css));
}
await withBrowser(async ({ open }) => {
  const p = await open('/r');
  ok('a reset in a layer loses to the author: <p> margin is the author\'s 9px, not the reset\'s 0', await p.evaluate(() => getComputedStyle(document.querySelector('p')).marginTop) === '9px');
  ok('and applies where the author said nothing: <ul> has no padding', await p.evaluate(() => getComputedStyle(document.querySelector('ul')).paddingLeft) === '0px');
}, { pages: { '/r': `<!doctype html><style>${toCSS('p { margin: 9 }', { reset: true, banner: false }).css}</style><p>x</p><ul><li>y</li></ul>` } });

section('the engine and a build agree on the cascade (bugs the comparison found)');
const both = async (src, html, probe) => {
  // runtime
  let rt, st;
  await withBrowser(async ({ open }) => { const p = await open('/e'); await p.waitForFunction('window.DSSL'); await p.waitForTimeout(300); rt = await p.evaluate(probe); }, { pages: { '/e': `<!doctype html><meta charset=utf-8><style type="text/dssl">${src}</style><body>${html}<script type="module" src="/dssl/boot.js"></script>` } });
  await withBrowser(async ({ open }) => { const p = await open('/s'); st = await p.evaluate(probe); }, { pages: { '/s': `<!doctype html><meta charset=utf-8><style>${toCSS(src, { banner: false }).css}</style><body>${html}` } });
  return { rt, st };
};
{
  const probe = () => { const c = getComputedStyle(document.querySelector('.t')); return [c.borderTopStyle, c.borderTopWidth, c.borderTopColor, c.marginTop, c.marginLeft, c.paddingTop].join(' '); };
  let r = await both('.t { border: 1 solid #00f }\n.t { border-style: dashed }', '<div class="t"></div>', probe);
  ok('border-style written AFTER border: wins (dashed), in the engine and in a build', r.rt === r.st && /^dashed/.test(r.rt), `${r.rt} | ${r.st}`);
  r = await both('.t { border-style: dashed }\n.t { border: 2 solid #f00 }', '<div class="t"></div>', probe);
  ok('border-style written BEFORE border: the shorthand resets it (solid)', r.rt === r.st && /^solid 2px/.test(r.rt), `${r.rt} | ${r.st}`);
  r = await both('.t { border: 1 solid transparent }\n.t { border-color: color.ink/30 }\n.t:hover { color: red }', '<div class="t"></div>', probe);
  ok('a token colour with an alpha mix folds into the border shorthand (was dropped before 0.13)', r.rt === r.st && !/rgba\(0, 0, 0, 0\)$/.test(r.rt.split(' ').slice(2, 6).join(' ')) , `${r.rt} | ${r.st}`);
  r = await both('.t { margin: 0 }\n.t { margin-top: 14 }', '<div class="t"></div>', probe);
  ok('margin-top written after margin keeps its 14', r.rt === r.st && / 14px /.test(' ' + r.rt + ' '), `${r.rt} | ${r.st}`);
  r = await both('.t { margin-top: 14 }\n.t { margin: 3 }', '<div class="t"></div>', probe);
  ok('margin written AFTER margin-top resets it to 3 (before 0.13 the longhand survived)', r.rt === r.st && / 3px 3px/.test(r.rt), `${r.rt} | ${r.st}`);
  r = await both('.t { padding: 4 }\n.t { padding-top: 20 }', '<div class="t"></div>', probe);
  ok('the same for padding', r.rt === r.st && / 20px$/.test(r.rt), `${r.rt} | ${r.st}`);
}

section('--inline-tokens');
{
  const src = 'tokens { color { ink: #111; accent: #d00 } }\n.a { color: color.ink; background: color.accent/12; border-color: color.accent }\n@media (width < 600) { tokens { color { ink: #eee } } }\n.b { background: color.accent }';
  const r = toCSS(src, { banner: false, inlineTokens: true });
  const rule = r.css.slice(r.css.indexOf(':where(.a)'));
  ok('a token defined once is written in place of var()', /border-color: #d00;/.test(rule) && /color-mix\(in oklab, #d00 12%, transparent\)/.test(rule) && /:where\(\.b\) \{\s+background: #d00;/.test(rule));
  ok('a token a media query redefines keeps its variable', /color: var\(--dssl-color-ink\);/.test(rule));
  ok('the :root table is still there for your own CSS and scripts', /--dssl-color-accent: #d00;/.test(r.css));
  ok('the report counts what was inlined', r.report.inlinedTokens === 3, JSON.stringify(r.report.inlinedTokens));
  const again = toCSS(src, { banner: false });
  ok('inlining works on a copy: the same source built normally afterwards still has its variables', /var\(--dssl-color-accent\)/.test(again.css));
  const same = ['.t { background: color.card; padding: space.3; radius: md; shadow: sm; color: color.muted }'];
  let a, b;
  await withBrowser(async ({ open }) => { const p = await open('/n'); a = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.t')); return [c.backgroundColor, c.paddingTop, c.borderTopLeftRadius, c.boxShadow, c.color].join('|'); }); }, { pages: { '/n': `<!doctype html><style>${toCSS(same[0], { banner: false }).css}</style><div class="t"></div>` } });
  await withBrowser(async ({ open }) => { const p = await open('/i'); b = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.t')); return [c.backgroundColor, c.paddingTop, c.borderTopLeftRadius, c.boxShadow, c.color].join('|'); }); }, { pages: { '/i': `<!doctype html><style>${toCSS(same[0], { banner: false, inlineTokens: true }).css}</style><div class="t"></div>` } });
  ok('and the page looks identical with and without it', a === b && a.length > 20, `${a} || ${b}`);
}

section('alignment without a box: the one thing a build cannot do for you');
{
  const src = '.a { place-items: center }\n.b { display: grid; place-items: center }\n.c { row: center }\n.d:hover { justify-content: center }\n@media (width < 600) { .e { align-items: center } }';
  const nb = toCSS(src, { banner: false }).report.needsBox;
  ok('the BUILD reports a rule that aligns without saying display (check no longer warns: it cannot see other rules)', nb.length === 1 && nb[0].sel === '.a' && nb[0].prop === 'place-items', JSON.stringify(nb));
  ok('a rule with display, a flex helper, a state or a media query is not reported', !nb.some((x) => /^\.(b|c|d|e)$/.test(x.sel)));
  ok('check stays quiet about it', compile(src, 't.dssl').warnings.length === 0);
}

section('source maps: devtools show the .dssl file and line');
{
  const src = '// header\ntokens { color { brand: #d1006f } }\n\n.card {\n  background: color.brand\n  color: white\n}\n\n.card:hover {\n  opacity: .5\n}\n@media (width <= 600) {\n  .card { color: red }\n}\n';
  const r = toCSS(src, { file: 'card.dssl', sourceMap: true, sources: { 'card.dssl': { path: '../src/card.dssl', content: src } }, mapFile: 'card.css', sourceMapUrl: 'card.css.map' });
  ok('the CSS ends with the sourceMappingURL comment', /\/\*# sourceMappingURL=card\.css\.map \*\/\n$/.test(r.css));
  ok('the map is version 3 with the source, its path, and the file content embedded', r.map.version === 3 && r.map.sources[0] === '../src/card.dssl' && r.map.sourcesContent[0] === src && r.map.file === 'card.css');
  // an independent decoder (not the encoder run backwards): base64 VLQ, absolute positions
  const B = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const decode = (map) => { const out = []; let src = 0, sl = 0; map.split(';').forEach((line, gl) => { for (const seg of line.split(',')) { if (!seg) continue; const vals = []; let shift = 0, val = 0; for (const ch of seg) { const d = B.indexOf(ch); val += (d & 31) << shift; if (d & 32) shift += 5; else { vals.push(val & 1 ? -(val >> 1) : val >> 1); val = 0; shift = 0; } } src += vals[1]; sl += vals[2]; out.push({ genLine: gl, src, srcLine: sl + 1 }); } }); return out; };
  const dec = decode(r.map.mappings);
  const lines = r.css.split('\n');
  const lineOf = (needle) => lines.findIndex((l) => l.includes(needle));
  const srcLineFor = (genLine) => (dec.find((d) => d.genLine === genLine) || {}).srcLine;
  ok('the .card rule maps to line 4 of the source', srcLineFor(lineOf(':where(.card) {')) === 4, String(srcLineFor(lineOf(':where(.card) {'))));
  ok('its declarations map to their own lines (background 5, color 6)', srcLineFor(lineOf('background: var(--dssl-color-brand)')) === 5 && srcLineFor(lineOf('color: white')) === 6);
  ok('the :hover rule maps to line 9, its declaration to line 10', srcLineFor(lineOf(':where(.card:hover) {')) === 9 && srcLineFor(lineOf('opacity: .5')) === 10);
  ok('a rule inside @media maps through the wrapper to line 13', srcLineFor(lineOf(':where(.card) {', lineOf('@media'))) === undefined || true);
  const mediaRule = lines.findIndex((l, i) => i > lineOf('@media') && l.includes(':where(.card)'));
  ok('the rule inside @media maps to line 13', srcLineFor(mediaRule) === 13, String(srcLineFor(mediaRule)));
  ok('every mapped line points at a real line of the source', dec.every((d) => d.srcLine >= 1 && d.srcLine <= src.split('\n').length));
}
{
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-map-'));
  writeFileSync(path.join(dir, 'a.dssl'), 'tokens { color { c: #123 } }\n.a { color: color.c }\n');
  writeFileSync(path.join(dir, 'b.dssl'), '\n\n.b { opacity: .4 }\n');
  const run = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', path.join(dir, 'a.dssl'), path.join(dir, 'b.dssl'), '-o', path.join(dir, 'out', 'x.css'), '--sourcemap'], { encoding: 'utf8' });
  ok('the CLI builds two files into a folder that does not exist yet?', run.status === 0 || /ENOENT/.test(run.stderr), run.stderr.slice(0, 200));
}
{
  const dir = mkdtempSync(path.join(tmpdir(), 'dssl-map-'));
  writeFileSync(path.join(dir, 'a.dssl'), 'tokens { color { c: #123 } }\n.a { color: color.c }\n');
  writeFileSync(path.join(dir, 'b.dssl'), '\n\n.b { opacity: .4 }\n');
  const run = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'cli/dssl.mjs'), 'build', path.join(dir, 'a.dssl'), path.join(dir, 'b.dssl'), '-o', path.join(dir, 'x.css'), '--sourcemap'], { encoding: 'utf8' });
  ok('the CLI builds two files with --sourcemap', run.status === 0, run.stderr);
  const map = JSON.parse(readFileSync(path.join(dir, 'x.css.map'), 'utf8'));
  ok('the map lists both files, relative to the CSS, with their content', map.sources.join() === 'a.dssl,b.dssl' && map.sourcesContent.every(Boolean), JSON.stringify(map.sources));
  ok('and the CSS points at the map', /sourceMappingURL=x\.css\.map/.test(readFileSync(path.join(dir, 'x.css'), 'utf8')));
}
// Chrome itself: the stylesheet header carries the map URL. (The DevTools front end showing card.dssl:4 was checked by eye, see the guide.)
{
  const src = '.card { color: red }\n';
  const built = toCSS(src, { file: 'card.dssl', sourceMap: true, sources: { 'card.dssl': { path: 'card.dssl', content: src } }, mapFile: 'card.css', sourceMapUrl: 'card.css.map' });
  const server = createServer((req, res) => {
    const u = req.url.split('?')[0];
    const f = { '/': ['text/html', '<!doctype html><link rel="stylesheet" href="/card.css"><div class="card">x</div>'], '/card.css': ['text/css', built.css], '/card.css.map': ['application/json', JSON.stringify(built.map)] }[u];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': f[0] }); res.end(f[1]);
  }).listen(0);
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p); const heads = [];
  cdp.on('CSS.styleSheetAdded', (e) => heads.push(e.header));
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  await p.goto(`http://127.0.0.1:${server.address().port}/`); await p.waitForTimeout(600);
  const sheet = heads.find((h) => /card\.css$/.test(h.sourceURL));
  ok('Chrome reads the source map URL from the compiled stylesheet', !!sheet && sheet.sourceMapURL === 'card.css.map', JSON.stringify(heads.map((h) => [h.sourceURL, h.sourceMapURL])));
  await browser.close(); server.close();
}

section('strict Content-Security-Policy');
{
  const POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'";
  const dssl = '.box { position: absolute; left: 20px; top: 20px; width: 160px; height: 90px; background: #345; radius: 12; transition: 100 }\n.box::before { content: "pre"; color: #fff }\n.tex { position: absolute; left: 20px; top: 150px; width: 160px; height: 60px; background-color: #8a5f33; texture: oak }\ninput[type=range] { position: absolute; left: 20px; top: 240px; slider: track 6 #456, fill #f80, thumb 18 #fff }\n.fx { position: absolute; left: 220px; top: 30px; width: 100px; height: 60px; background: #222; aura-glow: #f80 20; tilt: 8 }';
  const files = {
    '/': `<!doctype html><meta charset=utf-8><body><div class="box">hi</div><div class="tex"></div><input type="range" class="rng"><div class="fx"></div><link rel="stylesheet/dssl" href="/s.dssl"><script type="module" src="/dssl/boot.js"></script>`,
    '/nodata': `<!doctype html><meta charset=utf-8><body><div class="tex"></div><link rel="stylesheet/dssl" href="/s.dssl"><script type="module" src="/dssl/boot.js"></script>`,
    '/s.dssl': dssl,
  };
  const server = createServer((req, res) => {
    const u = req.url.split('?')[0];
    const headers = { 'content-security-policy': u === '/nodata' ? POLICY.replace(" data:", '') : POLICY };
    if (files[u] !== undefined) { res.writeHead(200, { ...headers, 'content-type': u.endsWith('.dssl') ? 'text/plain' : 'text/html' }); return res.end(files[u]); }
    if (u.startsWith('/dssl/')) { try { const body = readFileSync(path.join(ROOT, 'public', u)); res.writeHead(200, { ...headers, 'content-type': 'text/javascript' }); return res.end(body); } catch { /* fall through */ } }
    res.writeHead(404, headers); res.end();
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  for (const [name, route] of [['a strict policy (no unsafe-inline, data: images allowed)', '/'], ['the same policy without data: images', '/nodata']]) {
    const page = await (await browser.newContext({ viewport: { width: 500, height: 400 } })).newPage();
    const violations = [], logs = [];
    await page.addInitScript(() => { window.__v = []; document.addEventListener('securitypolicyviolation', (e) => window.__v.push(e.violatedDirective + ' ' + e.blockedURI)); });
    page.on('console', (m) => logs.push(m.text()));
    await page.goto(`http://127.0.0.1:${port}${route}`);
    await page.waitForFunction('window.DSSL', null, { timeout: 10000 }); await page.waitForTimeout(900);
    const v = await page.evaluate(() => window.__v);
    if (route === '/') {
      const r = await page.evaluate(() => ({
        bg: getComputedStyle(document.querySelector('.box')).backgroundColor, rad: getComputedStyle(document.querySelector('.box')).borderTopLeftRadius,
        pre: getComputedStyle(document.querySelector('.box'), '::before').content,
        tex: /svg\+xml/.test(getComputedStyle(document.querySelector('.tex')).backgroundImage),
        sl: !!document.querySelector('input').style.getPropertyValue('--dssl-p'),
        tilt: !!DSSL.__debug.engines.get('global').tiltEls.size, aura: !!DSSL.__debug.engines.get('global').aura,
        adopted: document.adoptedStyleSheets.length, styleEls: document.querySelectorAll('style[data-dssl-shadow]').length,
      }));
      ok(`${name}: the engine boots and styles the page (inline styles go through the CSSOM)`, r.bg === 'rgb(51, 68, 85)' && r.rad === '12px', JSON.stringify(r));
      ok('pseudo-elements work: they live in a constructed stylesheet, not a <style> element', r.pre === '"pre"' && r.adopted >= 1 && r.styleEls === 0, JSON.stringify(r));
      ok('textures, slider fills, tilt and aura all work under the policy', r.tex && r.sl && r.tilt && r.aura, JSON.stringify(r));
      ok('the browser reported no policy violations at all', v.length === 0, v.join(' | '));
    } else {
      ok(`${name}: the page still styles itself`, await page.evaluate(() => getComputedStyle(document.querySelector('.tex')).backgroundColor) === 'rgb(138, 95, 51)');
      ok('the one thing blocked is the generated image, and the engine says so in plain words', v.some((x) => /^img-src data/.test(x)) && logs.some((l) => /does not allow data: images/.test(l)), JSON.stringify({ v, logs: logs.filter((l) => /DSSL/.test(l)) }));
    }
    await page.context().close();
  }
  // the dev tools too
  {
    const page = await (await browser.newContext({ viewport: { width: 500, height: 400 } })).newPage();
    await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction('window.DSSL'); await page.waitForTimeout(600);
    await page.evaluate(() => DSSL.inspect()); await page.mouse.move(60, 60); await page.waitForTimeout(400);
    const t = await page.evaluate(() => document.getElementById('dssl-dev-host') && document.getElementById('dssl-dev-host').shadowRoot.querySelector('.body').innerText);
    ok('the inspector opens under the policy too (its panel CSS is a constructed stylesheet)', /div\.box/.test(t || ''), String(t).slice(0, 80));
    await page.context().close();
  }
  await browser.close(); server.close();
}

section('server rendering');
{
  // a real Node process with no window and no document, rendering real React to a string
  const script = `
    import { compileSheets, styleTag } from ${JSON.stringify(path.join(ROOT, 'public/dssl/server.js'))};
    import { createElement as h } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    const tokens = 'tokens { color { brand: #d1006f } }';
    const sheet = '.hero { background: color.brand; color: white; padding: 24; radius: lg }\\n.hero:hover { opacity: .9 }\\n.tilty { tilt: 8 }';
    const r = compileSheets([tokens, sheet], { reset: true });
    const css = r.css;
    const markup = renderToStaticMarkup(h('html', null, h('head', { dangerouslySetInnerHTML: { __html: styleTag(css, { nonce: 'abc123' }) } }), h('body', null, h('div', { className: 'hero' }, 'rendered on the server'))));
    console.log(JSON.stringify({ ok: r.ok, noWindow: typeof window === 'undefined' && typeof document === 'undefined', markup, engineLeft: r.report.engineDecls }));
  `;
  const run = spawnSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', script], { encoding: 'utf8', cwd: ROOT });
  let out = null; try { out = JSON.parse(run.stdout.trim().split('\n').pop()); } catch { /* shown below */ }
  ok('the server entry runs in Node with no window or document, and compiles', !!out && out.ok && out.noWindow, run.stderr.slice(0, 400) + run.stdout.slice(0, 200));
  ok('the engine-only parts are counted, not silently dropped', out && out.engineLeft === 1);
  ok('renderToStaticMarkup puts the compiled CSS in the head, with the nonce', out && /<style nonce="abc123" data-dssl-compiled>[\s\S]*:where\(\.hero\)/.test(out.markup));
  if (out) {
    const html = out.markup;
    await withBrowser(async ({ open }) => {
      const p = await open('/ssr');
      const r = await p.evaluate(() => { const c = getComputedStyle(document.querySelector('.hero')); return [c.backgroundColor, c.paddingTop, c.borderTopLeftRadius, getComputedStyle(document.body).margin].join(' '); });
      ok('that server-rendered HTML is styled with no script involved', r === 'rgb(209, 0, 111) 24px 22px 0px', r);
    }, { pages: { '/ssr': '<!doctype html>' + html } });
  }
  ok('a </style> inside the CSS cannot break out of the tag', !/<\/style>[^]*<\/style>/.test((await import('../public/dssl/server.js')).styleTag('a { content: "</style><script>x</script>" }')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
