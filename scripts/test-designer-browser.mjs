#!/usr/bin/env node
/* test-designer-browser.mjs: the designer panel (dssl-vscode/media/designer.js) in a real browser.
 * VS Code's webview API is replaced by a stub that records every message the panel posts, and
 * the controls are driven the way a person would: type in a number box, pick from a menu, click.
 * What this cannot cover is VS Code itself (the panel hosting, the editor insert): that is
 * covered by test-designer-host.mjs against a fake of the editor API. */
import { withBrowser } from './lib/browser-harness.mjs';
import { decodePng, px, dist } from './lib/pixels.mjs';
import { PRESET_NAMES, GENERATORS } from '../public/dssl/texture.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);

const PAGE = `<!doctype html><meta charset=utf-8><link rel="stylesheet" href="/dssl-vscode/media/designer.css">
<body data-tab="aura"><div id="app"></div>
<script>window.__sent = []; window.acquireVsCodeApi = () => ({ postMessage: (m) => window.__sent.push(m), getState: () => null, setState: (s) => { window.__state = s; } });</script>
<script type="module" src="/dssl-vscode/media/designer.js"></script>`;

/** set a control by its label: number box for sliders, the select/checkbox otherwise */
const rowOf = (p, tab, label) => p.locator(`section.panel:not([hidden]) label.row:has(> .lab:text-is("${label}"))`).first();
const setNum = async (p, label, v, nth = 0) => { const el = p.locator(`section.panel:not([hidden]) label.row:has(> .lab:text-is("${label}")) input.num`).nth(nth); await el.fill(String(v)); await p.waitForTimeout(40); };
const setSel = async (p, label, v) => { await p.locator(`section.panel:not([hidden]) label.row:has(> .lab:text-is("${label}")) select`).first().selectOption(v); await p.waitForTimeout(40); };
const setChk = async (p, label, v, nth = 0) => { const el = p.locator(`section.panel:not([hidden]) label.row:has(> .lab:text-is("${label}")) input[type=checkbox]`).nth(nth); if ((await el.isChecked()) !== v) await el.click(); await p.waitForTimeout(40); };
const code = (p) => p.inputValue('#code');
const status = (p) => p.textContent('.status');
const compiles = async (p) => /^✓/.test((await status(p)) || '');

