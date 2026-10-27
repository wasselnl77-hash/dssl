/* =========================================================================
 * DSSL: dev.js (0.12.0) - the in-page inspector and hot reload
 *
 *   DSSL.inspect()      hover any element to see which DSSL rule produced each style, and where
 *   DSSL.watch()        re-apply a .dssl file the moment it changes on disk, with no page reload
 *
 * Neither is loaded for visitors: this file is only imported when you call them
 * (or when the script tag carries data-inspect or data-watch).
 * ========================================================================= */

import { parseColor, over, contrast, toHex } from './color.js';
import { shadowWarnings } from './lint.js';

const HOST_ID = 'dssl-dev-host';

function describe(el) {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? '#' + el.id : '';
  const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
  return tag + id + cls;
}

/* ------------------------------------------------------------------ inspector */

export function createInspector({ explain }) {
  let state = null;

  const start = () => {
    if (state) return state.api;
    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    // the panel's CSS goes in a constructed stylesheet, because a strict CSP refuses a <style> element made by script
    const PANEL_CSS = `
        :host { all: initial }
        .box { position: fixed; border: 2px solid #ff3d8b; background: rgba(255,61,139,.12); pointer-events: none; border-radius: 2px; display: none }
        .panel { position: fixed; right: 12px; bottom: 12px; width: min(440px, calc(100vw - 24px)); max-height: 58vh; overflow: auto; pointer-events: auto;
          background: #17111f; color: #ece7f5; font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; border-radius: 10px;
          box-shadow: 0 10px 40px rgba(0,0,0,.45); border: 1px solid #3a2f4f }
        header { position: sticky; top: 0; display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 8px 12px; background: #231a33; border-bottom: 1px solid #3a2f4f }
        header b { color: #ff8ac4 }
        button { all: unset; cursor: pointer; padding: 2px 8px; border: 1px solid #5a4a78; border-radius: 6px; color: #ece7f5 }
        button:focus-visible { outline: 2px solid #ffd98a }
        .sec { padding: 8px 12px; border-bottom: 1px solid #2a2140 }
        .sec h4 { margin: 0 0 4px; color: #a9c6ff; font-weight: 700 }
        .row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px; padding: 1px 0 }
        .row span:first-child { overflow-wrap: anywhere }
        .src { color: #9ce3c0; white-space: nowrap }
        .val { color: #ffd98a }
        .muted { color: #9a90ad }
        .none { padding: 12px; color: #9a90ad }
`;
    const PANEL_HTML = `
      <div class="box" part="box"></div>
      <div class="panel" role="dialog" aria-label="DSSL inspector"><header><span><b>DSSL</b> inspector</span><span><button data-act="pin" title="Click the page to pin an element">hover</button> <button data-act="close" aria-label="Close inspector">Esc</button></span></header><div class="body"><div class="none">Hover an element. Click it to keep its rules on screen.</div></div></div>`;
    let adopted = false;
    try { const sheet = new CSSStyleSheet(); sheet.replaceSync(PANEL_CSS); root.adoptedStyleSheets = [sheet]; adopted = true; } catch { /* an old browser: use a <style> inside the shadow root */ }
    root.innerHTML = (adopted ? '' : `<style>${PANEL_CSS}</style>`) + PANEL_HTML;
    document.documentElement.appendChild(host);
    const box = root.querySelector('.box'), body = root.querySelector('.body'), pinBtn = root.querySelector('[data-act=pin]');
    let target = null, pinned = false;

    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const place = (el) => {
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const show = (el) => {
      target = el; place(el);
      let rep = null;
      try { rep = explain(el, { quiet: true }); } catch { rep = null; }
      if (!rep) { body.innerHTML = `<div class="sec"><h4>${esc(describe(el))}</h4><span class="muted">no DSSL engine covers this element</span></div>`; return; }
      const wins = rep.wins || [];
      const matched = rep.matched || [];
      body.innerHTML =
        `<div class="sec"><h4>${esc(describe(el))}</h4><span class="muted">${matched.length} rule${matched.length === 1 ? '' : 's'} matched, ${wins.length} declaration${wins.length === 1 ? '' : 's'} won</span></div>` +
        `<div class="sec"><h4>what applied</h4>${wins.length ? wins.map((w) => `<div class="row"><span>${esc(w.prop)}: <span class="val">${esc(String(w.value).slice(0, 90))}${String(w.value).length > 90 ? '...' : ''}</span>${w.imp ? ' !important' : ''}</span><span class="src">${esc(w.by.file || 'inline')}:${w.by.line} ${esc(w.by.sel)}</span></div>`).join('') : '<span class="muted">nothing</span>'}</div>` +
        `<div class="sec"><h4>rules, in cascade order</h4>${matched.length ? matched.map((m) => `<div class="row"><span>${esc(m.sel)}${m.states && m.states.length ? ' <span class="muted">[' + esc(m.states.join(',')) + ']</span>' : ''}</span><span class="src">${esc(m.layer)} ${esc(m.file || 'inline')}:${m.line}</span></div>`).join('') : '<span class="muted">none</span>'}</div>` +
        (rep.pseudo && rep.pseudo.length ? `<div class="sec"><h4>pseudo-elements</h4>${rep.pseudo.slice(0, 4).map((p) => `<div class="row"><span>::${esc(p.pseudo)} ${esc(p.sel)}</span><span class="src">${esc(p.file || 'inline')}:${p.line}</span></div>`).join('')}${rep.pseudo.length > 4 ? `<span class="muted">and ${rep.pseudo.length - 4} more, mostly global ones like scrollbars</span>` : ''}</div>` : '');
    };
    const inside = (el) => el === host || (el && el.closest && el.closest('#' + HOST_ID));
    const onMove = (e) => {
      if (pinned) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || inside(el) || el === document.documentElement || el === document.body) return;
      if (el !== target) show(el);
    };
    const onClick = (e) => {
      if (inside(e.target)) return;
      e.preventDefault(); e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || inside(el)) return;
      pinned = true; pinBtn.textContent = 'pinned (click to release)'; show(el);
    };
    const onKey = (e) => { if (e.key === 'Escape') { if (pinned) release(); else stop(); } };
    const release = () => { pinned = false; pinBtn.textContent = 'hover'; };
    const onScroll = () => { if (target && target.isConnected) place(target); };
    pinBtn.addEventListener('click', release);
    root.querySelector('[data-act=close]').addEventListener('click', () => stop());
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    const stop = () => {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      host.remove(); state = null;
    };
    state = { api: { stop, show, get target() { return target; }, get pinned() { return pinned; } } };
    return state.api;
  };

  return { start, stop: () => { if (state) state.api.stop(); }, get active() { return !!state; } };
}

