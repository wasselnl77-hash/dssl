/* =========================================================================
 * DSSL: aura.js
 *
 *   .orb { aura-glow: color.accent 28 pulse 1600 }
 *   .orb { aura-particle: #7cf -> transparent count 40 dir up from bottom }
 *   .orb { aura: glow #ff7a00 30 flicker 0.3, particles #fc4 -> #f30 count 60 shape flame glowing }
 *
 * An aura is light and particles around an element. It has NO presets: fire,
 * an energy aura, snow and sparks are all just parameters, and you name your
 * own with a `behavior` block. What you get is the set of knobs.
 *
 * Two kinds of layer:
 *   glow       a soft light around the element (color, radius, pulse, flicker)
 *   particles  things that leave the element (count, size, life, speed, dir ...)
 *
 * Properties (all of them end up in the same two slots, so they stack with the cascade):
 *   aura:                 glow and/or particles, comma separated. Replaces both slots.
 *   aura-glow:            the glow slot
 *   aura-particle(s):     the particles slot
 *   glow-particle(s):     the particles slot, every particle glowing
 *   aura-glow-particle(s): both slots at once; settings are shared
 *
 * This file has two halves. The top is PURE (parseAura, no DOM) and runs in the
 * compiler. The bottom is the canvas RUNTIME (AuraManager) that the engine drives.
 * ========================================================================= */

import { parseColor, toRgba, withAlpha } from './color.js';
import { parseTexture, makeMask, splitWords, rng } from './texture.js';

/* ------------------------------------------------------------------ *
 * vocabulary
 * ------------------------------------------------------------------ */

export const FROM_WORDS = ['edge', 'outline', 'bottom', 'top', 'left', 'right', 'center', 'corners', 'thumb'];
export const SHAPES = ['circle', 'spark', 'square', 'ring', 'star', 'flame', 'smoke', 'line',
  'heart', 'diamond', 'triangle', 'plus', 'drop', 'bubble', 'snowflake', 'confetti', 'leaf'];   // 0.16.0: the last nine

