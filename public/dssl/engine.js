/* =========================================================================
 * DSSL — engine.js
 * The style engine. No CSS output for regular rules: DSSL matches selectors
 * against the live DOM itself and applies winning declarations directly to
 * elements (inline style), running its own cascade:
 *
 *     cascade = (layer, source order)   — no specificity, ever
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
 * are the one thing compiled to real CSS in a shadow <style> tag — using the
 * same tokens via var().
 * ========================================================================= */

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };

// v0.3.4 — alignment implies a formatting context.
// place-items / place-content / align-* / justify-* only arrange children
// inside flex or grid containers. On a plain <span> or <button> they used to
// silently do nothing — which is exactly how the feature icons, the theme
// toggle and the token dots ended up pinned top-left inside their circles.
// The language promises loud failures over silent ones, so when a winning
// declaration asks for alignment but the element has no layout context, the
// engine PROMOTES it: inline elements → inline-grid (flow preserved), blockish
// elements → grid. Explicit `display:` in the same cascade still wins, because
// the promotion is applied first and "later wins" is the whole cascade.
const ALIGN_PROPS = new Set([
  'place-items', 'place-content', 'align-items', 'justify-items',
  'align-content', 'justify-content',
]);
const HAS_CONTEXT_RE = /^(flex|inline-flex|grid|inline-grid)$/;

/* v0.4.1 — shorthand/longhand coexistence cannot survive inline.
 *
 * A var()-pending shorthand (`border: 1px solid var(--c)`) and an overriding
 * longhand of the same family (`border-color: color-mix(... var(--i) ...)`)
 * cannot coexist in one inline declaration block: the CSSOM silently expands
 * the shorthand into EMPTY longhands and the border vanishes. The old
 * wipe-and-rewrite engine masked this by restoring the shorthand on every
 * recompute (and flickering the border on every hover — part of the twitch);
 * the diffing engine exposed it permanently (veto badges lost their border).
 *
 * The language's answer is a merge, at the CSSOM boundary: when a winning
 * set holds a family shorthand AND one of its longhands, the longhand's
 * value is folded into the shorthand's grammar slot (border) or the
 * shorthand is expanded positionally (padding/margin/gap), and the longhand
 * is dropped — the block never holds both. Unhandled pairs fail LOUDLY. */
const BORDER_STYLES = new Set(['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset']);
const BORDER_WIDTH_RE = /^(0|[\d.]+(?:px|em|rem|%|pt|ch|vw|vh)|thin|medium|thick)$/i;