/* ------------------------------------------------------------------ hot reload */

export function createWatcher({ apply, sources }) {
  let timer = null, opts = null;
  const seen = new Map();            // url -> last text
  let toast = null, toastTimer = null;

  const say = (text, bad) => {
    if (!opts || opts.toast === false) return;
    if (!toast) {
      toast = document.createElement('div');
      toast.setAttribute('role', 'status');
      toast.style.cssText = 'all:initial;position:fixed;left:12px;bottom:12px;z-index:2147483646;font:12px/1.4 ui-monospace,Menlo,monospace;padding:6px 10px;border-radius:8px;color:#fff;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      document.documentElement.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.background = bad ? '#b3372e' : '#1c6b45';
    toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { if (toast) toast.style.display = 'none'; }, bad ? 6000 : 1600);
  };

  const check = async () => {
    for (const url of sources()) {
      let text;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) continue;
        text = await res.text();
      } catch { continue; }
      if (!seen.has(url)) { seen.set(url, text); continue; }
      if (seen.get(url) === text) continue;
      seen.set(url, text);
      const r = apply(text, { name: url, replace: true });
      const short = url.split('/').pop();
      if (r.errors.length) say(`${short}: ${r.errors.length} error${r.errors.length === 1 ? '' : 's'}, line ${r.errors[0].line ?? '?'}: ${r.errors[0].message}`.slice(0, 160), true);
      else say(`reloaded ${short}`);
    }
    // plain CSS links (a built stylesheet): swap the href so the browser fetches it again
    if (opts && opts.css !== false) {
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        let u; try { u = new URL(link.href); } catch { continue; }
        if (u.origin !== location.origin) continue;
        const base = u.origin + u.pathname;
        let text;
        try { text = await (await fetch(base, { cache: 'no-store' })).text(); } catch { continue; }
        if (!seen.has(base)) { seen.set(base, text); continue; }
        if (seen.get(base) === text) continue;
        seen.set(base, text);
        link.href = base + '?dssl-reload=' + Date.now();
        say(`reloaded ${u.pathname.split('/').pop()}`);
      }
    }
  };

  const start = (o = {}) => {
    stop();
    opts = { interval: 800, css: true, toast: true, ...o };
    // remember what is on the page now, so only later edits count
    (async () => { await check(); timer = setInterval(() => { check().catch(() => {}); }, Math.max(250, opts.interval)); })();
    return true;
  };
  const stop = () => { if (timer) clearInterval(timer); timer = null; opts = null; if (toast) { toast.remove(); toast = null; } };
  return { start, stop, get active() { return !!timer || !!opts; }, check };
}

/* ------------------------------------------------------------------ runtime lint */