/* ---- shapes an aura can follow (0.16.0) ---- */
const TWO_PI = Math.PI * 2;
const ngon = (n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * TWO_PI; return [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]; });
const starOf = (n, inner) => Array.from({ length: n * 2 }, (_, i) => { const a = -Math.PI / 2 + (i / (n * 2)) * TWO_PI, r = i % 2 ? inner : 1; return [0.5 + 0.5 * r * Math.cos(a), 0.5 + 0.5 * r * Math.sin(a)]; });
const heartOf = () => {
  const pts = [];
  for (let i = 0; i < 48; i++) { const t = (i / 48) * TWO_PI; pts.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return pts.map(([x, y]) => [(x - x0) / (x1 - x0), (y - y0) / (y1 - y0)]);
};
const dropOf = () => {
  const pts = [[0.5, 0]];
  for (let deg = -32.6; deg <= 212.6; deg += 8) { const a = (deg * Math.PI) / 180; pts.push([0.5 + 0.35 * Math.cos(a), 0.65 + 0.35 * Math.sin(a)]); }
  return pts;
};
/** the polygons, as fractions of the element's box (0..1, y down) */
const UNIT_SHAPES = {
  diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  triangle: [[0.5, 0], [1, 1], [0, 1]],
  hexagon: ngon(6, 0),
  octagon: ngon(8, Math.PI / 8),
  pentagon: ngon(5),
  star: starOf(5, 0.4),
  star4: starOf(4, 0.36),
  star6: starOf(6, 0.5),
  cross: [[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]],
  heart: heartOf(),
  drop: dropOf(),
  bolt: [[0.58, 0], [0.18, 0.56], [0.46, 0.56], [0.34, 1], [0.82, 0.38], [0.54, 0.38], [0.72, 0]],
};
/** the names `around` takes (polygon(...) is the other form) */
export const AROUND_NAMES = ['follow', 'box', 'round', 'pill', 'alpha', ...Object.keys(UNIT_SHAPES)];

/** `around` in its parsed form to a polygon, as [x, y] fractions of the box, or null for a shape that is not a polygon (box, round, pill, follow, alpha) */
export function aroundPoints(spec) {
  if (!spec) return null;
  if (spec.name === 'polygon') return spec.pts;
  return UNIT_SHAPES[spec.name] || null;
}

/** `around` words to {name} or {name:'polygon', pts}; null with a message when it is neither */
export function parseAround(word, hooks) {
  const w = String(word || '').trim();
  if (AROUND_NAMES.includes(w)) return { name: w };
  const m = /^polygon\((.*)\)$/s.exec(w);
  if (!m) { hooks.error(`unknown around "${w}"`, hooks.suggest(w, AROUND_NAMES) || `use one of: ${AROUND_NAMES.join(', ')}, or polygon(50% 0, 100% 50%, 50% 100%, 0 50%)`); return null; }
  const pts = [];
  for (const part of m[1].split(',')) {
    const t = part.trim().split(/\s+/);
    const v = t.map((x) => (/^-?[\d.]+%$/.test(x) ? parseFloat(x) / 100 : /^-?[\d.]+$/.test(x) ? parseFloat(x) / 100 : NaN));
    if (t.length !== 2 || v.some((n) => !Number.isFinite(n))) { hooks.error(`polygon needs "x y" pairs in percent, got "${part.trim()}"`, 'around polygon(50% 0, 100% 50%, 50% 100%, 0 50%)'); return null; }
    pts.push(v);
  }
  if (pts.length < 3) { hooks.error('a polygon needs at least 3 points', 'around polygon(50% 0, 100% 100%, 0 100%)'); return null; }
  return { name: 'polygon', pts };
}
export const DIR_WORDS = { up: -90, down: 90, left: 180, right: 0, out: 'out', in: 'in' };
export const AURA_BLENDS = ['add', 'normal'];

const num = (min, max, extra = {}) => ({ kind: 'number', words: 1, min, max, ...extra });

export const GLOW_KEYS = {
  color:     { kind: 'color', words: 1, doc: 'the light colour (default: the element\'s text colour)' },
  radius:    num(1, 400, { doc: 'how far the glow reaches, in px' }),
  intensity: num(0, 4, { doc: 'brightness, 1 is normal' }),
  pulse:     num(0, 60000, { doc: 'milliseconds for one breath in and out; 0 is steady' }),
  depth:     num(0, 1, { doc: 'how deep the pulse goes, 0 to 1' }),
  flicker:   num(0, 1, { doc: 'random flicker, like a flame: 0 is steady, 1 is wild' }),
  seed:      num(0, 99999, { int: true, doc: 'a different random flicker with the same look' }),
  texture:   { kind: 'texture', words: 1, doc: 'texture(grain scale 2): break the light up with a texture' },
  essential: { kind: 'flag', words: 0, doc: 'keep animating even when the visitor prefers reduced motion' },
  unclipped: { kind: 'flag', words: 0, doc: 'let the light spill out of a parent that clips (overflow: hidden, auto, scroll). Without it the aura is cut at that edge, like the element itself' },
  around:    { kind: 'around', words: 1, doc: 'the shape the light follows: follow (the default: the element\'s clip-path or rounded corners), box, round, pill, diamond, triangle, hexagon, octagon, pentagon, star, star4, star6, cross, heart, drop, bolt, alpha (an <img> or <canvas>\'s visible pixels), or polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' },
  inner:     { kind: 'flag', words: 0, doc: 'light inside the edge (a rim) instead of outside it' },
  rays:      num(1, 64, { int: true, doc: 'that many beams of light from the middle, slowly turning (see spin)' }),
  spin:      num(-3600, 3600, { doc: 'rays turn this many degrees a second (default 10); on particles, how fast each one tumbles' }),
  ripple:    num(200, 60000, { doc: 'rings that spread out from the shape and fade, one every this many milliseconds' }),
  nohalo:    { kind: 'flag', words: 0, doc: 'only the rays and ripples, without the soft halo' },
  always:    { kind: 'flag', words: 0, doc: 'keep emitting even when the element cannot be seen (opacity 0, display: none, visibility: hidden, on it or an ancestor): for an invisible anchor that smoke or sparks come out of' },
  z:         num(-1000000, 2147483000, { int: true, doc: 'the z-index of the layer this light is drawn on: `z 5` puts it under a hill with z-index 10. It meets elements in the page\'s root stacking context' }),
};

export const PARTICLE_KEYS = {
  color:      { kind: 'colors', words: 1, doc: 'colours over a particle\'s life: color #ff0 -> #f60 -> transparent' },
  count:      num(1, 600, { int: true, doc: 'how many particles are alive at once' }),
  size:       { kind: 'range', words: 2, min: 0.5, max: 300, doc: 'diameter in px: size 4, or size 10 4 (start and end of a random range)' },
  life:       { kind: 'range', words: 2, min: 50, max: 60000, doc: 'how long one lives, in ms: life 900, or life 600 1200' },
  speed:      { kind: 'range', words: 2, min: 0, max: 3000, doc: 'px per second: speed 60, or speed 30 90' },
  dir:        { kind: 'dir', words: 1, doc: 'where they head: up, down, left, right, out, in, or degrees (-90 is up)' },
  spread:     num(0, 360, { doc: 'how wide the fan of directions is, in degrees' }),
  gravity:    num(-2000, 2000, { doc: 'px/s squared; negative pulls up (flames), positive down (snow)' }),
  drag:       num(0, 10, { doc: 'air resistance: how fast particles slow down' }),
  turbulence: num(0, 1000, { doc: 'random sideways wobble, px/s' }),
  from:       { kind: 'word', words: 1, values: FROM_WORDS, doc: 'where they are born: edge or outline (along the element\'s real outline, see around), bottom, top, left, right, center, corners, thumb (range sliders)' },
  shape:      { kind: 'word', words: 1, values: SHAPES, doc: 'circle, spark, square, ring, star, flame, smoke, line, heart, diamond, triangle, plus, drop, bubble, snowflake, confetti or leaf' },
  grow:       num(0, 10, { doc: 'size at the end of life as a multiple of the start: 0.2 shrinks, 3 swells' }),
  blend:      { kind: 'word', words: 1, values: AURA_BLENDS, doc: 'add makes overlapping particles brighter, normal just stacks them' },
  glowing:    { kind: 'flag', words: 0, doc: 'soft glowing particles that add light' },
  behind:     { kind: 'flag', words: 0, doc: 'draw only outside the element\'s box, as if the element hid them' },
  seed:       num(0, 99999, { int: true, doc: 'a different random pattern with the same look' }),
  texture:    { kind: 'texture', words: 1, doc: 'texture(grain): grainy particles' },
  essential:  { kind: 'flag', words: 0, doc: 'keep animating even when the visitor prefers reduced motion' },
  unclipped:  { kind: 'flag', words: 0, doc: 'let the particles leave a parent that clips (overflow: hidden, auto, scroll). Without it they are cut at that edge' },
  around:     { kind: 'around', words: 1, doc: 'the shape `from edge` and `from outline` follow: follow (the default), box, round, pill, diamond, triangle, hexagon, octagon, pentagon, star, star4, star6, cross, heart, drop, bolt, or polygon(...)' },
  palette:    { kind: 'flag', words: 0, doc: 'each particle takes ONE of the colours (confetti) instead of fading through them' },
  spin:       num(-3600, 3600, { doc: 'how fast each particle tumbles, in degrees a second (random direction)' }),
  wind:       num(-3000, 3000, { doc: 'a sideways push, px/s squared; negative pushes left' }),
  orbit:      num(-3600, 3600, { doc: 'the particles circle the middle of the element, this many degrees a second' }),
  always:     { kind: 'flag', words: 0, doc: 'keep emitting even when the element cannot be seen (opacity 0, display: none, visibility: hidden, on it or an ancestor): for an invisible anchor that smoke or sparks come out of' },
  z:          num(-1000000, 2147483000, { int: true, doc: 'the z-index of the layer these particles are drawn on: `z 5` puts them under a hill with z-index 10. It meets elements in the page\'s root stacking context' }),
};

/* ------------------------------------------------------------------ *
 * parsing (compile time, no DOM)
 * ------------------------------------------------------------------ */

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

const isNumeric = (w) => w !== '' && !Number.isNaN(Number(w));
/** could this word be a colour? A bare unknown word (speedd) must NOT be swallowed as one, or the typo
 *  never gets its "did you mean" */
const looksLikeColor = (w) => /^#[0-9a-f]{3,8}(\/[\d.]+%?)?$/i.test(w) || /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|var)\(/i.test(w)
  || /^[a-z][\w-]*(\.[\w-]+)+(\/[\d.]+%?)?$/i.test(w) || /^(transparent|currentcolor)$/i.test(w) || parseColor(w) !== null;

/**
 * Parse one layer's words.
 *   kind: 'glow' | 'particles' | 'both'   which keys are legal
 *   forceGlowing: glow-particle
 * Returns { glow?, particles? } layers, or null (an error was reported).
 */
function parseLayerWords(words, kind, hooks, opts = {}) {
  const wantGlow = kind === 'glow' || kind === 'both';
  const wantParticles = kind === 'particles' || kind === 'both';
  const keys = kind === 'glow' ? GLOW_KEYS : kind === 'particles' ? PARTICLE_KEYS : { ...GLOW_KEYS, ...PARTICLE_KEYS };
  const g = {}, p = {};
  const setBoth = (k, v) => { if (k in GLOW_KEYS && wantGlow) g[k] = v; if (k in PARTICLE_KEYS && wantParticles) p[k] = v; };
  const textureOf = (inner) => parseTexture(inner, hooks);

  let i = 0;
  const err = (m, h) => { hooks.error(m, h); return null; };

  // positional shorthand: aura-glow: <color> <radius>   aura-particle: <colors> <count>
  const isKey = (w) => Object.prototype.hasOwnProperty.call(keys, w) || w in DIR_WORDS;
  if (words.length && !isKey(words[0]) && words[0] !== '->') {
    const stops = [];
    while (i < words.length && !isKey(words[i]) && !isNumeric(words[i]) && (words[i] === '->' || looksLikeColor(words[i]))) {
      if (words[i] === '->') { i++; continue; }
      const css = hooks.color(words[i]);
      if (css === null) return null;
      stops.push(css);
      i++;
    }
    if (stops.length) {
      if (wantGlow) g.color = stops[0];
      if (wantParticles) p.colors = stops;
    }
    if (i < words.length && isNumeric(words[i])) {
      const n = Number(words[i]);
      if (wantGlow && !wantParticles) g.radius = n;
      else if (wantParticles && !wantGlow) p.count = n;
      else { g.radius = n; }
      i++;
    }
  }

  while (i < words.length) {
    const w = words[i];
    if (w in DIR_WORDS && !(w in keys)) { if (wantParticles) p.dir = DIR_WORDS[w]; i++; continue; }
    // texture(grain scale 2) is one function-style word that carries its own settings
    const fnTex = /^texture\((.*)\)$/s.exec(w);
    if (fnTex && keys.texture) {
      i++;
      const t = textureOf(fnTex[1].trim());
      if (t === null) return null;
      setBoth('texture', t);
      continue;
    }
    const def = keys[w];
    if (!def) {
      const all = [...Object.keys(keys), ...Object.keys(DIR_WORDS)];
      return err(`unknown aura setting "${w}"`, hooks.suggest(w, all) || `settings: ${Object.keys(keys).join(', ')}`);
    }
    i++;
    if (def.kind === 'flag') {
      if (w === 'glowing') { if (wantParticles) p.glowing = true; }
      else setBoth(w, true);
      continue;
    }
    if (def.kind === 'colors') {
      const stops = [];
      while (i < words.length && (words[i] === '->' || (!isKey(words[i]) && !isNumeric(words[i]) && looksLikeColor(words[i])))) {
        if (words[i] === '->') { i++; continue; }
        const css = hooks.color(words[i]);
        if (css === null) return null;
        stops.push(css);
        i++;
      }
      if (!stops.length) return err('color needs at least one colour', def.doc);
      if (wantGlow && 'color' in GLOW_KEYS) g.color = stops[0];
      if (wantParticles) p.colors = stops;
      continue;
    }
    if (def.kind === 'color') {
      const css = hooks.color(words[i]);
      if (css === null) return null;
      i++;
      setBoth(w, css);
      if (w === 'color' && wantParticles) p.colors = [css];
      continue;
    }
    if (def.kind === 'texture') {
      const word = words[i];
      i++;
      const m = /^texture\((.*)\)$/s.exec(word || '');
      const inner = m ? m[1] : word;
      if (!inner) return err('texture needs a name', def.doc);
      const t = textureOf(inner);
      if (t === null) return null;
      setBoth('texture', t);
      continue;
    }
    if (def.kind === 'around') {
      const v = words[i]; i++;
      const sp = parseAround(v, hooks);
      if (sp === null) return null;
      setBoth('around', sp);
      continue;
    }
    if (def.kind === 'dir') {
      const v = words[i]; i++;
      if (v in DIR_WORDS) p.dir = DIR_WORDS[v];
      else if (isNumeric(v)) p.dir = Number(v);
      else return err(`unknown direction "${v}"`, hooks.suggest(v, Object.keys(DIR_WORDS)) || 'up, down, left, right, out, in, or degrees');
      continue;
    }
    if (def.kind === 'word') {
      const v = words[i]; i++;
      if (!def.values.includes(v)) return err(`unknown ${w} "${v}"`, hooks.suggest(v, def.values) || `use one of: ${def.values.join(', ')}`);
      if (wantParticles) p[w] = v;
      continue;
    }
    if (def.kind === 'range') {
      const vals = [];
      while (i < words.length && vals.length < 2 && isNumeric(words[i])) { vals.push(Number(words[i])); i++; }
      if (!vals.length) return err(`${w} needs a number`, def.doc);
      if (vals.some((n) => n < def.min || n > def.max)) return err(`${w} must be between ${def.min} and ${def.max}`, def.doc);
      if (wantParticles) p[w] = vals.length === 1 ? [vals[0], vals[0]] : [Math.min(...vals), Math.max(...vals)];
      continue;
    }
    // plain number
    const raw = words[i]; i++;
    if (!isNumeric(raw)) return err(`${w} needs a number, got "${raw ?? ''}"`, def.doc);
    const n = Number(raw);
    if (n < def.min || n > def.max) return err(`${w} must be between ${def.min} and ${def.max}`, def.doc);
    setBoth(w === 'turbulence' ? 'turbulence' : w, def.int ? Math.round(n) : n);
  }

  if (opts.forceGlowing && wantParticles) p.glowing = true;
  const out = {};
  if (wantGlow && (kind === 'glow' || Object.keys(g).length || opts.requireGlow)) out.glow = { kind: 'glow', ...g };
  if (wantParticles && (kind === 'particles' || Object.keys(p).length || opts.requireParticles)) out.particles = { kind: 'particles', ...p };
  return out;
}

/**
 * Parse the value of one of the aura properties. `prop` decides the shape:
 *   'aura'                 layers need a leading glow / particles word
 *   'aura-glow'            one glow layer
 *   'aura-particle'        one particles layer
 *   'glow-particle'        one particles layer, glowing
 *   'aura-glow-particle'   a glow layer AND a glowing particles layer, settings shared
 * Returns { glow: [layers]|null, particles: [layers]|null } where null means "clear this slot",
 * or null when invalid.
 */
export function parseAura(prop, value, hooks) {
  const text = String(value || '').trim();
  if (!text) { hooks.error(`${prop} needs a value`, 'e.g. aura-glow: color.accent 24'); return null; }
  const base = prop.replace(/s$/, ''); // aura-particles -> aura-particle
  if (text === 'none') {
    // `none` clears exactly the slots this property owns, so aura-glow: none leaves particles alone
    const clears = { 'aura': { glow: null, particles: null }, 'aura-glow': { glow: null }, 'aura-particle': { particles: null }, 'glow-particle': { particles: null }, 'aura-glow-particle': { glow: null, particles: null } };
    return clears[base] || { glow: null, particles: null };
  }

  if (prop === 'aura') {
    const glow = [], particles = [];
    for (const part of splitCommas(text)) {
      const words = splitWords(part);
      const head = words[0];
      let kind;
      if (head === 'glow') kind = 'glow';
      else if (head === 'particles' || head === 'particle') kind = 'particles';
      else {
        hooks.error(`an aura layer starts with glow or particles, not "${head}"`, hooks.suggest(head, ['glow', 'particles']) || 'e.g. aura: glow color.accent 24, particles #fc4 count 40');
        return null;
      }
      const r = parseLayerWords(words.slice(1), kind, hooks);
      if (!r) return null;
      if (r.glow) glow.push(r.glow);
      if (r.particles) particles.push(r.particles);
    }
    return { glow, particles };
  }

  const out = { glow: undefined, particles: undefined };
  const layersOf = (kind, opts) => {
    const arr = [];
    for (const part of splitCommas(text)) {
      const r = parseLayerWords(splitWords(part), kind, hooks, opts);
      if (!r) return null;
      if (r.glow) arr.push(r.glow);
      if (r.particles) arr.push(r.particles);
    }
    return arr;
  };

  if (base === 'aura-glow') { const a = layersOf('glow'); if (!a) return null; out.glow = a; }
  else if (base === 'aura-particle') { const a = layersOf('particles'); if (!a) return null; out.particles = a; }
  else if (base === 'glow-particle') { const a = layersOf('particles', { forceGlowing: true }); if (!a) return null; out.particles = a; }
  else if (base === 'aura-glow-particle') {
    const glow = [], particles = [];
    for (const part of splitCommas(text)) {
      const r = parseLayerWords(splitWords(part), 'both', hooks, { forceGlowing: true, requireGlow: true, requireParticles: true });
      if (!r) return null;
      if (r.glow) glow.push(r.glow);
      if (r.particles) particles.push(r.particles);
    }
    out.glow = glow; out.particles = particles;
  } else { hooks.error(`unknown aura property "${prop}"`, null); return null; }
  return out;
}

/* ------------------------------------------------------------------ *
 * turning a parsed layer into numbers the runtime can use
 * ------------------------------------------------------------------ */

export const GLOW_DEFAULTS = { radius: 24, intensity: 1, pulse: 0, depth: 0.35, flicker: 0, seed: 1 };
export const PARTICLE_DEFAULTS = {
  count: 40, size: [4, 4], life: [900, 900], speed: [40, 40], dir: -90, spread: 30,
  gravity: 0, drag: 0, turbulence: 0, from: 'edge', shape: 'circle', grow: 0.3, blend: null, glowing: false, seed: 1,
};

/**
 * Resolve a parsed layer for drawing. `rc(cssColor)` returns {r,g,b,a} or null,
 * `fallback` is the colour used when the layer names none (the element's text colour).
 */
export function resolveLayer(layer, rc, fallback) {
  const pick = (css) => (css === undefined || /^currentcolor$/i.test(css) ? fallback : (rc(css) || fallback));
  if (layer.kind === 'glow') {
    return { ...GLOW_DEFAULTS, ...layer, rgba: pick(layer.color), tex: layer.texture && layer.texture.length ? layer.texture : null };
  }
  const stops = (layer.colors && layer.colors.length ? layer.colors : [undefined]).map(pick);
  if (stops.length === 1) stops.push(withAlpha(stops[0], 0)); // a single colour fades out
  const glowing = !!layer.glowing;
  return {
    ...PARTICLE_DEFAULTS, ...layer, stops, glowing, behind: !!layer.behind,
    blend: layer.blend || (glowing ? 'add' : 'normal'),
    tex: layer.texture && layer.texture.length ? layer.texture : null,
  };
}

/* ====================================================================== *
 * RUNTIME. Everything below needs a browser.
 * ====================================================================== */

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));

