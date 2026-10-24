/* =========================================================================
 * DSSL designer: designer.js
 *
 * The panel behind "DSSL: Open Designer". Three tabs (Aura, Texture, Slider)
 * with a control for every setting, a live preview drawn by the SAME code the
 * engine uses (the aura renderer, the texture builder, the slider CSS), a few
 * graphs, and the DSSL it writes, checked by the real compiler as you edit.
 *
 * It talks to the editor through four messages:
 *   panel -> editor   insert { text }   copy { text }   requestSelection {}   ready {}
 *   editor -> panel   selection { text }   tab { tab }
 * Everything else happens in here, so it can be driven (and tested) in any browser.
 * ========================================================================= */

import * as core from './designer-core.js';
import { AuraManager, resolveLayer, parseAura } from '../lib/engine/aura.js';
import { buildTexture, parseTexture, PRESETS, TEXTURE_KEYS } from '../lib/engine/texture.js';
import { sliderCss, parseSlider } from '../lib/engine/slider.js';
import { parseColor } from '../lib/engine/color.js';
import { parse } from '../lib/engine/parser.js';
import { resolve } from '../lib/engine/resolver.js';

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage() {}, getState: () => null, setState() {} };

/* ---------------- tiny DOM helpers ---------------- */

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
};
const $ = (sel, root = document) => root.querySelector(sel);

/** every control calls this when it changes something */
let onChange = () => {};

function row(label, ...controls) { return h('label', { class: 'row' }, h('span', { class: 'lab' }, label), h('span', { class: 'ctl' }, ...controls)); }

/** a labelled slider that also shows (and accepts) its number */
function num(label, get, set, min, max, step = 1, hint = '') {
  const range = h('input', { type: 'range', min, max, step, value: get() });
  const box = h('input', { type: 'number', min, max, step, value: get(), class: 'num' });
  const sync = (v) => { range.value = v; box.value = v; };
  range.addEventListener('input', () => { set(Number(range.value)); box.value = range.value; onChange(); });
  box.addEventListener('input', () => { const v = Number(box.value); if (!Number.isNaN(v)) { set(v); range.value = v; onChange(); } });
  const el = row(label, range, box);
  if (hint) el.title = hint;
  el.sync = () => sync(get());
  return el;
}
/** low and high of a range, as two sliders */
function pair(label, get, set, min, max, step = 1, hint = '') {
  const a = num(`${label} from`, () => get()[0], (v) => set([Math.min(v, get()[1]), Math.max(v, get()[1])]), min, max, step, hint);
  const b = num(`${label} to`, () => get()[1], (v) => set([Math.min(get()[0], v), Math.max(get()[0], v)]), min, max, step, hint);
  return h('div', { class: 'pair' }, a, b);
}
function color(label, get, set, alpha = true) {
  const c = h('input', { type: 'color', value: get().hex });
  const a = h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: get().a, title: 'opacity', class: 'alpha' });
  c.addEventListener('input', () => { set({ hex: c.value, a: Number(a.value) }); onChange(); });
  a.addEventListener('input', () => { set({ hex: c.value, a: Number(a.value) }); onChange(); });
  const el = row(label, c, alpha ? a : null);
  el.sync = () => { c.value = get().hex; a.value = get().a; };
  return el;
}
function select(label, get, set, options, hint = '') {
  const s = h('select', {}, options.map((o) => h('option', { value: o.value ?? o, selected: (o.value ?? o) === get() }, o.label ?? o)));
  s.addEventListener('change', () => { set(s.value); onChange(); });
  const el = row(label, s);
  if (hint) el.title = hint;
  el.sync = () => { s.value = get(); };
  return el;
}
function check(label, get, set, hint = '') {
  const c = h('input', { type: 'checkbox', checked: get() });
  c.addEventListener('change', () => { set(c.checked); onChange(); });
  const el = row(label, c);
  if (hint) el.title = hint;
  el.sync = () => { c.checked = get(); };
  return el;
}
const group = (title, ...kids) => h('fieldset', {}, h('legend', {}, title), ...kids);

