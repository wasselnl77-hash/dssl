/* =========================================================================
 * DSSL designer: designer-core.js
 *
 * The state of the Aura, Texture and Slider designers, and the two-way trip
 * between that state and DSSL text. Pure: no DOM, no vscode. The panel
 * (designer.js) draws controls for this state; the tests (scripts/test-designer.mjs)
 * check that what it writes compiles and reads back to the same thing.
 *
 * Colours in the state are { hex: '#rrggbb', a: 0..1 }, because that is what a
 * colour picker plus an alpha slider produces. DSSL text gets #rrggbb, or
 * rgba(...) when it is see-through.
 * ========================================================================= */

import { parseColor, toHex } from '../lib/engine/color.js';
import { PRESETS, PRESET_NAMES, GENERATORS, TEXTURE_KEYS, parseTexture } from '../lib/engine/texture.js';
import { parseAura, GLOW_DEFAULTS, PARTICLE_DEFAULTS, SHAPES, FROM_WORDS, GLOW_KEYS, PARTICLE_KEYS } from '../lib/engine/aura.js';
import { parseSlider, THUMB_SHAPES } from '../lib/engine/slider.js';

export { PRESETS, PRESET_NAMES, GENERATORS, TEXTURE_KEYS, SHAPES, FROM_WORDS, THUMB_SHAPES, GLOW_KEYS, PARTICLE_KEYS, GLOW_DEFAULTS, PARTICLE_DEFAULTS };

/* ---------------- small helpers ---------------- */

const fmt = (n) => String(+Number(n).toFixed(3));
export const colorToDssl = (c) => (c.a >= 0.999 ? c.hex : `rgba(${parseInt(c.hex.slice(1, 3), 16)},${parseInt(c.hex.slice(3, 5), 16)},${parseInt(c.hex.slice(5, 7), 16)},${fmt(c.a)})`);
export const dsslToColor = (css) => {
  const p = parseColor(css);
  return p ? { hex: toHex(p), a: +p.a.toFixed(3) } : null;
};
const hooksFor = (warnings) => ({
  error: (m) => warnings.push(m),
  color: (w) => w,
  suggest: () => null,
});
/** a range as DSSL writes it: "5" when both ends match, "4 10" (low then high) otherwise */
const rangeText = (r) => (r[0] === r[1] ? fmt(r[0]) : `${fmt(Math.min(...r))} ${fmt(Math.max(...r))}`);

/* ====================================================================== *
 * AURA
 * ====================================================================== */

export const defaultAuraState = () => ({
  glow: { on: true, color: { hex: '#ff7a00', a: 1 }, radius: GLOW_DEFAULTS.radius, intensity: 1, pulse: 0, depth: GLOW_DEFAULTS.depth, flicker: 0, texture: '', seed: 1, essential: false },
  particles: {
    on: true,
    stops: [{ hex: '#ffd24a', a: 1 }, { hex: '#ff6a00', a: 1 }, { hex: '#ff2800', a: 0 }],
    count: 60, size: [6, 10], life: [700, 1100], speed: [40, 110], dir: 'up', deg: -90, spread: 40,
    gravity: -40, drag: 0, turbulence: 60, from: 'top', shape: 'flame', grow: 0.3,
    glowing: true, behind: true, blend: '', texture: '', seed: 1, essential: false,
  },
});

function glowWords(g) {
  const w = [colorToDssl(g.color), fmt(g.radius)];
  if (g.intensity !== 1) w.push('intensity', fmt(g.intensity));
  if (g.pulse) w.push('pulse', fmt(g.pulse));
  if (g.pulse && g.depth !== GLOW_DEFAULTS.depth) w.push('depth', fmt(g.depth));
  if (g.flicker) w.push('flicker', fmt(g.flicker));
  if (g.texture) w.push(`texture(${g.texture})`);
  if (g.seed !== 1) w.push('seed', fmt(g.seed));
  if (g.essential) w.push('essential');
  return w;
}

