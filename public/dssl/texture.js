/* =========================================================================
 * DSSL: texture.js
 *
 *   .card  { texture: paper }
 *   .metal { texture: brushed intensity 0.6 color2 #cfd8e3 }
 *   .mine  { texture: noise scale 3 octaves 4 color #2a1a0a color2 #c08040 blend multiply }
 *
 * A texture is a LAYER of generated image that sits on top of an element's own
 * background. There are generators (noise, bump, lines, dots, grid, checker,
 * weave, carbon, waves, hex) and settings (scale, intensity, contrast, color,
 * color2, blend, ...). Every named preset below is nothing more than a stored
 * combination of those, so anything a preset does you can write yourself, and
 * you can name your own with a `behavior` block.
 *
 * This file is pure: no DOM. parseTexture() runs in the compiler and checks the
 * words; buildTexture() turns a parsed layer into CSS background pieces and is
 * given a function that resolves colour words (the engine passes one that
 * understands the page's tokens; tests pass parseColor).
 * ========================================================================= */

import { parseColor, withAlpha, toRgba, mix } from './color.js';

const mix2 = (x, y, t) => mix(x, y, t, 'srgb');

/* ------------------------------------------------------------------ *
 * vocabulary
 * ------------------------------------------------------------------ */

export const BLEND_MODES = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'color-burn', 'color-dodge', 'darken', 'lighten', 'difference', 'exclusion'];

export const GENERATORS = ['noise', 'bump', 'lines', 'dots', 'grid', 'checker', 'weave', 'carbon', 'waves', 'hex', 'rings'];

/** the settings a texture layer understands, with how many value words each takes */
export const TEXTURE_KEYS = {
  scale:     { words: 1, kind: 'number', min: 0.1, max: 2000, doc: 'feature size in px: how big the grains, cells or lines are' },
  intensity: { words: 1, kind: 'number', min: 0, max: 2, doc: 'how strong the layer is, 0 to 1 (more than 1 over-drives it)' },
  contrast:  { words: 1, kind: 'number', min: 0, max: 40, doc: 'noise contrast: 1 is as generated, higher is harsher' },
  threshold: { words: 1, kind: 'number', min: 0, max: 1, doc: 'noise cut-off: only values above it show (glitter uses a high one)' },
  contour:   { words: 1, kind: 'number', min: 0.005, max: 0.5, doc: 'draw thin lines where the noise crosses the threshold, instead of a plain cut: veins, rings, contours' },
  octaves:   { words: 1, kind: 'number', min: 1, max: 8, int: true, doc: 'noise detail layers, 1 is smooth, 5 is rough' },
  seed:      { words: 1, kind: 'number', min: 0, max: 99999, int: true, doc: 'a different random pattern with the same look' },
  stretch:   { words: 2, kind: 'numbers', min: 0.1, max: 200, doc: 'stretch noise features along x and y, e.g. stretch 40 1 for wood grain' },
  depth:     { words: 1, kind: 'number', min: 0, max: 30, doc: 'bump height: how deep the relief looks' },
  light:     { words: 1, kind: 'number', min: -360, max: 360, doc: 'bump light direction in degrees' },
  angle:     { words: 1, kind: 'number', min: -360, max: 360, doc: 'direction of lines and patterns, in degrees' },
  thickness: { words: 1, kind: 'number', min: 0.1, max: 500, doc: 'line or grid-line width in px' },
  radius:    { words: 1, kind: 'number', min: 0.02, max: 1, doc: 'dot size as a fraction of the cell' },
  softness:  { words: 1, kind: 'number', min: 0, max: 1, doc: 'how soft the edges of dots and lines are' },
  animate:   { words: 1, kind: 'number', min: 0, max: 60000, doc: 'milliseconds per shimmer step (film-grain flicker); 0 is still' },
  type:      { words: 1, kind: 'word', values: ['fractal', 'turbulence'], doc: 'noise flavour: fractal is clouds, turbulence is veins' },
  blend:     { words: 1, kind: 'word', values: BLEND_MODES, doc: 'how the layer mixes with what is under it' },
  color:     { words: 1, kind: 'color', doc: 'the main colour (dark end of noise, ink of lines and dots)' },
  color2:    { words: 1, kind: 'color', doc: 'the second colour (light end of noise, background cell of patterns)' },
  figure:    { words: 1, kind: 'number', min: 0, max: 1, doc: 'rings generator: how strongly the growth rings arch into a cathedral figure, 0 is straight grain' },
  warp:      { words: 1, kind: 'number', min: 0, max: 1, doc: 'rings generator: how much each ring wobbles along its length' },
  pores:     { words: 1, kind: 'number', min: 0, max: 1, doc: 'rings generator: fine fibre and pore streaks between the rings' },
  knots:     { words: 1, kind: 'number', min: 0, max: 8, int: true, doc: 'rings generator: how many knots in one tile (the pattern repeats, so keep it small)' },
  planks:    { words: 1, kind: 'number', min: 24, max: 1200, doc: 'rings generator: lay it out as planks this many px tall, with a seam and a slightly different board each' },
  invert:    { words: 0, kind: 'flag', doc: 'swap the two colours' },
};

/* ------------------------------------------------------------------ *
 * presets: a name is a stored set of settings, nothing more
 *   layers: one or more { gen, ...settings }. First entries sit on top.
 * ------------------------------------------------------------------ */

const K = (r, g, b, a = 1) => `rgba(${r},${g},${b},${a})`;

