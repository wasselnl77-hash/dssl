/* =========================================================================
 * DSSL: lint.js
 *
 * Warnings for things that compile and run and are still wrong for the people
 * using the page. They fit the language's promise (a mistake should be loud),
 * and they never stop a build unless you ask for `dssl check --strict`.
 *
 *   contrast   text colour against its own background, in the same rule
 *   focus      an outline removed from something you can tab to, with nothing in its place
 *   target     a button or link with an explicit size smaller than a thumb can hit
 *
 * Only unconditional rules are checked. A rule inside @media or @signal might be
 * the dark theme, and judging it against the light tokens would be wrong.
 *
 * Pure: no DOM. Called by resolve() with the rules it just built.
 * ========================================================================= */

import { parseColor, evalColorExpr, over, contrast, toRgba, toHex } from './color.js';

const ALIGN_PROPS = new Set(['place-items', 'place-content', 'align-items', 'justify-items', 'align-content', 'justify-content']);

/** one design-token lookup closed over the sheet's token map */
export function makeColorResolver(tokenMap) {
  const lookup = (name) => tokenMap.get(name);
  /** CSS value as the resolver emits it ("var(--dssl-color-ink)", "color-mix(...)", "#fff") to a colour */
  return function cssToColor(css, depth = 0) {
    if (css === undefined || css === null || depth > 6) return null;
    const s = String(css).trim();
    const direct = parseColor(s);
    if (direct) return direct;
    if (!s.includes('var(')) return null;
    let unresolved = false;
    const expanded = s.replace(/var\(--dssl-([a-z0-9-]+)\)/g, (m, name) => {
      const key = name.replace('-', '.'); // namespace is the first segment: color-code-bg is color.code-bg
      const raw = lookup(key);
      if (raw === undefined) { unresolved = true; return m; }
      const c = evalColorExpr(raw, lookup);
      if (!c) { unresolved = true; return m; }
      return toRgba(c);
    });
    if (unresolved) return null;
    return cssToColor(expanded, depth + 1);
  };
}