function particleWords(p, { bare = false } = {}) {
  const D = PARTICLE_DEFAULTS;
  const w = [p.stops.map(colorToDssl).join(' -> ')];
  w.push('count', fmt(p.count));
  if (p.size[0] !== D.size[0] || p.size[1] !== D.size[1]) w.push('size', rangeText(p.size));
  if (p.life[0] !== D.life[0] || p.life[1] !== D.life[1]) w.push('life', p.life[0] === p.life[1] ? fmt(p.life[0]) : `${fmt(Math.min(...p.life))} ${fmt(Math.max(...p.life))}`);
  if (p.speed[0] !== D.speed[0] || p.speed[1] !== D.speed[1]) w.push('speed', p.speed[0] === p.speed[1] ? fmt(p.speed[0]) : `${fmt(Math.min(...p.speed))} ${fmt(Math.max(...p.speed))}`);
  const dir = p.dir === 'deg' ? fmt(p.deg) : p.dir;
  if (!(p.dir === 'up')) w.push('dir', dir);
  if (p.spread !== D.spread) w.push('spread', fmt(p.spread));
  if (p.gravity) w.push('gravity', fmt(p.gravity));
  if (p.drag) w.push('drag', fmt(p.drag));
  if (p.turbulence) w.push('turbulence', fmt(p.turbulence));
  if (p.from !== D.from) w.push('from', p.from);
  if (p.shape !== D.shape) w.push('shape', p.shape);
  if (p.grow !== D.grow) w.push('grow', fmt(p.grow));
  if (p.glowing) w.push('glowing');
  if (p.behind) w.push('behind');
  if (p.blend) w.push('blend', p.blend);
  if (p.texture) w.push(`texture(${p.texture})`);
  if (p.seed !== 1) w.push('seed', fmt(p.seed));
  if (p.essential) w.push('essential');
  return w;
}

/** DSSL for an aura state. style 'separate': one declaration per slot. 'single': one aura: line. */
export function auraToDssl(state, style = 'separate') {
  const g = state.glow.on ? glowWords(state.glow).join(' ') : null;
  const p = state.particles.on ? particleWords(state.particles).join(' ') : null;
  if (!g && !p) return 'aura: none';
  if (style === 'single') {
    const parts = [];
    if (g) parts.push(`glow ${g}`);
    if (p) parts.push(`particles ${p}`);
    return `aura: ${parts.join(',\n      ')}`;
  }
  const lines = [];
  if (g) lines.push(`aura-glow: ${g}`);
  if (p) lines.push(`aura-particle: ${p}`);
  return lines.join('\n');
}

/** what a layer means when nothing is said about a setting: the LANGUAGE's defaults, not the designer's starting look */
const languageGlow = () => ({ on: false, color: { hex: '#ffffff', a: 1 }, radius: GLOW_DEFAULTS.radius, intensity: GLOW_DEFAULTS.intensity, pulse: 0, depth: GLOW_DEFAULTS.depth, flicker: 0, texture: '', seed: 1, essential: false });
const languageParticles = () => ({
  on: false, stops: [{ hex: '#ffffff', a: 1 }, { hex: '#ffffff', a: 0 }], count: PARTICLE_DEFAULTS.count, size: [...PARTICLE_DEFAULTS.size], life: [...PARTICLE_DEFAULTS.life], speed: [...PARTICLE_DEFAULTS.speed],
  dir: 'up', deg: -90, spread: PARTICLE_DEFAULTS.spread, gravity: 0, drag: 0, turbulence: 0, from: PARTICLE_DEFAULTS.from, shape: PARTICLE_DEFAULTS.shape, grow: PARTICLE_DEFAULTS.grow,
  glowing: false, behind: false, blend: '', texture: '', seed: 1, essential: false,
});

/** read an aura back from DSSL text (aura:, aura-glow:, aura-particle: ...). Returns { state, notes }. */
export function auraFromDssl(text) {
  const state = { glow: languageGlow(), particles: languageParticles() };
  const notes = [];
  const decls = splitDecls(text);
  for (const [prop, value] of decls) {
    if (!/^(aura|aura-glow|aura-particles?|glow-particles?|aura-glow-particles?)$/.test(prop)) continue;
    const warnings = [];
    const r = parseAura(prop, value, hooksFor(warnings));
    if (!r) { notes.push(`could not read "${prop}: ${value}": ${warnings.join('; ')}`); continue; }
    if (r.glow && r.glow[0]) {
      const g = r.glow[0];
      Object.assign(state.glow, { on: true });
      if (g.color) { const c = dsslToColor(g.color); if (c) state.glow.color = c; else notes.push(`the colour "${g.color}" is a token or variable, so the designer used its default`); }
      for (const k of ['radius', 'intensity', 'pulse', 'depth', 'flicker', 'seed']) if (g[k] !== undefined) state.glow[k] = g[k];
      if (g.essential) state.glow.essential = true;
      if (g.texture && g.texture[0]) state.glow.texture = textureLayerName(g.texture[0]);
    }
    if (r.particles && r.particles[0]) {
      const q = r.particles[0];
      state.particles.on = true;
      if (q.colors) {
        const stops = q.colors.map((c) => dsslToColor(c)).filter(Boolean);
        if (stops.length) state.particles.stops = stops.length === 1 ? [stops[0], { ...stops[0], a: 0 }] : stops;
        if (stops.length < q.colors.length) notes.push('a token or variable colour could not be shown on a picker and was skipped');
      }
      for (const k of ['count', 'spread', 'gravity', 'drag', 'turbulence', 'grow', 'seed']) if (q[k] !== undefined) state.particles[k] = q[k];
      for (const k of ['size', 'life', 'speed']) if (q[k]) state.particles[k] = q[k];
      if (q.dir !== undefined) { if (typeof q.dir === 'number') { state.particles.dir = q.dir === -90 ? 'up' : q.dir === 90 ? 'down' : q.dir === 180 ? 'left' : q.dir === 0 ? 'right' : 'deg'; state.particles.deg = q.dir; } else state.particles.dir = q.dir; }
      for (const k of ['from', 'shape', 'blend']) if (q[k]) state.particles[k] = q[k];
      for (const k of ['glowing', 'behind', 'essential']) if (q[k]) state.particles[k] = true;
      if (q.texture && q.texture[0]) state.particles.texture = textureLayerName(q.texture[0]);
    }
  }
  return { state, notes };
}