export const PRESETS = {
  // ---- grains and noise
  grain:      { doc: 'fine film grain, neutral on any colour', mask: true,
    layers: [{ gen: 'noise', scale: 1.1, octaves: 2, contrast: 1.7, intensity: 0.5, color: '#000', color2: '#fff', blend: 'overlay' }] },
  noise:      { doc: 'coarser static', mask: true,
    layers: [{ gen: 'noise', scale: 2.6, octaves: 3, contrast: 1.9, intensity: 0.5, color: '#000', color2: '#fff', blend: 'overlay' }] },
  rough:      { doc: 'gritty relief, like a rough cast wall', mask: true,
    layers: [{ gen: 'bump', scale: 3, octaves: 4, depth: 3.4, light: 135, intensity: 0.75, color: '#000', color2: '#fff', blend: 'overlay' }] },
  sand:       { doc: 'warm fine sand grains', mask: true,
    layers: [{ gen: 'bump', scale: 1.5, octaves: 3, depth: 2.2, light: 130, intensity: 0.7, color: '#5a4426', color2: '#fff1d0', blend: 'overlay' }] },
  paper:      { doc: 'soft paper fibre with a little unevenness',
    layers: [
      { gen: 'noise', scale: 1.5, octaves: 4, contrast: 1.2, intensity: 0.3, color: '#000', color2: '#fff', blend: 'overlay' },
      { gen: 'noise', scale: 120, octaves: 3, contrast: 1.3, intensity: 0.25, color: '#000', color2: '#fff', blend: 'soft-light', seed: 7 },
    ] },
  cloud:      { doc: 'big soft cloudy variation', mask: true,
    layers: [{ gen: 'noise', scale: 90, octaves: 5, contrast: 1.6, intensity: 0.7, color: '#000', color2: '#fff', blend: 'soft-light' }] },
  concrete:   { doc: 'pitted concrete',
    layers: [
      { gen: 'bump', scale: 6, octaves: 5, depth: 2.6, light: 135, intensity: 0.7, color: '#000', color2: '#fff', blend: 'overlay' },
      { gen: 'noise', scale: 140, octaves: 4, contrast: 1.5, intensity: 0.45, color: '#000', color2: '#fff', blend: 'soft-light', seed: 3 },
    ] },
  stone:      { doc: 'carved stone with broad relief',
    layers: [{ gen: 'bump', scale: 26, octaves: 5, depth: 2.4, light: 125, intensity: 0.75, color: '#000', color2: '#fff', blend: 'overlay' }] },
  crumpled:   { doc: 'crumpled foil or paper, big creases',
    layers: [{ gen: 'bump', scale: 34, octaves: 4, depth: 4, light: 135, intensity: 0.8, color: '#000', color2: '#fff', blend: 'overlay', seed: 11 }] },
  glitter:    { doc: 'sparse bright sparkles', mask: true,
    layers: [{ gen: 'noise', scale: 1.2, octaves: 1, contrast: 16, threshold: 0.66, intensity: 1, color: 'rgba(255,255,255,0)', color2: '#fff', blend: 'screen', seed: 5 }] },
  frost:      { doc: 'fine icy crystals',
    layers: [{ gen: 'bump', scale: 2.2, octaves: 4, depth: 3.2, light: 140, intensity: 0.95, color: 'rgba(160,210,255,0)', color2: '#ffffff', blend: 'screen' }] },
  // ---- natural, stretched
  marble:     { doc: 'veined marble',
    layers: [
      { gen: 'noise', scale: 120, octaves: 5, contour: 0.035, threshold: 0.5, intensity: 0.9, color: '#6c6877', color2: 'rgba(247,245,240,0)', blend: 'multiply', seed: 4 },
      { gen: 'noise', scale: 120, octaves: 5, contour: 0.16, threshold: 0.5, intensity: 0.25, color: '#9b97a6', color2: 'rgba(247,245,240,0)', blend: 'multiply', seed: 4 },
      { gen: 'noise', scale: 200, octaves: 3, contrast: 1.4, intensity: 0.3, color: '#cfc9c0', color2: '#fbfaf7', blend: 'soft-light', seed: 21 },
    ] },
  wood:       { doc: 'long wood grain, along x (use angle 90 for vertical)',
    layers: [{ gen: 'noise', scale: 4, octaves: 3, contrast: 1.8, stretch: [40, 1], intensity: 1, color: '#7a4b24', color2: '#c99a62', blend: 'multiply' }] },
  oak:        { doc: 'oak: open grain, tan with brown rings',
    layers: [{ gen: 'rings', scale: 11, color: '#8a5f33', color2: '#c9a574', contrast: 1.3, figure: 0.55, warp: 0.45, pores: 0.5, seed: 3, blend: 'normal' }] },
  walnut:     { doc: 'walnut: dark chocolate with black-brown rings',
    layers: [{ gen: 'rings', scale: 9, color: '#2b1a10', color2: '#6a4631', contrast: 1.2, figure: 0.5, warp: 0.55, pores: 0.45, seed: 8, blend: 'normal' }] },
  cherry:     { doc: 'cherry: warm red-brown with fine rings',
    layers: [{ gen: 'rings', scale: 8, color: '#7a3a1c', color2: '#bb7443', contrast: 1.1, figure: 0.4, warp: 0.35, pores: 0.35, seed: 5, blend: 'normal' }] },
  maple:      { doc: 'maple: pale, tight, nearly plain grain',
    layers: [{ gen: 'rings', scale: 13, color: '#c79a5a', color2: '#ecd6ab', contrast: 0.8, figure: 0.25, warp: 0.3, pores: 0.25, seed: 11, blend: 'normal' }] },
  pine:       { doc: 'pine: light yellow wood with wide rings and knots',
    layers: [{ gen: 'rings', scale: 16, color: '#b5742f', color2: '#e6c081', contrast: 1.4, figure: 0.65, warp: 0.5, pores: 0.4, knots: 2, seed: 14, blend: 'normal' }] },
  mahogany:   { doc: 'mahogany: deep red-brown, straight grain',
    layers: [{ gen: 'rings', scale: 10, color: '#4a2012', color2: '#8c4727', contrast: 1.1, figure: 0.3, warp: 0.3, pores: 0.4, seed: 6, blend: 'normal' }] },
  ebony:      { doc: 'ebony: nearly black with faint streaks',
    layers: [{ gen: 'rings', scale: 12, color: '#0c0908', color2: '#2d2621', contrast: 0.7, figure: 0.2, warp: 0.25, pores: 0.3, seed: 2, blend: 'normal' }] },
  birch:      { doc: 'birch: creamy pale wood with fine rings',
    layers: [{ gen: 'rings', scale: 10, color: '#d2ae74', color2: '#f0dfb9', contrast: 0.9, figure: 0.3, warp: 0.35, pores: 0.25, seed: 9, blend: 'normal' }] },
  'oak-planks': { doc: 'oak laid as planks, with seams',
    layers: [{ gen: 'rings', scale: 11, color: '#8a5f33', color2: '#c9a574', contrast: 1.3, figure: 0.55, warp: 0.45, pores: 0.5, planks: 110, seed: 3, blend: 'normal' }] },
  'walnut-planks': { doc: 'walnut laid as planks, with seams',
    layers: [{ gen: 'rings', scale: 9, color: '#2b1a10', color2: '#6a4631', contrast: 1.2, figure: 0.5, warp: 0.55, pores: 0.45, planks: 96, seed: 8, blend: 'normal' }] },
  bark:       { doc: 'rough vertical bark',
    layers: [{ gen: 'bump', scale: 10, octaves: 4, depth: 5, stretch: [1, 6], light: 150, intensity: 0.8, color: '#000', color2: '#fff', blend: 'overlay' }] },
  leather:    { doc: 'pebbled leather',
    layers: [{ gen: 'bump', scale: 5, octaves: 2, depth: 4.2, light: 120, intensity: 0.85, color: '#000', color2: '#fff', blend: 'overlay' }] },
  brushed:    { doc: 'brushed metal, fine lines along x',
    layers: [{ gen: 'noise', scale: 1.2, octaves: 2, contrast: 1.5, stretch: [60, 1], intensity: 0.5, color: '#000', color2: '#fff', blend: 'overlay' }] },
  // ---- woven
  canvas:     { doc: 'artist canvas weave',
    layers: [
      { gen: 'weave', scale: 3, thickness: 1, intensity: 0.5, color: '#000', blend: 'multiply' },
      { gen: 'noise', scale: 1.4, octaves: 3, contrast: 1.3, intensity: 0.3, color: '#000', color2: '#fff', blend: 'overlay' },
    ] },
  linen:      { doc: 'loose linen weave with slubs',
    layers: [
      { gen: 'weave', scale: 4, thickness: 1.2, intensity: 0.4, color: '#5a4a32', blend: 'multiply' },
      { gen: 'noise', scale: 80, octaves: 3, contrast: 1.4, stretch: [8, 1], intensity: 0.25, color: '#000', color2: '#fff', blend: 'soft-light', seed: 9 },
    ] },
  denim:      { doc: 'diagonal twill, blue by default',
    layers: [
      { gen: 'lines', angle: 45, scale: 3, thickness: 1.4, intensity: 0.45, color: '#0d2147', blend: 'multiply' },
      { gen: 'noise', scale: 1.3, octaves: 3, contrast: 1.4, intensity: 0.3, color: '#000', color2: '#fff', blend: 'overlay', seed: 2 },
    ] },
  carbon:     { doc: 'carbon fibre twill',
    layers: [{ gen: 'carbon', scale: 20, intensity: 1, color: '#151515', color2: '#262626', blend: 'normal' }] },
  // ---- patterns
  scanlines:  { doc: 'CRT scanlines',
    layers: [{ gen: 'lines', angle: 0, scale: 4, thickness: 2, intensity: 0.28, color: '#000', blend: 'normal' }] },
  halftone:   { doc: 'newsprint dots',
    layers: [{ gen: 'dots', scale: 8, radius: 0.2, softness: 0.2, intensity: 0.55, color: '#000', blend: 'multiply', stagger: true }] },
  dots:       { doc: 'a plain dot grid',
    layers: [{ gen: 'dots', scale: 14, radius: 0.16, softness: 0.05, intensity: 0.35, color: '#000', blend: 'normal' }] },
  lines:      { doc: 'diagonal hairlines',
    layers: [{ gen: 'lines', angle: 45, scale: 8, thickness: 1, intensity: 0.3, color: '#000', blend: 'normal' }] },
  grid:       { doc: 'a square grid, like graph paper',
    layers: [{ gen: 'grid', scale: 24, thickness: 1, intensity: 0.25, color: '#000', blend: 'normal' }] },
  checker:    { doc: 'checkerboard',
    layers: [{ gen: 'checker', scale: 24, intensity: 0.12, color: '#000', blend: 'normal' }] },
  crosshatch: { doc: 'crossed hairlines',
    layers: [
      { gen: 'lines', angle: 45, scale: 6, thickness: 1, intensity: 0.28, color: '#000', blend: 'normal' },
      { gen: 'lines', angle: -45, scale: 6, thickness: 1, intensity: 0.28, color: '#000', blend: 'normal' },
    ] },
  stripes:    { doc: 'bold diagonal stripes',
    layers: [{ gen: 'lines', angle: 45, scale: 32, thickness: 16, intensity: 0.12, color: '#000', blend: 'normal' }] },
  waves:      { doc: 'soft repeating waves',
    layers: [{ gen: 'waves', scale: 40, thickness: 1.2, intensity: 0.3, color: '#000', blend: 'normal' }] },
  hex:        { doc: 'honeycomb',
    layers: [{ gen: 'hex', scale: 28, thickness: 1, intensity: 0.28, color: '#000', blend: 'normal' }] },
};

