/* =========================================================================
 * DSSL - engine.js
 * The style engine. No CSS output for regular rules: DSSL matches selectors
 * against the live DOM itself and applies winning declarations directly to
 * elements (inline style), running its own cascade:
 *
 *     cascade = (layer, source order)   - no specificity, ever
 *     layers:  tokens < base < components < utilities < pin
 *
 * States (hover/focus/active/…) are implemented by the engine with event
 * delegation + live `matches()` checks. `seen` (v0.4) is engine-native too: it
 * fires once per element when it scrolls into view, via IntersectionObserver.
 * `@media` uses matchMedia listeners, `@signal` is driven from JS, `@container`
 * is evaluated against the nearest tracked container. Motion runs through the
 * Web Animations API, and `stagger:` choreographs children's delays.
 *
 * Pseudo-elements (::before/::after/…) cannot be expressed inline, so they
 * are the one thing compiled to real CSS in a shadow <style> tag - using the
 * same tokens via var().
 * ========================================================================= */

import { composeDeform, arcLayout } from './utils.js';
// 0.9.0: texture layers, aura (light and particles) and the range-slider helper
import { buildTexture, composeTextureInto, splitBgList as splitList } from './texture.js';
import { AuraManager, resolveLayer } from './aura.js';
import { parseColor } from './color.js';
import { tiltTransform } from './effects.js';
import { keyframesCss, animationShorthand } from './static.js'
import { shadowWarnings } from './lint.js';

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };

/* 0.8.2: one cascade position per rule, across every stylesheet on the page.
 *
 * A rule's own `order` is just its place inside the sheet it was written in:
 * every sheet counts from 0. The cascade sorts by (layer, order), so when two
 * sheets were combined their numbers were compared as if they were one count,
 * and a later sheet's rule could lose to an earlier sheet's rule purely
 * because the earlier sheet had more rules above it. "Later wins" held inside
 * a sheet and not between them. That is also why a tokens block in a later
 * sheet could not override a conditional token from an earlier one.
 *
 * This puts the bundles in load order and shifts each one's numbers past the
 * end of the one before. The sheet's own numbers are kept in `order0`, so
 * calling it again after a rebuild gives the same result instead of drifting.
 */
export function assignGlobalOrder(bundlesInLoadOrder) {
  let base = 0;
  for (const b of bundlesInLoadOrder) {
    let max = -1;
    for (const list of [b.rules, b.shadowRules, b.raws]) {
      if (!list) continue;
      for (const r of list) {
        if (r.order0 === undefined) r.order0 = r.order;
        r.order = base + r.order0;
        if (r.order0 > max) max = r.order0;
      }
    }
    base += max + 1;
  }
}

// v0.3.4 - alignment implies a formatting context.
// place-items / place-content / align-* / justify-* only arrange children
// inside flex or grid containers. On a plain <span> or <button> they used to
// silently do nothing - which is exactly how the feature icons, the theme
// toggle and the token dots ended up pinned top-left inside their circles.
// The language promises loud failures over silent ones, so when a winning
// declaration asks for alignment but the element has no layout context, the
// engine PROMOTES it: inline elements → inline-grid (flow preserved), blockish
// elements → grid. Explicit `display:` in the same cascade still wins, because
// the promotion is applied first and "later wins" is the whole cascade.
/** the page's CSP nonce, if it has one: a script or style tag carries it as .nonce, or a <meta name="dssl-nonce"> can say it */
function pageNonce() {
  try {
    const el = document.querySelector('script[nonce], style[nonce], link[nonce]');
    if (el && (el.nonce || el.getAttribute('nonce'))) return el.nonce || el.getAttribute('nonce');
    const m = document.querySelector('meta[name="dssl-nonce"]');
    return m ? m.getAttribute('content') : '';
  } catch { return ''; }
}

// properties the engine also writes by other routes (the overlap nudge, bend-around, stack), so a mismatch there is not the author's doing
const ENGINE_ALSO_WRITES = new Set(['translate', 'transform', 'transform-origin', 'grid-area']);

const ALIGN_PROPS = new Set([
  'place-items', 'place-content', 'align-items', 'justify-items',
  'align-content', 'justify-content',
]);
const HAS_CONTEXT_RE = /^(flex|inline-flex|grid|inline-grid)$/;

/* v0.4.1 - shorthand/longhand coexistence cannot survive inline.
 *
 * A var()-pending shorthand (`border: 1px solid var(--c)`) and an overriding
 * longhand of the same family (`border-color: color-mix(... var(--i) ...)`)
 * cannot coexist in one inline declaration block: the CSSOM silently expands
 * the shorthand into EMPTY longhands and the border vanishes. The old
 * wipe-and-rewrite engine masked this by restoring the shorthand on every
 * recompute (and flickering the border on every hover - part of the twitch);
 * the diffing engine exposed it permanently (veto badges lost their border).
 *
 * The language's answer is a merge, at the CSSOM boundary: when a winning
 * set holds a family shorthand AND one of its longhands, the longhand's
 * value is folded into the shorthand's grammar slot (border) or the
 * shorthand is expanded positionally (padding/margin/gap), and the longhand
 * is dropped - the block never holds both. Unhandled pairs fail LOUDLY. */
const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
const BORDER_WIDTH_RE = /^(0|[\d.]+(?:px|em|rem|%|pt|ch|vw|vh)|thin|medium|thick)$/i;

/** split on whitespace that is not inside parentheses: `1px solid color-mix(in oklab, red 40%, transparent)` is three words */
function wordsTop(str) {
  const out = []; let depth = 0, cur = '';
  for (const ch of String(str).trim()) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Put one border longhand into a border shorthand, in its own slot (width, style or colour). The cascade is
 * "later wins", so a `border-style: dashed` written AFTER `border: 1 solid ...` has to win, and the inline style
 * cannot hold both. `kind` says which slot the longhand owns.
 */
function foldIntoBorder(shVal, lhVal, kind = 'color') {
  const width = [], style = [], color = [];
  for (const t of wordsTop(shVal)) {
    if (!width.length && BORDER_WIDTH_RE.test(t)) width.push(t);
    else if (!style.length && BORDER_STYLES.has(t.toLowerCase())) style.push(t);
    else color.push(t);
  }
  const slot = kind === 'width' ? width : kind === 'style' ? style : color;
  slot.length = 0; slot.push(lhVal);        // replace the slot (or fill it, when the shorthand had none)
  return [...width, ...style, ...color].join(' ');
}

const POSITIONAL_FAMILIES = {
  'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'],
  'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'],
  'gap': ['row-gap', 'column-gap'],
};

function expandPositional(shVal, longhands) {
  const parts = String(shVal).trim().split(/\s+/);
  let vals;
  if (longhands.length === 2) {
    vals = parts.length > 1 ? [parts[0], parts[1]] : [parts[0], parts[0]];
  } else {
    const [a, b = parts[0], c = parts[0], d = parts[1]] = parts.length === 1 ? [parts[0]] : parts;
    vals = parts.length === 1 ? [parts[0], parts[0], parts[0], parts[0]]
         : parts.length === 2 ? [a, b, a, b]
         : parts.length === 3 ? [a, b, c, b]
         : [a, b, c, d];
  }
  return longhands.map((p, i) => [p, vals[i]]);
}

// state pseudo-classes that may appear inside a rule selector. Used to strip
// them back OFF when collecting recompute candidates (see stateEvent).
const STATE_PSEUDO_RE = /:(hover|focus|focus-visible|active|focus-within|visited|target|disabled|enabled|checked|placeholder-shown|read-only|read-write|open|closed|empty|required|invalid|valid|link|indeterminate|seen)\b/g;

function parseSizeQuery(q) {
  // supports (min-width: 480px) | (max-width: 480px) | (width >= 480px) | (width <= 480px)
  let m = q.match(/min-width\s*:\s*([0-9.]+)(px)?/) || q.match(/width\s*>=\s*([0-9.]+)(px)?/);
  const min = m ? parseFloat(m[1]) : null;
  m = q.match(/max-width\s*:\s*([0-9.]+)(px)?/) || q.match(/width\s*<=\s*([0-9.]+)(px)?/);
  const max = m ? parseFloat(m[1]) : null;
  return { min, max };
}

/** split a CSS list at top-level commas, so rgba(1,2,3) and var(--x, 4) stay whole */
export class DsslEngine {
  constructor({ scope = null, name = 'global', reset = false } = {}) {
    this.name = name;
    this.scope = scope || null;            // null = whole document
    this.reset = reset;
    this.bundles = new Map();              // bundleName -> resolved doc
    this.rules = [];
    this.shadowRules = [];
    this.signalStore = new Map();
    this.scopedSignals = new WeakMap();    // 0.15.0: element -> Map(name -> value) for DSSL.signal(name, value, el)
    this.scopedCount = 0;
    this.sigShadowIdx = [];                // 0.15.0: indexes of the pseudo-element rules that sit behind a @signal
    this.motionHeld = false;               // 0.15.0: DSSL.pauseMotion()
    this.mqlCache = new Map();
    this.containerEls = new Set();
    this.ownMap = new WeakMap();           // element -> [props DSSL owns]
    this.animMap = new WeakMap();          // element -> Map(key -> Animation)
    this.stackPrev = new WeakMap();        // element -> [children we grid-area'd]
    this.touched = new Set();              // every element we ever styled (so removals can be cleaned)
    this.pending = new Set();
    this.scheduled = false;
    this.initialized = false;
    this.shadowStyle = null;
    this.seq = 0;                          // bundle insertion order
    this.lastApply = 0;
    this.seenSet = new WeakSet();          // v0.4.0 - elements that entered the viewport
    this.staggerEls = new Map();           // v0.4.0 - element → stagger delay (ms)
    this.io = null;                        // IntersectionObserver backing `seen`
    this.naturalDisplay = new WeakMap();   // v0.4.1 - element → display without our promotion
    // v0.5.0 - overlap policy. CSS lets transparent things stack silently;
    // DSSL measures real boxes and shoves the transparent side out along the
    // shortest escape axis, through the separate `translate` channel (so it
    // composes with transforms and WAAPI instead of fighting them).
    this.overlapPolicy = new WeakMap();    // element → own policy ('allow'|'deny'|'auto')
    this.overlapEls = new Set();           // elements holding a policy (fast "any?" check)
    this.nudges = new WeakMap();           // element → {x, y} applied collision nudge
    this.nudgedEls = new Set();            // elements currently carrying a nudge
    this._overlapRaf = 0;
    this._overlapDirty = false;
    this._hasInfiniteAnims = false;        // infinite loops never 'finish' - heartbeat keeps watch
    // v0.6.0 - bend-around arcs a container's children along a circle;
    // gradient-flow loops background-position through WAAPI.
    this.arcMap = new Map();               // container → degrees
    this.arcPrev = new Map();              // container → Map(child → {t, o}) last written
    this.gflowWarned = new WeakSet();      // elements already told they have nothing to flow
    // 0.9.0
    this.aura = null;                      // AuraManager, created the first time something asks for an aura
    this._colorProbe = null;               // hidden element used to resolve var(--token) colours
    this._colorCache = new Map();          // css colour text -> {r,g,b,a}; cleared on every full recompute
    this._texCache = new Map();            // texture spec + colours -> built CSS pieces
    this.sliderEls = new Map();            // range input -> its input listener
    this.texAnims = new WeakMap();         // element -> running texture-shimmer Animation
    this.texEls = new Set();               // elements that have one, so freeze() can stop them all
    this.tiltEls = new Map();              // 0.10.0: element -> { spec, stop } for tilt:
    this.authored = new WeakMap();         // 0.14.0: element -> Map(prop -> { value, imp }) of inline styles that belong to the page, not to us
    this.staticSeen = false;               // 0.14.0: is there any data-dssl-static subtree
    this._forceCompute = false;
  }

  /* ------------------------------------------------------------ *
   * 0.9.0: colours, texture, aura, slider
   * ------------------------------------------------------------ */

