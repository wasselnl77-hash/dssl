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
 * delegation + live `matches()` checks. `@media` uses matchMedia listeners,
 * `@signal` is driven from JS, `@container` is evaluated against the nearest
 * tracked container. Motion runs through the Web Animations API.
 *
 * Pseudo-elements (::before/::after/…) cannot be expressed inline, so they
 * are the one thing compiled to real CSS in a shadow <style> tag — using the
 * same tokens via var().
 * ========================================================================= */

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };

// state pseudo-classes that may appear inside a rule selector. Used to strip
// them back OFF when collecting recompute candidates (see stateEvent).
const STATE_PSEUDO_RE = /:(hover|focus|focus-visible|active|focus-within|visited|target|disabled|enabled|checked|placeholder-shown|read-only|read-write|open|closed|empty|required|invalid|valid|link|indeterminate)\b/g;

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
      for (const m of muts) {
        if (m.type === 'attributes') {
          if (m.attributeName === 'style') continue;
          if (m.target === document.documentElement && m.attributeName.startsWith('data-dssl')) continue;
          batch.add(m.target);
          // class/attr changes can affect descendant rules — include small subtrees
          if (m.target.querySelectorAll) {
            const kids = m.target.querySelectorAll('*');
            if (kids.length <= 300) kids.forEach(k => batch.add(k));
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
        try { m.addEventListener('change', () => this.computeAll()); } catch { /* old browsers */ }
      }
      return m;
    };

    // --- reduced motion ---
    try {
      const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
      rm.addEventListener('change', () => this.computeAll());
      this.reducedMotion = rm;
    } catch { this.reducedMotion = { matches: false }; }

    // --- container tracking via ResizeObserver ---
    this.ro = new ResizeObserver(() => this.computeAll());
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
    });
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
      let found;
      try { found = root.querySelectorAll(rule.sel); } catch { continue; }
      found.forEach(el => els.add(el));
    }
    for (const el of els) this.computeElement(el);
    this._applying = false;
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
      } else if (!this.matches(el, rule.sel)) continue;
      if (!rule.media.every(q => this.mql(q).matches)) continue;
      if (!this.signalsPass(rule)) continue;
      if (!this.containerPass(el, rule)) continue;
      matched.push(rule);
    }
    matched.sort((a, b) =>
      (LAYER_RANK[a.layer] ?? 2) - (LAYER_RANK[b.layer] ?? 2) || a.order - b.order
    );

    // wipe what we owned before
    const owned = this.ownMap.get(el) || [];
    for (const p of owned) { try { el.style.removeProperty(p); } catch { } }

    const newOwned = [];
    const animSpecs = [];
    let cancelAnims = false;
    let stack = false;

    for (const rule of matched) {
      const imp = rule.layer === 'pin' ? 'important' : '';
      for (const d of rule.decls) {
        if (d.prop === '@animate') {
          if (d.value === null) { cancelAnims = true; continue; }
          animSpecs.push({ ...d.value, key: rule.id + '|' + rule.media.join('&') + '|' + rule.signals.map(s => s.name + s.op + s.value).join('&') });
          continue;
        }
        if (d.prop === '@stack') { stack = true; continue; }
        try {
          el.style.setProperty(d.prop, d.value, imp);
          newOwned.push(d.prop);
        } catch { /* invalid value — resolver should have caught it */ }
      }
    }

    this.ownMap.set(el, newOwned);
    this.lastApply = Date.now();

    // container registration
    if (newOwned.includes('container-type')) {
      if (!this.containerEls.has(el)) { this.containerEls.add(el); try { this.ro.observe(el); } catch { } }
    } else if (this.containerEls.has(el)) {
      this.containerEls.delete(el);
      try { this.ro.unobserve(el); } catch { }
    }

    // stack behavior: children share grid cell
    const prevStack = this.stackPrev.get(el) || [];
    if (stack) {
      for (const child of el.children) {
        if (child.nodeType === 1) { try { child.style.gridArea = '1 / 1'; } catch { } }
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
        });
        anims.set(spec.key, anim);
      } catch { /* WAAPI unsupported property — skip */ }
    }
    if (animSpecs.length) this.animMap.set(el, anims);
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
    this.computeAll();
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
  }
}