/* ---------------- output: the code box, compile check, buttons ---------------- */

const out = { text: '' };
let codeBox, statusBox;

function compileCheck(snippet) {
  try {
    const src = core.wrapForCompile(snippet);
    const { ast, errors: pe } = parse(src, 'designer.dssl');
    const doc = resolve(ast, 'designer.dssl');
    const errors = [...pe, ...doc.errors];
    if (errors.length) return { ok: false, text: errors.map((e) => e.message + (e.hint ? ` (${e.hint})` : '')).join('; ') };
    return { ok: true, text: doc.warnings.length ? `compiles, ${doc.warnings.length} warning(s)` : 'compiles' };
  } catch (e) { return { ok: false, text: String(e.message || e) }; }
}

function setOutput(text) {
  out.text = text;
  codeBox.value = text;
  const c = compileCheck(text);
  statusBox.textContent = c.ok ? `✓ ${c.text}` : `✗ ${c.text}`;
  statusBox.className = 'status ' + (c.ok ? 'good' : 'bad');
  return c;
}

/* ====================================================================== *
 * AURA TAB
 * ====================================================================== */

const aura = { state: core.defaultAuraState(), style: 'separate', manager: null, history: [], bg: '#0b0a12', stage: null, target: null };

function auraLayersFromText(text) {
  const hooks = { error() {}, color: (w) => w, suggest: () => null };
  const glow = [], parts = [];
  for (const [prop, value] of core.splitDecls(text)) {
    if (!/^(aura|aura-glow|aura-particles?)$/.test(prop)) continue;
    const r = parseAura(prop, value, hooks);
    if (!r) continue;
    if (r.glow) glow.push(...r.glow);
    if (r.particles) parts.push(...r.particles);
  }
  const fb = { r: 255, g: 255, b: 255, a: 1 };
  return { glow: glow.map((l) => resolveLayer(l, parseColor, fb)), parts: parts.map((l) => resolveLayer(l, parseColor, fb)) };
}

function applyAuraPreview(text) {
  if (!aura.manager) aura.manager = new AuraManager({ reducedMotion: { matches: false }, budget: 1200 });
  const { glow, parts } = auraLayersFromText(text);
  aura.manager.set(aura.target, glow, parts);
  drawLifeCurves();
}

function drawLifeCurves() {
  const cv = $('#life-curve');
  if (!cv) return;
  const x = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.body);
  const fg = css.getPropertyValue('--vscode-editor-foreground') || '#ccc';
  x.strokeStyle = 'rgba(128,128,128,.35)'; x.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { const y = 6 + (i / 4) * (H - 16); x.beginPath(); x.moveTo(26, y); x.lineTo(W - 4, y); x.stroke(); }
  x.fillStyle = fg; x.font = '10px sans-serif';
  x.fillText('1', 8, 12); x.fillText('0', 8, H - 8); x.fillText('life →', W - 40, H - 1);
  const p = aura.state.particles;
  if (!p.on) { x.fillText('particles are off', 40, H / 2); return; }
  const stops = p.stops.length ? p.stops : [{ a: 1 }];
  const alphaAt = (t) => { const n = stops.length - 1; if (n <= 0) return stops[0].a; const f = Math.min(0.9999, t) * n; const i = Math.floor(f); return stops[i].a + (stops[i + 1].a - stops[i].a) * (f - i); };
  const line = (fn, strokeStyle, max) => { x.strokeStyle = strokeStyle; x.lineWidth = 2; x.beginPath(); for (let i = 0; i <= 60; i++) { const t = i / 60; const v = Math.max(0, Math.min(1, fn(t) / max)); const px = 26 + t * (W - 30), py = H - 10 - v * (H - 16); i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke(); };
  line(alphaAt, '#ff9f43', 1);
  const gmax = Math.max(1, p.grow);
  line((t) => 1 + (p.grow - 1) * t, '#48dbfb', gmax);
  x.fillStyle = '#ff9f43'; x.fillText('opacity', 34, 14);
  x.fillStyle = '#48dbfb'; x.fillText(`size (1 → ${p.grow})`, 90, 14);
}