  /** CSS colour text (including var(--dssl-...), color-mix and oklch) to {r,g,b,a} */
  resolveColorCss(css) {
    if (!css) return null;
    const hit = this._colorCache.get(css);
    if (hit !== undefined) return hit;
    let c = parseColor(css);
    if (!c) {
      try {
        if (!this._colorProbe) {
          const pr = document.createElement('span');
          pr.setAttribute('aria-hidden', 'true');
          pr.setAttribute('data-dssl-probe', '');
          pr.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;';
          (document.body || document.documentElement).appendChild(pr);
          this._colorProbe = pr;
        }
        const pr = this._colorProbe;
        pr.style.color = '';
        pr.style.color = css;
        if (pr.style.color) c = parseColor(getComputedStyle(pr).color);
      } catch { c = null; }
    }
    this._colorCache.set(css, c);
    return c;
  }

  /**
   * texture: put generated layers ON TOP of whatever background the author wrote.
   * Handles all three ways an author writes one: `background: ...` (shorthand),
   * `background-image: ...`, or just a colour. `owned` is the property map the
   * engine is about to write; this edits it in place.
   */
  composeTexture(el, owned, layers) {
    const rc = (css) => this.resolveColorCss(css);
    const key = JSON.stringify(layers.map((l) => [l, rc(l.color), rc(l.color2)]));
    let tex = this._texCache.get(key);
    if (!tex) {
      tex = buildTexture(layers, rc);
      if (this._texCache.size > 120) this._texCache.clear();
      this._texCache.set(key, tex);
    }
    if (!tex.count) return null;
    composeTextureInto(owned, tex);
    return tex;
  }