/* ====================================================================== *
 * TEXTURE
 * ====================================================================== */

export const defaultTextureLayer = (name = 'grain') => ({ name, set: {}, color: null, color2: null });
export const defaultTextureState = () => ({ layers: [defaultTextureLayer('wood')], base: '#b8a58a' });

const TEXTURE_NUMERIC = ['scale', 'intensity', 'contrast', 'threshold', 'octaves', 'seed', 'depth', 'light', 'angle', 'thickness', 'radius', 'softness', 'contour', 'animate'];

/** what a preset or generator would use with no overrides, to know what to leave out of the output */
function baselineFor(name) {
  if (PRESETS[name]) return PRESETS[name].layers[0];
  return {};
}

export function textureLayerToDssl(layer) {
  const w = [layer.name];
  const base = baselineFor(layer.name);
  for (const k of TEXTURE_NUMERIC) if (layer.set[k] !== undefined && layer.set[k] !== base[k]) w.push(k, fmt(layer.set[k]));
  if (layer.set.stretch && (layer.set.stretch[0] !== (base.stretch || [1, 1])[0] || layer.set.stretch[1] !== (base.stretch || [1, 1])[1])) w.push('stretch', fmt(layer.set.stretch[0]), fmt(layer.set.stretch[1]));
  if (layer.set.type && layer.set.type !== base.type) w.push('type', layer.set.type);
  if (layer.set.blend && layer.set.blend !== base.blend) w.push('blend', layer.set.blend);
  if (layer.set.invert) w.push('invert');
  if (layer.color) w.push('color', colorToDssl(layer.color));
  if (layer.color2) w.push('color2', colorToDssl(layer.color2));
  return w.join(' ');
}
const textureLayerName = (l) => textureLayerToDssl(fromParsedTexture(l));
export const textureToDssl = (state) => (state.layers.length ? `texture: ${state.layers.map(textureLayerToDssl).join(', ')}` : 'texture: none');

function fromParsedTexture(parsed) {
  const layer = defaultTextureLayer(parsed.preset || parsed.gen);
  const base = baselineFor(layer.name);
  for (const k of [...TEXTURE_NUMERIC, 'stretch', 'type', 'blend', 'invert']) if (parsed[k] !== undefined && JSON.stringify(parsed[k]) !== JSON.stringify(base[k])) layer.set[k] = parsed[k];
  if (parsed.color !== undefined && parsed.color !== base.color) layer.color = dsslToColor(parsed.color);
  if (parsed.color2 !== undefined && parsed.color2 !== base.color2) layer.color2 = dsslToColor(parsed.color2);
  return layer;
}

export function textureFromDssl(text) {
  const state = { layers: [], base: '#b8a58a' };
  const notes = [];
  for (const [prop, value] of splitDecls(text)) {
    if (prop !== 'texture') continue;
    const warnings = [];
    const parsed = parseTexture(value, hooksFor(warnings));
    if (!parsed) { notes.push(`could not read "texture: ${value}": ${warnings.join('; ')}`); continue; }
    // one parsed layer per generator layer; a multi-layer preset reads back as the preset name, once
    const seen = new Set();
    for (const l of parsed) {
      const key = l.preset ? `${l.preset}` : `${l.gen}:${JSON.stringify(l)}`;
      if (l.preset && seen.has(key)) continue;
      seen.add(key);
      state.layers.push(fromParsedTexture(l));
    }
  }
  if (!state.layers.length) state.layers.push(defaultTextureLayer('grain'));
  return { state, notes };
}

/* ====================================================================== *
 * SLIDER
 * ====================================================================== */