export const PRESET_NAMES = Object.keys(PRESETS);

/** baseline settings per generator, used when you start from a bare generator name */
const GEN_DEFAULTS = {
  noise:   { scale: 3, octaves: 3, contrast: 1.5, intensity: 0.5, color: '#000', color2: '#fff', blend: 'overlay', type: 'fractal' },
  bump:    { scale: 6, octaves: 4, depth: 3, light: 135, intensity: 0.6, color: '#000', color2: '#fff', blend: 'overlay' },
  lines:   { scale: 8, thickness: 1, angle: 45, intensity: 0.3, color: '#000', blend: 'normal' },
  dots:    { scale: 12, radius: 0.2, softness: 0.1, intensity: 0.4, color: '#000', blend: 'normal' },
  grid:    { scale: 24, thickness: 1, intensity: 0.25, color: '#000', blend: 'normal' },
  checker: { scale: 24, intensity: 0.15, color: '#000', blend: 'normal' },
  weave:   { scale: 4, thickness: 1, intensity: 0.4, color: '#000', blend: 'multiply' },
  carbon:  { scale: 20, intensity: 1, color: '#151515', color2: '#262626', blend: 'normal' },
  waves:   { scale: 40, thickness: 1.2, intensity: 0.3, color: '#000', blend: 'normal' },
  hex:     { scale: 28, thickness: 1, intensity: 0.28, color: '#000', blend: 'normal' },
  rings:   { scale: 10, color: '#7a4b24', color2: '#d1a770', contrast: 1.2, figure: 0.5, warp: 0.4, pores: 0.4, intensity: 1, blend: 'normal' },
};

/* ------------------------------------------------------------------ *
 * parsing (compile time)
 * ------------------------------------------------------------------ */