/* ---- geometry of an element's real shape (0.16.0) ---- */

const ANGLE_UNIT = { deg: Math.PI / 180, rad: 1, turn: TAU, grad: Math.PI / 200 };

/** the 2x2 part of everything the element does to itself: rotate, scale and transform (its translation is already in its rect) */
function linearOf(cs) {
  let a = 1, b = 0, c = 0, d = 1, any = false;
  const mul = (ma, mb, mc, md) => {      // cur = cur * m  (m is applied to a point first)
    const na = a * ma + c * mb, nb = b * ma + d * mb, nc = a * mc + c * md, nd = b * mc + d * md;
    a = na; b = nb; c = nc; d = nd; any = true;
  };
  const rot = cs.rotate;
  if (rot && rot !== 'none') {
    const m = /^(?:z\s+)?(-?[\d.]+)(deg|rad|turn|grad)$/.exec(rot);
    if (m) { const t = parseFloat(m[1]) * ANGLE_UNIT[m[2]]; mul(Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t)); }
  }
  const sc = cs.scale;
  if (sc && sc !== 'none') {
    const m = /^(-?[\d.]+)(?:\s+(-?[\d.]+))?/.exec(sc);
    if (m) { const sx = parseFloat(m[1]), sy = m[2] !== undefined ? parseFloat(m[2]) : sx; mul(sx, 0, 0, sy); }
  }
  const tr = cs.transform;
  if (tr && tr !== 'none') {
    let m = /^matrix\(([^)]*)\)$/.exec(tr);
    if (m) { const v = m[1].split(',').map(parseFloat); if (v.length === 6 && v.every(Number.isFinite)) mul(v[0], v[1], v[2], v[3]); }
    else if ((m = /^matrix3d\(([^)]*)\)$/.exec(tr))) { const v = m[1].split(',').map(parseFloat); if (v.length === 16 && v.every(Number.isFinite)) mul(v[0], v[1], v[4], v[5]); }
  }
  return any ? { a, b, c, d } : null;
}

/** clip-path: polygon / circle / ellipse / inset to a shape in fractions of the box; null for anything else (path(), url(), calc) */
const clipCache = new Map();
function parseClip(str) {
  if (!str || str === 'none') return null;
  if (clipCache.has(str)) return clipCache.get(str);
  let out = null;
  const val = (t, size) => (/%$/.test(t) ? parseFloat(t) / 100 : /px$/.test(t) ? parseFloat(t) / size : /^-?[\d.]+$/.test(t) ? (parseFloat(t) === 0 ? 0 : NaN) : NaN);
  try {
    let m;
    if ((m = /^polygon\((?:(?:nonzero|evenodd)\s*,\s*)?(.*)\)$/s.exec(str))) {
      const pts = m[1].split(',').map((p) => p.trim().split(/\s+/));
      if (pts.length >= 3 && pts.every((p) => p.length === 2)) out = { kind: 'poly', pts: pts.map((p) => ({ x: p[0], y: p[1] })) };
    } else if ((m = /^(circle|ellipse)\((.*)\)$/s.exec(str))) {
      const at = m[2].split(/\s+at\s+/);
      const radii = at[0].trim().split(/\s+/).filter(Boolean);
      const pos = (at[1] || '50% 50%').trim().split(/\s+/);
      out = { kind: 'ellipse', circle: m[1] === 'circle', radii, cx: pos[0], cy: pos[1] === undefined ? '50%' : pos[1] };
    } else if ((m = /^inset\(([^)]*?)(?:\s+round\s+.*)?\)$/s.exec(str))) {
      out = { kind: 'inset', v: m[1].trim().split(/\s+/) };
    }
  } catch { out = null; }
  if (clipCache.size > 200) clipCache.clear();
  clipCache.set(str, out);
  return out;
}