function drawLiveGraph() {
  const cv = $('#live-graph');
  if (!cv || !aura.manager) return;
  const st = aura.manager.stats;
  aura.history.push(st.particles);
  if (aura.history.length > 150) aura.history.shift();
  const x = cv.getContext('2d'), W = cv.width, H = cv.height;
  x.clearRect(0, 0, W, H);
  const max = Math.max(10, ...aura.history);
  x.strokeStyle = '#7bed9f'; x.lineWidth = 1.5; x.beginPath();
  aura.history.forEach((v, i) => { const px = (i / 149) * W, py = H - 4 - (v / max) * (H - 10); i ? x.lineTo(px, py) : x.moveTo(px, py); });
  x.stroke();
  x.fillStyle = getComputedStyle(document.body).color; x.font = '10px sans-serif';
  x.fillText(`${st.particles} particles · ${st.fps || 0} fps · ${st.frameMs.toFixed(2)} ms/frame`, 6, 11);
}

function buildAuraTab() {
  const s = aura.state;
  const g = s.glow, p = s.particles;
  const controls = [];
  const texOpts = ['', 'grain', 'noise', 'rough', 'sand', 'cloud', 'glitter', 'dots', 'lines', 'halftone', 'scanlines'].map((v) => ({ value: v, label: v || 'none' }));

  controls.push(group('Output',
    select('Write it as', () => aura.style, (v) => { aura.style = v; }, [{ value: 'separate', label: 'aura-glow and aura-particle' }, { value: 'single', label: 'one aura: line' }]),
  ));
  const glowCtl = group('Glow',
    check('On', () => g.on, (v) => { g.on = v; }, 'a soft light around the element'),
    color('Colour', () => g.color, (v) => { g.color = v; }),
    num('Radius', () => g.radius, (v) => { g.radius = v; }, 1, 200, 1, 'how far the light reaches, px'),
    num('Intensity', () => g.intensity, (v) => { g.intensity = v; }, 0, 3, 0.05),
    num('Pulse (ms)', () => g.pulse, (v) => { g.pulse = v; }, 0, 6000, 50, '0 is steady; otherwise one breath in and out takes this long'),
    num('Pulse depth', () => g.depth, (v) => { g.depth = v; }, 0, 1, 0.05),
    num('Flicker', () => g.flicker, (v) => { g.flicker = v; }, 0, 1, 0.05, 'random flicker, like a flame'),
    select('Texture', () => g.texture, (v) => { g.texture = v; }, texOpts),
    num('Seed', () => g.seed, (v) => { g.seed = v; }, 1, 99, 1),
    check('Essential', () => g.essential, (v) => { g.essential = v; }, 'keep animating under reduced motion'),
  );
  const stopsBox = h('div', { class: 'stops' });
  const renderStops = () => {
    stopsBox.replaceChildren();
    p.stops.forEach((st, i) => {
      stopsBox.append(h('div', { class: 'stop' },
        color(`Colour ${i + 1}`, () => p.stops[i], (v) => { p.stops[i] = v; }),
        h('button', { class: 'mini', title: 'remove this colour', disabled: p.stops.length <= 1, onclick: () => { p.stops.splice(i, 1); renderStops(); onChange(); } }, '×')));
    });
    stopsBox.append(h('button', { class: 'mini add', disabled: p.stops.length >= 5, onclick: () => { p.stops.push({ ...p.stops[p.stops.length - 1], a: 0 }); renderStops(); onChange(); } }, '+ add a colour stop'));
  };
  renderStops();
  const partCtl = group('Particles',
    check('On', () => p.on, (v) => { p.on = v; }),
    h('div', { class: 'note' }, 'Colours blend along a particle\'s life, left to right.'), stopsBox,
    num('Count', () => p.count, (v) => { p.count = v; }, 1, 300, 1, 'how many are alive at once'),
    pair('Size', () => p.size, (v) => { p.size = v; }, 1, 60, 1, 'diameter in px'),
    pair('Life (ms)', () => p.life, (v) => { p.life = v; }, 100, 4000, 50),
    pair('Speed (px/s)', () => p.speed, (v) => { p.speed = v; }, 0, 400, 5),
    select('Direction', () => p.dir, (v) => { p.dir = v; }, ['up', 'down', 'left', 'right', 'out', 'in', { value: 'deg', label: 'custom degrees' }]),
    num('Degrees', () => p.deg, (v) => { p.deg = v; }, -180, 180, 1, 'used when direction is custom (-90 is up)'),
    num('Spread', () => p.spread, (v) => { p.spread = v; }, 0, 360, 1, 'width of the fan of directions'),
    num('Gravity', () => p.gravity, (v) => { p.gravity = v; }, -300, 300, 5, 'negative pulls up, like a flame'),
    num('Drag', () => p.drag, (v) => { p.drag = v; }, 0, 5, 0.1),
    num('Turbulence', () => p.turbulence, (v) => { p.turbulence = v; }, 0, 300, 5),
    select('From', () => p.from, (v) => { p.from = v; }, core.FROM_WORDS),
    select('Shape', () => p.shape, (v) => { p.shape = v; }, core.SHAPES),
    num('Grow', () => p.grow, (v) => { p.grow = v; }, 0, 4, 0.1, 'end size as a multiple of the start'),
    check('Glowing', () => p.glowing, (v) => { p.glowing = v; }),
    check('Behind the element', () => p.behind, (v) => { p.behind = v; }, 'draw only outside the element'),
    select('Blend', () => p.blend, (v) => { p.blend = v; }, [{ value: '', label: 'automatic' }, 'add', 'normal']),
    select('Texture', () => p.texture, (v) => { p.texture = v; }, texOpts),
    num('Seed', () => p.seed, (v) => { p.seed = v; }, 1, 99, 1),
    check('Essential', () => p.essential, (v) => { p.essential = v; }),
  );
  controls.push(glowCtl, partCtl);

  const stage = h('div', { class: 'stage' }, h('div', { class: 'target', id: 'aura-target' }, 'element'));
  aura.stage = stage; aura.target = $('.target', stage);
  const bgPick = h('div', { class: 'bgs' }, h('span', {}, 'Preview on:'), ...[['#0b0a12', 'dark'], ['#f2f0f7', 'light'], ['#2a2f3a', 'slate']].map(([c, n]) => h('button', { class: 'mini', onclick: () => { stage.style.background = c; aura.target.style.background = c === '#f2f0f7' ? '#cfc8e0' : '#1d1b2c'; aura.target.style.color = c === '#f2f0f7' ? '#222' : '#ccc'; } }, n)));
  const graphs = group('Graphs',
    h('div', { class: 'cap' }, 'One particle over its life'), h('canvas', { id: 'life-curve', width: 360, height: 90 }),
    h('div', { class: 'cap' }, 'Live: particles alive'), h('canvas', { id: 'live-graph', width: 360, height: 50 }));
  return { controls, preview: [stage, bgPick, graphs], onChange: () => { const text = core.auraToDssl(aura.state, aura.style); setOutput(text); applyAuraPreview(text); } };
}