/** split on top-level commas ("grain, scanlines" or "rgb(1, 2, 3)" stays whole) */
function splitCommas(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** split on top-level whitespace, keeping rgb(1 2 3) and color.ink/40 as one word */
export function splitWords(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s.trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Parse the value of `texture:`.
 *   hooks.error(message, hint)  report a problem
 *   hooks.color(word)           turn a colour word into the CSS the engine will resolve later
 *   hooks.suggest(word, list)   did-you-mean
 * Returns an array of layer specs, [] for `none`, or null when it was invalid.
 */
export function parseTexture(value, hooks) {
  const text = String(value || '').trim();
  if (!text) { hooks.error('texture needs a name', `try texture: grain, or one of ${PRESET_NAMES.slice(0, 6).join(', ')} ...`); return null; }
  if (text === 'none') return [];
  const out = [];
  for (const part of splitCommas(text)) {
    const words = splitWords(part);
    const first = words[0];
    let base;
    if (PRESETS[first]) base = PRESETS[first].layers.map((l) => ({ ...l, preset: first }));
    else if (GENERATORS.includes(first)) base = [{ gen: first, preset: null, ...GEN_DEFAULTS[first] }];
    else {
      hooks.error(`unknown texture "${first}"`, hooks.suggest(first, [...PRESET_NAMES, ...GENERATORS]) || `presets: ${PRESET_NAMES.join(', ')}. generators: ${GENERATORS.join(', ')}`);
      return null;
    }
    const over = {};
    for (let i = 1; i < words.length; i++) {
      const key = words[i];
      const def = TEXTURE_KEYS[key];
      if (!def) {
        hooks.error(`unknown texture setting "${key}"`, hooks.suggest(key, Object.keys(TEXTURE_KEYS)) || `settings: ${Object.keys(TEXTURE_KEYS).join(', ')}`);
        return null;
      }
      if (def.kind === 'flag') { over[key] = true; continue; }
      const vals = words.slice(i + 1, i + 1 + def.words);
      if (vals.length < def.words || vals.some((v) => TEXTURE_KEYS[v])) {
        hooks.error(`texture setting "${key}" needs ${def.words === 1 ? 'a value' : def.words + ' values'}`, def.doc);
        return null;
      }
      i += def.words;
      if (def.kind === 'number' || def.kind === 'numbers') {
        const nums = vals.map((v) => Number(v));
        if (nums.some((n) => Number.isNaN(n))) { hooks.error(`texture setting "${key}" needs a number, got "${vals.join(' ')}"`, def.doc); return null; }
        if (nums.some((n) => n < def.min || n > def.max)) { hooks.error(`texture "${key}" must be between ${def.min} and ${def.max}`, def.doc); return null; }
        over[key] = def.kind === 'numbers' ? nums : (def.int ? Math.round(nums[0]) : nums[0]);
      } else if (def.kind === 'word') {
        if (!def.values.includes(vals[0])) {
          hooks.error(`unknown ${key} "${vals[0]}"`, hooks.suggest(vals[0], def.values) || `use one of: ${def.values.join(', ')}`);
          return null;
        }
        over[key] = vals[0];
      } else if (def.kind === 'color') {
        const css = hooks.color(vals[0]);
        if (css === null) return null;
        over[key] = css;
      }
    }
    // settings given in a custom texture apply to every layer of a multi-layer preset
    // (color settings apply to the first layer only when the preset has several, so a
    // two-layer preset keeps its own second tone)
    base.forEach((layer, idx) => {
      const merged = { ...layer };
      for (const [k, v] of Object.entries(over)) {
        if ((k === 'color' || k === 'color2') && base.length > 1 && idx > 0) continue;
        merged[k] = v;
      }
      out.push(merged);
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * building (run time, in the browser, or in tests)
 * ------------------------------------------------------------------ */

const svgUrl = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}")`;
const f = (n, d = 3) => String(+Number(n).toFixed(d));
const n01 = (x) => Math.max(0, Math.min(1, x));

/** resolve a layer's two colours into rgba objects with intensity applied */
function layerColors(spec, rc) {
  let a = rc(spec.color) || parseColor('#000');
  let b = rc(spec.color2) || (spec.color2 === undefined ? null : parseColor('#fff'));
  const k = spec.intensity === undefined ? 1 : spec.intensity;
  if (spec.invert && b) [a, b] = [b, a];
  const scaleA = (c) => (c ? withAlpha(c, n01(c.a * k)) : null);
  return { a: scaleA(a), b: scaleA(b), raw: { a, b } };
}

function noiseFreq(spec) {
  const base = 1 / Math.max(0.2, spec.scale || 3);
  const st = spec.stretch || [1, 1];
  let fx = base / (st[0] || 1), fy = base / (st[1] || 1);
  if (spec.angle === 90 || spec.angle === -90 || spec.angle === 270) [fx, fy] = [fy, fx];
  return [Math.max(0.0008, fx), Math.max(0.0008, fy)];
}

const tileFor = (spec) => {
  const f2 = noiseFreq(spec);
  // keep tiles reasonably small, but big enough to hide repetition for coarse noise
  const feature = 1 / Math.min(f2[0], f2[1]);
  return Math.round(Math.max(128, Math.min(512, feature * 3)));
};

/** a lookup table that is 0 right at `level` and rises to 1 by `width` away: contour lines */
function contourTable(level, width) {
  const n = 96, out = [];
  for (let i = 0; i < n; i++) out.push(f(Math.min(1, Math.abs(i / (n - 1) - level) / width), 3));
  return out.join(' ');
}

/** noise → contrast curve → two-colour ramp. The workhorse. */
function buildNoise(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const A = a, B = b || a;
  const [fx, fy] = noiseFreq(spec);
  const oct = Math.max(1, Math.round(spec.octaves || 3));
  const c = spec.contrast === undefined ? 1.5 : spec.contrast;
  const t = spec.threshold === undefined ? 0.5 : spec.threshold;
  const off = 0.5 - c * t;
  const T = tileFor(spec);
  const ch = (x) => f(x / 255);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'>` +
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='${spec.type === 'turbulence' ? 'turbulence' : 'fractalNoise'}' baseFrequency='${f(fx, 5)} ${f(fy, 5)}' numOctaves='${oct}' seed='${spec.seed || 0}' stitchTiles='stitch'/>` +
    (spec.contour
      ? `<feColorMatrix type='matrix' values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/>` +
        `<feComponentTransfer><feFuncR type='table' tableValues='${contourTable(t, spec.contour)}'/><feFuncG type='table' tableValues='${contourTable(t, spec.contour)}'/><feFuncB type='table' tableValues='${contourTable(t, spec.contour)}'/></feComponentTransfer>`
      : `<feColorMatrix type='matrix' values='${f(c)} 0 0 0 ${f(off)} ${f(c)} 0 0 0 ${f(off)} ${f(c)} 0 0 0 ${f(off)} 0 0 0 0 1'/>`) +
    `<feColorMatrix type='matrix' values='${f(ch(B.r - A.r))} 0 0 0 ${ch(A.r)} ${f(ch(B.g - A.g))} 0 0 0 ${ch(A.g)} ${f(ch(B.b - A.b))} 0 0 0 ${ch(A.b)} ${f(B.a - A.a)} 0 0 0 ${f(A.a)}'/>` +
    `</filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`;
  return [{ image: svgUrl(svg), size: `${T}px ${T}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'overlay', tile: T }];
}

/**
 * Noise used as a height map and lit from one side, so it reads as physical
 * relief. The lighting is a 3x3 directional-derivative convolution with
 * edgeMode="wrap", which keeps the tile seamless. feDiffuseLighting looks
 * nicer up close but treats the tile edge specially and leaves a 1px seam.
 */
function buildBump(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const A = a, B = b || a;
  const [fx, fy] = noiseFreq(spec);
  const oct = Math.max(1, Math.round(spec.octaves || 4));
  const T = tileFor(spec);
  const az = ((spec.light === undefined ? 135 : spec.light) * Math.PI) / 180;
  // relief strength grows slowly with feature size: big features have gentle slopes, but the fine
  // octaves layered on top keep their steep ones, so a linear rule over-drives anything coarse
  const m = (spec.depth === undefined ? 3 : spec.depth) * 0.33 * Math.pow(Math.max(0.5, spec.scale || 6), 0.25);
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1], gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  const kernel = gx.map((v, i) => f((m * (Math.cos(az) * v + Math.sin(az) * gy[i])) / 4, 4)).join(' ');
  const ch = (x) => f(x / 255);
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${T}' height='${T}'>` +
    `<filter id='f' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
    `<feTurbulence type='fractalNoise' baseFrequency='${f(fx, 5)} ${f(fy, 5)}' numOctaves='${oct}' seed='${spec.seed || 0}' stitchTiles='stitch'/>` +
    `<feColorMatrix type='matrix' values='1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1'/>` +
    `<feConvolveMatrix order='3' kernelMatrix='${kernel}' divisor='1' bias='0.5' edgeMode='wrap' preserveAlpha='true'/>` +
    `<feColorMatrix type='matrix' values='${f(ch(B.r - A.r))} 0 0 0 ${ch(A.r)} ${f(ch(B.g - A.g))} 0 0 0 ${ch(A.g)} ${f(ch(B.b - A.b))} 0 0 0 ${ch(A.b)} ${f(B.a - A.a)} 0 0 0 ${f(A.a)}'/>` +
    `</filter><rect width='100%' height='100%' filter='url(#f)'/></svg>`;
  return [{ image: svgUrl(svg), size: `${T}px ${T}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'overlay', tile: T }];
}