function foldIntoBorder(shVal, lhVal) {
  const parts = String(shVal).trim().split(/\s+/);
  const width = [];
  const style = [];
  const color = [];
  for (const t of parts) {
    if (!width.length && BORDER_WIDTH_RE.test(t)) width.push(t);
    else if (!style.length && BORDER_STYLES.has(t.toLowerCase())) style.push(t);
    else color.push(t);
  }
  if (color.length) color[0] = lhVal;      // replace the color slot (later cascade wins)
  else color.push(lhVal);                  // shorthand had no color slot — append
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

export class DsslEngine {
  constructor({ scope = null, name = 'global', reset = false } = {}) {
    this.name = name;
    this.scope = scope || null;            // null = whole document
    this.reset = reset;
    this.bundles = new Map();              // bundleName -> resolved doc
    this.rules = [];
    this.shadowRules = [];
    this.signalStore = new Map();
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
    this.seenSet = new WeakSet();          // v0.4.0 — elements that entered the viewport
    this.staggerEls = new Map();           // v0.4.0 — element → stagger delay (ms)
    this.io = null;                        // IntersectionObserver backing `seen`
    this.naturalDisplay = new WeakMap();   // v0.4.1 — element → display without our promotion
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
    const bundles = [...this.bundles.values()].sort((a, b) => a.seq - b.seq);
    for (const b of bundles) {
      for (const r of b.rules) {
        rules.push(r); // scoped engines map :root rules onto the scope element
      }
      shadowRules.push(...b.shadowRules);
    }
    this.rules = rules;
    this.shadowRules = shadowRules;

    // unique media queries → MediaQueryList cache
    for (const r of rules) for (const q of r.media) this.mql(q);
    for (const r of shadowRules) for (const q of r.media) this.mql(q);

    this.init();
    this.renderShadow();
    this.computeAll();
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
    const on = (type, fn) => root.addEventListener(type, fn, { passive: true, capture: type === 'focusin' || type === 'focusout' });
    on('pointerover', (e) => this.stateEvent('hover', e.target));
    on('pointerout', (e) => this.stateEvent('hover', e.target));
    on('focusin', (e) => { this.stateEvent('focus', e.target); this.stateEvent('focus-visible', e.target); });
    on('focusout', (e) => { this.stateEvent('focus', e.target); this.stateEvent('focus-visible', e.target); });
    on('pointerdown', (e) => this.stateEvent('active', e.target));
    on('pointerup', (e) => this.stateEvent('active', e.target));
    on('pointercancel', (e) => this.stateEvent('active', e.target));

    // --- DOM mutations ---
    const mo = new MutationObserver((muts) => {
      if (this._applying) return; // our own style writes — ignore
      const batch = new Set();
      let fullSweep = false;
      for (const m of muts) {
        if (m.type === 'attributes') {
          if (m.attributeName === 'style') continue;
          if (m.target === document.documentElement && m.attributeName.startsWith('data-dssl')) continue;
          batch.add(m.target);
          // class/attr changes can affect descendant rules — include small subtrees.
          // v0.3.3: when the changed element owns a HUGE subtree (view root flips
          // like data-view on the site shell), don't skip the descendants — a full
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
            if (n.querySelectorAll) n.querySelectorAll('*').forEach(k => this.touched.delete(k));
          });
        }
      }
      if (fullSweep) {
        // one full recompute per microtask burst, same drain the scheduler uses
        if (!this._sweepQueued) {
          this._sweepQueued = true;
          queueMicrotask(() => { this._sweepQueued = false; this.computeAll(); });
        }
        return;
      }
      if (batch.size) this.schedule(batch);
    });
    mo.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: undefined });
    this._mo = mo;

    // --- media changes ---
    // (matchMedia listeners are added lazily per query in mql(); rewire here)
    const origMql = this.mql.bind(this);
    this.mql = (query) => {
      const m = origMql(query);
      if (!m._dsslWired) {
        m._dsslWired = true;
        try { m.addEventListener('change', () => this.scheduleComputeAll()); } catch { /* old browsers */ }
      }
      return m;
    };

    // --- reduced motion ---
    try {
      const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
      rm.addEventListener('change', () => this.scheduleComputeAll());
      this.reducedMotion = rm;
    } catch { this.reducedMotion = { matches: false }; }

    // --- `seen` state (v0.4.0): fires once when the element scrolls into view ---
    if (typeof IntersectionObserver !== 'undefined') {
      this.io = new IntersectionObserver((entries) => {
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
    // without IntersectionObserver (ancient engines), isSeen() treats every
    // element as seen — content must never be trapped invisible by a missing API.

    // --- container tracking via ResizeObserver ---
    // v0.4.1: the callback goes through the coalescing scheduler, and — more
    // importantly — computeElement now skips no-op style writes. The old
    // wipe-and-rewrite could change an observed container's size mid-cycle,
    // which re-fired this observer, which recomputed and rewrote again… a
    // feedback loop the user experienced as the whole UI "twitching". An
    // idempotent drain cannot move anything, so the loop dies here.
    this.ro = new ResizeObserver(() => this.scheduleComputeAll());
  }

  stateEvent(state, target) {
    if (!target || target.nodeType !== 1) return;
    const batch = new Set();

    // the element that just entered/left the state — and its ancestors,
    // because hover/focus-within rules can style them too
    let node = target;
    while (node && node.nodeType === 1 && this.inScope(node)) {
      batch.add(node);
      node = node.parentElement;
    }

    for (const rule of this.rules) {
      const hit = rule.states.has(state) || (state === 'focus' && rule.states.has('focus-visible')) || (state === 'focus-visible' && rule.states.has('focus'));
      if (!hit) continue;
      // v0.3 fix: query the state-less base selector. On pointerout the
      // element that just LEFT hover no longer matches `:hover` — querying
      // the stateful selector skipped it and the hover styles stuck forever.
      // The base selector is a superset; computeElement re-evaluates the
      // real (stateful) match, so both entering and leaving are handled.
      const base = rule.sel.replace(STATE_PSEUDO_RE, '').trim() || '*';
      let els;
      try { els = (this.scope || document).querySelectorAll(base); }
      catch { try { els = (this.scope || document).querySelectorAll(rule.sel); } catch { continue; } }
      els.forEach(el => batch.add(el));
    }
    if (batch.size) this.schedule(batch);
  }

  /* ------------------------------------------------------------ *
   * Scheduling + cascade application
   * ------------------------------------------------------------ */

  schedule(els) {
    els.forEach(el => this.pending.add(el));
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      const batch = [...this.pending];
      this.pending.clear();
      this._applying = true;
      for (const el of batch) this.computeElement(el);
      this._applying = false;
      this.applyStagger();
    });
  }

  /* v0.4.1 — coalesced full recompute for ambient triggers (ResizeObserver,
   * media flips, signals, reduced-motion). Several triggers can land in the
   * same frame; each one used to run its own computeAll synchronously. One
   * compute per microtask burst is always enough — the drain is idempotent. */
  scheduleComputeAll() {
    if (this._allQueued) return;
    this._allQueued = true;
    queueMicrotask(() => { this._allQueued = false; this.computeAll(); });
  }

  matches(el, sel) {
    try { return el.matches(sel); } catch { return false; }
  }

  inScope(el) {
    if (!this.scope) return true;
    return this.scope === el || this.scope.contains(el);
  }

  signalsPass(rule) {
    for (const s of rule.signals) {
      const has = this.signalStore.has(s.name);
      const val = this.signalStore.get(s.name);
      if (s.op === 'truthy') { if (!has || val === false || val === null || val === 'false') return false; }
      else if (s.op === '==') { if (!has || String(val) !== String(s.value)) return false; }
      else if (s.op === '!=') { if (has && String(val) === String(s.value)) return false; }
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
    this._applying = true;
    const rootEl = this.scope || document.documentElement;
    const els = new Set([rootEl, ...this.touched]);   // include previously-styled elements — their rules may have STOPPED matching
    const root = this.scope || document;
    for (const rule of this.rules) {
      if (rule.sel === ':root') { els.add(rootEl); continue; }
      // v0.4.0: `:seen` is engine-native and invalid inside querySelectorAll —
      // enumerate the stripped selector; computeElement re-checks the real state.
      let sel = rule.sel;
      if (rule.states.has('seen')) sel = sel.replace(/:seen\b/g, '') || '*';
      let found;
      try { found = root.querySelectorAll(sel); } catch { continue; }
      found.forEach(el => els.add(el));
    }
    for (const el of els) this.computeElement(el);
    this._applying = false;
    this.applyStagger();
  }

  computeElement(el) {
    if (!el || !el.style || el.nodeType !== 1) return;
    if (!this.inScope(el)) return;
    this.touched.add(el);

    const matched = [];
    const rootEl = this.scope || document.documentElement;
    for (const rule of this.rules) {
      if (rule.sel === ':root') {
        if (el !== rootEl) continue;
      } else {
        let sel = rule.sel;
        if (rule.states.has('seen')) {
          // v0.4.0 — `seen` belongs to the engine, not to CSS selectors: until
          // the element has intersected, the rule cannot match. Make sure the
          // element IS observed so it re-computes the moment it scrolls in.
          if (!this.isSeen(el)) { this.observeSeen(el); continue; }
          sel = sel.replace(/:seen\b/g, '') || '*';
        }
        if (!this.matches(el, sel)) continue;
      }
      if (!rule.media.every(q => this.mql(q).matches)) continue;
      if (!this.signalsPass(rule)) continue;
      if (!this.containerPass(el, rule)) continue;
      matched.push(rule);
    }
    matched.sort((a, b) =>
      (LAYER_RANK[a.layer] ?? 2) - (LAYER_RANK[b.layer] ?? 2) || a.order - b.order
    );

    /* v0.4.1 — diff-based writes. The engine used to WIPE every property it
     * owned and rewrite them all on every single recompute, even when nothing
     * had changed. Under pointer boundary storms that meant hundreds of no-op
     * style mutations per second, a resize-observer feedback loop (the write
     * moved an observed container, RO re-fired, the write ran again…), and a
     * visible "twitch" while the browser kept relayouting identical styles.
     *
     * The language's promise is that a recompute is a pure function of (DOM,
     * rules, state) — so a recompute that resolves to the same declarations
     * must touch the DOM zero times. Build the new ownership map, diff it
     * against what we own, and write ONLY the difference. */

    const owned = this.ownMap.get(el) || new Map();  // prop -> {value, imp}
    const newOwned = new Map();                      // prop -> {value, imp}
    const animSpecs = [];
    let cancelAnims = false;
    let stack = false;
    let staggerMs;                         // v0.4.0 — @stagger value, if any

    // flatten matched decls in cascade order (last decl of a prop wins, exactly
    // like sequential setProperty calls did)
    const flat = [];
    for (const rule of matched) {
      const imp = rule.layer === 'pin' ? 'important' : '';
      for (const d of rule.decls) flat.push({ d, imp, rule });
    }
    for (const { d, imp } of flat) {
      if (d.prop === '@animate') {
        if (d.value === null) { cancelAnims = true; continue; }
        animSpecs.push({ ...d.value, key: /* filled below */ null });
        continue;
      }
      if (d.prop === '@stack') { stack = true; continue; }
      if (d.prop === '@stagger') { staggerMs = d.value; continue; }
      newOwned.set(d.prop, { value: d.value, imp });
    }
    // anim keys need rule identity — rebuild them from matched order
    {
      let i = 0;
      for (const rule of matched) {
        for (const d of rule.decls) {
          if (d.prop !== '@animate' || d.value === null) continue;
          const spec = animSpecs[i++];
          if (spec) spec.key = rule.id + '|' + rule.media.join('&') + '|' + rule.signals.map(s => s.name + s.op + s.value).join('&');
        }
      }
    }

    // v0.4.1 — resolve shorthand/longhand coexistence BEFORE any write, so the
    // inline block never holds a family shorthand and one of its longhands.
    for (const fam of ['border']) {
      const sh = newOwned.get(fam);
      if (!sh) continue;
      for (const lhName of ['border-color', 'border-width', 'border-style']) {
        const lh = newOwned.get(lhName);
        if (!lh) continue;
        if (lhName === 'border-color') newOwned.set(fam, { value: foldIntoBorder(sh.value, lh.value), imp: sh.imp });
        else newOwned.set(fam, { value: sh.value, imp: sh.imp }); // non-color longhand: shorthand wins width/style only when it has that slot — keep shorthand, drop longhand
        newOwned.delete(lhName);
        if (!this._warned) this._warned = new Set();
        const wmsg = `[DSSL] folded ${lhName} into ${fam} on <${el.tagName.toLowerCase()}${el.className ? ' .' + String(el.className).split(' ')[0] : ''}> — inline style cannot hold a var() shorthand and its longhand together`;
        if (!this._warned.has(wmsg)) { this._warned.add(wmsg); console.info(wmsg); }
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
        if (!prevL) newOwned.set(p, { value: v, imp });
      }
    }

    // REMOVE pass — properties we owned but the new cascade no longer sets.
    // This runs BEFORE the promotion read below, so getComputedStyle sees the
    // element's natural display, not a leftover promotion from last time.
    // v0.4.1: the bookkeeping map must forget them too — the SET pass diffs
    // against `owned`, and a prop deleted from the element but still in the
    // map would look "unchanged" and never be rewritten (that is how the
    // alignment promotion's display used to vanish on the second recompute).
    for (const p of [...owned.keys()]) {
      if (!newOwned.has(p)) {
        try { el.style.removeProperty(p); } catch { }
        owned.delete(p);
      }
    }

    // v0.3.4: alignment implies a formatting context — see ALIGN_PROPS above.
    // The element's NATURAL display (without our previous promotion) decides.
    // v0.4.1: when we own a display we are about to drop, getComputedStyle can
    // race the removal — so the natural value is cached per element the first
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

    // SET pass — only what is new or actually changed.
    for (const [prop, next] of newOwned) {
      const prev = owned.get(prop);
      if (prev && prev.value === next.value && prev.imp === next.imp) continue;
      try {
        el.style.setProperty(prop, next.value, next.imp);
      } catch (why) {
        // v0.3.2: the language promises loud errors — if the browser rejects
        // a value we resolved, say so instead of failing silently. This is
        // how the repeat(4px, 1fr) grid collapse would have been caught.
        const msg = `[DSSL] browser rejected "${prop}: ${next.value}" — ${why && why.message || 'invalid value'}`;
        if (!this._warned) this._warned = new Set();
        if (!this._warned.has(msg)) { this._warned.add(msg); console.warn(msg); }
      }
    }

    this.ownMap.set(el, newOwned);
    this.lastApply = Date.now();

    // v0.4.0 — stagger bookkeeping: remember (or forget) this container
    const hadStagger = this.staggerEls.has(el);
    if (staggerMs !== undefined && staggerMs !== null && Number.isFinite(Number(staggerMs))) {
      this.staggerEls.set(el, Number(staggerMs));
    } else if (hadStagger) {
      this.staggerEls.delete(el);
      this.resetStagger(el); // rule stopped matching — restore natural delays
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
        // v0.4.1: idempotent — children get recomputed on every drain, but
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
      if (reduced && !spec.essential) continue;
      if (anims.has(spec.key)) continue;
      let frames = spec.frames.map(f => ({ ...f.props, offset: f.offset / 100 }));
      if (frames.length === 1) {
        if (frames[0].offset === 0) frames = [frames[0], { offset: 1 }];
        else frames = [{ offset: 0 }, frames[0]];
      }
      try {
        const anim = el.animate(frames, {
          duration: spec.duration, easing: spec.easing,
          delay: spec.delay || 0, fill: spec.fill,
          iterations: spec.iterations || 1,        // v0.5.0 — `infinite`
          direction: spec.direction || 'normal',   // v0.5.0 — `alternate`
        });
        anims.set(spec.key, anim);
      } catch { /* WAAPI unsupported property — skip */ }
    }
    if (animSpecs.length) this.animMap.set(el, anims);
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

  /* The stagger rule stopped matching — cancel the children's shifted
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

  signal(name, value) {
    if (value === null || value === undefined) this.signalStore.delete(name);
    else this.signalStore.set(name, String(value));
    // DevTools-visible mirror
    try {
      if (value === null || value === undefined) document.documentElement.removeAttribute('data-dssl-signal-' + name);
      else document.documentElement.setAttribute('data-dssl-signal-' + name, String(value));
    } catch { }
    this.scheduleComputeAll();
  }

  getSignal(name) { return this.signalStore.get(name); }

  /* ------------------------------------------------------------ *
   * Pseudo-elements → shadow CSS (the only real CSS we emit)
   * ------------------------------------------------------------ */

  renderShadow() {
    const idAttr = 'data-dssl-engine';
    let host = this.scope;
    if (this.scope && !this.scope.hasAttribute(idAttr)) this.scope.setAttribute(idAttr, this.name);

    const prefix = this.scope ? `[${idAttr}="${this.name}"] ` : '';

    const cssFor = (r) => {
      let sel = prefix + r.sel + '::' + r.pseudo;
      for (const s of r.signals) {
        const attr = 'data-dssl-signal-' + s.name;
        const cond = s.op === 'truthy' ? `html[${attr}]` : `html[${attr}="${s.value}"]`;
        sel = cond + ' ' + sel;
      }
      let body = r.decls.map(d => `  ${d.prop}: ${d.value};`).join('\n');
      let out = `${sel} {\n${body}\n}`;
      for (const q of [...r.media].reverse()) out = `@media ${q} {\n${out}\n}`;
      for (const c of [...r.containers].reverse()) out = `@container ${c} {\n${out}\n}`;
      return out;
    };

    let css = this.shadowRules.map(cssFor).join('\n\n');

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

    if (!this.shadowStyle) {
      this.shadowStyle = document.createElement('style');
      this.shadowStyle.setAttribute('data-dssl-shadow', this.name);
      document.head.appendChild(this.shadowStyle);
    }
    this.shadowStyle.textContent = `/* generated by DSSL engine "${this.name}" — pseudo-elements + reset only */\n` + css;
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
  }
}