/* ====================================================================== *
 * TEXTURE TAB
 * ====================================================================== */

const tex = { state: core.defaultTextureState(), sel: 0 };

function textureCss(text) {
  const hooks = { error() {}, color: (w) => w, suggest: () => null };
  const decls = core.splitDecls(text).filter(([p]) => p === 'texture');
  if (!decls.length) return null;
  const layers = parseTexture(decls[0][1], hooks);
  return layers ? buildTexture(layers, parseColor) : null;
}

function buildTextureTab() {
  const s = tex.state;
  const layer = () => s.layers[Math.min(tex.sel, s.layers.length - 1)] || s.layers[0];
  const grid = h('div', { class: 'tiles' });
  const tile = (name, kind) => {
    const b = textureCss(`texture: ${name}`);
    const t = h('button', { class: 'tile', title: PRESETS[name] ? PRESETS[name].doc : `generator: ${name}`, onclick: () => { s.layers[tex.sel] = core.defaultTextureLayer(name); rebuild(); } }, h('span', { class: 'sw' }), h('span', { class: 'nm' }, name));
    if (b) Object.assign($('.sw', t).style, { backgroundColor: '#b8a58a', backgroundImage: b.image, backgroundSize: b.size, backgroundRepeat: b.repeat, backgroundPosition: b.position, backgroundBlendMode: b.blend });
    t.dataset.name = name;
    return t;
  };
  core.PRESET_NAMES.forEach((n) => grid.append(tile(n)));
  grid.append(h('div', { class: 'tilehead' }, 'Generators (start from scratch)'));
  core.GENERATORS.forEach((n) => grid.append(tile(n)));

  const layerBar = h('div', { class: 'layers' });
  const settings = h('div', {});
  const swatch = h('div', { class: 'swatch', id: 'tex-swatch' });
  const baseColor = h('input', { type: 'color', value: s.base, onchange: (e) => { s.base = e.target.value; swatch.style.backgroundColor = s.base; } });
  const numeric = ['scale', 'intensity', 'contrast', 'threshold', 'octaves', 'seed', 'depth', 'light', 'angle', 'thickness', 'radius', 'softness', 'contour', 'animate', ...core.RINGS_ONLY];

  function rebuild() {
    layerBar.replaceChildren(...s.layers.map((l, i) => h('button', { class: 'mini' + (i === tex.sel ? ' on' : ''), onclick: () => { tex.sel = i; rebuild(); } }, `${i + 1}. ${l.name}`)),
      h('button', { class: 'mini add', disabled: s.layers.length >= 4, onclick: () => { s.layers.push(core.defaultTextureLayer('grain')); tex.sel = s.layers.length - 1; rebuild(); } }, '+ stack another'),
      h('button', { class: 'mini', disabled: s.layers.length <= 1, onclick: () => { s.layers.splice(tex.sel, 1); tex.sel = 0; rebuild(); } }, 'remove this'));
    settings.replaceChildren();
    const L = layer();
    const base = PRESETS[L.name] ? PRESETS[L.name].layers[0] : {};
    const eff = (k) => (L.set[k] !== undefined ? L.set[k] : base[k]);
    const info = h('div', { class: 'note' }, PRESETS[L.name] ? `${L.name}: ${PRESETS[L.name].doc}` : `${L.name} (a generator: set it up yourself)`);
    settings.append(info);
    const isRings = (base.gen || L.name) === 'rings';
    for (const k of numeric) {
      if (core.RINGS_ONLY.includes(k) && !isRings) continue;   // wood settings only show for wood
      const def = TEXTURE_KEYS[k];
      const dflt = base[k] !== undefined ? base[k] : (def.min + Math.min(def.max, 20) / 2);
      const step = def.int ? 1 : def.max <= 2 ? 0.05 : def.max <= 40 ? 0.1 : 1;
      const el = num(k, () => (eff(k) !== undefined ? eff(k) : dflt), (v) => { L.set[k] = v; }, def.min, Math.min(def.max, k === 'scale' ? 300 : def.max), step, def.doc);
      settings.append(el);
    }
    const st = eff('stretch') || [1, 1];
    settings.append(
      num('stretch x', () => (L.set.stretch || st)[0], (v) => { L.set.stretch = [v, (L.set.stretch || st)[1]]; }, 1, 80, 1, TEXTURE_KEYS.stretch.doc),
      num('stretch y', () => (L.set.stretch || st)[1], (v) => { L.set.stretch = [(L.set.stretch || st)[0], v]; }, 1, 80, 1),
      select('blend', () => eff('blend') || 'normal', (v) => { L.set.blend = v; }, ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'color-burn', 'color-dodge', 'darken', 'lighten', 'difference', 'exclusion']),
      select('type', () => eff('type') || 'fractal', (v) => { L.set.type = v; }, ['fractal', 'turbulence']),
      select('mirror tile (symmetrical)', () => L.set.symmetrical || 'none', (v) => { L.set.symmetrical = v === 'none' ? undefined : v; }, ['none', 'both', 'x', 'y']),
      check('invert', () => !!L.set.invert, (v) => { L.set.invert = v || undefined; }),
      h('div', { class: 'pair' },
        check('own colour', () => !!L.color, (v) => { L.color = v ? (L.color || { hex: '#000000', a: 1 }) : null; rebuild(); }),
        L.color ? color('colour', () => L.color, (v) => { L.color = v; }) : null),
      h('div', { class: 'pair' },
        check('own colour 2', () => !!L.color2, (v) => { L.color2 = v ? (L.color2 || { hex: '#ffffff', a: 1 }) : null; rebuild(); }),
        L.color2 ? color('colour 2', () => L.color2, (v) => { L.color2 = v; }) : null),
      h('button', { class: 'mini', onclick: () => { L.set = {}; L.color = null; L.color2 = null; rebuild(); } }, 'reset this layer to the preset'));
    api.onChange();
  }
  const api = {
    controls: [group('Textures', h('div', { class: 'note' }, 'Pick a preset (or a generator), then adjust it. Stack up to 4.'), grid), group('Layers', layerBar, settings)],
    preview: [h('div', { class: 'swrow' }, h('span', {}, 'Preview on:'), baseColor), swatch,
      h('div', { class: 'sample', style: 'margin-top:8px' }, 'The same texture over text: ', h('b', {}, 'DSSL'))],
    onChange: () => {
      const text = core.textureToDssl(s);
      const c = setOutput(text);
      const b = c.ok ? textureCss(text) : null;
      swatch.style.backgroundColor = s.base;
      Object.assign(swatch.style, { backgroundImage: b ? b.image : 'none', backgroundSize: b ? b.size : '', backgroundRepeat: b ? b.repeat : '', backgroundPosition: b ? b.position : '', backgroundBlendMode: b ? b.blend : '' });
    },
    afterBuild: rebuild,
  };
  return api;
}