function buildLines(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const p = Math.max(1, spec.scale || 8), w = Math.min(p, Math.max(0.2, spec.thickness || 1));
  const soft = (spec.softness === undefined ? 0.4 : spec.softness) * 1.5;
  const ink = toRgba(a), bg = b ? toRgba(b) : 'transparent';
  const ang = spec.angle === undefined ? 45 : spec.angle;
  const image = `repeating-linear-gradient(${f(-ang, 1)}deg, ${ink} 0, ${ink} ${f(w)}px, ${bg} ${f(w + soft)}px, ${bg} ${f(p)}px)`;
  return [{ image, size: 'auto', repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: p }];
}

function buildDots(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const S = Math.max(2, spec.scale || 12), r = (spec.radius === undefined ? 0.2 : spec.radius) * S;
  const soft = Math.max(0.3, (spec.softness === undefined ? 0.1 : spec.softness) * S);
  const ink = toRgba(a), bg = b ? toRgba(b) : 'transparent';
  const dot = `radial-gradient(circle at center, ${ink} 0, ${ink} ${f(Math.max(0, r - soft / 2))}px, ${bg} ${f(r + soft / 2)}px, ${bg} 100%)`;
  const layers = [{ image: dot, size: `${f(S)}px ${f(S)}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: S }];
  if (spec.stagger) layers.push({ image: dot, size: `${f(S)}px ${f(S)}px`, repeat: 'repeat', position: `${f(S / 2)}px ${f(S / 2)}px`, blend: spec.blend || 'normal', tile: S });
  return layers;
}

function buildGrid(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const S = Math.max(3, spec.scale || 24), w = Math.max(0.3, spec.thickness || 1);
  const ink = toRgba(a);
  const blend = spec.blend || 'normal';
  const out = [
    { image: `linear-gradient(${ink} ${f(w)}px, transparent 0)`, size: `${f(S)}px ${f(S)}px`, repeat: 'repeat', position: '0 0', blend, tile: S },
    { image: `linear-gradient(90deg, ${ink} ${f(w)}px, transparent 0)`, size: `${f(S)}px ${f(S)}px`, repeat: 'repeat', position: '0 0', blend, tile: S },
  ];
  if (b) out.push({ image: `linear-gradient(${toRgba(b)}, ${toRgba(b)})`, size: 'auto', repeat: 'repeat', position: '0 0', blend, tile: S });
  return out;
}

function buildChecker(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const S = Math.max(2, spec.scale || 24);
  const ink = toRgba(a), bg = b ? toRgba(b) : 'transparent';
  const image = `conic-gradient(${ink} 25%, ${bg} 0 50%, ${ink} 0 75%, ${bg} 0)`;
  return [{ image, size: `${f(S * 2)}px ${f(S * 2)}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: S * 2 }];
}

