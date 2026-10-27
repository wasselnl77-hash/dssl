/* =========================================================================
 * DSSL - index.js - public API + auto-boot
 *
 *   import '/dssl/index.js'        // or <script type="module" src="/dssl/index.js">
 *
 *   DSSL.load(['/styles/site.dssl'])          // fetch + apply
 *   DSSL.apply(source, { name, scope })       // apply a source string
 *   DSSL.compile(source)                      // parse + resolve only (no DOM)
 *   DSSL.signal('theme', 'dark')              // JS → styles bridge
 *   DSSL.refresh() / DSSL.replay(sel) / DSSL.errors
 *
 * Auto-boot: any <link rel="stylesheet/dssl" href="…"> or
 * <style type="text/dssl"> on the page is fetched/applied on load.
 * Add <html data-dssl-reset> to also get the small built-in reset.
 * ========================================================================= */

import { parse } from './parser.js';
import { resolve, DEFAULT_TOKENS, EASINGS } from './resolver.js';
import { toCSS as docToCSS } from './static.js';
import { DsslEngine } from './engine.js';

export const VERSION = '0.16.0';

let counter = 0;
const loadedUrls = new Set();   // every .dssl file fetched by load(), so DSSL.watch() knows what to follow
const engines = new Map();
let lastErrors = [];

// Token registry shared across bundles: tokens.dssl defines the palette,
// every later stylesheet resolves against it.
const tokenRegistry = new Map(Object.entries(DEFAULT_TOKENS));
// ...and so do motions (0.14.0): `motion waddle { }` in one file can be used by `animate: waddle` in another
const motionRegistry = new Map();

function getEngine(opts = {}) {
  if (!opts.scope) {
    if (!engines.has('global')) {
      engines.set('global', new DsslEngine({ scope: null, name: 'global', reset: !!opts.reset || document.documentElement.hasAttribute('data-dssl-reset') }));
    }
    return engines.get('global');
  }
  const el = typeof opts.scope === 'string' ? document.querySelector(opts.scope) : opts.scope;
  if (!el) throw new Error('[DSSL] scope not found: ' + opts.scope);
  const key = 'scope:' + (el.getAttribute('data-dssl-engine') || (el.setAttribute('data-dssl-engine', 'scoped-' + engines.size), 'scoped-' + engines.size));
  if (!engines.has(key)) engines.set(key, new DsslEngine({ scope: el, name: el.getAttribute('data-dssl-engine'), reset: !!opts.reset }));
  return engines.get(key);
}

function reportErrors(errors, file) {
  lastErrors = errors;
  if (!errors.length) return;
  try {
    console.groupCollapsed(`%c[DSSL] ${errors.length} issue(s) in ${file}`, 'color:#b3372e;font-weight:bold');
    for (const e of errors) {
      console.warn(`${e.file || ''}${e.file ? ':' : ''}${e.line ?? ''} - ${e.message}${e.hint ? `\n    did you mean "${e.hint}"?` : ''}`);
    }
    console.groupEnd();
  } catch { /* very old browsers */ }
}

// v0.7.0 - warnings compile fine but are probably not what you meant.
// Non-fatal by contract (ok stays ok), loud by promise.
function reportWarnings(warnings, file) {
  if (!warnings || !warnings.length) return;
  try {
    console.groupCollapsed(`%c[DSSL] ${warnings.length} warning(s) in ${file}`, 'color:#8a6d1a;font-weight:bold');
    for (const w of warnings) {
      console.warn(`${w.file || ''}${w.file ? ':' : ''}${w.line ?? ''} - ${w.message}${w.hint ? `\n    ${w.hint}` : ''}`);
    }
    console.groupEnd();
  } catch { /* very old browsers */ }
}

/** Parse + resolve without touching the DOM. */
export function compile(source, file = 'inline.dssl') {
  const { ast, errors: parseErrors } = parse(source, file);
  const doc = resolve(ast, file, Object.fromEntries(tokenRegistry), Object.fromEntries(motionRegistry));
  const errors = [...parseErrors, ...doc.errors];
  return {
    ok: errors.length === 0,
    errors,
    warnings: doc.warnings || [],
    stats: {
      rules: doc.rules.length,
      shadowRules: doc.shadowRules.length,
      motions: Object.keys(doc.motions).length,
      tokens: Object.keys(doc.tokens).length,
      mediaQueries: doc.mediaQueries.length,
      warnings: (doc.warnings || []).length,
    },
    tokens: doc.tokens,
    doc,
  };
}