/* ====================================================================== *
 * SLIDER TAB
 * ====================================================================== */

const sl = { state: core.defaultSliderState() };

function buildSliderTab() {
  const s = sl.state;
  const style = h('style', { id: 'pv-style' });
  const input = h('input', { type: 'range', id: 'pv', min: 0, max: 100, value: 60 });
  input.addEventListener('input', () => input.style.setProperty('--dssl-p', String(Number(input.value) / 100)));
  input.style.setProperty('--dssl-p', '0.6');
  const bars = h('div', { class: 'bars' });
  const renderBars = () => {
    bars.replaceChildren(...s.bars.map((v, i) => h('input', { type: 'range', class: 'bar', min: 0, max: 100, value: v, title: `bar ${i + 1}`, oninput: (e) => { s.bars[i] = Number(e.target.value); onChange(); } })));
  };
  renderBars();
  const controls = [
    group('Track',
      num('Height', () => s.trackH, (v) => { s.trackH = v; }, 1, 40),
      color('Colour', () => s.trackColor, (v) => { s.trackColor = v; }),
      select('Corners', () => s.trackRadius, (v) => { s.trackRadius = v; }, [{ value: 'full', label: 'fully round' }, { value: 'px', label: 'a number of px' }]),
      num('Corner px', () => s.trackRadiusPx, (v) => { s.trackRadiusPx = v; }, 0, 20),
      check('Fill', () => s.fill, (v) => { s.fill = v; }, 'colour the part before the thumb'),
      color('Fill colour', () => s.fillColor, (v) => { s.fillColor = v; })),
    group('Thumb',
      num('Size', () => s.thumb, (v) => { s.thumb = v; }, 6, 60),
      color('Colour', () => s.thumbColor, (v) => { s.thumbColor = v; }),
      select('Shape', () => s.shape, (v) => { s.shape = v; }, core.THUMB_SHAPES),
      check('Ring', () => s.ring, (v) => { s.ring = v; }), num('Ring width', () => s.ringW, (v) => { s.ringW = v; }, 1, 10), color('Ring colour', () => s.ringColor, (v) => { s.ringColor = v; }),
      check('Glow', () => s.glow, (v) => { s.glow = v; }), color('Glow colour', () => s.glowColor, (v) => { s.glowColor = v; }), num('Glow radius', () => s.glowR, (v) => { s.glowR = v; }, 2, 60)),
    group('Ticks',
      check('Ticks', () => s.ticks, (v) => { s.ticks = v; }), num('Count', () => s.tickCount, (v) => { s.tickCount = v; }, 2, 40), color('Colour', () => s.tickColor, (v) => { s.tickColor = v; }), num('Length', () => s.tickLen, (v) => { s.tickLen = v; }, 2, 20)),
    group('Graph (histogram slider)',
      check('Show graph', () => s.graph, (v) => { s.graph = v; }),
      num('Height', () => s.graphH, (v) => { s.graphH = v; }, 16, 120), num('Bar gap', () => s.graphGap, (v) => { s.graphGap = v; }, 0, 10),
      h('div', { class: 'cap' }, 'Bar heights'), bars,
      h('div', { class: 'pair' },
        h('button', { class: 'mini', onclick: () => { s.bars = Array.from({ length: s.bars.length }, (_, i) => Math.round(50 + 45 * Math.sin(i / 1.6))); renderBars(); onChange(); } }, 'wave'),
        h('button', { class: 'mini', onclick: () => { s.bars = Array.from({ length: s.bars.length }, (_, i) => Math.round(((i + 1) / s.bars.length) * 100)); renderBars(); onChange(); } }, 'ramp'),
        h('button', { class: 'mini', onclick: () => { s.bars = Array.from({ length: s.bars.length }, () => Math.round(10 + Math.random() * 90)); renderBars(); onChange(); } }, 'random'),
        h('button', { class: 'mini', onclick: () => { s.bars = s.bars.length < 40 ? [...s.bars, 50] : s.bars; renderBars(); onChange(); } }, '+ bar'),
        h('button', { class: 'mini', onclick: () => { s.bars = s.bars.length > 2 ? s.bars.slice(0, -1) : s.bars; renderBars(); onChange(); } }, '− bar'))),
  ];
  return {
    controls,
    preview: [h('div', { class: 'sliderstage' }, input, style), h('div', { class: 'note' }, 'This panel is Chromium, so it shows the -webkit-slider-* rules. The -moz-range-* rules for Firefox are written alongside them by the compiler.')],
    onChange: () => {
      const text = core.sliderToDssl(s);
      const c = setOutput(text);
      const hooks = { error() {}, color: (w) => w, suggest: () => null };
      const decl = core.splitDecls(text).find(([p]) => p === 'slider');
      const spec = c.ok && decl ? parseSlider(decl[1], hooks) : null;
      if (!spec) return;
      const css = sliderCss(spec);
      const rule = (sel, decls) => `${sel} { ${decls.map((d) => `${d.prop}: ${d.value}`).join('; ')} }`;
      style.textContent = [rule('#pv', css.base), ...css.shadow.filter((x) => x.pseudo.startsWith('-webkit')).map((x) => rule(`#pv::${x.pseudo}`, x.decls))].join('\n');
    },
  };
}