export const defaultSliderState = () => ({
  trackH: 8, trackColor: { hex: '#445566', a: 1 }, trackRadius: 'full', trackRadiusPx: 4,
  fill: true, fillColor: { hex: '#ff7a00', a: 1 },
  thumb: 22, thumbColor: { hex: '#ffffff', a: 1 }, shape: 'circle',
  ring: false, ringW: 3, ringColor: { hex: '#ff7a00', a: 1 },
  glow: false, glowColor: { hex: '#ff7a00', a: 1 }, glowR: 14,
  ticks: false, tickCount: 10, tickColor: { hex: '#8890a0', a: 1 }, tickLen: 6,
  graph: false, bars: [20, 45, 70, 90, 60, 35, 50, 80, 95, 40, 60, 75], graphH: 48, graphGap: 3,
});

export function sliderToDssl(s) {
  const c = [];
  const radius = s.trackRadius === 'full' ? 'radius full' : `radius ${fmt(s.trackRadiusPx)}`;
  c.push(`track ${fmt(s.trackH)} ${colorToDssl(s.trackColor)} ${radius}`);
  c.push(s.fill ? `fill ${colorToDssl(s.fillColor)}` : 'fill none');
  c.push(`thumb ${fmt(s.thumb)} ${colorToDssl(s.thumbColor)}`);
  if (s.shape !== 'circle') c.push(`shape ${s.shape}`);
  if (s.ring) c.push(`ring ${fmt(s.ringW)} ${colorToDssl(s.ringColor)}`);
  if (s.glow) c.push(`glow ${colorToDssl(s.glowColor)} ${fmt(s.glowR)}`);
  if (s.ticks) c.push(`ticks ${fmt(s.tickCount)} ${colorToDssl(s.tickColor)} ${fmt(s.tickLen)}`);
  if (s.graph) { c.push(`graph ${s.bars.map(fmt).join(' ')}`); c.push(`graph-height ${fmt(s.graphH)}`); c.push(`graph-gap ${fmt(s.graphGap)}`); }
  return `slider: ${c.join(',\n        ')}`;
}

export function sliderFromDssl(text) {
  const state = defaultSliderState();
  state.fill = false; state.ring = false; state.glow = false; state.ticks = false; state.graph = false;
  const notes = [];
  for (const [prop, value] of splitDecls(text)) {
    if (prop !== 'slider') continue;
    const warnings = [];
    const spec = parseSlider(value, hooksFor(warnings));
    if (!spec) { notes.push(`could not read "slider: ${value}": ${warnings.join('; ')}`); continue; }
    const col = (css, into) => { const c = dsslToColor(css); if (c) return c; notes.push(`the colour "${css}" is a token or variable, so the designer used its default`); return into; };
    state.trackH = spec.track.h; state.trackColor = col(spec.track.color, state.trackColor);
    if (spec.track.radius === 'full') state.trackRadius = 'full'; else { state.trackRadius = 'px'; state.trackRadiusPx = spec.track.radius; }
    if (spec.fill) { state.fill = true; state.fillColor = col(spec.fill, state.fillColor); }
    state.thumb = spec.thumb.size; state.thumbColor = col(spec.thumb.color, state.thumbColor); state.shape = spec.shape;
    if (spec.ring) { state.ring = true; state.ringW = spec.ring.w; state.ringColor = col(spec.ring.color, state.ringColor); }
    if (spec.glow) { state.glow = true; state.glowColor = col(spec.glow.color, state.glowColor); state.glowR = spec.glow.r; }
    if (spec.ticks) { state.ticks = true; state.tickCount = spec.ticks.n; state.tickColor = col(spec.ticks.color, state.tickColor); state.tickLen = spec.ticks.len; }
    if (spec.graph) { state.graph = true; state.bars = spec.graph; state.graphH = spec.graphHeight; state.graphGap = spec.graphGap; }
  }
  return { state, notes };
}

/* ---------------- shared ---------------- */

/** "prop: value" pairs from a snippet, joining continuation lines (a trailing comma continues the value) */
export function splitDecls(text) {
  const out = [];
  const lines = String(text).replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\/\/.*$/, '');
    if (!line.trim()) continue;
    if (cur && /,\s*$/.test(cur[1])) { cur[1] += ' ' + line.trim(); continue; }
    const m = /^\s*(?:[\w.#:&>+~\[\]="' *-]+\{)?\s*([\w-]+)\s*:\s*(.*?)\s*;?\s*$/.exec(line);
    if (m) { cur = [m[1], m[2]]; out.push(cur); } else cur = null;
  }
  return out.map(([p, v]) => [p, v.replace(/\s*;?\s*\}?\s*$/, '').trim()]);
}

/** a complete rule around the snippet, so the real compiler can check it */
export const wrapForCompile = (snippet, selector = '.preview') => `${selector} {\n  ${snippet.replace(/\n/g, '\n  ')}\n}\n`;
