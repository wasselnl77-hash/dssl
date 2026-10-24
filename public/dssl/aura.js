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

export const FROM_WORDS = ['edge', 'bottom', 'top', 'left', 'right', 'center', 'corners', 'thumb'];
export const SHAPES = ['circle', 'spark', 'square', 'ring', 'star', 'flame', 'smoke', 'line'];
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
  from:       { kind: 'word', words: 1, values: FROM_WORDS, doc: 'where they are born: edge, bottom, top, left, right, center, corners, thumb (range sliders)' },
  shape:      { kind: 'word', words: 1, values: SHAPES, doc: 'circle, spark, square, ring, star, flame, smoke or line' },
  grow:       num(0, 10, { doc: 'size at the end of life as a multiple of the start: 0.2 shrinks, 3 swells' }),
  blend:      { kind: 'word', words: 1, values: AURA_BLENDS, doc: 'add makes overlapping particles brighter, normal just stacks them' },
  glowing:    { kind: 'flag', words: 0, doc: 'soft glowing particles that add light' },
  behind:     { kind: 'flag', words: 0, doc: 'draw only outside the element\'s box, as if the element hid them' },
  seed:       num(0, 99999, { int: true, doc: 'a different random pattern with the same look' }),
  texture:    { kind: 'texture', words: 1, doc: 'texture(grain): grainy particles' },
  essential:  { kind: 'flag', words: 0, doc: 'keep animating even when the visitor prefers reduced motion' },
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
    this._frame = (t) => this.frame(t);
  }

  get reduced() { return !!(this.reducedMotion && this.reducedMotion.matches); }

  /* ---- setup ---- */

  ensureCanvas() {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.setAttribute('aria-hidden', 'true');
    c.setAttribute('data-dssl-aura', '');
    c.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483000;';
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
    this.canvas.width = Math.max(1, Math.round(this.vw * this.dpr));
    this.canvas.height = Math.max(1, Math.round(this.vh * this.dpr));
    this.dirty = true;
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

  pause() { this.paused = true; this.running = false; if (this._poll) { clearTimeout(this._poll); this._poll = null; } if (this.ctx) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); }
  resume() { this.paused = false; this.start(); }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onScroll, { capture: true });
    if (this._poll) { clearTimeout(this._poll); this._poll = null; }
    if (this.io) this.io.disconnect();
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
    const ctx = this.ctx, dpr = this.dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // global budget: if everyone asks for more than the page can afford, everyone gets a share
    let want = 0;
    for (const em of this.emitters.values()) if (em.visible && !em.dying) for (const l of em.layers) want += l.cfg.count;
    const share = want > this.budget ? this.budget / want : 1;

    let alive = 0, anyActive = false;
    for (const [el, em] of this.emitters) {
      if (!el.isConnected) { this.emitters.delete(el); if (this.io) this.io.unobserve(el); continue; }
      // read geometry once per frame for visible emitters
      let rect = null;
      if (em.visible || em.layers.some((l) => l.parts.length)) {
        rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) rect = null;
      }
      em.rect = rect;
      if (em.radiusAt < 0 || (em.age++ % 45) === 0) { em.radius = this.cornerRadius(el, rect); em.radiusAt = 0; }

      if (em.dying) em.fade = Math.max(0, em.fade - dt * 3);
      else em.fade = Math.min(1, em.fade + dt * 4);

      // glow
      if (rect && em.fade > 0 && (em.visible || em.dying)) {
        for (const g of em.glow) { this.drawGlow(ctx, rect, em, g, now, reduced); }
        if (em.glow.length) anyActive = true;
      }

      // particles
      for (const L of em.layers) {
        const cfg = L.cfg;
        const moving = !reduced || cfg.essential;
        if (rect && em.visible && !em.dying && moving) this.emit(L, rect, em, dt, share, el);
        if (L.parts.length) this.stepAndDraw(ctx, L, dt, moving, cfg.behind && rect ? { rect, radius: em.radius } : null);
        alive += L.parts.length;
        if (L.parts.length || (rect && em.visible && !em.dying && moving)) anyActive = true;
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

    if (this.emitters.size === 0) { this.running = false; ctx.clearRect(0, 0, this.vw, this.vh); return; }
    // Normally the loop runs every frame (the glow follows the element, particles move). With reduced
    // motion nothing moves, so one frame is a complete picture; it is redrawn on scroll, resize, a
    // style change, and a slow poll for layout shifts. Essential layers and fading-out emitters still loop.
    let needLoop = !reduced;
    if (reduced) {
      for (const em of this.emitters.values()) {
        if (em.dying) needLoop = true;
        if (em.glow.some((g) => g.cfg.essential) || em.layers.some((l) => l.cfg.essential && (l.parts.length || (em.visible && !em.dying)))) needLoop = true;
      }
    }
    if (needLoop) { requestAnimationFrame(this._frame); return; }
    this.running = false;
    if (!this._poll) this._poll = setTimeout(() => { this._poll = null; this.start(); }, 600);
  }

  cornerRadius(el, rect) {
    try {
      const v = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
      const r = rect ? Math.min(rect.width, rect.height) / 2 : 0;
      return Math.min(v, r);
    } catch { return 0; }
  }

  /* ---- glow ---- */

  drawGlow(ctx, rect, em, g, now, reduced) {
    const cfg = g.cfg;
    const moving = !reduced || cfg.essential;
    let a = cfg.intensity * em.fade;
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
    const R = cfg.radius;
    const dpr = this.dpr;
    const x = rect.left, y = rect.top, w = rect.width, h = rect.height;
    const pad = Math.ceil(R * 1.6);
    const lw = Math.ceil(w + pad * 2), lh = Math.ceil(h + pad * 2);
    if (lw * lh * dpr * dpr > 6e6) return; // a glow bitmap bigger than this would cost more than it is worth

    // The blur is the expensive part, and pulsing and flickering only change how BRIGHT the shape is, not
    // what it looks like. So the shape is painted once into this glow's own bitmap, and each frame just
    // draws that bitmap at the current alpha. It repaints only when the shape really changes.
    const key = `${lw}x${lh}|${dpr}|${c.r | 0},${c.g | 0},${c.b | 0},${c.a.toFixed(2)}|${R}|${em.radius}|${cfg.tex ? sigOf(cfg.tex[0]) : ''}`;
    if (!g.bitmap || g.bitmapKey !== key) {
      if (!g.bitmap) g.bitmap = document.createElement('canvas');
      const off = g.bitmap;
      off.width = Math.ceil(lw * dpr); off.height = Math.ceil(lh * dpr);
      const o = off.getContext('2d');
      o.save();
      // clip so the light never paints over the element itself
      o.beginPath();
      o.rect(0, 0, off.width, off.height);
      o.scale(dpr, dpr);
      roundRectPath(o, pad, pad, w, h, em.radius);
      o.setTransform(1, 0, 0, 1, 0, 0);
      o.clip('evenodd');
      const SH = 10000; // draw the shape far off-canvas and let only its blurred shadow land here
      o.shadowOffsetX = SH * dpr;
      o.fillStyle = '#000';
      for (const [k, mul] of [[1, 0.8], [0.55, 0.45], [0.25, 0.4]]) {
        o.shadowBlur = R * k * dpr;
        o.shadowColor = `rgba(${c.r | 0},${c.g | 0},${c.b | 0},${clamp01(c.a * mul)})`;
        o.beginPath();
        o.scale(dpr, dpr);
        roundRectPath(o, pad - SH, pad, w, h, em.radius);
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.fill();
      }
      o.restore();
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
    for (let i = 0; i < passes; i++) ctx.drawImage(g.bitmap, 0, 0, g.bitmap.width, g.bitmap.height, x - pad, y - pad, lw, lh);
    ctx.restore();
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
      L.parts.push(this.spawn(L, rect, el));
    }
  }

  spawn(L, rect, el) {
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
      default: { // edge: a random point on the perimeter
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
    const sp = between(c.speed[0], c.speed[1]);
    return {
      x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      age: 0, life: between(c.life[0], c.life[1]) / 1000,
      size: between(c.size[0], c.size[1]), rot: r() * TAU, spin: (r() - 0.5) * 4, variant: (r() * 4) | 0, ph: r() * TAU,
    };
  }

  stepAndDraw(ctx, L, dt, moving, hide) {
    const c = L.cfg, parts = L.parts;
    const additive = c.blend === 'add';
    ctx.save();
    if (hide) {
      // clip the element's own box OUT, so the layer reads as sitting behind it
      ctx.beginPath();
      ctx.rect(-50, -50, this.vw + 100, this.vh + 100);
      roundRectPath(ctx, hide.rect.left, hide.rect.top, hide.rect.width, hide.rect.height, hide.radius);
      ctx.clip('evenodd');
    }
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
    const drag = Math.exp(-c.drag * dt);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (moving) {
        p.age += dt;
        if (p.age >= p.life) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
        p.vy += c.gravity * dt;
        if (c.turbulence) { p.vx += Math.sin(p.ph + p.age * 7) * c.turbulence * dt; p.vy += Math.cos(p.ph * 1.3 + p.age * 5) * c.turbulence * 0.3 * dt; }
        if (c.drag) { p.vx *= drag; p.vy *= drag; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.spin * dt;
      }
      const t = p.age / p.life;
      const col = colorAt(c.stops, t);
      const alpha = clamp01(col.a);
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
    } else if (shape === 'ring' || shape === 'star' || shape === 'square') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
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