/* ====================================================================== *
 * the shell: tabs, output box, buttons
 * ====================================================================== */

const tabs = {};
let current = 'aura';

function showTab(name) {
  current = name;
  document.body.dataset.tab = name;
  for (const [n, t] of Object.entries(tabs)) { t.panel.hidden = n !== name; t.btn.classList.toggle('on', n === name); }
  if (name !== 'aura' && aura.manager) aura.manager.set(aura.target, [], []);
  onChange = tabs[name].api.onChange;
  onChange();
  vscode.setState({ tab: name, aura: aura.state, tex: tex.state, sl: sl.state, style: aura.style });
}

/** load a snippet (from the editor's selection) into whichever tab it belongs to */
function loadText(text) {
  const notes = [];
  const props = core.splitDecls(text).map(([p]) => p);
  let target = null;
  if (props.some((p) => /^(aura|aura-|glow-)/.test(p))) {
    const r = core.auraFromDssl(text); Object.assign(aura.state, r.state); notes.push(...r.notes); target = 'aura';
  } else if (props.includes('texture')) {
    const r = core.textureFromDssl(text); Object.assign(tex.state, r.state); tex.sel = 0; notes.push(...r.notes); target = 'texture';
  } else if (props.includes('slider')) {
    const r = core.sliderFromDssl(text); Object.assign(sl.state, r.state); notes.push(...r.notes); target = 'slider';
  }
  if (!target) { flash('Nothing to load: select an aura, texture or slider declaration first.'); return; }
  mount(target); // rebuild the controls from the new state
  flash(notes.length ? `Loaded. ${notes.join(' ')}` : 'Loaded from your selection.');
}