/** Apply a DSSL source string. opts: { name, scope, replace, reset } */
export function apply(source, opts = {}) {
  const name = opts.name || 'inline-' + (++counter);
  const file = name.endsWith('.dssl') ? name : name + '.dssl';
  const result = compile(source, file);
  for (const [k, v] of Object.entries(result.doc.motionFrames || {})) motionRegistry.set(k, v);
  // fold this bundle's tokens into the shared registry for later bundles
  let registryDirty = false;
  for (const [k, v] of Object.entries(result.doc.tokens || {})) {
    if (tokenRegistry.get(k) !== v) { tokenRegistry.set(k, v); registryDirty = true; }
  }
  if (!opts.keepErrors) reportErrors(result.errors, file);
  if (!opts.keepErrors) reportWarnings(result.warnings, file);
  if (result.ok || result.doc.rules.length || result.doc.shadowRules.length) {
    const engine = getEngine(opts);
    if (!opts.scope) {
      // the shared registry is installed once as the first bundle; refresh it
      // whenever any bundle's tokens changed. Scoped bundles keep their own
      // :root rules mapped onto the scope element instead.
      if (!engine.hasBundle('__dssl-tokens__') || registryDirty) {
        engine.applyBundle('__dssl-tokens__', { rules: result.doc.registryRule ? [result.doc.registryRule] : [], shadowRules: [], motions: {}, mediaQueries: [], errors: [] }, { replace: true });
      }
    }
    engine.applyBundle(name, result.doc, { replace: !!opts.replace });
  }
  return result;
}

/** Fetch and apply one or more .dssl files, in order.
 *  v0.3.2: files are fetched IN PARALLEL but applied in the order given -
 *  the old sequential await chain made six stylesheets cost six round-trips. */
export async function load(urls, opts = {}) {
  const list = Array.isArray(urls) ? urls : [urls];
  const texts = await Promise.all(list.map(async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return { url, ok: false, text: '', status: res.status };
      return { url, ok: true, text: await res.text(), status: res.status };
    } catch (e) {
      return { url, ok: false, text: '', status: 0, why: e && e.message };
    }
  }));
  const results = [];
  for (const r of texts) {
    if (!r.ok) {
      const errors = [{ file: r.url, line: 0, message: `could not load stylesheet (HTTP ${r.status || 'network error'}${r.why ? ': ' + r.why : ''})` }];
      reportErrors(errors, r.url);
      results.push({ ok: false, errors });
      continue;
    }
    loadedUrls.add(opts.name || r.url);
    results.push(apply(r.text, { ...opts, name: opts.name || r.url }));
  }
  return results;
}

/** v0.8.0 - the exit lane: compile a DSSL source string to a real CSS
 *  stylesheet (tokens → custom properties, states → :hover, @media as-is,
 *  layers → @layer, motions → @keyframes, raw { } verbatim). Returns
 *  { css, report } - report counts what was emitted and what stays
 *  engine-only (@signal rules, animate: and friends). */
export function toCSS(input, opts = {}) {
  // one source string, or several (strings or already-compiled documents) in load order: tokens fold forward like <link> order
  const list = Array.isArray(input) ? input : [input];
  const docs = [], errors = [], warnings = [];
  let base = {}, motionBase = {};
  for (const [i, item] of list.entries()) {
    if (typeof item === 'string') {
      const file = (list.length === 1 ? opts.file : (opts.files && opts.files[i])) || `inline-${i + 1}.dssl`;
      const { ast, errors: pe } = parse(item, file);
      const doc = resolve(ast, file, Object.keys(base).length ? base : Object.fromEntries(tokenRegistry), motionBase);
      docs.push(doc); errors.push(...pe, ...doc.errors); warnings.push(...(doc.warnings || []));
      base = { ...base, ...doc.tokens };
      motionBase = { ...motionBase, ...(doc.motionFrames || {}) };
    } else { docs.push(item); errors.push(...(item.errors || [])); warnings.push(...(item.warnings || [])); }
  }
  const built = docToCSS(docs.length === 1 ? docs[0] : docs, { file: opts.file || 'inline.dssl', ...opts, version: VERSION });
  return { ...built, ok: errors.length === 0, errors, warnings };
}

/** DSSL.signal('screen', 'menu') for the whole page; DSSL.signal('hp', 2, el) only for el and what is inside it (the nearest wins).
 *  Booleans and numbers are kept as they are: DSSL.getSignal('toasting') is true, not "true". */
