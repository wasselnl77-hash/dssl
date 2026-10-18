/* =========================================================================
 * DSSL — index.js — public API + auto-boot
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
import { resolve, DEFAULT_TOKENS } from './resolver.js';
import { DsslEngine } from './engine.js';

export const VERSION = '0.3.3';

let counter = 0;
const engines = new Map();
let lastErrors = [];

// Token registry shared across bundles: tokens.dssl defines the palette,
// every later stylesheet resolves against it.
const tokenRegistry = new Map(Object.entries(DEFAULT_TOKENS));

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
      console.warn(`${e.file || ''}${e.file ? ':' : ''}${e.line ?? ''} — ${e.message}${e.hint ? `\n    did you mean "${e.hint}"?` : ''}`);
    }
    console.groupEnd();
  } catch { /* very old browsers */ }
}

/** Parse + resolve without touching the DOM. */
export function compile(source, file = 'inline.dssl') {
  const { ast, errors: parseErrors } = parse(source, file);
  const doc = resolve(ast, file, Object.fromEntries(tokenRegistry));
  const errors = [...parseErrors, ...doc.errors];
  return {
    ok: errors.length === 0,
    errors,
    stats: {
      rules: doc.rules.length,
      shadowRules: doc.shadowRules.length,
      motions: Object.keys(doc.motions).length,
      tokens: Object.keys(doc.tokens).length,
      mediaQueries: doc.mediaQueries.length,
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
  // fold this bundle's tokens into the shared registry for later bundles
  let registryDirty = false;
  for (const [k, v] of Object.entries(result.doc.tokens || {})) {
    if (tokenRegistry.get(k) !== v) { tokenRegistry.set(k, v); registryDirty = true; }
  }
  if (!opts.keepErrors) reportErrors(result.errors, file);
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
 *  v0.3.2: files are fetched IN PARALLEL but applied in the order given —
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
    results.push(apply(r.text, { ...opts, name: opts.name || r.url }));
  }
  return results;
}

export function signal(name, value) { for (const e of engines.values()) e.signal(name, value); }
export function getSignal(name) { return engines.get('global')?.getSignal(name); }
export function refresh() { for (const e of engines.values()) e.computeAll(); }
export function replay(selector) { for (const e of engines.values()) e.replay(selector); }
export function errors() { return lastErrors; }
export function version() { return VERSION; }

export const DSSL = {
  version: VERSION, compile, apply, load, signal, getSignal, refresh, replay, errors,
  __debug: { engines },
};

if (typeof window !== 'undefined') {
  window.DSSL = DSSL;

  // ---- auto-boot -------------------------------------------------------
  const boot = async () => {
    try {
      const links = [...document.querySelectorAll('link[rel="stylesheet/dssl"]')];
      const inlines = [...document.querySelectorAll('style[type="text/dssl"]')];

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
      // always announce readiness — even when there was nothing to auto-load
      window.dispatchEvent(new CustomEvent('dssl-ready', { detail: { version: VERSION } }));
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