const lastDecl = (decls, ...props) => { for (let i = decls.length - 1; i >= 0; i--) if (props.includes(decls[i].prop)) return decls[i]; return null; };
const pxOf = (v) => { const m = /^(-?[\d.]+)px$/.exec(String(v || '').trim()); return m ? parseFloat(m[1]) : null; };
const finalCompound = (sel) => String(sel).trim().split(/[\s>+~]+/).pop() || '';
const INTERACTIVE = /^(a|button|input|select|textarea|summary)\b|\[tabindex|\[role=["']?(button|link|tab|menuitem)|^\*$/;

/**
 * @param {object} p { rules, tokenMap, file }
 * @returns {Array} warnings in the compiler's {file, line, message, hint} shape
 */
/**
 * Rules that align their children and never say what kind of box they are. The engine quietly makes the box a grid when it
 * runs; a `dssl build` cannot, because a stylesheet does not know what each element is. So this is reported by the build (and
 * by DSSL.lint on a live page, which knows exactly which elements were promoted), not by `check`: per rule it cannot see that
 * a different rule gave the same element display: flex, and it was wrong about that often enough to be noise.
 */
export function alignWithoutBox(rules) {
  const out = [];
  for (const r of rules) {
    if (r.pseudo) continue;
    const conditional = (r.media && r.media.length) || (r.signals && r.signals.length) || (r.containers && r.containers.length);
    const states = r.states || new Set();
    if (conditional || states.size) continue;
    const aligns = r.decls.find((d) => ALIGN_PROPS.has(d.prop));
    if (aligns && !r.decls.some((d) => d.prop === 'display' || d.prop === '@display')) out.push({ sel: r.sel, prop: aligns.prop, line: aligns.line, file: r.file });
  }
  return out;
}

export function lintRules({ rules, tokenMap, file }) {
  const warnings = [];
  const cssToColor = makeColorResolver(tokenMap);
  const pageBg = (() => { const raw = tokenMap.get('color.paper'); return raw ? evalColorExpr(raw, (n) => tokenMap.get(n)) : null; })();

  const killedFocus = [];
  const focusBases = new Set();

  for (const r of rules) {
    if (r.pseudo) continue;
    const conditional = (r.media && r.media.length) || (r.signals && r.signals.length) || (r.containers && r.containers.length);
    const states = r.states || new Set();
    const hasFocus = states.has('focus') || states.has('focus-visible');

    // ---- contrast
    if (!conditional) {
      const fgD = lastDecl(r.decls, 'color');
      const bgD = lastDecl(r.decls, 'background-color', 'background');
      if (fgD && bgD && typeof fgD.value === 'string' && typeof bgD.value === 'string') {
        let bg = cssToColor(bgD.value);
        let fg = cssToColor(fgD.value);
        if (bg && fg) {
          // a translucent background takes its look from whatever is behind it, which a single rule cannot know
          // (a dark theme is usually in a media block, and this check only reads the unconditional rules). So judge
          // it against the light page colour, white and black, and warn only when it fails on every one of them.
          const backdrops = bg.a < 0.999 ? [pageBg ? { ...pageBg, a: 1 } : null, { r: 255, g: 255, b: 255, a: 1 }, { r: 0, g: 0, b: 0, a: 1 }].filter(Boolean) : [null];
          let bestRatio = -1, bestFg = null, bestBg = null;
          for (const back of backdrops) {
            const solidBg = back ? over(bg, back) : bg;
            const solidFg = fg.a < 0.999 ? over(fg, solidBg) : fg;
            const rr = contrast(solidFg, solidBg);
            if (rr > bestRatio) { bestRatio = rr; bestFg = solidFg; bestBg = solidBg; }
          }
          if (bestBg) {
            const fgSolid = bestFg;
            bg = bestBg;
            const ratio = bestRatio;
            const size = pxOf((lastDecl(r.decls, 'font-size') || {}).value);
            const weightRaw = (lastDecl(r.decls, 'font-weight') || {}).value;
            const weight = weightRaw === 'bold' ? 700 : Number(weightRaw) || 400;
            const large = size !== null && (size >= 24 || (size >= 18.66 && weight >= 700));
            const need = large ? 3 : 4.5;
            if (ratio < need) {
              warnings.push({
                file, line: fgD.line,
                message: `text contrast is ${ratio.toFixed(1)}:1 (${toHex(fgSolid)} on ${toHex(bg)}), below the ${need}:1 that readers need${large ? ' for large text' : ''}`,
                hint: 'pick a darker or lighter text colour (WCAG AA). Contrast is only checked for a colour and a background written in the same rule',
              });
            }
          }
        }
      }
    }

    // ---- focus
    if (hasFocus) focusBases.add(r.sel.replace(/:(focus-visible|focus)\b/g, '').trim());
    if (!hasFocus && INTERACTIVE.test(finalCompound(r.sel).replace(/[.#:][\w-]+.*$/, (m) => m.startsWith('[') ? m : '') || finalCompound(r.sel))) {
      for (const d of r.decls) {
        const v = String(d.value).trim();
        const killed = (d.prop === 'outline' && /^(none|0|0px)(\s|$)/.test(v)) || (d.prop === 'outline-style' && v === 'none') || (d.prop === 'outline-width' && /^0(px)?$/.test(v));
        if (killed) { killedFocus.push({ sel: r.sel, line: d.line }); break; }
      }
    }

    // ---- tap target
    const tag = finalCompound(r.sel);
    if (!conditional && /^(button|a)\b|\[role=["']?button/.test(tag)) {
      for (const dim of ['width', 'height', 'min-width', 'min-height']) {
        const d = lastDecl(r.decls, dim);
        const px = d && pxOf(d.value);
        if (px !== null && px !== undefined && px < 24 && px > 0) {
          warnings.push({
            file, line: d.line,
            message: `${dim}: ${px}px on "${r.sel}" is below 24px, the smallest target WCAG 2.2 allows`,
            hint: 'give buttons and links at least 24px (44px is comfortable for a thumb), or add padding instead of shrinking the box',
          });
          break;
        }
      }
    }
  }

  for (const k of killedFocus) {
    if (focusBases.has(k.sel)) continue;
    warnings.push({
      file, line: k.line,
      message: `the focus outline is removed from "${k.sel}" and nothing replaces it, so keyboard users lose their place`,
      hint: 'add a focus-visible { outline: 2 solid color.accent } block, or `use focus-ring` if you have that behavior',
    });
  }
  return warnings;
}

/* ------------------------------------------------------------------ *
 * rules that can never win (0.15.0)
 * ------------------------------------------------------------------ */

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };

/** split a selector at top-level spaces and > + ~ (outside brackets and parentheses); null when it holds a top-level comma */
function selectorParts(sel) {
  const parts = []; let depth = 0, cur = '', q = null;
  for (const ch of String(sel).trim()) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && ch === ',') return null;
    if (depth === 0 && (ch === ' ' || ch === '>' || ch === '+' || ch === '~')) { if (cur) { parts.push(cur); cur = ''; } parts.push(ch === ' ' ? ' ' : ch); continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

/** the simple selectors of one compound: `div.a#b[x]:not(.c)` is div, .a, #b, [x], :not(.c) */
function simpleSelectors(compound) {
  const out = []; let i = 0; const n = compound.length;
  const take = (start) => {
    let j = start + 1, depth = 0;
    while (j < n) {
      const c = compound[j];
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
      else if (depth === 0 && /[.#:\[]/.test(c)) break;
      j++;
    }
    return j;
  };
  if (/^[a-zA-Z*]/.test(compound)) { let j = 0; while (j < n && /[\w*-]/.test(compound[j])) j++; out.push(compound.slice(0, j).toLowerCase()); i = j; }
  while (i < n) {
    const j = compound[i] === ':' && compound[i + 1] === ':' ? take(i + 1) : take(i);
    out.push(compound.slice(i, j)); i = j;
  }
  return out;
}

/**
 * A rule whose every declaration of a property is beaten by a LATER rule that matches everything it matches. There is no specificity
 * in DSSL, so `.prop.broc { z-index: 1 }` in one file loses to a plain `.prop { z-index: 2 }` in a file that comes after it, and the
 * line does nothing at all. (The very same selector again is left alone: that is how a later file overrides an earlier one.) Both rules must be unconditional alike (same @media, @signal, container, state) and the later one must be
 * in the same layer or a higher one. Pure; rules from several files must already carry one global `order`.
 * @returns {Array<{a:{sel,file,line,props:string[]}, b:{sel,file,line}}>}
 */
export function shadowedRules(rules) {
  const info = [];
  for (const r of rules) {
    if (!r || r.pseudo || !r.sel || !r.decls || !r.decls.length) continue;
    const parts = selectorParts(r.sel);
    if (!parts || !parts.length) continue;
    const comp = parts[parts.length - 1];
    if (/^[ >+~]$/.test(comp)) continue;
    if (/^:root$|::/.test(r.sel)) continue;
    const toks = simpleSelectors(comp);
    if (!toks.length) continue;
    const cond = JSON.stringify([r.media || [], (r.signals || []).map((s) => [s.name, s.op, s.value, s.values]), r.containers || [], [...(r.states || [])].sort()]);
    info.push({ idx: info.length, r, toks, set: new Set(toks), single: parts.length === 1, cond, rank: LAYER_RANK[r.layer] ?? 2, order: r.order ?? 0 });
  }
  // the later rules, found by the first simple selector they need
  const byTok = new Map();
  for (const b of info) if (b.single) { const k = b.toks[0]; if (!byTok.has(k)) byTok.set(k, []); byTok.get(k).push(b); }
  const pairs = new Map();
  for (const a of info) {
    const seenProps = new Set();
    const cands = [];
    for (const t of a.toks) for (const b of byTok.get(t) || []) cands.push(b);
    if (byTok.has('*')) for (const b of byTok.get('*')) cands.push(b);
    cands.sort((x, y) => x.order - y.order);
    for (const b of cands) {
      if (b === a || b.cond !== a.cond) continue;
      if (b.r.sel.replace(/\s+/g, ' ').trim() === a.r.sel.replace(/\s+/g, ' ').trim()) continue;   // the same selector again is an override on purpose (a theme file, a later tweak)
      if (b.rank < a.rank || (b.rank === a.rank && b.order <= a.order)) continue;
      if (b.toks.some((t) => t !== '*' && !a.set.has(t))) continue;
      const bProps = new Map();
      for (const d of b.r.decls) if (d.prop && !String(d.prop).startsWith('@')) bProps.set(d.prop, d.value);
      const hit = [];
      for (const d of a.r.decls) {
        const p = d.prop;
        if (!p || String(p).startsWith('@') || seenProps.has(p) || !bProps.has(p)) continue;
        if (String(bProps.get(p)) === String(d.value)) continue;
        seenProps.add(p); hit.push(p);
      }
      if (hit.length) {
        const key = a.idx + '>' + b.idx;
        pairs.set(key, { a: { sel: a.r.sel, file: a.r.file, line: (a.r.decls.find((d) => d.prop === hit[0]) || a.r).line ?? a.r.line, props: hit }, b: { sel: b.r.sel, file: b.r.file, line: b.r.line } });
      }
    }
  }
  return [...pairs.values()];
}

/** the same, as compiler warnings */
export function shadowWarnings(rules) {
  return shadowedRules(rules).map((p) => ({
    file: p.a.file, line: p.a.line,
    message: `${p.a.props.join(', ')} in "${p.a.sel}" can never apply: "${p.b.sel}" (${p.b.file || ''}${p.b.file ? ':' : ''}${p.b.line}) comes later, matches every element this rule matches, and sets ${p.a.props.length > 1 ? 'the same properties' : 'the same property'}`,
    hint: 'there is no specificity in DSSL, so the later rule always wins. Move the more specific rule below the general one, or remove the line from the general one',
  }));
}