export function signal(name, value, el) { for (const e of engines.values()) e.signal(name, value, el); }
export function getSignal(name, el) { return engines.get('global')?.getSignal(name, el); }
/** DSSL.flush() styles everything that is waiting, right now, so that computed styles and layout (offsetTop...) are final on the next line.
 *  Styling normally happens a moment after a change, in a microtask. */
export function flush() { for (const e of engines.values()) e.flush(); }
/** await DSSL.settled(): the same, for code that can wait. It also lets anything the flush itself queued finish. */
export async function settled() { flush(); await Promise.resolve(); flush(); }
/**
 * DSSL.play(el, 'boing', { duration, delay, easing, iterations, hold, essential, jitter }) runs a motion once from JavaScript and
 * returns a promise for the animation, which settles when it ends. `hold: true` keeps the final frame instead of snapping back
 * (what you want for a pop-in). It follows reduced motion like animate: does, unless the motion or the call says essential.
 * Before this you added a class, set a timer, and removed the class, once per replay.
 */
export function play(el, name, opts = {}) {
  const m = motionRegistry.get(name);
  if (!m) {
    const known = [...motionRegistry.keys()];
    const hint = didYouMeanLocal(name, known);
    return Promise.reject(new Error(`[DSSL] play: unknown motion "${name}"${hint ? ` (did you mean "${hint}"?)` : known.length ? ` (known: ${known.join(', ')})` : ' (no motion is defined yet)'}`));
  }
  if (!el || typeof el.animate !== 'function') return Promise.reject(new Error('[DSSL] play: the first argument must be an element'));
  const eng = engines.get('global');
  const reduced = eng ? eng.reducedMotion.matches : false;
  if (reduced && !m.essential && !opts.essential) return Promise.resolve(null);
  let frames = m.frames.map((f) => ({ ...f.props, offset: f.offset / 100 }));
  if (frames.length === 1) frames = frames[0].offset === 0 ? [frames[0], { offset: 1 }] : [{ offset: 0 }, frames[0]];
  const ms = (v, d) => (typeof v === 'string' ? (/ms$/.test(v) ? parseFloat(v) : /s$/.test(v) ? parseFloat(v) * 1000 : parseFloat(v)) : (v === undefined ? d : v));
  const easing = opts.easing ? (EASINGS[opts.easing] || opts.easing) : EASINGS.smooth;
  const jit = opts.jitter ? Math.round(Math.random() * ms(opts.jitter, 0)) : 0;
  let anim;
  try {
    const pseudoElement = opts.pseudo ? (String(opts.pseudo).startsWith(':') ? String(opts.pseudo) : '::' + opts.pseudo) : undefined;   // 0.15.0: DSSL.play(el, 'pop', { pseudo: '::after' })
    anim = el.animate(frames, { ...(pseudoElement ? { pseudoElement } : {}), duration: ms(opts.duration, 400), delay: ms(opts.delay, 0) + jit, easing, iterations: opts.iterations === 'infinite' ? Infinity : (opts.iterations || 1), direction: opts.direction || 'normal', fill: opts.hold ? 'forwards' : (opts.fill || 'none') });
  } catch (e) { return Promise.reject(e); }
  if (eng && eng.motionHeld) { try { anim.pause(); } catch { /* ignore */ } }
  return anim.finished.then(() => anim, () => anim);   // a cancelled animation settles too, so awaiting it never hangs
}

/**
 * For tests and for stepping a game one tick at a time. DSSL.pauseMotion() freezes every animation on the page (and every one DSSL
 * starts afterwards); DSSL.stepMotion(100) moves them all forward by 100 ms, whatever the clock says; DSSL.resumeMotion() lets them run.
 * DSSL.computed(el, 'translate') is the final computed value right now, with nothing left waiting to be styled.
 */
export function pauseMotion() { for (const e of engines.values()) e.motionHeld = true; flush(); let n = 0; for (const a of document.getAnimations()) { try { a.pause(); n++; } catch { /* ignore */ } } return n; }
export function stepMotion(ms = 16.7) {
  const n = pauseMotion();
  for (const a of document.getAnimations()) {
    try {
      const t = Number(a.currentTime) || 0;
      a.currentTime = t + ms;
    } catch { /* ignore */ }
  }
  return n;
}
export function resumeMotion() { for (const e of engines.values()) e.motionHeld = false; let n = 0; for (const a of document.getAnimations()) { try { if (a.playState === 'paused') { a.play(); n++; } } catch { /* ignore */ } } return n; }
export function computed(el, prop, pseudo) {
  flush();
  const cs = getComputedStyle(el, pseudo || null);
  return prop.includes('-') ? cs.getPropertyValue(prop) : (cs[prop] !== undefined ? cs[prop] : cs.getPropertyValue(prop));
}