  /** film-grain shimmer: step the texture layers' positions every `ms`, stills when reduced motion asks */
  applyTextureShimmer(el, tex, ms, userLayerCount) {
    const prev = this.texAnims.get(el);
    const want = ms > 0 && tex && !(this.reducedMotion && this.reducedMotion.matches) && el.animate;
    if (!want) { if (prev) { try { prev.cancel(); } catch { } this.texAnims.delete(el); } this.texEls.delete(el); return; }
    const n = tex.parts.length;
    const frames = [];
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let f = 0; f < 6; f++) {
      const pos = tex.parts.map((p) => `${Math.round(r() * (p.tile || 64))}px ${Math.round(r() * (p.tile || 64))}px`);
      for (let u = 0; u < userLayerCount; u++) pos.push('0% 0%');
      frames.push({ backgroundPosition: pos.join(', ') });
    }
    if (prev) { try { prev.cancel(); } catch { } }
    const a = el.animate(frames, { duration: ms * frames.length, iterations: Infinity, easing: 'steps(1, jump-end)' });
    this.texAnims.set(el, a);
    this.texEls.add(el);
  }

  auraManager() {
    if (!this.aura) this.aura = new AuraManager({ reducedMotion: this.reducedMotion });
    return this.aura;
  }

  applyAura(el, glow, particles) {
    const hasAny = (glow && glow.length) || (particles && particles.length);
    if (!hasAny) { if (this.aura) this.aura.remove(el); return; }
    let fallback = { r: 255, g: 255, b: 255, a: 1 };
    try { fallback = parseColor(getComputedStyle(el).color) || fallback; } catch { }
    const rc = (css) => this.resolveColorCss(css);
    const g = (glow || []).map((l) => resolveLayer(l, rc, fallback));
    const p = (particles || []).map((l) => resolveLayer(l, rc, fallback));
    this.auraManager().set(el, g, p);
  }

  /** 0.10.0: tilt follows the pointer by smoothing toward a target, writing four custom properties on the element */
  applyTilt(el, spec) {
    const cur = this.tiltEls.get(el);
    if (!spec) { if (cur) { cur.stop(); this.tiltEls.delete(el); } return; }
    const key = JSON.stringify(spec);
    if (cur && cur.key === key) return;
    if (cur) cur.stop();
    let reduce = false;
    try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { }
    if (reduce) { this.tiltEls.set(el, { key, stop() { } }); return; }
    const sign = spec.invert ? -1 : 1;
    const cu = { x: 0, y: 0, s: 1, gx: 50, gy: 50 };
    let target = { x: 0, y: 0, s: 1, gx: 50, gy: 50 };
    let raf = 0;
    const write = () => {
      el.style.setProperty('--dssl-tx', cu.x.toFixed(2) + 'deg');
      el.style.setProperty('--dssl-ty', cu.y.toFixed(2) + 'deg');
      el.style.setProperty('--dssl-ts', cu.s.toFixed(4));
      if (spec.glare) { el.style.setProperty('--dssl-gx', cu.gx.toFixed(1) + '%'); el.style.setProperty('--dssl-gy', cu.gy.toFixed(1) + '%'); }
    };
    const step = () => {
      raf = 0;
      let moving = false;
      for (const k of ['x', 'y', 's', 'gx', 'gy']) {
        const d = target[k] - cu[k];
        const eps = k === 's' ? 0.0005 : 0.02;
        if (Math.abs(d) > eps) { cu[k] += d * spec.speed; moving = true; } else cu[k] = target[k];
      }
      write();
      if (moving) raf = requestAnimationFrame(step);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
    const move = (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
      target = { x: -ny * spec.max * sign, y: nx * spec.max * sign, s: spec.lift, gx: (nx + 1) * 50, gy: (ny + 1) * 50 };
      kick();
    };
    const leave = () => { target = { x: 0, y: 0, s: 1, gx: 50, gy: 50 }; kick(); };
    el.addEventListener('pointermove', move, { passive: true });
    el.addEventListener('pointerleave', leave, { passive: true });
    this.tiltEls.set(el, {
      key,
      stop: () => {
        el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave);
        if (raf) cancelAnimationFrame(raf);
        for (const p of ['--dssl-tx', '--dssl-ty', '--dssl-ts', '--dssl-gx', '--dssl-gy']) el.style.removeProperty(p);
      },
    });
  }

  /** range inputs: keep --dssl-p (the value as 0..1) current so the track fill and graph can follow it */
  applySlider(el, spec) {
    const known = this.sliderEls.has(el);
    if (!spec) {
      if (known) { el.removeEventListener('input', this.sliderEls.get(el)); this.sliderEls.delete(el); el.style.removeProperty('--dssl-p'); }
      return;
    }
    if (el.tagName !== 'INPUT' || el.type !== 'range') {
      if (!this._warnedSlider) this._warnedSlider = new WeakSet();
      if (!this._warnedSlider.has(el)) { this._warnedSlider.add(el); console.info(`[DSSL] slider: on <${el.tagName.toLowerCase()}> does nothing, it styles <input type="range">`); }
      return;
    }
    const sync = () => {
      const mn = el.min === '' ? 0 : Number(el.min), mx = el.max === '' ? 100 : Number(el.max);
      const p = (Number(el.value) - mn) / ((mx - mn) || 1);
      el.style.setProperty('--dssl-p', String(Math.max(0, Math.min(1, p))));
    };
    if (!known) { el.addEventListener('input', sync); this.sliderEls.set(el, sync); }
    sync();
  }

  /* ------------------------------------------------------------ *
   * Bundles
   * ------------------------------------------------------------ */

  hasBundle(name) { return this.bundles.has(name); }

  applyBundle(name, doc, { replace = false } = {}) {
    // keep the original insertion order when replacing a bundle in place
    const prev = this.bundles.get(name);
    const seq = prev ? prev.seq : this.seq++;
    if (replace) this.bundles.delete(name);
    this.bundles.set(name, { seq, ...doc });
    this.rebuild();
  }

  removeBundle(name) {
    if (!this.bundles.has(name)) return;
    this.bundles.delete(name);
    this.rebuild();
  }

  rebuild() {
    const rules = [];
    const shadowRules = [];
    const raws = [];
    const motionFrames = {};
    const bundles = [...this.bundles.values()].sort((a, b) => a.seq - b.seq);
    assignGlobalOrder(bundles);
    for (const b of bundles) {
      for (const r of b.rules) {
        rules.push(r); // scoped engines map :root rules onto the scope element
      }
      shadowRules.push(...b.shadowRules);
      // v0.8.0 - raw { } verbatim CSS rides the same document stylesheet
      if (b.raws) raws.push(...b.raws);
      Object.assign(motionFrames, b.motionFrames || {});   // 0.14.0: one registry of motions across every sheet
    }
    this.motionFrames = motionFrames;
    this.rules = rules;
    this.shadowRules = shadowRules;
    this.raws = raws;
    this.syncFontLinks(bundles);

    // unique media queries → MediaQueryList cache
    for (const r of rules) for (const q of r.media) this.mql(q);
    for (const r of shadowRules) for (const q of r.media) this.mql(q);

    this.init();
    this.renderShadow();
    this.computeAll();
    this.reportShadowed(rules);
  }

  /** 0.15.0: say, once each, which rules can never apply because a later rule beats them everywhere (no specificity: the later one wins) */
  reportShadowed(rules) {
    try {
      if (!this._shadowTold) this._shadowTold = new Set();
      const fresh = shadowWarnings(rules).filter((w) => { const k = w.file + ':' + w.line + '|' + w.message; if (this._shadowTold.has(k)) return false; this._shadowTold.add(k); return true; });
      if (!fresh.length) return;
      console.groupCollapsed(`%c[DSSL] ${fresh.length} rule(s) can never apply`, 'color:#8a6d1a;font-weight:bold');
      for (const w of fresh) console.warn(`${w.file || ''}:${w.line ?? ''} - ${w.message}\n    ${w.hint}`);
      console.groupEnd();
    } catch { /* a lint must never break the page */ }
  }

  /** 0.12.0: fonts { } becomes <link> tags in <head>, one per URL, removed again when no sheet asks for it */
  syncFontLinks(bundles) {
    if (typeof document === 'undefined' || !document.head) return;
    const want = new Set();
    for (const b of bundles) for (const l of b.fontLinks || []) want.add(l.url);
    const have = new Map();
    for (const el of document.head.querySelectorAll('link[data-dssl-font]')) have.set(el.getAttribute('href'), el);
    for (const [url, el] of have) if (!want.has(url)) el.remove();
    for (const url of want) {
      if (have.has(url)) continue;
      if (!document.head.querySelector('link[data-dssl-font-preconnect]') && /^https:\/\/fonts\.googleapis\.com\//.test(url)) {
        for (const origin of ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']) {
          const pc = document.createElement('link');
          pc.rel = 'preconnect'; pc.href = origin; if (origin.includes('gstatic')) pc.crossOrigin = '';
          pc.setAttribute('data-dssl-font-preconnect', '');
          document.head.appendChild(pc);
        }
      }
      const el = document.createElement('link');
      el.rel = 'stylesheet'; el.href = url; el.setAttribute('data-dssl-font', '');
      document.head.appendChild(el);
    }
  }

  /** a stable pseudo-random 0..max for this element, so a row of identical pickups does not bob in lockstep (and the same page always looks the same) */
  jitterFor(el, max) {
    if (!this._jit) this._jit = new WeakMap();
    let r = this._jit.get(el);
    if (r === undefined) {
      this._jitSeed = ((this._jitSeed || 1) * 16807) % 2147483647;
      r = this._jitSeed / 2147483647;
      this._jit.set(el, r);
    }
    return Math.round(r * max);
  }

  mql(query) {
    let m = this.mqlCache.get(query);
    if (!m) {
      try { m = window.matchMedia(query); } catch { m = { matches: false, addEventListener() {} }; }
      this.mqlCache.set(query, m);
    }
    return m;
  }

  /* ------------------------------------------------------------ *
   * One-time wiring: events, observers, media listeners
   * ------------------------------------------------------------ */

  init() {
    if (this.initialized) return;
    this.initialized = true;

    const root = this.scope || document;
    const doc = this.scope ? this.scope : document.documentElement;

    // --- element state events ---
    // v0.7.0 - every listener is registered in this._listeners so freeze()
    // can detach the whole reactive surface and unfreeze() re-arm it.
    if (!this._listeners) this._listeners = [];
    const on = (type, fn) => {
      const opts = { passive: true, capture: type === 'focusin' || type === 'focusout' };
      root.addEventListener(type, fn, opts);
      this._listeners.push({ target: root, type, fn, opts });
    };
    on('pointerover', (e) => this.stateEvent('hover', e.target));
    on('pointerout', (e) => this.stateEvent('hover', e.target));
    on('focusin', (e) => { this.stateEvent('focus', e.target); this.stateEvent('focus-visible', e.target); });
    on('focusout', (e) => { this.stateEvent('focus', e.target); this.stateEvent('focus-visible', e.target); });
    on('pointerdown', (e) => this.stateEvent('active', e.target));
    on('pointerup', (e) => this.stateEvent('active', e.target));
    on('pointercancel', (e) => this.stateEvent('active', e.target));
    // v0.7.2 - form-state events. checked/indeterminate live on properties
    // the pointer and focus listeners never see: unchecking with Space went
    // stale, and programmatic el.checked = true never restyled until focus
    // moved. change bubbles, so delegation reaches it. toggle does NOT
    // bubble - a capture-phase listener on document still catches it on the
    // way down. Note for docs: programmatic property writes fire no event at
    // all; dispatch a bubbling change event after setting .checked.
    on('change', (e) => {
      const t = e.target;
      if (!t || t.nodeType !== 1) return;
      this.stateEvent('checked', t);
      this.stateEvent('disabled', t);
      this.stateEvent('indeterminate', t);
    });
    {
      const tgl = (e) => { const t = e.target; if (t && t.nodeType === 1) this.stateEvent('open', t); };
      document.addEventListener('toggle', tgl, true);
      this._listeners.push({ target: document, type: 'toggle', fn: tgl, opts: true });
    }

    // --- DOM mutations ---
    const mo = new MutationObserver((muts) => this.onMutations(muts));
    mo.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: undefined });
    this._mo = mo;
    this.startOverlapTimer();

    // --- media changes ---
    // (matchMedia listeners are added lazily per query in mql(); rewire here)
    const origMql = this.mql.bind(this);
    this.mql = (query) => {
      const m = origMql(query);
      if (!m._dsslWired) {
        m._dsslWired = true;
        // v0.7.0 - the frozen guard lives HERE (not at attach time) so the
        // same listener serves both modes: freeze() needs no bookkeeping.
        try { m.addEventListener('change', () => { if (!this.frozen) this.scheduleComputeAll(); }); } catch { /* old browsers */ }
      }
      return m;
    };

    // --- reduced motion ---
    try {
      const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
      rm.addEventListener('change', () => { if (!this.frozen) this.scheduleComputeAll(); });
      // 0.14.0: <html data-dssl-motion="full"> runs every motion whatever the system asks for (a game's motion is its content),
      // "reduced" holds them all still, and anything else follows the system. DSSL.motion('full') sets it.
      this.reducedMotion = { get matches() { const m = document.documentElement.getAttribute('data-dssl-motion'); return m === 'full' ? false : m === 'reduced' ? true : rm.matches; }, get system() { return rm.matches; } };
    } catch { this.reducedMotion = { matches: false }; }

    // --- `seen` state (v0.4.0): fires once when the element scrolls into view ---
    this.io = this.makeSeenObserver();

    // --- container tracking via ResizeObserver ---
    // v0.4.1: the callback goes through the coalescing scheduler, and - more
    // importantly - computeElement now skips no-op style writes. The old
    // wipe-and-rewrite could change an observed container's size mid-cycle,
    // which re-fired this observer, which recomputed and rewrote again… a
    // feedback loop the user experienced as the whole UI "twitching". An
    // idempotent drain cannot move anything, so the loop dies here.
    this.ro = new ResizeObserver(() => this.scheduleComputeAll());
  }

  /* ------------------------------------------------------------ *
   * v0.7.0 - freeze/unfreeze internals + the seen observer factory
   * ------------------------------------------------------------ */

  makeSeenObserver() {
    if (typeof IntersectionObserver === 'undefined') return null;
    return new IntersectionObserver((entries) => {
      const batch = new Set();
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        this.seenSet.add(en.target);
        try { this.io.unobserve(en.target); } catch { }
        batch.add(en.target);
      }
      if (batch.size) this.schedule(batch);
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  }

  /* v0.5.0 - overlap heartbeat. Drains catch layout changes, but transform
   * animations drift boxes every frame without any drain. Infinite loops
   * never fire `finish`, so a lazy 400ms pulse re-checks while they run.
   * v0.7.0 - extracted so freeze()/unfreeze() can stop and restart it. */
  startOverlapTimer() {
    if (this._overlapTimer) clearInterval(this._overlapTimer);
    this._overlapTimer = setInterval(() => {
      if (this.frozen || document.hidden) return;
      if (this._overlapDirty || this._hasInfiniteAnims) {
        this._overlapDirty = false;
        this.resolveOverlaps();
      }
    }, 400);
  }

  freezeNotice() {
    if (this._freezeTold) return;
    this._freezeTold = true;
    console.info(`[DSSL] engine "${this.name}" is frozen - ambient restyling is off; DSSL.unfreeze() re-arms it`);
  }

  stateEvent(state, target) {
    if (!target || target.nodeType !== 1) return;
    const batch = new Set();

    // the element that just entered/left the state - and its ancestors,
    // because hover/focus-within rules can style them too
    let node = target;
    while (node && node.nodeType === 1 && this.inScope(node)) {
      batch.add(node);
      node = node.parentElement;
    }

    // v0.7.2 - candidate collection is no longer page-wide. The external
    // review measured 33,060 recomputes for hovering 8 cards in a 1k-card
    // page: every state event queried the whole document for EVERY stateful
    // rule and batched every match. Reality: a subject-state rule (.card:hover)
    // can only ever change the chain collected above. Rules where the state
    // sits on an ANCESTOR compound (.card:hover .title) reach further down -
    // queried from the matching ancestor via :scope, so the cost is bounded
    // by that ancestor's subtree, never the page. computeElement re-checks
    // the full stateful selector, so a superset batch is only wasted work,
    // never wrong output.
    for (const rule of this.rules) {
      const hit = rule.states.has(state) || (state === 'focus' && rule.states.has('focus-visible')) || (state === 'focus-visible' && rule.states.has('focus'));
      if (!hit) continue;
      const reach = rule._reach !== undefined ? rule._reach : (rule._reach = stateReach(rule.sel, state));
      if (reach === null) continue; // subject-state: the chain covers it
      if (reach.fallback) {
        // :has()/:not() wrappers defeat the cheap strip - keep the old
        // page-wide superset for this rare shape
        const base = rule.sel.replace(STATE_PSEUDO_RE, '').trim() || '*';
        let els; try { els = (this.scope || document).querySelectorAll(base); } catch { continue; }
        els.forEach(el => batch.add(el));
        continue;
      }
      for (const anc of batch) {
        let prefixOK;
        try { prefixOK = anc.matches(reach.prefix); } catch { prefixOK = false; }
        if (!prefixOK) continue;
        if (reach.sib) {
          // sibling tails: querySelectorAll cannot leave the subtree, so walk
          // the siblings by hand (+ stops at the first; ~ keeps scanning)
          let sib = anc.nextElementSibling;
          while (sib) {
            let hitSib = false;
            try { hitSib = sib.matches(reach.firstSeg); } catch { hitSib = false; }
            if (hitSib) {
              batch.add(sib);
              if (reach.restAfter) {
                let sub; try { sub = sib.querySelectorAll(reach.restAfter); } catch { sub = null; }
                if (sub) sub.forEach(x => batch.add(x));
              }
            }
            if (reach.sib === '+') break;
            sib = sib.nextElementSibling;
          }
          continue;
        }
        let els;
        try { els = anc.querySelectorAll(':scope ' + reach.rest); } catch { continue; }
        els.forEach(el => batch.add(el));
      }
    }
    if (batch.size) this.schedule(batch);
  }

  /* ------------------------------------------------------------ *
   * Scheduling + cascade application
   * ------------------------------------------------------------ */

  schedule(els) {
    if (this.frozen) return;         // v0.7.0 - frozen: state events and seen batches are ambient
    els.forEach(el => this.pending.add(el));
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.drainPending(); });
  }

  drainPending() {
    if (!this.pending.size) return;
    const batch = [...this.pending];
    this.pending.clear();
    this._applying = true;
    for (const el of batch) this.computeElement(el);
    this._applying = false;
    this.applyStagger();
    this.applyArc();          // v0.6.0 - bend-around arcs after every drain
    this.scheduleOverlap();   // v0.5.0 - nudges read fresh boxes after the writes settle
  }

  /** 0.15.0: do now what the engine has queued for the next microtask: DOM changes the observer has not delivered, restyles, signals.
   *  After this, computed styles and layout are final. DSSL.settled() is the awaitable version. */
  flush() {
    if (this.frozen) return;
    if (this._mo) { const recs = this._mo.takeRecords(); if (recs.length) this.onMutations(recs); }
    if (this._sweepQueued || this._allQueued) { this._sweepQueued = false; this._allQueued = false; this._sigNames = null; this._sigScopes = null; this._sigGlobal = false; this.computeAll(); }
    else this.flushSignals();
    this.drainPending();
  }

  /** what the page changed (the MutationObserver's work, also run by flush()) */
  onMutations(muts) {
    if (this.frozen) return; // v0.7.0 - a frozen engine sees a snapshot, not a live page
    if (this._applying) return; // our own style writes - ignore
    const batch = new Set();
    let fullSweep = false;
    for (const m of muts) {
      if (m.type === 'attributes') {
        if (m.attributeName === 'style' || m.attributeName === 'data-dssl-s') continue;
        if (m.target === document.documentElement && m.attributeName.startsWith('data-dssl')) continue;
        batch.add(m.target);
        // class/attr changes can affect descendant rules - include small subtrees.
        // v0.3.3: when the changed element owns a HUGE subtree (view root flips
        // like data-view on the site shell), don't skip the descendants - a full
        // debounced sweep keeps every descendant rule honest. Skipping is what
        // left the nav highlight stuck on the boot-time view after SPA routing.
        if (m.target.querySelectorAll) {
          const kids = m.target.querySelectorAll('*');
          if (kids.length <= 300) kids.forEach(k => batch.add(k));
          else fullSweep = true;
        }
      } else {
        if (m.addedNodes) m.addedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          batch.add(n);
          if (n.querySelectorAll) n.querySelectorAll('*').forEach(k => batch.add(k));
        });
        if (m.removedNodes) m.removedNodes.forEach(n => {
          if (n.nodeType !== 1) return;
          this.touched.delete(n);
          this.overlapEls.delete(n);   // v0.5.0 - dropped policies must not pin the pass
          this.nudgedEls.delete(n);
          if (n.querySelectorAll) n.querySelectorAll('*').forEach(k => {
            this.touched.delete(k);
            this.overlapEls.delete(k);
            this.nudgedEls.delete(k);
          });
        });
      }
    }
    if (fullSweep) {
      // one full recompute per microtask burst, same drain the scheduler uses
      if (!this._sweepQueued) {
        this._sweepQueued = true;
        queueMicrotask(() => { if (!this._sweepQueued) return; this._sweepQueued = false; this.computeAll(); });
      }
      return;
    }
    if (batch.size) this.schedule(batch);
  }

  /* v0.4.1 - coalesced full recompute for ambient triggers (ResizeObserver,
   * media flips, signals, reduced-motion). Several triggers can land in the
   * same frame; each one used to run its own computeAll synchronously. One
   * compute per microtask burst is always enough - the drain is idempotent. */
  scheduleComputeAll() {
    if (this.frozen) return;         // v0.7.0 - frozen: no ambient recompute
    if (this._allQueued) return;
    this._allQueued = true;
    queueMicrotask(() => { if (!this._allQueued) return; this._allQueued = false; this.computeAll(); });
  }

  matches(el, sel) {
    try { return el.matches(sel); } catch { return false; }
  }

  inScope(el) {
    if (!this.scope) return true;
    return this.scope === el || this.scope.contains(el);
  }

  /** the elements a signal-gated pseudo-element rule is about: its selector without the states (hover...) it also needs */
  sigShadowBase(r) {
    if (r._base === undefined) r._base = (r.sel || '*').replace(STATE_PSEUDO_RE, '').trim() || '*';
    return r._base;
  }

  /** keep data-dssl-s on an element: the numbers of the signal-gated pseudo-element rules that are on for it right now */
  markSignalShadow(el) {
    let on = '';
    for (const idx of this.sigShadowIdx) {
      const r = this.shadowRules[idx];
      if (!r || !this.matches(el, this.sigShadowBase(r))) continue;
      if (!this.signalsPass(r, el)) continue;
      on += (on ? ' ' : '') + idx;
    }
    const cur = el.getAttribute('data-dssl-s');
    try {
      if (on) { if (cur !== on) el.setAttribute('data-dssl-s', on); }
      else if (cur !== null) el.removeAttribute('data-dssl-s');
    } catch { /* detached */ }
  }

  /** a signal's value for an element: the nearest ancestor (or itself) that was given its own (DSSL.signal(name, value, el)), else the global one */
  sigLookup(el, name) {
    if (this.scopedCount && el) {
      for (let a = el; a; a = a.parentElement) {
        const m = this.scopedSignals.get(a);
        if (m && m.has(name)) return { has: true, val: m.get(name) };
      }
    }
    return this.signalStore.has(name) ? { has: true, val: this.signalStore.get(name) } : { has: false, val: undefined };
  }

  signalsPass(rule, el) {
    for (const s of rule.signals) {
      const { has, val } = this.sigLookup(el, s.name);
      if (s.op === 'truthy') { if (!has || val === false || val === null || val === 'false' || val === 0 || val === '0') return false; }
      else if (s.op === '==') { if (!has || String(val) !== String(s.value)) return false; }
      else if (s.op === '!=') { if (has && String(val) === String(s.value)) return false; }
      else if (s.op === 'in') { if (!has || !(s.values || []).includes(String(val))) return false; }          // 0.14.0
      else if (s.op === 'notin') { if (has && (s.values || []).includes(String(val))) return false; }
    }
    return true;
  }

  containerPass(el, rule) {
    if (!rule.containers.length) return true;
    // nearest ancestor (or self) with container-type set via DSSL
    let node = el;
    while (node) {
      if (this.containerEls.has(node)) break;
      node = node.parentElement;
    }
    if (!node) return false;
    const w = node.clientWidth;
    for (const q of rule.containers) {
      const { min, max } = parseSizeQuery(q);
      if (min !== null && w < min) return false;
      if (max !== null && w > max) return false;
    }
    return true;
  }

  computeAll() {
    this._colorCache.clear();   // 0.9.0: tokens or the theme may have changed, so colours are looked up again
    this.staticSeen = !!document.querySelector('[data-dssl-static]');
    this._forceCompute = true;  // a full recompute (the sheets changed, a media query flipped) reaches static subtrees too
    this._applying = true;
    const rootEl = this.scope || document.documentElement;
    const els = new Set([rootEl, ...this.touched]);   // include previously-styled elements - their rules may have STOPPED matching
    const root = this.scope || document;
    for (const rule of this.rules) {
      if (rule.sel === ':root') { els.add(rootEl); continue; }
      // v0.4.0: `:seen` is engine-native and invalid inside querySelectorAll -
      // enumerate the stripped selector; computeElement re-checks the real state.
      let sel = rule.sel;
      if (rule.states.has('seen')) sel = sel.replace(/:seen\b/g, '') || '*';
      let found;
      try { found = root.querySelectorAll(sel); } catch { continue; }
      found.forEach(el => els.add(el));
    }
    for (const idx of this.sigShadowIdx) { try { root.querySelectorAll(this.sigShadowBase(this.shadowRules[idx])).forEach((el) => els.add(el)); } catch { /* bad selector */ } }
    for (const el of els) this.computeElement(el);
    this._forceCompute = false;
    this._applying = false;
    this.applyStagger();
    this.applyArc();            // v0.6.0 - bend-around arcs after every drain
    this.scheduleOverlap();     // v0.5.0
  }

  /** restyle one subtree now, static or not (DSSL.refresh(el)) */
  refreshSubtree(root) {
    if (!root || root.nodeType !== 1 || !this.inScope(root)) return;
    this._forceCompute = true; this._applying = true;
    try { for (const el of [root, ...root.querySelectorAll('*')]) this.computeElement(el); }
    finally { this._forceCompute = false; this._applying = false; }
    this.applyStagger(); this.applyArc(); this.scheduleOverlap();
  }

  computeElement(el) {
    if (!el || !el.style || el.nodeType !== 1) return;
    if (!this.inScope(el)) return;
    // 0.14.0: a subtree marked data-dssl-static is styled once and then left alone: a class toggled on its parent, a media query,
    // a signal no longer walk it. DSSL.freeze(el) marks one and DSSL.refresh(el) restyles it on demand.
    if (this.staticSeen && !this._forceCompute && this.ownMap.has(el) && el.closest('[data-dssl-static]')) return;
    this.touched.add(el);
    if (this.sigShadowIdx.length) this.markSignalShadow(el);

    const matched = [];
    const rootEl = this.scope || document.documentElement;
    for (const rule of this.rules) {
      if (rule.sel === ':root') {
        if (el !== rootEl) continue;
      } else {
        // v0.7.2 - the gate now runs BEFORE native matches(). The external
        // review caught the wrong order: every element paid a full el.matches()
        // for every rule even when the cheap gate could say no. Same contract
        // as v0.7.0: the gate only ever says NO, and bails to null on anything
        // it does not fully understand - a missed optimization beats a missed
        // match.
        const gate = rule._gate !== undefined ? rule._gate : (rule._gate = gateFor(rule.sel));
        if (gate && !gatePass(el, gate)) continue;
        let sel = rule.sel;
        if (rule.states.has('seen')) {
          // v0.4.0 - `seen` belongs to the engine, not to CSS selectors: until
          // the element has intersected, the rule cannot match. Make sure the
          // element IS observed so it re-computes the moment it scrolls in.
          if (!this.isSeen(el)) { this.observeSeen(el); continue; }
          sel = sel.replace(/:seen\b/g, '') || '*';
        }
        if (!this.matches(el, sel)) continue;
      }
      if (!rule.media.every(q => this.mql(q).matches)) continue;
      if (!this.signalsPass(rule, el)) continue;
      if (!this.containerPass(el, rule)) continue;
      matched.push(rule);
    }
    matched.sort((a, b) =>
      (LAYER_RANK[a.layer] ?? 2) - (LAYER_RANK[b.layer] ?? 2) || a.order - b.order
    );

    /* v0.4.1 - diff-based writes. The engine used to WIPE every property it
     * owned and rewrite them all on every single recompute, even when nothing
     * had changed. Under pointer boundary storms that meant hundreds of no-op
     * style mutations per second, a resize-observer feedback loop (the write
     * moved an observed container, RO re-fired, the write ran again…), and a
     * visible "twitch" while the browser kept relayouting identical styles.
     *
     * The language's promise is that a recompute is a pure function of (DOM,
     * rules, state) - so a recompute that resolves to the same declarations
     * must touch the DOM zero times. Build the new ownership map, diff it
     * against what we own, and write ONLY the difference. */

    const owned = this.ownMap.get(el) || new Map();  // prop -> {value, imp}
    // 0.14.0: inline styles that are NOT ours. What the page wrote before the engine first looked (a style="" attribute, a script
    // that placed the element) belongs to the author and wins over a rule, like in CSS; the same goes for a property a script
    // changes after we wrote it. Before this the engine overwrote them, so a rule with `left: 0` undid a game's own positions.
    let authored = this.authored.get(el);
    if (!this.ownMap.has(el) && !authored) {
      for (let i = 0; i < el.style.length; i++) {
        const p = el.style[i];
        if (p.startsWith('--dssl-') || p === 'grid-area') continue;
        if (!authored) { authored = new Map(); this.authored.set(el, authored); }
        authored.set(p, { value: el.style.getPropertyValue(p), imp: el.style.getPropertyPriority(p) });
      }
    }
    if (authored) {
      for (const [p, a] of authored) {
        const cur = el.style.getPropertyValue(p);
        if (cur === '') authored.delete(p);                       // the author took it away: the rule may have it now
        else { a.value = cur; a.imp = el.style.getPropertyPriority(p); }
      }
      if (!authored.size) { this.authored.delete(el); authored = null; }
    }
    const newOwned = new Map();                      // prop -> {value, imp}
    const animSpecs = [];
    let cancelAnims = false;
    let stack = false;
    let staggerMs;                         // v0.4.0 - @stagger value, if any
    let overlapVal;                        // v0.5.0 - @overlap policy, if any
    const deform = {};                     // v0.6.0 - bend/bendY/fold/bendUp/stretch parts
    let arcVal;                            // v0.6.0 - @bend-around degrees
    let gflowVal;                          // v0.6.0 - @gradient-flow spec
    let textureVal, auraGlowVal, auraPartsVal, sliderVal; // 0.9.0
    let tiltVal = null;                    // 0.10.0
    let declSeq = 0;                       // cascade position of each declaration, so a longhand can tell whether it came after its shorthand

    // flatten matched decls in cascade order (last decl of a prop wins, exactly
    // like sequential setProperty calls did)
    const flat = [];
    for (const rule of matched) {
      const imp = rule.layer === 'pin' ? 'important' : '';
      for (const d of rule.decls) flat.push({ d, imp, rule });
    }
    for (const { d, imp } of flat) {
      if (d.prop === '@overlap') { overlapVal = d.value; continue; }
      if (d.prop === '@animate') {
        if (d.value === null) { cancelAnims = true; continue; }
        animSpecs.push({ ...d.value, key: /* filled below */ null });
        continue;
      }
      if (d.prop === '@stack') { stack = true; continue; }
      if (d.prop === '@stagger') { staggerMs = d.value; continue; }
      // v0.6.0 - the deform family + gradient tools are engine-native: they
      // never land in the inline block as raw @-props; they compose.
      if (d.prop === '@bend') { deform.bend = Number(d.value) || 0; continue; }
      if (d.prop === '@bend-y') { deform.bendY = Number(d.value) || 0; continue; }
      if (d.prop === '@fold') { deform.fold = Number(d.value) || 0; continue; }
      if (d.prop === '@bend-up') { deform.bendUp = Number(d.value) || 0; continue; }
      if (d.prop === '@stretch') {
        const sv = d.value;
        if (sv && typeof sv === 'object') {
          deform.stretch = Number(sv.factor) || 0;
          deform.stretchAxis = sv.axis || 'horizontal';
        } else {
          const sa = String(sv).trim().split(/\s+/);
          deform.stretch = Number(sa[0]) || 0;
          deform.stretchAxis = sa[1] === 'vertical' ? 'vertical' : 'horizontal';
        }
        continue;
      }
      if (d.prop === '@bend-around') { arcVal = d.value === null ? null : Number(d.value); continue; }
      if (d.prop === '@gradient-flow') { gflowVal = d.value || null; continue; }
      if (d.prop === '@texture') { textureVal = d.value || null; continue; }
      if (d.prop === '@aura-glow') { auraGlowVal = d.value || null; continue; }
      if (d.prop === '@aura-particles') { auraPartsVal = d.value || null; continue; }
      if (d.prop === '@slider') { sliderVal = d.value || null; continue; }
      if (d.prop === '@tilt') { tiltVal = d.value || null; continue; }
      newOwned.set(d.prop, { value: d.value, imp, seq: ++declSeq });
    }
    // anim keys need rule identity - rebuild them from matched order
    {
      let i = 0;
      for (const rule of matched) {
        let nth = 0;   // 0.15.0: several motions in one rule (animate: a 300, b 500) each need their own key
        for (const d of rule.decls) {
          if (d.prop !== '@animate' || d.value === null) continue;
          const spec = animSpecs[i++];
          if (spec) spec.key = rule.id + '|' + rule.media.join('&') + '|' + rule.signals.map(s => s.name + s.op + s.value).join('&') + '#' + (nth++);
        }
      }
    }

    // v0.4.1 - resolve shorthand/longhand coexistence BEFORE any write, so the
    // inline block never holds a family shorthand and one of its longhands.
    for (const fam of ['border']) {
      const sh = newOwned.get(fam);
      if (!sh) continue;
      for (const lhName of ['border-color', 'border-width', 'border-style']) {
        const lh = newOwned.get(lhName);
        if (!lh) continue;
        // the one that came later in the cascade wins: a longhand after the shorthand is folded into its slot, a
        // longhand before it is simply overridden. (Before 0.13.0 a later border-style or border-width was thrown away.)
        const single = wordsTop(lh.value).length === 1;
        if ((lh.seq || 0) > (sh.seq || 0) && single) newOwned.set(fam, { value: foldIntoBorder(sh.value, lh.value, lhName.slice(7)), imp: sh.imp, seq: lh.seq });
        newOwned.delete(lhName);
        // (0.14.0: no console line here. Folding is the normal, correct way a border longhand meets its shorthand, not news.)
      }
    }
    for (const [fam, longhands] of Object.entries(POSITIONAL_FAMILIES)) {
      const sh = newOwned.get(fam);
      if (!sh) continue;
      const clash = longhands.filter(p => newOwned.has(p));
      if (!clash.length) continue;
      const imp = sh.imp;
      newOwned.delete(fam);
      for (const [p, v] of expandPositional(sh.value, longhands)) {
        const prevL = newOwned.get(p);
        // whichever came later in the cascade wins: `margin-top: 14` after `margin: 0` keeps its 14, but `margin: 0` after
        // `margin-top: 14` resets it (before 0.13.0 the longhand always survived)
        if (!prevL || (prevL.seq || 0) < (sh.seq || 0)) newOwned.set(p, { value: v, imp, seq: sh.seq });
      }
    }

    // v0.6.0 - the deform family composes into the transform channel, so one
    // inline `transform` carries bend + stretch + whatever the user wrote.
    // Diffing stays honest: a recompute resolving to the same string writes
    // nothing. Edge-pinned members read the live box to bake their pivot.
    if (deform.bend || deform.bendY || deform.fold || deform.bendUp || deform.stretch) {
      const userT = newOwned.get('transform');
      let h = 0;
      if (deform.fold || deform.bendUp) { try { h = el.offsetHeight; } catch { h = 0; } }
      const c = composeDeform(deform, userT ? userT.value : '', { h });
      newOwned.set('transform', { value: c.transform, imp: userT ? userT.imp : '' });
    }

    // 0.10.0 - tilt adds its rotation after everything else in the transform.
    // The angles are variables the pointer handler updates, so moving the
    // mouse never triggers a restyle.
    if (tiltVal) {
      const userT = newOwned.get('transform');
      const base = userT && userT.value && userT.value !== 'none' ? String(userT.value) + ' ' : '';
      newOwned.set('transform', { value: base + tiltTransform(tiltVal), imp: userT ? userT.imp : '' });
    }

    // v0.6.0 - gradient-flow needs a gradient to flow and room to move. If
    // the element has no background-image at all, say so instead of looping
    // a position nobody can see.
    if (gflowVal) {
      let hasImg = !!newOwned.get('background-image');
      if (!hasImg) { try { hasImg = getComputedStyle(el).backgroundImage !== 'none'; } catch { } }
      if (hasImg) {
        // a gradient sized 100% has nowhere to slide - give it room unless
        // the cascade explicitly sized it
        if (!newOwned.get('background-size')) newOwned.set('background-size', { value: '200% 100%', imp: '' });
      } else {
        if (!this.gflowWarned.has(el)) {
          this.gflowWarned.add(el);
          console.info(`[DSSL] gradient-flow on <${el.tagName.toLowerCase()}> has nothing to flow - give it a gradient or background-image first`);
        }
        gflowVal = null;
      }
      if (gflowVal && this.reducedMotion && this.reducedMotion.matches) gflowVal = null; // decorative motion
    }

    // 0.9.0 - texture sits on top of the author's own background
    let builtTex = null, texUserLayers = 0;
    if (textureVal && textureVal.length) {
      const shv = newOwned.get('background'), imv = newOwned.get('background-image');
      texUserLayers = shv ? splitList(shv.value).length : imv ? splitList(imv.value).length : 0;
      builtTex = this.composeTexture(el, newOwned, textureVal);
    }

    // REMOVE pass - properties we owned but the new cascade no longer sets.
    // This runs BEFORE the promotion read below, so getComputedStyle sees the
    // element's natural display, not a leftover promotion from last time.
    // v0.4.1: the bookkeeping map must forget them too - the SET pass diffs
    // against `owned`, and a prop deleted from the element but still in the
    // map would look "unchanged" and never be rewritten (that is how the
    // alignment promotion's display used to vanish on the second recompute).
    for (const p of [...owned.keys()]) {
      if (!newOwned.has(p)) {
        try { el.style.removeProperty(p); } catch { }
        owned.delete(p);
      }
    }

    // v0.3.4: alignment implies a formatting context - see ALIGN_PROPS above.
    // The element's NATURAL display (without our previous promotion) decides.
    // v0.4.1: when we own a display we are about to drop, getComputedStyle can
    // race the removal - so the natural value is cached per element the first
    // time we see it without owning a display. none/contents are never
    // promoted (promoting would unhide or boxify them).
    if (flat.some(x => ALIGN_PROPS.has(x.d.prop)) && !newOwned.has('display')) {
      let disp = '';
      if (owned.has('display')) {
        disp = this.naturalDisplay.get(el) || '';
        if (!disp) { try { disp = getComputedStyle(el).display; } catch { } }
      } else {
        try { disp = getComputedStyle(el).display; } catch { }
        if (disp) this.naturalDisplay.set(el, disp);
      }
      if (disp && !HAS_CONTEXT_RE.test(disp) && disp !== 'none' && disp !== 'contents') {
        const inlineCtx = disp === 'inline' || disp.startsWith('inline-');
        newOwned.set('display', { value: inlineCtx ? 'inline-grid' : 'grid', imp: '' });
      }
    }

    // SET pass - only what is new or actually changed.
    let wrote = false;
    for (const [prop, next] of newOwned) {
      const prev = owned.get(prop);
      // a script changed a property we wrote: it is the author's now (the few the engine also writes by other routes are exempt)
      if (prev && prev.rb !== undefined && !ENGINE_ALSO_WRITES.has(prop) && el.style.getPropertyValue(prop) !== prev.rb) {
        if (!authored) { authored = new Map(); this.authored.set(el, authored); }
        authored.set(prop, { value: el.style.getPropertyValue(prop), imp: el.style.getPropertyPriority(prop) });
        newOwned.delete(prop); owned.delete(prop);
        continue;
      }
      if (authored && authored.has(prop)) { newOwned.delete(prop); continue; }
      if (prev && prev.value === next.value && prev.imp === next.imp) { next.rb = prev.rb; continue; }
      wrote = true;
      try {
        el.style.setProperty(prop, next.value, next.imp);
      } catch (why) {
        // v0.3.2: the language promises loud errors - if the browser rejects
        // a value we resolved, say so instead of failing silently. This is
        // how the repeat(4px, 1fr) grid collapse would have been caught.
        const msg = `[DSSL] browser rejected "${prop}: ${next.value}" - ${why && why.message || 'invalid value'}`;
        if (!this._warned) this._warned = new Set();
        if (!this._warned.has(msg)) { this._warned.add(msg); console.warn(msg); }
      }
    }

    // a shorthand we just wrote (margin: 0) can have wiped a longhand the author set (margin-top: 14): put theirs back
    if (authored) {
      for (const [p, a] of authored) {
        try { if (el.style.getPropertyValue(p) !== a.value) el.style.setProperty(p, a.value, a.imp); } catch { /* ignore */ }
      }
    }
    // what the browser holds for each property now, read once after every write: a longhand written after its shorthand changes how
    // the shorthand reads back, so a per-property reading taken at write time would look like someone else's edit
    if (wrote || authored) for (const [p, v] of newOwned) v.rb = el.style.getPropertyValue(p);
    this.ownMap.set(el, newOwned);
    this.lastApply = Date.now();

    // v0.4.0 - stagger bookkeeping: remember (or forget) this container
    const hadStagger = this.staggerEls.has(el);
    if (staggerMs !== undefined && staggerMs !== null && Number.isFinite(Number(staggerMs))) {
      this.staggerEls.set(el, Number(staggerMs));
    } else if (hadStagger) {
      this.staggerEls.delete(el);
      this.resetStagger(el); // rule stopped matching - restore natural delays
    }

    // v0.6.0 - bend-around bookkeeping: remember (or forget) arc containers
    const hadArc = this.arcMap.has(el);
    if (arcVal !== undefined && arcVal !== null && Number.isFinite(arcVal) && arcVal !== 0) {
      this.arcMap.set(el, arcVal);
    } else if (hadArc) {
      this.arcMap.delete(el);
      this.resetArc(el);
    }

    // container registration
    if (newOwned.has('container-type')) {
      if (!this.containerEls.has(el)) { this.containerEls.add(el); try { this.ro.observe(el); } catch { } }
    } else if (this.containerEls.has(el)) {
      this.containerEls.delete(el);
      try { this.ro.unobserve(el); } catch { }
    }

    // stack behavior: children share grid cell
    const prevStack = this.stackPrev.get(el) || [];
    if (stack) {
      for (const child of el.children) {
        // v0.4.1: idempotent - children get recomputed on every drain, but
        // rewriting grid-area every time churned the style attribute for free.
        if (child.nodeType === 1 && child.style.gridArea !== '1 / 1') {
          try { child.style.gridArea = '1 / 1'; } catch { }
        }
      }
      this.stackPrev.set(el, [...el.children]);
    } else if (prevStack.length) {
      for (const child of prevStack) { try { child.style.removeProperty('grid-area'); } catch { } }
      this.stackPrev.delete(el);
    }

    // animations
    const anims = this.animMap.get(el) || new Map();
    if (cancelAnims) {
      anims.forEach(a => { try { a.cancel(); } catch { } });
      anims.clear();
    }
    const reduced = this.reducedMotion && this.reducedMotion.matches;
    for (const spec of animSpecs) {
      if (spec.broken || !spec.frames || !spec.frames.length) continue;
      if (reduced && !spec.essential) {
        // never silent: a game or a tutorial can lose all its motion to a system setting and look broken
        if (!this._reducedTold) {
          this._reducedTold = true;
          console.info(`[DSSL] "${spec.motion}" and any other animate: that is not marked essential did not run, because this browser asks for reduced motion (prefers-reduced-motion: reduce). Motion that IS the content should say \`essential\` inside its motion block, or set <html data-dssl-motion="full"> (DSSL.motion('full')) to run everything.`);
        }
        continue;
      }
      if (anims.has(spec.key)) continue;
      let frames = spec.frames.map(f => ({ ...f.props, offset: f.offset / 100 }));
      if (frames.length === 1) {
        if (frames[0].offset === 0) frames = [frames[0], { offset: 1 }];
        else frames = [{ offset: 0 }, frames[0]];
      }
      try {
        const anim = el.animate(frames, {
          duration: spec.duration, easing: spec.easing,
          delay: (spec.delay || 0) + (spec.jitter ? this.jitterFor(el, spec.jitter) : 0), fill: spec.fill,
          iterations: spec.iterations || 1,        // v0.5.0 - `infinite`
          direction: spec.direction || 'normal',   // v0.5.0 - `alternate`
        });
        if (spec.iterations === Infinity) this._hasInfiniteAnims = true;
        if (this.motionHeld) { try { anim.pause(); } catch { /* ignore */ } }   // DSSL.pauseMotion(): new motions start held too
        anims.set(spec.key, anim);
      } catch { /* WAAPI unsupported property - skip */ }
      this._overlapDirty = true;   // moving boxes can create (or clear) overlaps
    }

    // v0.6.0 - gradient-flow: loop background-position through WAAPI. Lives
    // in the same animMap so replay() and cancels treat it like any motion.
    const hadGflow = anims.has('@gflow');
    if (gflowVal) {
      const cur = anims.get('@gflow');
      if (!cur) {
        try {
          const a = el.animate(
            [{ backgroundPosition: '0% 50%' }, { backgroundPosition: '100% 50%' }],
            {
              duration: gflowVal.duration, easing: gflowVal.easing || 'linear',
              direction: gflowVal.direction || 'normal', iterations: Infinity, fill: 'both',
            },
          );
          anims.set('@gflow', a);
          this._hasInfiniteAnims = true;
        } catch { /* WAAPI missing - skip */ }
      } else {
        try {
          const t = cur.effect.getTiming();
          if (Number(t.duration) !== Number(gflowVal.duration) || t.direction !== (gflowVal.direction || 'normal')) {
            cur.effect.updateTiming({ duration: gflowVal.duration, direction: gflowVal.direction || 'normal', easing: gflowVal.easing || 'linear' });
          }
        } catch { }
      }
    } else if (hadGflow) {
      try { anims.get('@gflow').cancel(); } catch { }
      anims.delete('@gflow');
    }
    if (animSpecs.length || anims.has('@gflow')) this.animMap.set(el, anims);

    // 0.9.0 - things that live beside the style attribute: texture shimmer, aura, range sliders
    this.applyTextureShimmer(el, builtTex, builtTex ? Math.max(...textureVal.map((l) => l.animate || 0)) : 0, texUserLayers);
    this.applyAura(el, auraGlowVal, auraPartsVal);
    this.applySlider(el, sliderVal);
    this.applyTilt(el, tiltVal);

    // v0.5.0 - overlap bookkeeping: remember (or forget) the element's policy.
    // The collision pass itself runs rAF-deferred after the drain; a policy
    // that stops matching also drops any nudge it was carrying.
    if (overlapVal) {
      this.overlapPolicy.set(el, overlapVal);
      this.overlapEls.add(el);
      this._overlapDirty = true;
    } else if (this.overlapPolicy.has(el)) {
      this.overlapPolicy.delete(el);
      this.overlapEls.delete(el);
      if (this.nudgedEls.has(el)) this.clearNudge(el);
    }
  }

  /* ------------------------------------------------------------ *
   * v0.5.0 - overlap: nothing below 100% opacity may overlap
   * ------------------------------------------------------------ */

  scheduleOverlap() {
    if (this.frozen) return;         // v0.7.0 - frozen: nothing moves, ever
    if (this._overlapRaf) return;
    this._overlapRaf = requestAnimationFrame(() => {
      this._overlapRaf = 0;
      this.resolveOverlaps();
    });
  }

  clearNudge(el) {
    this.nudges.delete(el);
    this.nudgedEls.delete(el);
    try { el.style.translate = ''; } catch { }
  }

  setNudge(el, n) {
    this.nudges.set(el, n);
    this.nudgedEls.add(el);
    try { el.style.translate = `${n.x}px ${n.y}px`; } catch { }
  }

  /* One collision pass. Walks the tree once for boxes, resolves candidates
   * biggest-first (big boxes anchor, small decorations yield), and writes
   * each mover's escape offset through the `translate` channel - a separate
   * transform track, so DSSL transforms and WAAPI animations never notice. */
  resolveOverlaps() {
    if (!this.overlapEls.size) return;
    const root = this.scope || document.body;
    if (!root || !root.isConnected) return;
    const docEl = document.documentElement;

    const cands = [];
    const obst = [];
    let order = 0;

    const walk = (el, inherited) => {
      const own = this.overlapPolicy.get(el);
      const eff = own || inherited;           // nearest explicit policy wins - CSS-style inheritance
      if (el !== docEl && el !== document.body) {
        const r = el.getBoundingClientRect();
        if (r.width > 0.5 && r.height > 0.5) {
          let cs;
          try { cs = getComputedStyle(el); } catch { cs = null; }
          if (cs && cs.visibility === 'visible') {
            const n = this.nudges.get(el);
            const nx = n ? n.x : 0, ny = n ? n.y : 0;
            const base = {
              left: r.left - nx, top: r.top - ny,
              right: r.right - nx, bottom: r.bottom - ny,
            };
            const box = { el, base, order: order++, area: (base.right - base.left) * (base.bottom - base.top) };
            obst.push(box);
            if (eff && eff !== 'allow') {
              const op = parseFloat(cs.opacity);
              if (eff === 'deny' || (op < 0.999 && op > 0.001)) cands.push(box);
            }
          }
        }
      }
      for (const c of el.children) walk(c, eff);
    };
    walk(root, 'allow');

    if (!cands.length) { this.dropStaleNudges(new Set()); return; }

    // bigger boxes anchor - a 300px glow yielding to a 12px badge is backwards
    cands.sort((a, b) => b.area - a.area || a.order - b.order);

    const placed = new Map();   // box → nudge, visible to candidates resolved after it
    for (const c of cands) {
      // ancestors/descendants always “overlap” their own tree - that is
      // containment, not collision. Everything else is fair game.
      const others = [];
      for (const o of obst) {
        if (o.el === c.el) continue;
        if (o.el.contains(c.el) || c.el.contains(o.el)) continue;
        const n = placed.get(o);
        others.push(n ? shiftBox(o.base, n) : o.base);
      }
      const n = overlapNudge(c.base, others);
      if (n.x || n.y) placed.set(c, n);
    }

    const keep = new Set();
    for (const [box, n] of placed) {
      keep.add(box.el);
      const cur = this.nudges.get(box.el);
      if (!cur || cur.x !== n.x || cur.y !== n.y) this.setNudge(box.el, n);
    }
    // a candidate that stopped wanting (opacity settled back to 1, policy
    // removed, layout changed) lets go of its nudge
    this.dropStaleNudges(keep);
  }

  dropStaleNudges(keep) {
    for (const el of [...this.nudgedEls]) {
      if (keep.has(el)) continue;
      this.clearNudge(el);
    }
  }

  /* ------------------------------------------------------------ *
   * v0.6.0 - bend-around: a container's children on an arc
   * ------------------------------------------------------------ */

  /* Runs after every drain (like stagger): reads each arc container's width
   * and lays its element children along the circle. A rotation around a far
   * pivot also swings the child sideways by R·sin(θ) - left alone, the row
   * would end up twice as wide and clip. So the arc is laid in three beats:
   * strip the previous arc to read the flex-truth, rotate to measure the
   * swing, then translate the swing away. The row keeps its footprint; only
   * the lift and the tilt remain. Children's own cascade transforms run
   * inside the arc rotation, so hover bends keep working on curved menus. */
  applyArc() {
    if (!this.arcMap.size) return;
    for (const [el, deg] of this.arcMap) {
      if (!el.isConnected) { this.arcMap.delete(el); this.resetArc(el); continue; }
      const kids = [];
      for (const c of el.children) if (c.nodeType === 1) kids.push(c);
      const layout = arcLayout(kids.length, el.clientWidth, deg);
      if (!layout) { this.clearArcOn(el); continue; }
      const last = this.arcPrev.get(el) || new Map();
      const ownOf = (kid) => {
        const m = this.ownMap.get(kid);
        const t = m && m.get('transform');
        const o = m && m.get('transform-origin');
        return { t: t ? t.value : '', o: o ? o.value : '' };
      };
      const originY = (kid) =>
        `50% ${Math.round((kid.offsetHeight / 2 + layout.R * (deg > 0 ? 1 : -1)) * 100) / 100}px`;
      const centerX = (kid) => {
        const r = kid.getBoundingClientRect();
        return r.left + r.width / 2;
      };

      // beat 1 - strip the previous arc so the boxes are the layout's truth
      kids.forEach((kid, i) => {
        if (!last.has(kid)) return;
        const own = ownOf(kid);
        try { kid.style.setProperty('transform', own.t); } catch { }
        try { kid.style.setProperty('transform-origin', own.o); } catch { }
      });
      const baseX = kids.map(centerX);

      // beat 2 - pure rotation around the far pivot, then measure the swing
      kids.forEach((kid, i) => {
        const own = ownOf(kid);
        try {
          kid.style.setProperty('transform-origin', originY(kid));
          kid.style.setProperty('transform', `rotate(${layout.angles[i]}deg)` + (own.t ? ' ' + own.t : ''));
        } catch { }
      });
      const swungX = kids.map(centerX);

      // beat 3 - translate the swing away; the arc keeps the row's width.
      // Always write: beat 2 just clobbered these properties with the
      // measuring rotation, so a "same as last time" diff would skip the
      // restore and leave the raw rotated state on the element.
      const nextMap = new Map();
      kids.forEach((kid, i) => {
        const own = ownOf(kid);
        const dx = Math.round((baseX[i] - swungX[i]) * 100) / 100;
        const t = (dx ? `translateX(${dx}px) ` : '') +
          `rotate(${layout.angles[i]}deg)` + (own.t ? ' ' + own.t : '');
        const o = originY(kid);
        try { kid.style.setProperty('transform', t); } catch { }
        try { kid.style.setProperty('transform-origin', o); } catch { }
        nextMap.set(kid, { t, o });
      });
      for (const [kid] of last) if (!nextMap.has(kid)) this.restoreArcChild(kid);
      this.arcPrev.set(el, nextMap);
    }
  }

  /* The arc rule stopped matching (or the box can't arc): hand every child
   * its cascade-owned transform back, or drop the properties entirely. */
  resetArc(el) { this.clearArcOn(el); }

  clearArcOn(el) {
    const last = this.arcPrev.get(el);
    if (!last) return;
    for (const kid of last.keys()) this.restoreArcChild(kid);
    this.arcPrev.delete(el);
  }

  restoreArcChild(kid) {
    if (!kid || kid.nodeType !== 1) return;
    const own = this.ownMap.get(kid);
    const t = own && own.get('transform');
    const o = own && own.get('transform-origin');
    try { if (t) kid.style.setProperty('transform', t.value); else kid.style.removeProperty('transform'); } catch { }
    try { if (o) kid.style.setProperty('transform-origin', o.value); else kid.style.removeProperty('transform-origin'); } catch { }
  }

  /* ------------------------------------------------------------ *
   * `seen` state + stagger choreography (v0.4.0)
   * ------------------------------------------------------------ */

  isSeen(el) {
    // no IntersectionObserver → everything counts as seen: content must
    // never be trapped invisible by a missing API.
    return !this.io || this.seenSet.has(el);
  }

  observeSeen(el) {
    if (!this.io) return;
    try { this.io.observe(el); } catch { } // re-observe is a no-op per spec
  }

  /* A parent with `stagger: 60` offsets each element child's animation delay
   * by its DOM position, so lists and grids cascade in. Runs after every
   * compute drain, so animations created by a late `seen` still get a slot. */
  applyStagger() {
    if (!this.staggerEls.size) return;
    for (const [el, ms] of this.staggerEls) {
      if (!el.isConnected) { this.staggerEls.delete(el); continue; }
      const kids = el.children;
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i];
        if (kid.nodeType !== 1) continue;
        const anims = this.animMap.get(kid);
        if (!anims || !anims.size) continue;
        anims.forEach(a => {
          try {
            // v0.4.1: only touch timing when the slot actually changed
            const cur = a.effect && a.effect.getTiming ? a.effect.getTiming().delay : null;
            if (cur !== i * ms && a.effect && a.effect.updateTiming) a.effect.updateTiming({ delay: i * ms });
          } catch { }
        });
      }
    }
  }

  /* The stagger rule stopped matching - cancel the children's shifted
   * animations so they restart with their own declared delays. */
  resetStagger(el) {
    for (const kid of el.children) {
      if (kid.nodeType !== 1) continue;
      const anims = this.animMap.get(kid);
      if (!anims || !anims.size) continue;
      anims.forEach(a => { try { a.cancel(); } catch { } });
      anims.clear();
      this.schedule([kid]);
    }
  }

  /* ------------------------------------------------------------ *
   * Signals (JS → styles bridge)
   * ------------------------------------------------------------ */

  /** DSSL.signal(name, value) sets it for the whole page; DSSL.signal(name, value, el) only for el and what is inside it (the
   *  nearest one wins). Booleans and numbers stay booleans and numbers for getSignal(); the data-dssl-signal-* mirror is text. */
  signal(name, value, scope) {
    const off = value === null || value === undefined;
    const target = scope && scope.nodeType === 1 ? scope : null;
    if (target) {
      let m = this.scopedSignals.get(target);
      if (off) { if (m && m.delete(name)) { this.scopedCount--; if (!m.size) this.scopedSignals.delete(target); } }
      else {
        if (!m) { m = new Map(); this.scopedSignals.set(target, m); }
        if (!m.has(name)) this.scopedCount++;
        m.set(name, value);
      }
    } else if (off) this.signalStore.delete(name);
    else this.signalStore.set(name, value);
    // DevTools-visible mirror
    try {
      const host = target || document.documentElement;
      if (off) host.removeAttribute('data-dssl-signal-' + name);
      else host.setAttribute('data-dssl-signal-' + name, String(value));
    } catch { }
    // 0.15.0: only the rules that mention this signal are looked at, and only the elements they select (inside the scope, if given),
    // not the whole page. A burst of signals in one task is one pass.
    if (!this._sigNames) this._sigNames = new Set();
    this._sigNames.add(name);
    if (target) { if (!this._sigScopes) this._sigScopes = new Set(); this._sigScopes.add(target); } else this._sigGlobal = true;
    // v0.7.0 - a frozen engine has no ambient drain, but an explicit signal()
    // is a developer action: drain synchronously so signals keep working
    // while the observers sleep.
    if (this.frozen) { this.freezeNotice(); this.flushSignals(); return; }
    if (this._sigQueued) return;
    this._sigQueued = true;
    queueMicrotask(() => { this._sigQueued = false; this.flushSignals(); });
  }

  flushSignals() {
    const names = this._sigNames;
    if (!names || !names.size) return;
    const scopes = this._sigScopes, global = this._sigGlobal;
    this._sigNames = null; this._sigScopes = null; this._sigGlobal = false;
    const rules = this.rules.filter((r) => r.signals.some((x) => names.has(x.name)));
    const shadows = this.sigShadowIdx.map((i) => this.shadowRules[i]).filter((r) => r.signals.some((x) => names.has(x.name)));
    if (!rules.length && !shadows.length) return;       // nothing is styled by this signal
    const rootEl = this.scope || document.documentElement;
    const root = this.scope || document;
    const els = new Set();
    for (const rule of rules) {
      if (rule.sel === ':root') { els.add(rootEl); continue; }
      let sel = rule.sel;
      if (rule.states.has('seen')) sel = sel.replace(/:seen\b/g, '') || '*';
      let found;
      try { found = root.querySelectorAll(sel); } catch { continue; }
      found.forEach((el) => els.add(el));
    }
    for (const r of shadows) { try { root.querySelectorAll(this.sigShadowBase(r)).forEach((el) => els.add(el)); } catch { /* bad selector */ } }
    const inside = (el) => { if (global) return true; for (const sc of scopes) if (sc === el || sc.contains(el)) return true; return false; };
    this._applying = true;
    try { for (const el of els) if (inside(el)) this.computeElement(el); }
    finally { this._applying = false; }
    this.applyStagger();
    this.applyArc();
    this.scheduleOverlap();
  }

  getSignal(name, el) { return this.sigLookup(el, name).val; }

  /* ------------------------------------------------------------ *
   * v0.7.0 - freeze / unfreeze: the speed escape hatch.
   *
   * The runtime model (live DOM walk + MutationObserver + inline styles)
   * is heavier than CSS by design - that is the price of being live. But
   * a page that does not need LIVE restyling should not keep paying for
   * it. freeze() detaches every observer and listener - MutationObserver,
   * ResizeObserver, IntersectionObserver, matchMedia, state events, the
   * overlap heartbeat - and leaves the resolved inline styles exactly
   * where they are. The page keeps its look at zero engine cost, which
   * is what makes big pages viable. Explicit developer calls (apply,
   * signal, refresh, replay) still drain; everything ambient sleeps.
   * unfreeze() re-arms the whole surface and recomputes once.
   * ------------------------------------------------------------ */

  freezeStats() {
    return {
      frozen: !!this.frozen,
      engine: this.name,
      elements: this.touched.size,
      rules: this.rules.length,
      shadowRules: this.shadowRules.length,
    };
  }

  freeze() {
    if (this.frozen) return this.freezeStats();
    this.frozen = true;
    try { if (this._mo) this._mo.disconnect(); } catch { }
    try { if (this.io) this.io.disconnect(); } catch { }
    try { if (this.ro) this.ro.disconnect(); } catch { }
    for (const l of this._listeners || []) {
      try { l.target.removeEventListener(l.type, l.fn, l.opts); } catch { }
    }
    if (this._overlapTimer) { clearInterval(this._overlapTimer); this._overlapTimer = null; }
    if (this._overlapRaf) { cancelAnimationFrame(this._overlapRaf); this._overlapRaf = 0; }
    if (this.aura) this.aura.pause();   // 0.9.0: a frozen page does not animate
    for (const el of this.texEls) { const a = this.texAnims.get(el); if (a) { try { a.cancel(); } catch { } } this.texAnims.delete(el); }
    this.texEls.clear();
    for (const t of this.tiltEls.values()) t.stop();
    this.tiltEls.clear();
    this.pending.clear();
    return this.freezeStats();
  }

  unfreeze() {
    if (!this.frozen) return this.freezeStats();
    this.frozen = false;
    // disconnect() dropped every per-element observation - rebuild the seen
    // observer from scratch (computeAll re-observes its candidates), re-arm
    // the state listeners, re-observe known containers, re-watch the DOM.
    this.io = this.makeSeenObserver();
    if (!this.ro && typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.scheduleComputeAll());
    }
    for (const el of this.containerEls) { try { this.ro.observe(el); } catch { } }
    for (const l of this._listeners || []) {
      try { l.target.addEventListener(l.type, l.fn, l.opts); } catch { }
    }
    if (this._mo) {
      const doc = this.scope ? this.scope : document.documentElement;
      try { this._mo.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: undefined }); } catch { }
    }
    this.startOverlapTimer();
    if (this.aura) this.aura.resume();
    this.computeAll();
    return this.freezeStats();
  }

  /* ------------------------------------------------------------ *
   * v0.7.0 - explain(): the DevTools answer to "which rule wrote
   * this one declaration?". Inline styles trade the cascade for a
   * style attribute; explain() gives the cascade back as data: every
   * matched rule with its file/line, and the winning declaration per
   * property with the rule that won it.
   * ------------------------------------------------------------ */

  explain(el) {
    if (!el || el.nodeType !== 1) return null;
    if (!this.inScope(el)) return null;
    const matched = [];
    const rootEl = this.scope || document.documentElement;
    for (const rule of this.rules) {
      if (rule.sel === ':root') {
        if (el !== rootEl) continue;
      } else {
        let sel = rule.sel;
        if (rule.states.has('seen')) {
          if (!this.isSeen(el)) { this.observeSeen(el); continue; }
          sel = sel.replace(/:seen\b/g, '') || '*';
        }
        const gate = rule._gate !== undefined ? rule._gate : (rule._gate = gateFor(rule.sel));
        if (gate && !gatePass(el, gate)) continue;
        if (!this.matches(el, sel)) continue;
      }
      if (!rule.media.every(q => this.mql(q).matches)) continue;
      if (!this.signalsPass(rule, el)) continue;
      if (!this.containerPass(el, rule)) continue;
      matched.push(rule);
    }
    matched.sort((a, b) =>
      (LAYER_RANK[a.layer] ?? 2) - (LAYER_RANK[b.layer] ?? 2) || a.order - b.order
    );

    // cascade replay: the LAST declaration of a property wins, exactly like
    // the SET pass - this is the answer to "what actually applied, and what
    // did it beat?"
    const wins = new Map();
    for (const rule of matched) {
      const imp = rule.layer === 'pin' ? 'important' : '';
      for (const d of rule.decls) {
        wins.set(d.prop, {
          prop: d.prop, value: d.value, imp,
          by: { id: rule.id, sel: rule.sel, layer: rule.layer, file: rule.file, line: rule.line },
        });
      }
    }

    // pseudo-element rules that target this element (the shadow-CSS path)
    const pseudo = [];
    for (const r of this.shadowRules) {
      const sel = r.sel || '*';
      if (!this.matches(el, sel)) continue;
      if (!r.media.every(q => this.mql(q).matches)) continue;
      if (!this.signalsPass(r, el)) continue;
      if (!this.containerPass(el, r)) continue;
      pseudo.push({ sel: r.sel, pseudo: r.pseudo, layer: r.layer, file: r.file, line: r.line, decls: r.decls });
    }

    return {
      element: el,
      frozen: !!this.frozen,
      matched: matched.map(r => ({
        id: r.id, sel: r.sel, layer: r.layer, order: r.order,
        file: r.file, line: r.line,
        states: [...r.states], media: r.media, signals: r.signals,
        decls: r.decls,
      })),
      wins: [...wins.values()],
      pseudo,
    };
  }

  /* ------------------------------------------------------------ *
   * Pseudo-elements → shadow CSS (the only real CSS we emit)
   * ------------------------------------------------------------ */

  renderShadow() {
    const idAttr = 'data-dssl-engine';
    let host = this.scope;
    if (this.scope && !this.scope.hasAttribute(idAttr)) this.scope.setAttribute(idAttr, this.name);

    const prefix = this.scope ? `[${idAttr}="${this.name}"] ` : '';

    const cssFor = (r, idx) => {
      // 0.15.0: a pseudo-element rule behind a @signal is switched by a marker the engine keeps on the element (data-dssl-s lists the rule
      // numbers that are on for it). The engine already knows which signal value an element sees (the nearest scope wins), which CSS cannot say.
      let sel = prefix + r.sel + (r.signals.length ? `[data-dssl-s~="${idx}"]` : '') + '::' + r.pseudo;
      let body = r.decls.filter((d) => !d.prop.startsWith('@')).map(d => `  ${d.prop}: ${d.value};`).join('\n');
      // 0.14.0: animate: on ::before / ::after is a CSS animation (WAAPI cannot reach a pseudo-element). Unless the motion is
      // essential it sits behind the reduced-motion check, with data-dssl-motion able to force it on or off.
      const ans = r.decls.filter((d) => d.prop === '@animate' && d.value && animationShorthand(d.value));
      const list = (xs) => xs.map((d) => animationShorthand(d.value)).join(', ');
      let extra = '';
      if (ans.length) {
        // the essential ones always run (so does everything behind a signal); the rest wait for the reduced-motion check
        const always = r.signals.length ? ans : ans.filter((d) => d.value.essential);
        if (always.length) body += `${body ? '\n' : ''}  animation: ${list(always)};`;
        if (always.length < ans.length) {
          const mk = (s) => `${s} {\n  animation: ${list(ans)};\n}`;
          extra = `\n\n@media (prefers-reduced-motion: no-preference) {\n${mk('html:not([data-dssl-motion="reduced"]) ' + sel)}\n}\n\n${mk('html[data-dssl-motion="full"] ' + sel)}`;
        }
      }
      let out = `${sel} {\n${body}\n}${extra}`;
      for (const q of [...r.media].reverse()) out = `@media ${q} {\n${out}\n}`;
      for (const c of [...r.containers].reverse()) out = `@container ${c} {\n${out}\n}`;
      return out;
    };

    this.sigShadowIdx = [];
    this.shadowRules.forEach((r, i) => { if (r.signals.length) this.sigShadowIdx.push(i); });
    let css = this.shadowRules.map(cssFor).join('\n\n');
    // 0.14.0: every motion is also a real @keyframes, so `animation: name 400ms` and its longhands (animation-delay...) work in
    // plain DSSL too, not only through animate:
    const kf = keyframesCss(this.motionFrames);
    if (kf.length) css += '\n\n' + kf.join('\n\n');

    // v0.8.0 - raw { } blocks: verbatim CSS (@font-face, @keyframes,
    // @supports, @import…), appended after the pseudo-element rules
    if (this.raws && this.raws.length) {
      css += '\n\n' + this.raws.map(r => r.css).join('\n\n');
    }

    if (this.reset) {
      css += `

/* dssl reset */
:where(html) { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
:where(html *, html *::before, html *::after) { box-sizing: border-box; }
:where(body) { margin: 0; }
:where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,pre) { margin: 0; }
:where(ul,ol) { margin: 0; padding: 0; list-style: none; }
:where(img,picture,video,canvas,svg) { display: block; max-width: 100%; }
:where(input,button,textarea,select) { font: inherit; color: inherit; letter-spacing: inherit; }
:where(a) { color: inherit; text-decoration: none; }
:where(button) { background: none; border: none; padding: 0; cursor: pointer; }
:where(table) { border-collapse: collapse; }`;
    }

    this.writeShadowCss(`/* generated by DSSL engine "${this.name}" - pseudo-elements + reset only */\n` + css);
  }

  /**
   * 0.13.0: a page with a strict Content-Security-Policy (no 'unsafe-inline' in style-src) refuses a <style> element made by
   * script, but allows a constructed stylesheet, so that is what the engine uses. Everything else it does to styles goes
   * through the CSSOM (el.style.setProperty), which the policy has always allowed. The <style> fallback is for browsers
   * without constructable stylesheets, and for raw CSS that contains @import, which a constructed sheet ignores; it carries
   * the page's nonce when there is one.
   */
  writeShadowCss(css) {
    const canAdopt = typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in document && typeof CSSStyleSheet.prototype.replaceSync === 'function';
    if (canAdopt && !/@import\b/.test(css)) {
      try {
        if (!this._sheet) { this._sheet = new CSSStyleSheet(); document.adoptedStyleSheets = [...document.adoptedStyleSheets, this._sheet]; }
        this._sheet.replaceSync(css);
        if (this.shadowStyle) { this.shadowStyle.remove(); this.shadowStyle = null; }
        return;
      } catch { /* fall through to a <style> element */ }
    }
    if (!this.shadowStyle) {
      this.shadowStyle = document.createElement('style');
      this.shadowStyle.setAttribute('data-dssl-shadow', this.name);
      const nonce = pageNonce();
      if (nonce) this.shadowStyle.setAttribute('nonce', nonce);
      document.head.appendChild(this.shadowStyle);
    }
    this.shadowStyle.textContent = css;
  }

  /* ------------------------------------------------------------ *
   * Replay animations
   * ------------------------------------------------------------ */

  replay(selector) {
    const root = this.scope || document;
    let els;
    try { els = selector ? root.querySelectorAll(selector) : root.querySelectorAll('*'); } catch { return; }
    this._applying = true;
    for (const el of els) {
      const anims = this.animMap.get(el);
      if (!anims) continue;
      anims.forEach(a => { try { a.cancel(); } catch { } });
      anims.clear();
      this.computeElement(el);
    }
    this._applying = false;
    this.applyStagger();
    this.applyArc();            // v0.6.0 - bend-around arcs after every drain
    this.scheduleOverlap();     // v0.5.0
  }
}