/** a shape in the element's own box, centred on (0, 0), sized w by h, in CSS px */
function resolveGeom(spec, clipStr, w, h, radius, srcEl) {
  const name = spec ? spec.name : 'follow';
  const pct = (t, size) => { const v = /%$/.test(t) ? parseFloat(t) / 100 * size : /px$/.test(t) ? parseFloat(t) : /^-?[\d.]+$/.test(t) ? parseFloat(t) : NaN; return v; };
  const polyFrom = (pts) => ({ kind: 'poly', pts: pts.map(([fx, fy]) => [(fx - 0.5) * w, (fy - 0.5) * h]) });
  if (name === 'follow') {
    const cl = parseClip(clipStr);
    if (cl) {
      if (cl.kind === 'poly') {
        const pts = cl.pts.map((p) => [pct(p.x, w) - w / 2, pct(p.y, h) - h / 2]);
        if (pts.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) return { kind: 'poly', pts, sig: 'clip:' + clipStr };
      } else if (cl.kind === 'ellipse') {
        const cx = pct(cl.cx, w) - w / 2, cy = pct(cl.cy, h) - h / 2;
        let rx, ry;
        if (cl.circle) { const ref = Math.sqrt((w * w + h * h) / 2); const r = cl.radii[0] ? (/%$/.test(cl.radii[0]) ? parseFloat(cl.radii[0]) / 100 * ref : pct(cl.radii[0], ref)) : ref / 2; rx = ry = r; }
        else { rx = cl.radii[0] ? pct(cl.radii[0], w) : w / 2; ry = cl.radii[1] ? pct(cl.radii[1], h) : h / 2; }
        if ([cx, cy, rx, ry].every(Number.isFinite)) return { kind: 'ellipse', cx, cy, rx, ry, sig: 'clip:' + clipStr };
      } else if (cl.kind === 'inset') {
        const v = cl.v.map((t, i) => pct(t, i % 2 ? w : h));
        const [t, r, b = t, l = r] = v.length === 1 ? [v[0], v[0], v[0], v[0]] : v.length === 2 ? [v[0], v[1], v[0], v[1]] : v;
        if ([t, r, b, l].every(Number.isFinite)) return { kind: 'poly', pts: [[-w / 2 + l, -h / 2 + t], [w / 2 - r, -h / 2 + t], [w / 2 - r, h / 2 - b], [-w / 2 + l, h / 2 - b]], sig: 'clip:' + clipStr };
      }
    }
    return { kind: 'rrect', r: radius, sig: 'rr' + radius };
  }
  if (name === 'box') return { kind: 'rrect', r: radius, sig: 'rr' + radius };
  if (name === 'pill') return { kind: 'rrect', r: Math.min(w, h) / 2, sig: 'pill' };
  if (name === 'round') return { kind: 'ellipse', cx: 0, cy: 0, rx: w / 2, ry: h / 2, sig: 'round' };
  if (name === 'alpha') {
    const ok = srcEl && ((srcEl.tagName === 'IMG' && srcEl.complete && srcEl.naturalWidth > 0) || srcEl.tagName === 'CANVAS' || (srcEl.tagName === 'VIDEO' && srcEl.readyState >= 2));
    if (ok) return { kind: 'alpha', src: srcEl, sig: 'alpha' + (srcEl.currentSrc || srcEl.src || '') };
    return { kind: 'rrect', r: radius, sig: 'rr' + radius };
  }
  const pts = aroundPoints(spec);
  if (pts) return { ...polyFrom(pts), sig: 'poly' + name + w + 'x' + h };
  return { kind: 'rrect', r: radius, sig: 'rr' + radius };
}

/** add a shape (centred, w by h) to the current path */
function tracePath(ctx, g, w, h) {
  if (g.kind === 'ellipse') { ctx.moveTo(g.cx + g.rx, g.cy); ctx.ellipse(g.cx, g.cy, Math.max(0.01, g.rx), Math.max(0.01, g.ry), 0, 0, TAU); ctx.closePath(); }
  else if (g.kind === 'poly') { g.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); }
  else roundRectPath(ctx, -w / 2, -h / 2, w, h, g.kind === 'rrect' ? g.r : 0);
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function colorAt(stops, t) {
  const n = stops.length - 1;
  if (n <= 0) return stops[0];
  const f = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const k = f - i;
  const a = stops[i], b = stops[i + 1];
  return { r: lerp(a.r, b.r, k), g: lerp(a.g, b.g, k), b: lerp(a.b, b.b, k), a: lerp(a.a, b.a, k) };
}

/** A tiny signature, used to tell "same settings" from "changed" without deep compares */
const sigOf = (x) => JSON.stringify(x);

export class AuraManager {
  /**
   * opts.reducedMotion: a MediaQueryList (or anything with .matches)
   * opts.budget: the most particles alive across the whole page
   */
  constructor(opts = {}) {
    this.reducedMotion = opts.reducedMotion || null;
    this.budget = opts.budget || 1800;
    this.emitters = new Map();     // element -> emitter
    this.canvas = null;
    this.ctx = null;
    this.dpr = 1;
    this.vw = 0; this.vh = 0;
    this.running = false;
    this.paused = false;
    this.last = 0;
    this.sprites = new Map();
    this.masks = new Map();
    this.io = null;
    this.stats = { particles: 0, emitters: 0, frameMs: 0, fps: 0, frames: 0 };
    this._fpsT = 0; this._fpsN = 0;
    this._onResize = () => this.resize();
    // reduced motion draws a still picture, so it only needs a new frame when something could have moved
    this._onScroll = () => { if (this.reduced && !this.running && !this.paused && this.emitters.size) this.start(); };
    this._poll = null;
    this.extra = new Map();        // z-index -> { canvas, ctx }: layers asked for with `z N`
    this._frame = (t) => this.frame(t);
  }

  get reduced() { return !!(this.reducedMotion && this.reducedMotion.matches); }

  /* ---- setup ---- */

  ensureCanvas() {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('data-dssl-aura', '');
    // 0.14.0: the layer sits above the page by default. <html data-dssl-aura-z="20"> (or DSSL.auraZ(20)) lowers it, so a menu or a
    // glass overlay with a higher z-index covers the light the way it covers everything else.
    const z = parseInt(document.documentElement.getAttribute('data-dssl-aura-z'), 10);
    c.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:${Number.isFinite(z) ? z : 2147483000};`;
    (document.body || document.documentElement).appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
    this.resize();
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('scroll', this._onScroll, { passive: true, capture: true });
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          const em = this.emitters.get(e.target);
          if (em) { em.visible = e.isIntersecting; if (e.isIntersecting) this.start(); }
        }
      }, { rootMargin: '200px' });
    }
  }

  resize() {
    if (!this.canvas) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.vw = window.innerWidth; this.vh = window.innerHeight;
    for (const c of this.allCanvases()) {
      c.width = Math.max(1, Math.round(this.vw * this.dpr));
      c.height = Math.max(1, Math.round(this.vh * this.dpr));
    }
    this.dirty = true;
  }

  allCanvases() { return [this.canvas, ...[...this.extra.values()].map((e) => e.canvas)]; }

  /** the drawing context for a layer: the default canvas, or the one at the z-index the layer asked for (`z 5`) */
  ctxFor(z) {
    if (z === undefined || z === null) return this.ctx;
    let e = this.extra.get(z);
    if (!e) {
      const c = document.createElement('canvas');
      c.setAttribute('aria-hidden', 'true');
      c.setAttribute('data-dssl-aura', String(z));
      c.style.cssText = `position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:${z};`;
      c.width = this.canvas.width; c.height = this.canvas.height;
      (document.body || document.documentElement).appendChild(c);
      e = { canvas: c, ctx: c.getContext('2d') };
      this.extra.set(z, e);
    }
    return e.ctx;
  }

  /** how visible an element really is: its opacity times every ancestor's; 0 for display: none or visibility: hidden */
  effectiveOpacity(el) {
    try {
      let o = 1;
      if (getComputedStyle(el).visibility !== 'visible') return 0;
      for (let a = el; a && a.nodeType === 1; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.display === 'none') return 0;
        o *= parseFloat(cs.opacity);
        if (!(o > 0.004)) return 0;
      }
      return o;
    } catch { return 1; }
  }

  /** what a frame would draw for this emitter, as a string: the same string twice means nothing needs redrawing */
  stateKey(el, eo) {
    const r = el.getBoundingClientRect();
    let extra = '';
    try { const cs = getComputedStyle(el); extra = `${cs.transform}|${cs.rotate}|${cs.scale}|${cs.clipPath}`; } catch { /* detached */ }
    return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)},${eo.toFixed(2)},${extra}`;
  }

