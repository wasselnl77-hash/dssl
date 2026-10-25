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