await withBrowser(async ({ open, errors }) => {
  const p = await open('/designer'); 
  await p.waitForSelector('#code'); await p.waitForTimeout(600);

  section('the panel');
  ok('it loads with three tabs and tells the editor it is ready', (await p.locator('button.tab').count()) === 3 && (await p.evaluate('window.__sent')).some((m) => m.type === 'ready'));
  ok('the first thing you see is a compiling aura', (await compiles(p)) && /aura-glow:/.test(await code(p)) && /aura-particle:/.test(await code(p)), await code(p));
  ok('the aura preview is really running the engine\'s renderer', (await p.evaluate('window.__designer.aura.manager && window.__designer.aura.manager.stats.frames')) > 5);

  section('aura: controls change the code and the preview');
  const before = await code(p);
  await setNum(p, 'Count', 120);
  ok('typing a count changes the code (count 120) and it still compiles', /count 120/.test(await code(p)) && (await compiles(p)), await code(p));
  await p.waitForTimeout(1500);
  ok('and the preview follows: more particles alive', (await p.evaluate('window.__designer.aura.manager.stats.particles')) > 40);
  await setSel(p, 'Shape', 'star'); await setSel(p, 'From', 'bottom');
  ok('menus change words in the code', /shape star/.test(await code(p)) && /from bottom/.test(await code(p)));
  await setChk(p, 'Behind the element', false);
  ok('checkboxes add and remove flags', !/ behind/.test(await code(p)));
  await setNum(p, 'Pulse (ms)', 1500); await setNum(p, 'Flicker', 0.4);
  ok('glow pulse and flicker appear in the aura-glow line', /aura-glow:.*pulse 1500.*flicker 0\.4/.test(await code(p)), (await code(p)).split('\n')[0]);
  await setSel(p, 'Write it as', 'single');
  ok('"one aura: line" writes the single form and it compiles', /^aura: glow/.test(await code(p)) && /\n\s+particles/.test(await code(p)) && (await compiles(p)), await code(p));
  await setSel(p, 'Write it as', 'separate');
  await setChk(p, 'On', false, 0); await setChk(p, 'On', false, 1);
  ok('with both layers off it writes aura: none', (await code(p)) === 'aura: none' && (await compiles(p)));
  await setChk(p, 'On', true, 0); await setChk(p, 'On', true, 1);

  section('aura: colour stops and graphs');
  const stops = () => p.locator('.stop').count();
  const n0 = await stops();
  await p.locator('button.add:has-text("add a colour stop")').click();
  ok('"add a colour stop" adds one more colour to the code', (await stops()) === n0 + 1 && (await code(p)).match(/ -> /g).length === n0);
  await p.locator('.stop button.mini').first().click();
  ok('and × removes one', (await stops()) === n0);
  const curve = decodePng(await p.locator('#life-curve').screenshot());
  let inked = 0; for (let y = 0; y < curve.height; y += 2) for (let x = 0; x < curve.width; x += 2) if (px(curve, x, y)[3] > 200 && dist(px(curve, x, y), [255, 159, 67]) < 40) inked++;
  ok('the life-curve graph draws the opacity line', inked > 15, `${inked} orange pixels`);
  await p.waitForTimeout(600);
  const live = decodePng(await p.locator('#live-graph').screenshot());
  let green = 0; for (let y = 0; y < live.height; y++) for (let x = 0; x < live.width; x++) if (dist(px(live, x, y), [123, 237, 159]) < 50) green++;
  ok('the live graph draws the particle count', green > 20, `${green} green pixels`);

  section('talking to the editor');
  await p.click('#insert');
  const sent = await p.evaluate('window.__sent');
  const ins = sent.filter((m) => m.type === 'insert').pop();
  ok('Insert posts exactly the code in the box', ins && ins.text === (await code(p)) && ins.text.length > 20);
  await p.click('#copy');
  ok('Copy posts a copy message too (the editor writes the clipboard)', (await p.evaluate('window.__sent')).some((m) => m.type === 'copy' && m.text === ins.text));
  await p.click('#load');
  ok('Load from selection asks the editor for it', (await p.evaluate('window.__sent')).some((m) => m.type === 'requestSelection'));
  await p.evaluate(`window.postMessage({ type: 'selection', text: 'aura-glow: #00ff88 55 pulse 1200 flicker 0.2' }, '*')`); await p.waitForTimeout(300);
  ok('a selection from the editor is read back into the controls', /aura-glow: #00ff88 55 pulse 1200 flicker 0\.2/.test(await code(p)) && !/aura-particle/.test(await code(p)), await code(p));
  ok('and the number boxes show it', (await rowOf(p, 'aura', 'Radius').locator('input.num').inputValue()) === '55');
  await p.evaluate(`window.postMessage({ type: 'selection', text: '.card { color: red }' }, '*')`); await p.waitForTimeout(200);
  ok('a selection with nothing to load says so and changes nothing', /Nothing to load/.test(await p.textContent('.flash')) && /55/.test(await code(p)));
  await p.evaluate(`window.postMessage({ type: 'selection', text: 'aura-glow: color.accent 24' }, '*')`); await p.waitForTimeout(300);
  ok('a token colour is loaded with a plain-spoken note, not an error', /token or variable/.test(await p.textContent('.flash')));

  section('texture');
  await p.click('button.tab[data-tab=texture]'); await p.waitForTimeout(500);
  const tiles = await p.locator('.tile').count();
  ok(`every preset and generator has a tile (${PRESET_NAMES.length} + ${GENERATORS.length})`, tiles === PRESET_NAMES.length + GENERATORS.length, tiles);
  const unpainted = await p.evaluate(`[...document.querySelectorAll('.tile .sw')].filter((e) => !e.style.backgroundImage || e.style.backgroundImage === 'none').length`);
  ok('every tile shows its texture', unpainted === 0, `${unpainted} blank`);
  await p.click('.tile[data-name=marble]'); await p.waitForTimeout(200);
  ok('clicking a preset writes it', (await code(p)) === 'texture: marble' && (await compiles(p)), await code(p));
  ok('and paints the big preview', (await p.evaluate(`document.getElementById('tex-swatch').style.backgroundImage`)).includes('data:image/svg+xml'));
  await setNum(p, 'scale', 90); await setNum(p, 'intensity', 0.6);
  ok('changing settings writes only what changed', /^texture: marble scale 90 intensity 0\.6$/.test(await code(p)) && (await compiles(p)), await code(p));
  await p.locator('button:has-text("stack another")').click(); await p.waitForTimeout(200);
  ok('stacking another layer writes a comma list', /^texture: marble scale 90 intensity 0\.6, grain$/.test(await code(p)), await code(p));
  await p.click('.tile[data-name=scanlines]'); await p.waitForTimeout(200);
  ok('the stacked layer can be changed on its own', /marble scale 90 intensity 0\.6, scanlines$/.test(await code(p)), await code(p));
  await p.locator('button:has-text("remove this")').click(); await p.waitForTimeout(200);
  ok('and removed', !/scanlines/.test(await code(p)));
  await setChk(p, 'own colour', true); await p.waitForTimeout(100);
  ok('an own colour appears in the code', /color #000000/.test(await code(p)) && (await compiles(p)), await code(p));
  await p.locator('button:has-text("reset this layer")').click(); await p.waitForTimeout(200);
  ok('reset puts the layer back to its preset', (await code(p)) === 'texture: marble');
  await p.click('.tile[data-name=noise]'); await setNum(p, 'octaves', 5); await setNum(p, 'contour', 0.05);
  ok('a bare generator with settings compiles', /^texture: noise.*octaves 5.*contour 0\.05/.test(await code(p)) && (await compiles(p)), await code(p));
  await p.evaluate(`window.postMessage({ type: 'selection', text: 'texture: wood scale 9 color #331100' }, '*')`); await p.waitForTimeout(300);
  ok('a texture selection switches to the texture tab and loads', /^texture: wood scale 9 color #331100$/.test(await code(p)), await code(p));

  section('slider');
  await p.click('button.tab[data-tab=slider]'); await p.waitForTimeout(500);
  ok('the default slider compiles and the preview is styled with the generated rules', (await compiles(p)) && (await p.evaluate(`document.getElementById('pv-style').textContent`)).includes('#pv::-webkit-slider-thumb'), await code(p));
  const box = await p.evaluate(`(() => { const r = document.getElementById('pv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
  const img = decodePng(await p.screenshot({ clip: { x: box.x, y: box.y, width: box.w, height: box.h } }));
  ok('the preview slider shows the fill colour left of the thumb (orange) and the track right of it', dist(px(img, box.w * 0.2, box.h / 2), [255, 122, 0]) < 30 && dist(px(img, box.w * 0.9, box.h / 2), [68, 85, 102]) < 30, `${px(img, box.w * 0.2, box.h / 2)} ${px(img, box.w * 0.9, box.h / 2)}`);
  await setSel(p, 'Shape', 'diamond'); await setChk(p, 'Ring', true); await setChk(p, 'Ticks', true);
  ok('shape, ring and ticks write clauses and still compile', /shape diamond/.test(await code(p)) && /ring/.test(await code(p)) && /ticks/.test(await code(p)) && (await compiles(p)), await code(p));
  await setChk(p, 'Show graph', true); await p.waitForTimeout(150);
  ok('the graph option writes the bars', /graph \d/.test(await code(p)) && /graph-height/.test(await code(p)) && (await compiles(p)));
  const bars0 = (await code(p)).match(/graph ([\d ]+),/)[1];
  await p.locator('button:has-text("ramp")').click(); await p.waitForTimeout(150);
  ok('the "ramp" button reshapes the bars', (await code(p)).match(/graph ([\d ]+),/)[1] !== bars0);
  await p.locator('button:has-text("+ bar")').click(); await p.waitForTimeout(100);
  ok('+ bar adds a bar', (await code(p)).match(/graph ([\d ]+),/)[1].split(' ').length === bars0.split(' ').length + 1);
  await p.evaluate(`window.postMessage({ type: 'selection', text: 'slider: track 4 #123456 radius 2, fill none, thumb 30 #ffffff, shape pill' }, '*')`); await p.waitForTimeout(300);
  ok('a slider selection loads (fill off, pill thumb)', /fill none/.test(await code(p)) && /shape pill/.test(await code(p)) && /thumb 30/.test(await code(p)), await code(p));

  section('state and errors');
  ok('the panel keeps its state for when the tab is hidden and shown again', (await p.evaluate('window.__state')) && (await p.evaluate('window.__state.tab')) === 'slider');
  ok('no page errors anywhere in that session', errors.length === 0, errors.join(' | '));
}, { pages: { '/designer': PAGE }, viewport: { width: 1100, height: 900 } });

// the same panel on a phone-ish narrow width must not break
await withBrowser(async ({ open, errors }) => {
  const p = await open('/designer'); await p.waitForSelector('#code'); await p.waitForTimeout(500);
  const overflow = await p.evaluate(`document.documentElement.scrollWidth > innerWidth + 1`);
  ok('a narrow panel (VS Code side column) does not overflow sideways', !overflow);
  ok('and the controls stack into one column', (await p.evaluate(`getComputedStyle(document.querySelector('.cols')).gridTemplateColumns.split(' ').length`)) === 1);
  ok('no page errors', errors.length === 0, errors.join(' | '));
}, { pages: { '/designer': PAGE }, viewport: { width: 560, height: 800 } });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