  /** reduced motion: has anything moved, resized or faded since the last frame? (cheap: no drawing) */
  peek() {
    for (const [el, em] of this.emitters) {
      if (!el.isConnected) return true;
      if (this.stateKey(el, this.effectiveOpacity(el)) !== em.key) return true;
    }
    return false;
  }

  /* ---- the engine's interface ---- */

  /** Set (or change) the aura of an element. glow/particles are arrays of resolved layers. */
  set(el, glow, particles) {
    const hasGlow = glow && glow.length, hasParts = particles && particles.length;
    if (!hasGlow && !hasParts) { this.remove(el); return; }
    this.ensureCanvas();
    let em = this.emitters.get(el);
    if (!em) {
      em = { el, visible: true, rect: null, radius: 0, glow: [], layers: [], dying: false, fade: 1, sig: '', age: 0, radiusAt: -1 };
      this.emitters.set(el, em);
      if (this.io) this.io.observe(el);
    }
    em.dying = false;
    const sig = sigOf([glow, particles]);
    if (sig === em.sig) { this.start(); return; }
    em.sig = sig;
    em.glow = (glow || []).map((g, i) => ({ cfg: g, rnd: rng((g.seed || 1) * 7919 + i), flick: 0, flickTarget: 0, t0: performance.now() }));
    // keep running particles when the layer list keeps its shape; otherwise start fresh
    const old = em.layers;
    em.layers = (particles || []).map((cfg, i) => {
      const prev = old[i];
      const keep = prev && prev.parts;
      return { cfg, rnd: keep ? prev.rnd : rng((cfg.seed || 1) * 104729 + i), parts: keep ? prev.parts : [], acc: keep ? prev.acc : 0 };
    });
    this.start();
  }

  remove(el) {
    const em = this.emitters.get(el);
    if (!em) return;
    em.dying = true; // stop emitting, let what is alive finish, fade the glow
    this.start();
  }