let flashBox;
function flash(msg) { flashBox.textContent = msg; flashBox.className = 'flash on'; clearTimeout(flash.t); flash.t = setTimeout(() => { flashBox.className = 'flash'; }, 5000); }

function mount(name) {
  const builders = { aura: buildAuraTab, texture: buildTextureTab, slider: buildSliderTab };
  const api = builders[name]();
  const t = tabs[name];
  t.api = api;
  t.panel.replaceChildren(h('div', { class: 'cols' }, h('div', { class: 'left' }, ...api.controls), h('div', { class: 'right' }, ...api.preview)));
  if (api.afterBuild) { onChange = api.onChange; api.afterBuild(); }
  if (current === name) { onChange = api.onChange; api.onChange(); }
}

function init() {
  const app = $('#app');
  const saved = vscode.getState();
  if (saved) {
    if (saved.aura) Object.assign(aura.state, saved.aura);
    if (saved.tex) Object.assign(tex.state, saved.tex);
    if (saved.sl) Object.assign(sl.state, saved.sl);
    if (saved.style) aura.style = saved.style;
  }
  const start = document.body.dataset.tab || (saved && saved.tab) || 'aura';
  flashBox = h('div', { class: 'flash' });
  codeBox = h('textarea', { id: 'code', readonly: true, rows: 7, spellcheck: false });
  statusBox = h('div', { class: 'status' });
  const header = h('header', {}, h('h1', {}, 'DSSL designer'), h('nav', {},
    ...[['aura', 'Aura'], ['texture', 'Texture'], ['slider', 'Slider']].map(([n, l]) => { const b = h('button', { class: 'tab', 'data-tab': n, onclick: () => showTab(n) }, l); tabs[n] = { btn: b, panel: h('section', { class: 'panel', hidden: true }) }; return b; })));
  const outBox = h('footer', {},
    h('div', { class: 'outhead' }, h('strong', {}, 'DSSL'), statusBox),
    codeBox,
    h('div', { class: 'btns' },
      h('button', { id: 'insert', class: 'primary', onclick: () => vscode.postMessage({ type: 'insert', text: out.text }) }, 'Insert at cursor'),
      h('button', { id: 'copy', onclick: async () => { vscode.postMessage({ type: 'copy', text: out.text }); try { await navigator.clipboard.writeText(out.text); } catch { /* the editor copies for us */ } flash('Copied.'); } }, 'Copy'),
      h('button', { id: 'load', onclick: () => vscode.postMessage({ type: 'requestSelection' }) }, 'Load from selection'),
      flashBox));
  app.replaceChildren(header, ...Object.values(tabs).map((t) => t.panel), outBox);
  for (const n of Object.keys(tabs)) mount(n);
  showTab(start);
  setInterval(() => { if (current === 'aura') drawLiveGraph(); }, 100);
  window.addEventListener('message', (e) => {
    const m = e.data || {};
    if (m.type === 'selection') loadText(m.text || '');
    if (m.type === 'tab' && tabs[m.tab]) showTab(m.tab);
  });
  vscode.postMessage({ type: 'ready' });
  window.__designer = { core, aura, tex, sl, showTab, loadText, get out() { return out.text; } }; // for tests and curious people
}

init();