/* ------------------------------------------------------------------ *
 * v0.5.0 - the escape math, exported pure for tests.
 *
 * Greedy minimal-translation: against every overlapping obstacle, the
 * four single-axis escapes are measured and the shortest one wins; repeat
 * until the box is clear (or 16 rounds, for sandwiched boxes that cannot
 * fully clear). Touching edges are not overlap - sub-pixel kiss does not
 * count, or two stacked cards with shared borders would tremble forever.
 * ------------------------------------------------------------------ */
export function overlapNudge(base, obstacles) {
  let r = { ...base };
  let tx = 0, ty = 0;
  for (let i = 0; i < 16; i++) {
    let best = null, bestMag = Infinity;
    for (const o of obstacles) {
      const ox = Math.min(r.right, o.right) - Math.max(r.left, o.left);
      const oy = Math.min(r.bottom, o.bottom) - Math.max(r.top, o.top);
      if (ox <= 0.01 || oy <= 0.01) continue;
      const opts = [
        [o.right - r.left, 0],   // push right
        [o.left - r.right, 0],   // push left
        [0, o.bottom - r.top],   // push down
        [0, o.top - r.bottom],   // push up
      ];
      for (const d of opts) {
        const mag = Math.abs(d[0]) + Math.abs(d[1]);
        if (mag < bestMag) { bestMag = mag; best = d; }
      }
    }
    if (!best) break;
    tx += best[0]; ty += best[1];
    r = { left: r.left + best[0], right: r.right + best[0], top: r.top + best[1], bottom: r.bottom + best[1] };
  }
  const rnd = (v) => Math.round(v * 100) / 100;
  return { x: rnd(tx), y: rnd(ty) };
}