/** plain-weave threads: horizontal and vertical fine lines */
function buildWeave(spec, rc) {
  const { a } = layerColors(spec, rc);
  const p = Math.max(1.5, spec.scale || 4), w = Math.max(0.4, spec.thickness || 1);
  const ink = toRgba(a), clear = toRgba(withAlpha(a.r === undefined ? parseColor('#000') : a, 0));
  const blend = spec.blend || 'multiply';
  return [
    { image: `repeating-linear-gradient(0deg, ${ink} 0, ${ink} ${f(w)}px, ${clear} ${f(w + 0.6)}px, ${clear} ${f(p)}px)`, size: 'auto', repeat: 'repeat', position: '0 0', blend, tile: p },
    { image: `repeating-linear-gradient(90deg, ${ink} 0, ${ink} ${f(w)}px, ${clear} ${f(w + 0.6)}px, ${clear} ${f(p)}px)`, size: 'auto', repeat: 'repeat', position: '0 0', blend, tile: p },
  ];
}

/** the classic layered-gradient carbon fibre, recoloured from color and color2 */
function buildCarbon(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const A = a, B = b || a;
  const dark = toRgba(A), light = toRgba(B);
  const mid = toRgba(mix2(A, B, 0.5)), deep = toRgba(mix2(A, parseColor('#000'), 0.25));
  const S = Math.max(8, spec.scale || 20), h = S / 2, q = S / 4;
  const blend = spec.blend || 'normal';
  const sz = `${f(S)}px ${f(S)}px`;
  const L = (image, size, position) => ({ image, size, repeat: 'repeat', position, blend, tile: S });
  return [
    L(`linear-gradient(27deg, ${dark} ${f(q)}px, transparent ${f(q)}px)`, sz, `0 ${f(q)}px`),
    L(`linear-gradient(207deg, ${dark} ${f(q)}px, transparent ${f(q)}px)`, sz, `${f(h)}px 0`),
    L(`linear-gradient(27deg, ${light} ${f(q)}px, transparent ${f(q)}px)`, sz, `0 ${f(h)}px`),
    L(`linear-gradient(207deg, ${light} ${f(q)}px, transparent ${f(q)}px)`, sz, `${f(h)}px ${f(q)}px`),
    L(`linear-gradient(90deg, ${mid} ${f(h)}px, transparent ${f(h)}px)`, sz, '0 0'),
    L(`linear-gradient(${light} 25%, ${dark} 25%, ${dark} 50%, transparent 50%, transparent 75%, ${mid} 75%, ${mid})`, sz, '0 0'),
    L(`linear-gradient(${deep}, ${deep})`, 'auto', '0 0'),
  ];
}