/** DSSL.auraZ(20): the z-index of the one canvas aura draws on (default: above everything). Menus and overlays with a higher z-index then cover it. */
export function auraZ(z) {
  const root = document.documentElement;
  if (z === null || z === undefined) root.removeAttribute('data-dssl-aura-z'); else root.setAttribute('data-dssl-aura-z', String(z));
  for (const e of engines.values()) if (e.aura && e.aura.canvas) e.aura.canvas.style.zIndex = z === null || z === undefined ? '2147483000' : String(z);
  return z;
}

/** DSSL.motion('full') runs every animate: whatever the system asks for, 'reduced' holds them all still, 'auto' follows the system */
export function motion(mode = 'auto') {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-dssl-motion'); else root.setAttribute('data-dssl-motion', mode === 'full' ? 'full' : 'reduced');
  for (const e of engines.values()) {
    // stop what is running, then let the recompute start only what the new mode allows
    for (const el of e.touched) { const m = e.animMap.get(el); if (m) { m.forEach((a) => { try { a.cancel(); } catch { } }); m.clear(); } }
    e.computeAll();
  }
  return mode;
}

// a tiny did-you-mean for play(), so index.js does not need utils for it
function didYouMeanLocal(w, list) {
  let best = null, bd = 3;
  for (const c of list) {
    const a = w, b = c; const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (d[a.length][b.length] < bd) { bd = d[a.length][b.length]; best = c; }
  }
  return best;
}

/** DSSL.refresh() restyles the whole page; DSSL.refresh(el) restyles that subtree, even if it is static */
export function refresh(root) { for (const e of engines.values()) { if (root && root.nodeType === 1) e.refreshSubtree(root); else e.computeAll(); } }
export function replay(selector) { for (const e of engines.values()) e.replay(selector); }
export function errors() { return lastErrors; }
export function version() { return VERSION; }

// v0.7.0 - freeze()/unfreeze() every engine: the whole page stops reacting
// (observers, media, state events, overlap heartbeat) and keeps its resolved
// look for free. Explicit API calls still drain. Returns combined stats.
export function freeze(root) {
  // 0.14.0: freeze(el) marks ONE subtree static (styled once, then left alone); freeze() with no argument still parks the whole page
  if (root && root.nodeType === 1) { root.setAttribute('data-dssl-static', ''); for (const e of engines.values()) e.staticSeen = true; return root; }
  const stats = [];
  for (const e of engines.values()) stats.push(e.freeze());
  return stats.length === 1 ? stats[0] : stats;
}
export function unfreeze(root) {
  if (root && root.nodeType === 1) { root.removeAttribute('data-dssl-static'); for (const e of engines.values()) e.refreshSubtree(root); return root; }
  const stats = [];
  for (const e of engines.values()) stats.push(e.unfreeze());
  return stats.length === 1 ? stats[0] : stats;
}

// v0.7.0 - explain(el): matched rules, source file/line, winning declaration
// per property, and the pseudo-element rules touching the element. Prints a
// readable group to the console (quiet: true for pure data) and returns it.
export function explain(el, opts = {}) {
  const eng = opts.scope !== undefined ? getEngine(opts) : engines.get('global');
  if (!eng) return null;
  const rep = eng.explain(el);
  if (!rep) return null;
  if (opts.quiet !== true) {
    try {
      const elDesc = el.tagName ? el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') : 'element';
      console.groupCollapsed(`%c[DSSL] explain <${elDesc}> - ${rep.matched.length} rule(s) matched`, 'color:#2d5a3d;font-weight:bold');
      for (const m of rep.matched) {
        console.log(`#${m.id} ${m.sel}  (${m.layer})  ${m.file || 'inline'}:${m.line}${m.states.length ? '  states: ' + m.states.join(',') : ''}`);
      }
      for (const w of rep.wins) {
        console.log(`%c${w.prop}: ${w.value}${w.imp ? ' !important' : ''}%c  ← ${w.by.sel} (${w.by.file || 'inline'}:${w.by.line})`, 'color:inherit', 'color:gray');
      }
      for (const p of rep.pseudo) {
        console.log(`::${p.pseudo}  ${p.sel}  (${p.layer})  ${p.file || 'inline'}:${p.line}`);
      }
      if (rep.frozen) console.log('(engine is frozen)');
      console.groupEnd();
    } catch { /* console quirks */ }
  }
  return rep;
}