function shiftBox(b, n) {
  return { left: b.left + n.x, right: b.right + n.x, top: b.top + n.y, bottom: b.bottom + n.y };
}

/* ------------------------------------------------------------------ *
 * v0.7.0 - the gate prefilter, exported pure for tests.
 *
 * computeElement used to call el.matches() for every rule on every
 * element: O(elements × rules) native calls, most of which failed on
 * the first class check anyway. A gate extracts the CHEAP NECESSARY
 * conditions from each selector's rightmost compound - classes, id,
 * tag - so the native call is skipped when the element obviously
 * cannot match. Contract: a gate may only ever say NO. Anything this
 * little parser does not fully understand (attribute selectors, quoted
 * strings, escapes, unicode, weird commas) bails to null = no
 * filtering. A missed optimization is always better than a missed
 * match.
 * ------------------------------------------------------------------ */

// characters we are willing to reason about at selector level; parens
// are allowed because :not()/:is()/:has()/:nth-child() get their inner
// lists stripped compound-by-compound. Quotes and [attrs] bail.
const GATE_CHARS = /^[A-Za-z0-9_\-#.:>~+\s*(),]+$/;

export function gateFor(sel) {
  if (!sel || sel === ':root' || sel === '*') return null;
  if (!GATE_CHARS.test(sel)) return null;
  // paren-aware top-level comma split - :is(.a,.b) span is ONE part
  const parts = [];
  {
    let depth = 0, cur = '';
    for (const ch of sel) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    parts.push(cur);
  }
  const gates = [];
  for (let part of parts) {
    part = part.trim();
    if (!part) return null;
    // rightmost compound: split at depth-0 combinators (space, >, +, ~)
    let depth = 0, start = 0;
    const compounds = [];
    for (let i = 0; i < part.length; i++) {
      const c = part[i];
      if (c === '(') { depth++; continue; }
      if (c === ')') { depth = Math.max(0, depth - 1); continue; }
      if (depth === 0 && (c === '>' || c === '+' || c === '~' || c === ' ')) {
        if (i > start) compounds.push(part.slice(start, i));
        start = i + 1;
      }
    }
    if (start < part.length) compounds.push(part.slice(start));
    if (!compounds.length) return null;
    let compound = compounds[compounds.length - 1].trim();
    if (!compound) return null;
    // inner selector lists (:not(.a, .b), :is(…)) are NOT requirements -
    // their classes/tags do not constrain the element, so strip every
    // paren group before extracting keys.
    let prev;
    do { prev = compound; compound = compound.replace(/\([^()]*\)/g, ''); } while (compound !== prev);
    if (!compound) { gates.push(null); continue; } // bare :is(...) - no filter
    if (!/^[A-Za-z0-9_\-#.:*\s]+$/.test(compound)) return null;
    const g = { tag: null, id: null, classes: [] };
    const tagM = compound.match(/^[A-Za-z][A-Za-z0-9-]*/);
    if (tagM && tagM[0] !== '*') g.tag = tagM[0].toUpperCase();
    const idM = compound.match(/#([A-Za-z0-9_-]+)/);
    if (idM) g.id = idM[1];
    const clsRe = /\.([A-Za-z0-9_-]+)/g;
    let cm;
    while ((cm = clsRe.exec(compound))) g.classes.push(cm[1]);
    if (!g.tag && !g.id && !g.classes.length) { gates.push(null); continue; }
    gates.push(g);
  }
  return gates.some(g => g) ? gates : null;
}

/* Duck-typed on purpose: tests drive it with fake elements. */
/* v0.7.2 - stateReach: where can a state change reach in the DOM?
 * Pure and exported for tests. Given a stateful selector and the state that
 * just flipped on some element, it answers:
 *   null              → subject-state (state on the rightmost compound): only
 *                       the event chain can change, no query needed at all
 *   { fallback:true } → the cheap strip cannot handle it (:has()/:not()
 *                       wrappers): caller keeps the page-wide superset
 *   { prefix, rest }  → batch every chain element matching `prefix` (the part
 *                       up to and including the stateful compound, states
 *                       stripped) and query `:scope` + `rest` under each
 *   { prefix, sib, firstSeg, restAfter } → the tail starts with a sibling
 *                       combinator; walk that element's siblings manually
 *                       (querySelectorAll cannot leave the subtree)
 */
export function stateReach(sel, state) {
  const segs = [];
  let depth = 0, cur = '', pendingComb = '';
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === '>' || c === '+' || c === '~' || /\s/.test(c))) {
      const comb = c === ' ' ? ' ' : c;
      if (cur.trim()) { segs.push({ comb: pendingComb || ' ', seg: cur.trim() }); cur = ''; pendingComb = comb; }
      else if (comb !== ' ') pendingComb = comb;
      continue;
    }
    cur += c;
  }
  if (cur.trim()) segs.push({ comb: pendingComb || ' ', seg: cur.trim() });
  if (segs.length <= 1) return null;
  const idx = segs.findIndex(s => new RegExp(':' + state + '\\b').test(s.seg));
  if (idx === -1 || idx === segs.length - 1) return null;
  const prefix = segs.slice(0, idx + 1).map(s => s.seg).join(' ').replace(STATE_PSEUDO_RE, '').trim();
  if (!prefix || /\(\s*\)/.test(prefix)) return { fallback: true };
  const tail = segs.slice(idx + 1);
  if (tail[0].comb === '+' || tail[0].comb === '~') {
    const restAfter = tail.slice(1).map(s => (s.comb === ' ' ? ' ' : ' ' + s.comb + ' ') + s.seg).join('').trim();
    return { prefix, sib: tail[0].comb, firstSeg: tail[0].seg, restAfter };
  }
  const rest = tail.map(s => (s.comb === ' ' ? ' ' : ' ' + s.comb + ' ') + s.seg).join('').trim();
  return { prefix, rest };
}

export function gatePass(el, gate) {
  if (!gate) return true;
  for (const g of gate) {
    if (!g) return true;   // one unfilterable part keeps the rule a candidate
    if (g.tag && String(el.tagName).toUpperCase() !== g.tag) continue;
    if (g.id && el.id !== g.id) continue;
    let ok = true;
    for (const c of g.classes) {
      if (!el.classList.contains(c)) { ok = false; break; }
    }
    if (!ok) continue;
    return true;
  }
  return false;
}