/**
 * The engine writes its styles inline, and an inline style beats any normal stylesheet rule. So a rule in the page's own CSS that sets a
 * property DSSL also sets on the same element silently loses. This finds those: for every readable stylesheet rule that matches an
 * element DSSL styles, a property both touch. The fix is `yield: <property>` on the DSSL rule (DSSL stops writing it, your CSS decides),
 * or `!important` in the CSS.
 */
function cssThatLoses(eng, scope) {
  const found = [];
  const seen = new Set();
  const visit = (rules, label) => {
    for (const r of rules) {
      try {
        if (r.type === 1 && r.selectorText) {                                         // a style rule
          if (/::|:hover|:focus|:active/.test(r.selectorText)) { visit(r.cssRules ? [...r.cssRules] : [], label); continue; }
          const props = [];
          for (let i = 0; i < r.style.length; i++) { const n = r.style[i]; if (r.style.getPropertyPriority(n) !== 'important') props.push(n); }
          if (props.length) {
            let els = [];
            try { els = scope.querySelectorAll(r.selectorText); } catch { /* a selector the browser rejects */ }
            for (const el of els) {
              const owned = eng.ownMap.get(el);
              if (!owned || !owned.size) continue;
              for (const q of props) {
                for (const [p, v] of owned) {
                  if (v.imp) continue;
                  if (p === q || q.startsWith(p + '-') || p.startsWith(q + '-')) {
                    // the same value on both sides is no conflict (a page that ships the compiled CSS AND runs the engine says everything twice)
                    const iv = el.style.getPropertyValue(q), rv = r.style.getPropertyValue(q);
                    if (!iv || iv === rv) continue;
                    const key = `${r.selectorText}|${p}|${q}|${describe(el)}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    found.push({ el, message: `your CSS (${label} ${r.selectorText} { ${q} }) loses: DSSL writes ${p} on this element inline, and an inline style beats a stylesheet. Add  yield: ${q}  to the DSSL rule so the CSS decides, or put !important on the CSS` });
                  }
                }
              }
            }
          }
          if (r.cssRules && r.cssRules.length) visit([...r.cssRules], label);          // nested CSS
        } else if (r.cssRules) {
          if (r.type === 4 && r.media && !window.matchMedia(r.media.mediaText).matches) continue;   // @media that is off
          if (r.type === 12 && r.conditionText && typeof CSS !== 'undefined' && CSS.supports && !CSS.supports(r.conditionText)) continue;
          visit([...r.cssRules], label);                                               // @media, @supports, @layer
        }
      } catch { /* a rule we cannot read */ }
    }
  };
  for (const sheet of [...document.styleSheets]) {
    try {
      const owner = sheet.ownerNode;
      if (owner && owner.getAttributeNames && owner.getAttributeNames().some((n) => n.startsWith('data-dssl'))) continue;   // the engine's own sheets
      // the output of `dssl build` declares the DSSL layer order first (tokens, base, components, utilities, pin). It is DSSL's own CSS, built
      // to sit UNDER the engine (its reset in particular), so it is not "your CSS" and is not judged here.
      const rules = [...sheet.cssRules];
      if (rules.some((r) => r.constructor && r.constructor.name === 'CSSLayerStatementRule' && [...(r.nameList || [])].includes('pin'))) continue;
      visit(rules, sheet.href ? sheet.href.split('/').pop() : '<style>');
    } catch { /* a cross-origin sheet cannot be read */ }
  }
  return found;
}

/**
 * DSSL.lint(root): the checks a stylesheet linter cannot make, because they need the page. It reads what the browser actually
 * computed, so it sees the cream text that inherited onto a cream card (two rules, two files, no warning from `dssl check`).
 *
 *   contrast   a piece of text against the colour it really sits on: its own background, or the nearest ancestor's, composited
 *              through any transparency. Text over an image or a gradient is not guessed at (pass { images: true } to include it).
 *   promoted   an element the engine turned into a grid because its rule aligns children without saying display. It looks right
 *              here, and a `dssl build` would not do it.
 *   motion     animate: motions that did not run because of reduced motion
 *
 * Returns [{ kind, el, selector, message, ... }]. { log: false } stays quiet. { min: 3 } changes the 4.5 limit.
 */
export function lintDocument(root, { explain, engines }, opts = {}) {
  const out = [];
  const scope = root || document.body;
  const min = opts.min || 4.5;
  const page = parseColor(getComputedStyle(document.documentElement).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
  const solidPage = page.a < 0.99 ? over(page, { r: 255, g: 255, b: 255, a: 1 }) : page;

  // the colour behind an element, or null when an image or gradient is in the way and we would only be guessing
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const c = parseColor(cs.backgroundColor);
      const hasImage = cs.backgroundImage && cs.backgroundImage !== 'none';
      if (hasImage && !opts.images) return null;
      if (c && c.a > 0) layers.push(c);
      if (c && c.a >= 0.99 && !hasImage) break;
    }
    let base = solidPage;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], { ...base, a: 1 });
    return base;
  };
  const opacityOf = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 0; return o; };

  // text-stroke and text-shadow are how game and poster text stays readable on any background. The letters count as readable when the
  // outline (a stroke of 1px or more) or a tight shadow (blur up to 4px) is a colour the letters themselves stand out against.
  const outlined = (cs, fg, need) => {
    const sw = parseFloat(cs.webkitTextStrokeWidth) || 0;
    if (sw >= 1) { const sc = parseColor(cs.webkitTextStrokeColor); if (sc && sc.a > 0.5 && contrast(over(fg, { ...sc, a: 1 }), { ...sc, a: 1 }) >= need) return true; }
    const ts = cs.textShadow;
    if (ts && ts !== 'none') {
      for (const part of ts.split(/,(?![^(]*\))/)) {
        const cm = /rgba?\([^)]*\)/.exec(part);
        const sc = cm && parseColor(cm[0]);
        const nums = part.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map((x) => parseFloat(x));
        const blur = nums[2] || 0;
        if (sc && sc.a > 0.5 && blur <= 4 && contrast(over(fg, { ...sc, a: 1 }), { ...sc, a: 1 }) >= need) return true;
      }
    }
    return false;
  };

  const seen = new Set();
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.nodeValue.trim()) continue;
    const el = t.parentElement;
    if (!el || seen.has(el) || el.closest('#' + HOST_ID + ', script, style, noscript')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || /transparent/.test(cs.webkitTextFillColor) ) continue;   // gradient text: the colour is a picture
    const fg = parseColor(cs.color);
    const bg = backdrop(el);
    if (!fg || !bg) continue;
    const op = opacityOf(el);
    if (op < 0.05) continue;                 // invisible (a closed menu, a hidden toast): judging it against itself is noise
    const solidFg = over({ ...fg, a: fg.a * op }, bg);
    const ratio = contrast(solidFg, bg);
    const size = parseFloat(cs.fontSize) || 16, bold = (parseInt(cs.fontWeight, 10) || 400) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? Math.min(min, 3) : min;
    if (ratio < need && outlined(cs, fg, need)) continue;   // an outline or hard shadow that sets the letters apart carries them
    if (ratio < need) {
      out.push({ kind: 'contrast', el, selector: describe(el), ratio: Math.round(ratio * 100) / 100, fg: toHex(solidFg), bg: toHex(bg), message: `text is ${ratio.toFixed(1)}:1 against what is behind it (${toHex(solidFg)} on ${toHex(bg)}), below ${need}:1${large ? ' for large text' : ''}` });
    }
  }

  for (const eng of engines) {
    for (const el of scope.querySelectorAll('*')) {
      const owned = eng.ownMap.get(el);
      const disp = owned && owned.get('display');
      const natural = eng.naturalDisplay.get(el);
      if (disp && /^(inline-)?grid$/.test(disp.value) && natural && !/^(flex|inline-flex|grid|inline-grid)$/.test(natural) && !(eng.rules || []).some((r) => r.decls.some((d) => d.prop === 'display' && /grid|flex/.test(String(d.value))) && eng.matches(el, r.sel.replace(/:seen\b/g, '') || '*'))) {
        out.push({ kind: 'promoted', el, selector: describe(el), message: `the engine made this a ${disp.value} because a rule aligns its children without a display (it was ${natural}); dssl build will not` });
      }
    }
    // 0.16.0: plain CSS that loses to what the engine writes inline
    for (const f of cssThatLoses(eng, scope)) out.push({ kind: 'css-loses', el: f.el, selector: describe(f.el), message: f.message });
    for (const w of shadowWarnings(eng.rules || [])) out.push({ kind: 'shadowed', el: null, selector: `${w.file || ''}:${w.line ?? ''}`, message: w.message });
    if (eng._reducedTold) out.push({ kind: 'motion', el: null, selector: '(page)', message: 'some animate: motions did not run because reduced motion is on; mark the ones that carry meaning `essential`, or DSSL.motion("full")' });
  }
  if (opts.log !== false && out.length) {
    try {
      console.groupCollapsed(`%c[DSSL] lint: ${out.length} thing${out.length === 1 ? '' : 's'} worth a look`, 'color:#8a6d1a;font-weight:bold');
      for (const f of out) console.warn(`${f.kind}  ${f.selector}  ${f.message}`, f.el || '');
      console.groupEnd();
    } catch { /* old console */ }
  }
  return out;
}