// ---- 0.12.0: dev tools, loaded only when asked for --------------------------
let devMod = null, inspector = null, watcher = null;
async function dev() {
  if (!devMod) devMod = await import('./dev.js');
  if (!inspector) inspector = devMod.createInspector({ explain });
  if (!watcher) watcher = devMod.createWatcher({ apply, sources: () => [...loadedUrls] });
  return { inspector, watcher };
}
/** DSSL.inspect() toggles the in-page inspector; DSSL.inspect(false) closes it */
export async function inspect(on = true) {
  const d = await dev();
  if (on === false) { d.inspector.stop(); return false; }
  d.inspector.start();
  return true;
}
/** DSSL.lint(root?, { min, images, log }) resolves to what is wrong on the page as it is drawn: low contrast text, engine-made boxes, motion held back */
export async function lint(root, opts) {
  const d = await dev();
  return devMod.lintDocument(root || null, { explain, engines: [...engines.values()] }, opts || {});
}

/** DSSL.watch({ interval, css, toast }) re-applies a .dssl file when it changes on disk; DSSL.watch(false) stops */
export async function watch(o = {}) {
  const d = await dev();
  if (o === false) { d.watcher.stop(); return false; }
  d.watcher.start(typeof o === 'object' ? o : {});
  return true;
}

export const DSSL = {
  version: VERSION, compile, apply, load, toCSS, signal, getSignal, flush, settled, computed, pauseMotion, stepMotion, resumeMotion, refresh, replay, errors,
  freeze, unfreeze, explain, inspect, watch, play, motion, auraZ, lint,
  __debug: { engines },
};

if (typeof window !== 'undefined') {
  window.DSSL = DSSL;

  // ---- auto-boot -------------------------------------------------------
  // 0.13.0: under a strict Content-Security-Policy the styles still work (they go through the CSSOM), but a generated
  // texture is a data: image. If the policy blocks those, say so once, in plain words, instead of leaving a flat colour.
  try {
    let told = false;
    document.addEventListener('securitypolicyviolation', (e) => {
      if (told || !/^img-src/.test(e.violatedDirective) || e.blockedURI !== 'data') return;
      told = true;
      console.info('[DSSL] a texture could not be shown: your Content-Security-Policy does not allow data: images. Add  img-src \'self\' data:  (textures are generated images), or build the page with dssl build so the CSS carries them.');
    });
  } catch { /* no document */ }
  const boot = async () => {
    try {
      const links = [...document.querySelectorAll('link[rel="stylesheet/dssl"]')];
      // v0.7.2 - inline DSSL blocks also work as <script type="text/dssl">
      // (some editors highlight/parse those better than an unknown style type)
      const inlines = [...document.querySelectorAll('style[type="text/dssl"], script[type="text/dssl"]')];

      const sources = [];
      for (const l of links) sources.push({ name: l.getAttribute('href'), kind: 'link', el: l });
      for (const s of inlines) sources.push({
        name: s.getAttribute('data-dssl-name') || 'inline-<style>-' + (++counter),
        kind: 'style', el: s,
      });

      for (const src of sources) {
        try {
          if (src.kind === 'link') await load(src.name);
          else apply(src.el.textContent, { name: src.name });
        } catch (e) {
          reportErrors([{ file: src.name, line: 0, message: 'boot failed: ' + e.message }], src.name);
        }
      }
    } finally {
      // always announce readiness - even when there was nothing to auto-load
      // 0.12.0: <script src="boot.js" data-watch data-inspect> turns the dev tools on, and so does ?dssl-watch in the address
      try {
        const tag = document.querySelector('script[src$="boot.js"], script[src$="dssl/index.js"]');
        const q = new URLSearchParams(location.search);
        if ((tag && tag.hasAttribute('data-watch')) || q.has('dssl-watch')) watch();
        if ((tag && tag.hasAttribute('data-inspect')) || q.has('dssl-inspect')) inspect();
      } catch { /* dev tools are optional */ }
      window.dispatchEvent(new CustomEvent('dssl-ready', { detail: { version: VERSION } }));
      // 0.10.0: a page that hides itself until styled (see the guide, "No flash") shows itself here
      try { document.documentElement.classList.add('dssl-ready'); } catch { /* no document element yet */ }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