  pause() { this.paused = true; this.running = false; if (this._poll) { clearTimeout(this._poll); this._poll = null; } if (this.ctx) for (const c of this.allCanvases()) c.getContext('2d').clearRect(0, 0, c.width, c.height); }
  resume() { this.paused = false; this.start(); }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onScroll, { capture: true });
    if (this._poll) { clearTimeout(this._poll); this._poll = null; }
    if (this.io) this.io.disconnect();
    for (const e of this.extra.values()) e.canvas.remove();
    this.extra.clear();
    if (this.canvas) this.canvas.remove();
    this.canvas = null; this.ctx = null; this.emitters.clear();
  }

  /* ---- loop ---- */

  start() {
    if (this.running || this.paused || !this.canvas) return;
    this.running = true;
    this.last = 0;
    requestAnimationFrame(this._frame);
  }

  frame(now) {
    if (!this.running) return;
    const t0 = performance.now();
    const dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0.016;
    this.last = now;
    const reduced = this.reduced;
    const dpr = this.dpr;

    for (const c of this.allCanvases()) {
      const x = c.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.clearRect(0, 0, c.width, c.height);
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    let changed = false;

    // global budget: if everyone asks for more than the page can afford, everyone gets a share
    let want = 0;
    for (const em of this.emitters.values()) if (em.visible && !em.dying) for (const l of em.layers) want += l.cfg.count;
    const share = want > this.budget ? this.budget / want : 1;

    let alive = 0, anyActive = false;
    this._n = (this._n || 0) + 1;
    for (const [el, em] of this.emitters) {
      if (!el.isConnected) { this.emitters.delete(el); if (this.io) this.io.unobserve(el); continue; }
      // read geometry once per frame for visible emitters
      let rect = null;
      if (em.visible || em.layers.some((l) => l.parts.length)) {
        rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) rect = null;
      }
      em.rect = rect;
      // 0.15.0: an emitter that cannot be seen (opacity 0 on it or any ancestor, display: none, visibility: hidden) does not emit, and
      // what it already let go fades with it. Looked up every third frame, or every frame in reduced motion where frames are rare.
      if (em.eo === undefined || reduced || this._n % 3 === 0) em.eo = this.effectiveOpacity(el);
      if (em.layers.some((l) => l.cfg.always) || em.glow.some((g) => g.cfg.always)) em.eo = 1;   // an invisible anchor on purpose
      const key = this.stateKey(el, em.eo);
      if (key !== em.key) { em.key = key; changed = true; }
      // 0.14.0: a stage scaled with transform: scale() has a rect the size you SEE, so the light follows it, and so must its size
      // and speed. The scale is how much bigger (or smaller) the box is than the box CSS says it is.
      em.scale = 1;
      if (em.radiusAt < 0 || (em.age++ % 45) === 0) { em.radius = this.cornerRadius(el, rect); em.radiusAt = 0; em.clips = this.clipAncestors(el, em); }
      // 0.16.0: where the element REALLY is: its rect is the box around the turned/scaled shape, so work out the shape's own size, the way it
      // is turned (rotate, scale, transform) and how much a parent scales it. Glow, edge particles and the hidden-behind clip all use this.
      em.base = rect ? this.baseOf(el, rect) : null;
      if (em.base) em.scale = em.base.s;

      if (em.dying) em.fade = Math.max(0, em.fade - dt * 3);
      else em.fade = Math.min(1, em.fade + dt * 4);

      // 0.14.0: cut the light at the edge of any parent that clips, so a stage with overflow: hidden keeps its fire inside
      const clipped = rect && em.clips && em.clips.length ? this.clipRect(em.clips) : null;
      const open = (ctx) => { if (clipped) { ctx.save(); ctx.beginPath(); ctx.rect(clipped.x, clipped.y, clipped.w, clipped.h); ctx.clip(); } };
      const close = (ctx) => { if (clipped) ctx.restore(); };
      const seen = em.eo > 0.004;

      // glow
      if (rect && em.fade > 0 && (em.visible || em.dying) && seen) {
        for (const g of em.glow) { const ctx = this.ctxFor(g.cfg.z); open(ctx); this.drawGlow(ctx, rect, em, g, now, reduced); close(ctx); }
        if (em.glow.length) anyActive = true;
      }

      // particles
      for (const L of em.layers) {
        const cfg = L.cfg;
        const moving = !reduced || cfg.essential;
        L.scale = em.scale;
        L.eo = em.eo;
        if (em.base) { L.cx = em.base.cx; L.cy = em.base.cy; }
        if (rect && em.visible && !em.dying && moving && seen) this.emit(L, rect, em, dt, share, el);
        if (L.parts.length) { const ctx = this.ctxFor(cfg.z); open(ctx); this.stepAndDraw(ctx, L, dt, moving, cfg.behind && em.base ? { base: em.base, geom: this.geomFor(em, cfg) } : null); close(ctx); }
        alive += L.parts.length;
        if (L.parts.length || (rect && em.visible && !em.dying && moving && seen)) anyActive = true;
      }
      if (em.dying && em.fade <= 0 && em.layers.every((l) => !l.parts.length)) {
        this.emitters.delete(el);
        if (this.io) this.io.unobserve(el);
      }
    }

    this.stats.particles = alive;
    this.stats.emitters = this.emitters.size;
    this.stats.frameMs = performance.now() - t0;
    this.stats.frames++;
    this._fpsN++;
    if (now - this._fpsT > 500) { this.stats.fps = Math.round((this._fpsN * 1000) / Math.max(1, now - this._fpsT)); this._fpsT = now; this._fpsN = 0; }

    if (this.emitters.size === 0) { this.running = false; for (const c of this.allCanvases()) c.getContext('2d').clearRect(0, 0, c.width, c.height); return; }
    // Normally the loop runs every frame (the glow follows the element, particles move). With reduced
    // motion nothing moves, so one frame is a complete picture; it is redrawn on scroll, resize, a
    // style change, and a quick look (peek) for anything that moved. A frame that saw something move, resize or fade asks for the next one,
    // so a glow on a thing that moves under reduced motion follows it every frame instead of lagging. Essential layers and fading-out emitters still loop.
    let needLoop = !reduced;
    if (reduced) {
      if (changed) needLoop = true;
      for (const em of this.emitters.values()) {
        if (em.dying) needLoop = true;
        if (em.glow.some((g) => g.cfg.essential) || em.layers.some((l) => l.cfg.essential && (l.parts.length || (em.visible && !em.dying)))) needLoop = true;
      }
    }
    if (needLoop) { requestAnimationFrame(this._frame); return; }
    this.running = false;
    this.watchStill();
  }

  /** reduced motion, nothing moving: look every 100ms (a few rect reads, no drawing) and draw again the moment something changed */
  watchStill() {
    if (this._poll || this.paused) return;
    this._poll = setTimeout(() => {
      this._poll = null;
      if (this.running || !this.canvas) return;
      if (this.peek()) this.start(); else this.watchStill();
    }, 100);
  }

  /** the ancestors that clip their children (overflow other than visible), unless this emitter said `unclipped` */
  clipAncestors(el, em) {
    if (em.layers.some((l) => l.cfg.unclipped) || em.glow.some((g) => g.cfg.unclipped)) return [];
    const out = [];
    try {
      for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (/(hidden|clip|auto|scroll)/.test(cs.overflowX + ' ' + cs.overflowY)) out.push(a);
      }
    } catch { /* detached */ }
    return out;
  }

  /** the visible box: the padding boxes of every clipping ancestor, intersected. Null when nothing clips. */
  clipRect(list) {
    let x0 = -1e9, y0 = -1e9, x1 = 1e9, y1 = 1e9;
    for (const a of list) {
      const r = a.getBoundingClientRect();
      const sx = a.offsetWidth ? r.width / a.offsetWidth : 1, sy = a.offsetHeight ? r.height / a.offsetHeight : 1;
      x0 = Math.max(x0, r.left + a.clientLeft * sx); y0 = Math.max(y0, r.top + a.clientTop * sy);
      x1 = Math.min(x1, r.left + (a.clientLeft + a.clientWidth) * sx); y1 = Math.min(y1, r.top + (a.clientTop + a.clientHeight) * sy);
    }
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }

  cornerRadius(el, rect) {
    try {
      const raw = getComputedStyle(el).borderTopLeftRadius;
      const w = el.offsetWidth || (rect ? rect.width : 0), h = el.offsetHeight || (rect ? rect.height : 0);
      // a percentage (border-radius: 50%) is a share of the box, not that many px
      const v = /%$/.test(raw) ? (parseFloat(raw) / 100) * Math.min(w, h) : parseFloat(raw) || 0;
      return Math.min(v, Math.min(w, h) / 2);
    } catch { return 0; }
  }

  /** the element's own box, centre and the way it is turned, scaled and clipped, read from the page */
  baseOf(el, rect) {
    let L = null, clip = 'none';
    try { const cs = getComputedStyle(el); L = linearOf(cs); clip = cs.clipPath; } catch { /* detached */ }
    let w = el.offsetWidth, h = el.offsetHeight;
    let a = 1, b = 0, c = 0, d = 1;
    if (!w || !h) { w = rect.width; h = rect.height; L = null; }
    if (L) ({ a, b, c, d } = L);
    const ew = Math.abs(a) * w + Math.abs(c) * h;
    const s = ew > 0 ? Math.max(0.05, Math.min(20, rect.width / ew)) : 1;
    return { cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, w, h, a, b, c, d, s, clip, turned: !!L };
  }

  /** the shape a layer follows (its `around`, else the element's clip-path or rounded corners), cached while nothing about it changes */
  geomFor(em, cfg) {
    const base = em.base;
    const key = `${cfg.around ? cfg.around.name + (cfg.around.pts ? cfg.around.pts.length : '') : 'follow'}|${base.w}x${base.h}|${base.clip}|${em.radius}`;
    const asks = cfg.around && cfg.around.name === 'alpha';      // an image can finish loading at any moment, so look again every frame
    if (!asks && cfg._gc && cfg._gc.key === key) return cfg._gc.geom;
    const geom = resolveGeom(cfg.around, base.clip, base.w, base.h, em.radius, em.el);
    cfg._gc = { key, geom };
    return geom;
  }

  /** put the shape into the current path of ctx, in page coordinates, whatever transform ctx has now */
  addShape(ctx, base, geom) {
    const m = ctx.getTransform();
    ctx.transform(base.a * base.s, base.b * base.s, base.c * base.s, base.d * base.s, base.cx, base.cy);
    tracePath(ctx, geom, base.w, base.h);
    ctx.setTransform(m);
  }

  /** the outline of the shape as a closed polyline in page coordinates, with the length of each side, for particles born "from outline" */
  outlineOf(em, cfg) {
    const base = em.base;
    if (!base) return null;
    const geom = this.geomFor(em, cfg);
    if (geom._olN === this._n && geom._olBase === base) return geom._ol;
    let local;
    if (geom.kind === 'poly') local = geom.pts;
    else if (geom.kind === 'ellipse') { local = []; for (let i = 0; i < 48; i++) { const t = (i / 48) * TAU; local.push([geom.cx + geom.rx * Math.cos(t), geom.cy + geom.ry * Math.sin(t)]); } }
    else { const hw = base.w / 2, hh = base.h / 2; local = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]; }
    const pts = local.map(([x, y]) => ({ x: base.cx + base.s * (base.a * x + base.c * y), y: base.cy + base.s * (base.b * x + base.d * y) }));
    const lens = []; let total = 0;
    for (let i = 0; i < pts.length; i++) { const q = pts[(i + 1) % pts.length]; const l = Math.hypot(q.x - pts[i].x, q.y - pts[i].y); lens.push(l); total += l; }
    geom._ol = { pts, lens, total }; geom._olN = this._n; geom._olBase = base;
    return geom._ol;
  }

  /* ---- glow ---- */

  drawGlow(ctx, rect, em, g, now, reduced) {
    const cfg = g.cfg;
    const base = em.base;
    if (!base) return;
    const moving = !reduced || cfg.essential;
    let a = cfg.intensity * em.fade * (em.eo === undefined ? 1 : em.eo);
    if (moving && cfg.pulse > 0) {
      const ph = ((now - g.t0) / cfg.pulse) * TAU;
      a *= 1 - cfg.depth * 0.5 * (1 + Math.sin(ph)) ;
    }
    if (moving && cfg.flicker > 0) {
      // smooth random flicker: ease toward a new random target a few times a second
      if (Math.random() < 0.18) g.flickTarget = g.rnd();
      g.flick += (g.flickTarget - g.flick) * 0.35;
      a *= 1 - cfg.flicker * g.flick * 0.9;
    }
    if (a <= 0.004) return;
    const c = cfg.rgba;
    const s = base.s;
    const geom = this.geomFor(em, cfg);

    // 0.16.0: beams and ripples, drawn straight onto the canvas (they move, so there is nothing to cache)
    if (cfg.rays) this.drawRays(ctx, em, geom, cfg, a, now, moving);
    if (cfg.ripple) this.drawRipple(ctx, em, geom, cfg, a, now, moving);
    if (cfg.nohalo && (cfg.rays || cfg.ripple)) return;

    const R = cfg.radius * s;
    const dpr = this.dpr;
    const pad = Math.ceil(R * 1.6);
    const lw = Math.ceil(rect.width + pad * 2), lh = Math.ceil(rect.height + pad * 2);
    if (lw * lh * dpr * dpr > 6e6) return; // a glow bitmap bigger than this would cost more than it is worth

    // The blur is the expensive part, and pulsing and flickering only change how BRIGHT the shape is, not
    // what it looks like. So the shape is painted once into this glow's own bitmap, and each frame just
    // draws that bitmap at the current alpha. It repaints only when the shape really changes.
    const m = [base.a, base.b, base.c, base.d].map((n) => n.toFixed(3)).join(',');
    const live = geom.kind === 'alpha' && geom.src && geom.src.tagName !== 'IMG' ? Math.floor(now / 120) : '';   // a canvas or video changes under us
    const key = `${lw}x${lh}|${dpr}|${c.r | 0},${c.g | 0},${c.b | 0},${c.a.toFixed(2)}|${R.toFixed(1)}|${cfg.inner ? 1 : 0}|${geom.sig}|${m}|${base.w}x${base.h}|${s.toFixed(3)}|${cfg.tex ? sigOf(cfg.tex[0]) : ''}|${live}`;
    if (!g.bitmap || g.bitmapKey !== key) {
      if (!g.bitmap) g.bitmap = document.createElement('canvas');
      const off = g.bitmap;
      off.width = Math.ceil(lw * dpr); off.height = Math.ceil(lh * dpr);
      const o = off.getContext('2d');
      const SH = 10000; // draw the shape far off-canvas and let only its blurred shadow land here
      // the shape in bitmap pixels: centred, turned and scaled like the element; shiftDev slides it sideways in device pixels
      const put = (shiftDev) => {
        o.setTransform(dpr * base.a * s, dpr * base.b * s, dpr * base.c * s, dpr * base.d * s, dpr * (lw / 2) + shiftDev, dpr * (lh / 2));
        if (geom.kind === 'alpha') { try { o.drawImage(geom.src, -base.w / 2, -base.h / 2, base.w, base.h); } catch { /* an image that cannot be drawn */ } }
        else tracePath(o, geom, base.w, base.h);
        o.setTransform(1, 0, 0, 1, 0, 0);
      };
      const addPath = () => { o.setTransform(dpr * base.a * s, dpr * base.b * s, dpr * base.c * s, dpr * base.d * s, dpr * (lw / 2), dpr * (lh / 2)); tracePath(o, geom.kind === 'alpha' ? { kind: 'rrect', r: 0 } : geom, base.w, base.h); o.setTransform(1, 0, 0, 1, 0, 0); };
      const shadowOf = (shiftDev, blur, color) => {
        o.shadowOffsetX = SH * dpr; o.shadowBlur = blur * dpr; o.shadowColor = color;
        if (geom.kind === 'alpha') put(-SH * dpr);
        else { o.beginPath(); put(-SH * dpr); o.fillStyle = '#000'; o.fill(); }
      };
      o.save();
      if (cfg.inner) {
        // light just inside the edge: fill the shape with the colour, then wipe out its blurred core
        if (geom.kind === 'alpha') { o.fillStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp01(c.a)})`; o.fillRect(0, 0, off.width, off.height); o.globalCompositeOperation = 'destination-in'; o.shadowColor = 'transparent'; put(0); }
        else {
          o.beginPath(); addPath(); o.clip();
          o.fillStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp01(c.a)})`;
          o.fillRect(0, 0, off.width, off.height);
        }
        o.globalCompositeOperation = 'destination-out';
        shadowOf(0, R * 0.9, 'rgba(0,0,0,1)');
      } else {
        // outside: the shape itself is cut out of the clip, so the light never paints over the element
        if (geom.kind !== 'alpha') { o.beginPath(); o.rect(0, 0, off.width, off.height); addPath(); o.clip('evenodd'); }
        for (const [k, mul] of [[1, 0.8], [0.55, 0.45], [0.25, 0.4]]) {
          shadowOf(0, R * k, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp01(c.a * mul)})`);
        }
      }
      o.restore();
      if (!cfg.inner && geom.kind === 'alpha') {
        o.save(); o.globalCompositeOperation = 'destination-out'; o.shadowColor = 'transparent'; o.shadowBlur = 0; o.shadowOffsetX = 0; put(0); o.restore();
      }
      if (cfg.tex) {
        const mask = this.maskCanvas(cfg.tex[0], 128);
        o.save();
        o.globalCompositeOperation = 'destination-in';
        const pat = o.createPattern(mask, 'repeat');
        if (pat) { o.fillStyle = pat; o.fillRect(0, 0, off.width, off.height); }
        o.restore();
      }
      g.bitmapKey = key;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // intensity above 1 brightens by drawing the same light more than once
    const passes = Math.max(1, Math.ceil(a));
    ctx.globalAlpha = clamp01(a / passes);
    for (let i = 0; i < passes; i++) ctx.drawImage(g.bitmap, 0, 0, g.bitmap.width, g.bitmap.height, base.cx - lw / 2, base.cy - lh / 2, lw, lh);
    ctx.restore();
  }

  /** `rays N`: beams of light from the middle of the shape, turning slowly, never over the element itself */
  drawRays(ctx, em, geom, cfg, a, now, moving) {
    const base = em.base, c = cfg.rgba, n = cfg.rays;
    const len = (Math.hypot(base.w, base.h) / 2 + cfg.radius) * base.s;
    const turn = moving ? ((now / 1000) * (cfg.spin === undefined ? 10 : cfg.spin) * Math.PI) / 180 : 0;
    ctx.save();
    if (geom.kind !== 'alpha') { ctx.beginPath(); ctx.rect(-50, -50, this.vw + 100, this.vh + 100); this.addShape(ctx, base, geom); ctx.clip('evenodd'); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(base.cx, base.cy);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    grad.addColorStop(0, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp01(c.a * a * 0.85)})`);
    grad.addColorStop(1, `rgba(${c.r | 0},${c.g | 0},${c.b | 0},0)`);
    ctx.fillStyle = grad;
    const half = (Math.PI / n) * 0.42;
    for (let i = 0; i < n; i++) {
      const ang = turn + (i / n) * TAU;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, len, ang - half, ang + half); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  /** `ripple P`: three rings that spread out from the outline and fade; one still ring under reduced motion */
  drawRipple(ctx, em, geom, cfg, a, now, moving) {
    const base = em.base, c = cfg.rgba, P = cfg.ripple;
    const reach = (cfg.radius * base.s) / Math.max(1, (Math.min(base.w, base.h) * base.s) / 2);
    const phase0 = moving ? now / P : 0.4;
    for (let k = 0; k < 3; k++) {
      const t = (phase0 + k / 3) % 1;
      const ga = clamp01(a * (1 - t) * (moving ? 1 : 0.6));
      if (ga < 0.01) continue;
      const grow = 1 + t * reach;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.transform(base.a * base.s * grow, base.b * base.s * grow, base.c * base.s * grow, base.d * base.s * grow, base.cx, base.cy);
      ctx.beginPath();
      tracePath(ctx, geom.kind === 'alpha' ? { kind: 'rrect', r: 0 } : geom, base.w, base.h);
      ctx.lineWidth = 2 / (base.s * grow);
      ctx.strokeStyle = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${ga})`;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---- masks and sprites ---- */

  maskCanvas(texLayer, size) {
    const key = sigOf([texLayer, size]);
    let c = this.masks.get(key);
    if (c) return c;
    const data = makeMask(texLayer, size);
    c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    for (let i = 0; i < data.length; i++) { img.data[i * 4 + 3] = data[i]; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255; }
    x.putImageData(img, 0, 0);
    this.masks.set(key, c);
    return c;
  }

  /** a soft round sprite in one colour, optionally textured; cached by quantised colour */
  sprite(c, shape, tex, variant) {
    const q = (v) => (Math.round(v / 16) * 16) | 0;
    const key = `${q(c.r)},${q(c.g)},${q(c.b)}|${shape}|${tex ? sigOf(tex[0]) : ''}|${variant}`;
    let s = this.sprites.get(key);
    if (s) return s;
    if (this.sprites.size > 600) this.sprites.clear();
    const S = 64;
    s = document.createElement('canvas');
    s.width = s.height = S;
    const x = s.getContext('2d');
    const rgb = `${q(c.r)},${q(c.g)},${q(c.b)}`;
    if (shape === 'ring') {
      x.strokeStyle = `rgb(${rgb})`; x.lineWidth = 5; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 6, 0, TAU); x.stroke();
    } else if (shape === 'star') {
      x.fillStyle = `rgb(${rgb})`; x.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? S * 0.1 : S * 0.48, a = (i / 8) * TAU - Math.PI / 2; x.lineTo(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r); }
      x.closePath(); x.fill();
    } else if (shape === 'square') {
      x.fillStyle = `rgb(${rgb})`; x.fillRect(S * 0.15, S * 0.15, S * 0.7, S * 0.7);
    } else if (shape === 'heart' || shape === 'diamond' || shape === 'triangle' || shape === 'drop' || shape === 'plus') {
      // the same polygons an aura can follow, filled
      const pts = UNIT_SHAPES[shape === 'plus' ? 'cross' : shape];
      x.fillStyle = `rgb(${rgb})`; x.beginPath();
      pts.forEach(([px, py], i) => { const X = S * (0.08 + 0.84 * px), Y = S * (0.08 + 0.84 * py); if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
      x.closePath(); x.fill();
    } else if (shape === 'bubble') {
      const g = x.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2 - 3);
      g.addColorStop(0, `rgba(${rgb},0.05)`); g.addColorStop(1, `rgba(${rgb},0.35)`);
      x.fillStyle = g; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 3, 0, TAU); x.fill();
      x.strokeStyle = `rgba(${rgb},0.9)`; x.lineWidth = 3; x.stroke();
      x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 12, Math.PI * 1.1, Math.PI * 1.45); x.stroke();
    } else if (shape === 'snowflake') {
      x.strokeStyle = `rgb(${rgb})`; x.lineWidth = 4; x.lineCap = 'round';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU, cx = Math.cos(a), cy = Math.sin(a);
        x.beginPath(); x.moveTo(S / 2, S / 2); x.lineTo(S / 2 + cx * S * 0.44, S / 2 + cy * S * 0.44);
        for (const f of [0.55, 0.8]) {          // two little branches on each arm
          const bx = S / 2 + cx * S * 0.44 * f, by = S / 2 + cy * S * 0.44 * f;
          for (const d of [-0.9, 0.9]) { x.moveTo(bx, by); x.lineTo(bx + Math.cos(a + d) * S * 0.12, by + Math.sin(a + d) * S * 0.12); }
        }
        x.stroke();
      }
    } else if (shape === 'confetti') {
      x.fillStyle = `rgb(${rgb})`; x.fillRect(S * 0.05, S * 0.05, S * 0.9, S * 0.9);
    } else if (shape === 'leaf') {
      x.fillStyle = `rgb(${rgb})`; x.beginPath(); x.moveTo(S * 0.12, S * 0.88); x.quadraticCurveTo(S * 0.08, S * 0.12, S * 0.9, S * 0.1); x.quadraticCurveTo(S * 0.92, S * 0.9, S * 0.12, S * 0.88); x.closePath(); x.fill();
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2; x.beginPath(); x.moveTo(S * 0.15, S * 0.85); x.lineTo(S * 0.75, S * 0.25); x.stroke();
    } else {
      const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      const hard = shape === 'circle' ? 0.55 : 0.0;
      g.addColorStop(0, `rgba(${rgb},1)`);
      g.addColorStop(hard, `rgba(${rgb},${shape === 'circle' ? 0.95 : 0.7})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    }
    if (tex) {
      // multiply the sprite's alpha by a texture mask, a different offset per variant
      const m = this.maskCanvas(tex[0], 64);
      const id = x.getImageData(0, 0, S, S);
      const mx = m.getContext('2d').getImageData(0, 0, S, S).data;
      const off = (variant * 13) % S;
      for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) {
        const mi = (((yy + off) % S) * S + ((xx + off * 2) % S)) * 4 + 3;
        const i = (yy * S + xx) * 4 + 3;
        id.data[i] = (id.data[i] * mx[mi]) / 255;
      }
      x.putImageData(id, 0, 0);
    }
    this.sprites.set(key, s);
    return s;
  }

  /* ---- particles ---- */

  emit(L, rect, em, dt, share, el) {
    const c = L.cfg;
    const meanLife = ((c.life[0] + c.life[1]) / 2) / 1000;
    const rate = (c.count * share) / meanLife; // per second
    L.acc += rate * dt;
    const cap = Math.max(1, Math.round(c.count * share));
    while (L.acc >= 1) {
      L.acc -= 1;
      if (L.parts.length >= cap) { L.acc = Math.min(L.acc, 1); break; }
      L.parts.push(this.spawn(L, rect, el, em.scale || 1, em));
    }
  }

  spawn(L, rect, el, scale = 1, em = null) {
    const c = L.cfg, r = L.rnd;
    const between = (a, b) => a + (b - a) * r();
    let x, y;
    switch (c.from) {
      case 'bottom': x = rect.left + r() * rect.width; y = rect.bottom; break;
      case 'top': x = rect.left + r() * rect.width; y = rect.top; break;
      case 'left': x = rect.left; y = rect.top + r() * rect.height; break;
      case 'right': x = rect.right; y = rect.top + r() * rect.height; break;
      case 'center': x = rect.left + r() * rect.width; y = rect.top + r() * rect.height; break;
      case 'corners': { const k = (r() * 4) | 0; x = k & 1 ? rect.right : rect.left; y = k & 2 ? rect.bottom : rect.top; break; }
      case 'thumb': {
        // the thumb of a range input: where the value is
        let p = 0.5;
        try { const mn = Number(el.min || 0), mx = Number(el.max || 100); p = (Number(el.value) - mn) / (mx - mn || 1); } catch { /* not a range */ }
        const pad = 10;
        x = rect.left + pad + p * Math.max(0, rect.width - pad * 2); y = rect.top + rect.height / 2 + (r() - 0.5) * 6; break;
      }
      default: { // edge / outline: a random point on the perimeter
        // 0.16.0: along the element's REAL outline (turned, clipped to a diamond or a star), not the box around it
        const ol = em && this.outlineOf(em, c);
        if (ol && ol.total > 0) {
          let d = r() * ol.total, i = 0;
          while (i < ol.lens.length - 1 && d > ol.lens[i]) { d -= ol.lens[i]; i++; }
          const p0 = ol.pts[i], p1 = ol.pts[(i + 1) % ol.pts.length], t = ol.lens[i] > 0 ? d / ol.lens[i] : 0;
          x = p0.x + (p1.x - p0.x) * t; y = p0.y + (p1.y - p0.y) * t;
          break;
        }
        const per = 2 * (rect.width + rect.height);
        let d = r() * per;
        if (d < rect.width) { x = rect.left + d; y = rect.top; }
        else if ((d -= rect.width) < rect.height) { x = rect.right; y = rect.top + d; }
        else if ((d -= rect.height) < rect.width) { x = rect.right - d; y = rect.bottom; }
        else { d -= rect.width; x = rect.left; y = rect.bottom - d; }
      }
    }
    let ang;
    if (c.dir === 'out' || c.dir === 'in') {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      ang = Math.atan2(y - cy, x - cx);
      if (c.dir === 'in') ang += Math.PI;
    } else ang = (c.dir * Math.PI) / 180;
    ang += ((r() - 0.5) * c.spread * Math.PI) / 180;
    const sp = between(c.speed[0], c.speed[1]) * scale;
    return {
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      age: 0, life: between(c.life[0], c.life[1]) / 1000,
      size: between(c.size[0], c.size[1]) * scale, rot: r() * TAU,
      spin: c.spin !== undefined ? (r() < 0.5 ? -1 : 1) * ((c.spin * Math.PI) / 180) * (0.6 + 0.8 * r()) : (r() - 0.5) * 4,
      variant: (r() * 4) | 0, ph: r() * TAU, pc: (r() * 1000) | 0,
    };
  }

  stepAndDraw(ctx, L, dt, moving, hide) {
    const c = L.cfg, parts = L.parts;
    const additive = c.blend === 'add';
    ctx.save();
    if (hide) {
      // clip the element's own shape OUT, so the layer reads as sitting behind it
      ctx.beginPath();
      ctx.rect(-50, -50, this.vw + 100, this.vh + 100);
      this.addShape(ctx, hide.base, hide.geom);
      ctx.clip('evenodd');
    }
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    const drag = Math.exp(-c.drag * dt);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (moving) {
        p.age += dt;
        if (p.age >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        const sc = L.scale || 1;
        p.vy += c.gravity * sc * dt;
        if (c.wind) p.vx += c.wind * sc * dt;
        if (c.turbulence) { p.vx += Math.sin(p.ph + p.age * 7) * c.turbulence * sc * dt; p.vy += Math.cos(p.ph * 1.3 + p.age * 5) * c.turbulence * sc * 0.3 * dt; }
        if (c.drag) { p.vx *= drag; p.vy *= drag; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (c.orbit && L.cx !== undefined) {          // 0.16.0: circle the middle of the element
          const ang = (c.orbit * Math.PI / 180) * dt, co = Math.cos(ang), si = Math.sin(ang), dx = p.x - L.cx, dy = p.y - L.cy;
          p.x = L.cx + dx * co - dy * si; p.y = L.cy + dx * si + dy * co;
        }
        p.rot += p.spin * dt;
      }
      const t = p.age / p.life;
      let col, alphaIn;
      if (c.palette) {
        // confetti: ONE colour per particle, fading in and out over its life
        const base = c.stops[p.pc % Math.max(1, c.stops.length - (c.stops.length > 1 && c.stops[c.stops.length - 1].a === 0 ? 1 : 0))];
        col = base; alphaIn = base.a * Math.min(1, t / 0.08, (1 - t) / 0.3);
      } else { col = colorAt(c.stops, t); alphaIn = col.a; }
      const alpha = clamp01(alphaIn) * (L.eo === undefined ? 1 : L.eo);
      if (alpha <= 0.003) continue;
      const size = p.size * lerp(1, c.grow, t);
      this.drawParticle(ctx, c, p, col, alpha, size);
    }
    ctx.restore();
  }

  drawParticle(ctx, c, p, col, alpha, size) {
    const shape = c.shape;
    if (shape === 'spark' || shape === 'line') {
      const len = Math.max(size, Math.hypot(p.vx, p.vy) * 0.06);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      ctx.strokeStyle = `rgba(${col.r | 0},${col.g | 0},${col.b | 0},${alpha})`;
      ctx.lineWidth = Math.max(1, size * 0.3);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - (p.vx / sp) * len, p.y - (p.vy / sp) * len); ctx.stroke();
      if (c.glowing) {
        const s = this.sprite(col, 'glow', c.tex, p.variant), d = size * 3;
        ctx.globalAlpha = alpha * 0.5; ctx.drawImage(s, p.x - d / 2, p.y - d / 2, d, d); ctx.globalAlpha = 1;
      }
      return;
    }
    const kind = shape === 'circle' && c.glowing ? 'glow' : shape === 'flame' ? 'glow' : shape === 'smoke' ? 'glow' : shape;
    const s = this.sprite(col, kind, c.tex, p.variant);
    ctx.globalAlpha = alpha;
    if (shape === 'flame') {
      // a teardrop: stretched along its travel, narrower at the tip
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const ang = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(ang);
      const w = size * 2.2, h = size * 3.4;
      ctx.drawImage(s, -w / 2, -h * 0.65, w, h);
      ctx.restore();
    } else if (shape === 'confetti') {
      // a flat scrap tumbling: its height shrinks and grows as it turns over
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      const w = size * 1.5, h = Math.max(0.5, size * 0.8 * Math.abs(Math.cos(p.ph + p.age * 9)));
      ctx.drawImage(s, -w / 2, -h / 2, w, h);
      ctx.restore();
    } else if (shape === 'ring' || shape === 'star' || shape === 'square' || shape === 'heart' || shape === 'diamond' || shape === 'triangle' || shape === 'plus' || shape === 'drop' || shape === 'bubble' || shape === 'snowflake' || shape === 'leaf') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(shape === 'drop' ? Math.atan2(p.vy, p.vx) + Math.PI / 2 : p.rot);
      const d = size * (shape === 'ring' ? 1.2 : 1.4);
      ctx.drawImage(s, -d / 2, -d / 2, d, d);
      ctx.restore();
    } else {
      const d = size * (c.glowing || shape === 'smoke' ? 2.6 : 1.2);
      ctx.drawImage(s, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
  }

  /** for tests and tools: a readable snapshot, never needed in normal use */
  debug() {
    const out = [];
    for (const [el, em] of this.emitters) out.push({ el, visible: em.visible, dying: em.dying, glow: em.glow.length, layers: em.layers.map((l) => ({ alive: l.parts.length, sample: l.parts.slice(0, 5).map((p) => ({ x: p.x, y: p.y, vx: p.vx, vy: p.vy, age: p.age })) })) });
    return { stats: { ...this.stats }, running: this.running, paused: this.paused, canvas: !!this.canvas, emitters: out };
  }
}