function buildWaves(spec, rc) {
  const { a } = layerColors(spec, rc);
  const S = Math.max(8, spec.scale || 40), w = Math.max(0.3, spec.thickness || 1.2);
  const col = toRgba(a);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${f(S)}' height='${f(S / 2)}' viewBox='0 0 ${f(S)} ${f(S / 2)}'>` +
    `<path d='M0 ${f(S / 4)} Q ${f(S / 4)} 0 ${f(S / 2)} ${f(S / 4)} T ${f(S)} ${f(S / 4)}' fill='none' stroke='${col}' stroke-width='${f(w)}'/></svg>`;
  return [{ image: svgUrl(svg), size: `${f(S)}px ${f(S / 2)}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: S }];
}

function buildHex(spec, rc) {
  const { a } = layerColors(spec, rc);
  const W = Math.max(14, spec.scale || 28), k = W / 56;
  const col = toRgba(a), sw = Math.max(0.3, spec.thickness || 1) / k;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${f(W)}' height='${f(100 * k)}' viewBox='0 0 56 100'>` +
    `<path d='M28 66L0 50L0 16L28 0L56 16L56 50L28 66L28 100M28 0L28 34L0 50L0 84L28 100L56 84L56 50L28 34' fill='none' stroke='${col}' stroke-width='${f(sw)}'/></svg>`;
  return [{ image: svgUrl(svg), size: `${f(W)}px ${f(100 * k)}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: W }];
}


/* ------------------------------------------------------------------ *
 * rings: growth rings, drawn as vector curves
 *
 * A board is a log sliced, and the rings you see are where the slice crosses
 * the growth layers. So this does not stretch noise: it draws each ring as a
 * curve. The spacing wobbles, the curves arch (cathedral figure) because the
 * slice cuts the layers at a slant, there are pores between them, and planks
 * and knots are drawn on top. Everything comes from a seeded generator and
 * integer harmonics, so the same seed gives the same board on every machine
 * and the tile has no visible seam.
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const r1 = (n) => String(Math.round(n * 10) / 10);
const smallUrl = (svg) => `url("data:image/svg+xml,${svg.replace(/[%#<>"]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())}")`;

/** a smooth path through [x, y] samples (Catmull-Rom as cubic Beziers, ends clamped) */
function smoothPath(pts) {
  const n = pts.length;
  const at = (i) => pts[Math.max(0, Math.min(n - 1, i))];
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${r1(c1x)} ${r1(c1y)} ${r1(c2x)} ${r1(c2y)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d;
}

function buildRings(spec, rc) {
  const { a, b } = layerColors(spec, rc);
  const late = a, early = b || a;
  const P = Math.max(3, spec.scale || 10);
  const W = 576;                                    // one tile along the grain; every harmonic below divides it
  const fig = spec.figure === undefined ? 0.5 : spec.figure;
  const warp = spec.warp === undefined ? 0.4 : spec.warp;
  const pores = spec.pores === undefined ? 0.4 : spec.pores;
  const contrast = spec.contrast === undefined ? 1.2 : spec.contrast;
  const seed = spec.seed || 0;
  const planked = !!spec.planks;
  const plankH = planked ? Math.max(P * 3, spec.planks) : 0;
  const plankN = planked ? 3 : 1;
  const H = planked ? plankH * plankN : P * Math.max(12, Math.round(260 / P));
  const rgba = (c, alpha) => toRgba(withAlpha(c, n01((alpha === undefined ? 1 : alpha) * c.a)));
  const STEP = 48;

  let defs = '', body = '';
  let id = 0;
  for (let pi = 0; pi < plankN; pi++) {
    const rand = rng(seed * 7919 + pi * 104729 + 13);
    const h = planked ? plankH : H;
    const n = Math.max(3, Math.round(h / P));
    const Pe = h / n;
    const ph = [rand() * TAU, rand() * TAU, rand() * TAU];
    const x0 = rand() * W;
    const m = 2 + Math.floor(rand() * 3), spacingAmp = 0.12 + rand() * 0.22;
    const flip = planked && rand() < 0.5;
    const curve = (kf, x) => {
      const t = kf / n;
      // a free board arches from one face to the other; a seamless tile must repeat every n rings, so its envelope has period n
      const per = Math.pow(Math.sin(Math.PI * t), 2);
      const env = planked ? Math.pow(Math.max(0, Math.min(1, flip ? 1 - t : t)), 1.4) : per;
      const env2 = planked ? 0.6 + 0.4 * Math.abs(Math.sin(Math.PI * t)) : per;
      const bump = Math.pow((1 + Math.cos(TAU * (x - x0) / W)) / 2, 1.3);
      const arch = fig * 0.3 * h * env * bump;
      const wob = warp * P * 0.6 * env2 * (0.5 * Math.sin(TAU * x / W + ph[0] + TAU * kf / n) + 0.3 * Math.sin(TAU * 3 * x / W + ph[1] + TAU * 2 * kf / n) + 0.2 * Math.sin(TAU * 7 * x / W + ph[2] + TAU * 3 * kf / n));
      const u = kf + spacingAmp * Math.sin(TAU * m * kf / n);
      return u * Pe + arch + wob;
    };
    // sampled past both ends of the tile, so the stroke is continuous across the join and the viewport clips it
    const ringPath = (kf) => { const pts = []; for (let x = -2 * STEP; x <= W + 2 * STEP; x += STEP) pts.push([x, curve(kf, x)]); return smoothPath(pts); };
    const jit = Array.from({ length: n }, () => [rand(), rand()]);

    const lo = planked ? -2 : -1, hi = planked ? n + 2 : n;
    let g = '';
    for (let k = lo; k <= hi; k++) {
      const [jitter, jop] = jit[((k % n) + n) % n];   // ring k and ring k + n look alike, so the tile repeats cleanly
      const w = Pe * (0.14 + jitter * 0.26);
      const op = n01((0.4 + jop * 0.55) * Math.min(1.4, contrast / 1.2));
      const rid = 'r' + id++;
      defs += `<path id='${rid}' d='${ringPath(k + 0.8)}' fill='none'/>`;
      g += `<use href='#${rid}' stroke='${rgba(late, op * 0.28)}' stroke-width='${r1(w * 2.6)}'/><use href='#${rid}' stroke='${rgba(late, op)}' stroke-width='${r1(w)}'/>`;
    }
    // knots: elongated along the grain, with rings around them
    const knotN = spec.knots ? Math.max(0, Math.round(spec.knots / plankN + (pi === 0 ? 0.49 : 0))) : 0;
    let knots = '';
    for (let q = 0; q < knotN; q++) {
      const kx = 90 + rand() * (W - 180), ky = h * (0.25 + rand() * 0.5), rx = 9 + rand() * 12, ry = rx * 0.6;
      knots += `<ellipse cx='${r1(kx)}' cy='${r1(ky)}' rx='${r1(rx * 4)}' ry='${r1(ry * 3.4)}' fill='${rgba(late, 0.1)}'/>` +
        `<ellipse cx='${r1(kx)}' cy='${r1(ky)}' rx='${r1(rx * 2.4)}' ry='${r1(ry * 2.3)}' fill='none' stroke='${rgba(late, 0.35)}' stroke-width='1.2'/>` +
        `<ellipse cx='${r1(kx)}' cy='${r1(ky)}' rx='${r1(rx * 1.6)}' ry='${r1(ry * 1.6)}' fill='none' stroke='${rgba(late, 0.5)}' stroke-width='1.4'/>` +
        `<ellipse cx='${r1(kx)}' cy='${r1(ky)}' rx='${r1(rx)}' ry='${r1(ry)}' fill='${rgba(late, 0.85)}'/>`;
    }
    const tone = (rand() - 0.5) * 0.14;
    const toneRect = tone > 0 ? `<rect width='${W}' height='${r1(h)}' fill='rgba(255,255,255,${r1(Math.abs(tone) * 10) / 10})'/>` : `<rect width='${W}' height='${r1(h)}' fill='rgba(0,0,0,${r1(Math.abs(tone) * 10) / 10})'/>`;
    const clip = `c${pi}`;
    defs += `<clipPath id='${clip}'><rect width='${W}' height='${r1(h)}'/></clipPath>`;
    body += `<g transform='translate(0 ${r1(pi * plankH)})' clip-path='url(#${clip})'>` +
      `<rect width='${W}' height='${r1(h)}' fill='${rgba(early)}'/>` + (planked ? toneRect : '') + `<g fill='none'>${g}</g>${knots}</g>`;
  }

  // fine fibres: streaks stretched along the grain, drawn once over everything
  const fibre = pores > 0
    ? `<filter id='p' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>` +
      `<feTurbulence type='fractalNoise' baseFrequency='0.014 0.62' numOctaves='3' seed='${seed + 3}' stitchTiles='stitch'/>` +
      `<feColorMatrix type='matrix' values='0 0 0 0 ${f(late.r / 255)} 0 0 0 0 ${f(late.g / 255)} 0 0 0 0 ${f(late.b / 255)} ${f(pores * 4.2)} 0 0 0 ${f(-pores * 1.95)}'/></filter>` +
      `<rect width='${W}' height='${H}' filter='url(#p)' opacity='${f(Math.min(1, 0.55 * late.a))}'/>`
    : '';

  let seams = '';
  if (planked) {
    for (let pi = 0; pi < plankN; pi++) {
      const y = pi * plankH;
      seams += `<rect y='${r1(y)}' width='${W}' height='1.6' fill='rgba(0,0,0,0.5)'/><rect y='${r1(y + 1.6)}' width='${W}' height='1' fill='rgba(255,255,255,0.1)'/>`;
    }
  }

  const rot = spec.angle === 90 || spec.angle === -90 || spec.angle === 270;
  const inner = `<defs>${defs}</defs>${body}${fibre}${seams}`;
  const svg = rot
    ? `<svg xmlns='http://www.w3.org/2000/svg' width='${H}' height='${W}'><g transform='matrix(0 1 1 0 0 0)'>${inner}</g></svg>`
    : `<svg xmlns='http://www.w3.org/2000/svg' width='${W}' height='${H}'>${inner}</svg>`;
  return [{ image: smallUrl(svg), size: rot ? `${H}px ${W}px` : `${W}px ${H}px`, repeat: 'repeat', position: '0 0', blend: spec.blend || 'normal', tile: Math.max(W, H) }];
}

const BUILDERS = { rings: buildRings, noise: buildNoise, bump: buildBump, lines: buildLines, dots: buildDots, grid: buildGrid, checker: buildChecker, weave: buildWeave, carbon: buildCarbon, waves: buildWaves, hex: buildHex };

/**
 * Turn parsed layers into the CSS lists for background-image, -size, -repeat,
 * -position and -blend-mode, top layer first.
 *   rc(cssColorWord) -> {r,g,b,a} | null
 */
export function buildTexture(layers, rc) {
  const parts = [];
  for (const spec of layers) {
    const builder = BUILDERS[spec.gen];
    if (!builder) continue;
    for (const piece of builder(spec, rc)) parts.push({ ...piece, animate: spec.animate || 0 });
  }
  return {
    image: parts.map((p) => p.image).join(', '),
    size: parts.map((p) => p.size).join(', '),
    repeat: parts.map((p) => p.repeat).join(', '),
    position: parts.map((p) => p.position).join(', '),
    blend: parts.map((p) => p.blend).join(', '),
    count: parts.length,
    parts,
  };
}


/* ------------------------------------------------------------------ *
 * composing with the element's own background (shared by the engine and `dssl build`)
 * ------------------------------------------------------------------ */

export function splitBgList(value) {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(value)) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
/** a list of exactly n entries: the author's, cycled the way CSS cycles them, or the default */
function expandList(value, n, dflt) {
  const items = value ? splitBgList(value) : [];
  if (!items.length) return Array.from({ length: n }, () => dflt);
  return Array.from({ length: n }, (_, i) => items[i % items.length]);
}


/**
 * texture sits ON TOP of whatever background the author wrote: the shorthand, the longhands,
 * or just a colour. `owned` is a Map of prop -> { value, imp }; this edits it in place.
 */
export function composeTextureInto(owned, tex) {
  const sh = owned.get('background');
  const img = owned.get('background-image');
  const blendUser = owned.get('background-blend-mode');
  const texBlends = tex.blend.split(', ');
  if (sh) {
    // the author wrote the shorthand: texture layers go first, their value stays the last layer(s)
    const userLayers = splitBgList(sh.value).length;
    const texShort = tex.parts.map((p) => `${p.image} ${p.position} / ${p.size} ${p.repeat}`).join(', ');
    owned.set('background', { value: `${texShort}, ${sh.value}`, imp: sh.imp });
    owned.delete('background-image');
    owned.set('background-blend-mode', { value: [...texBlends, ...expandList(blendUser && blendUser.value, userLayers, 'normal')].join(', '), imp: sh.imp });
    return;
  }
  const userLayers = img ? splitBgList(img.value).length : 0;
  const imp = img ? img.imp : '';
  const get = (name) => (owned.get(name) || {}).value;
  const join = (texList, name, dflt) => [...texList.split(/,(?![^(]*\))/).map((x) => x.trim()), ...(userLayers ? expandList(get(name), userLayers, dflt) : [])].join(', ');
  owned.set('background-image', { value: tex.image + (img ? ', ' + img.value : ''), imp });
  owned.set('background-size', { value: join(tex.size, 'background-size', 'auto'), imp });
  owned.set('background-position', { value: join(tex.position, 'background-position', '0% 0%'), imp });
  owned.set('background-repeat', { value: join(tex.repeat, 'background-repeat', 'repeat'), imp });
  owned.set('background-blend-mode', { value: [...texBlends, ...(userLayers ? expandList(get('background-blend-mode'), userLayers, 'normal') : [])].join(', '), imp });
}

/* ------------------------------------------------------------------ *
 * deterministic value noise, for aura masks and tests
 * ------------------------------------------------------------------ */

/** small fast seeded PRNG (mulberry32) */
export function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * An alpha mask (Uint8Array of size*size) for the textures that make sense as one.
 * Used by aura so particles and glow can be grainy, dotted, scanned. Tileable.
 */
export function makeMask(layer, size = 128) {
  const out = new Uint8Array(size * size);
  const gen = layer.gen;
  const k = layer.intensity === undefined ? 1 : Math.min(1, layer.intensity);
  if (gen === 'lines') {
    const p = Math.max(2, layer.scale || 8), w = layer.thickness || 1, ang = ((layer.angle || 0) * Math.PI) / 180;
    // normal to a line whose direction is (cos a, -sin a) in screen coordinates
    const c = Math.sin(ang), s = Math.cos(ang);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = (((x * c + y * s) % p) + p) % p;
      out[y * size + x] = d < w ? 255 * k : 0;
    }
    return out;
  }
  if (gen === 'dots') {
    const S = Math.max(2, layer.scale || 12), r = (layer.radius === undefined ? 0.2 : layer.radius) * S;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const dx = (x % S) - S / 2, dy = (y % S) - S / 2;
      out[y * size + x] = Math.hypot(dx, dy) < r ? 255 * k : 0;
    }
    return out;
  }
  // everything else: value-noise fbm, tiled
  const rand = rng((layer.seed || 0) + 17);
  const cell = Math.max(1, Math.round(layer.scale || 3));
  const gridN = Math.max(2, Math.floor(size / cell));
  const lat = new Float32Array(gridN * gridN);
  for (let i = 0; i < lat.length; i++) lat[i] = rand();
  const oct = Math.max(1, Math.min(6, layer.octaves || 3));
  const contrast = layer.contrast === undefined ? 1.5 : layer.contrast;
  const thr = layer.threshold === undefined ? 0.5 : layer.threshold;
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (u, v, n) => {
    const g = Math.max(2, Math.round(n));
    const x = ((u % 1) + 1) % 1 * g, y = ((v % 1) + 1) % 1 * g;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = smooth(x - x0), fy = smooth(y - y0);
    const at = (ix, iy) => lat[(((iy % gridN) + gridN) % gridN) * gridN + (((ix % gridN) + gridN) % gridN)];
    const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0, amp = 0.5, n = gridN, tot = 0;
    for (let o = 0; o < oct; o++) { v += sample(x / size, y / size, n) * amp; tot += amp; amp *= 0.5; n *= 2; }
    v /= tot;
    const m = Math.max(0, Math.min(1, contrast * (v - thr) + 0.5));
    out[y * size + x] = 255 * m * k;
  }
  return out;
}
