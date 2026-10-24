/* =========================================================================
 * DSSL: fonts.js (0.12.0)
 *
 *   fonts {
 *     Fraunces: 500 700 800                  // from Google Fonts, these weights
 *     "Hanken Grotesk": 400 700 italic       // with the italics too
 *     Inter: 100..900 display optional       // a variable range, and how it swaps in
 *     Brand: from "/fonts/brand.woff2" 400   // your own file: becomes @font-face
 *   }
 *
 * Fonts used to need a raw { } block of plain CSS. A font is a stylesheet link
 * (Google) or an @font-face (your file), and neither belongs in a rule, so this
 * is its own block. At run time the engine adds the <link> to <head>; `dssl build`
 * writes an @import at the top of the CSS.
 *
 * Google's servers see every visitor who loads a Google font. If that matters
 * to you (it does under some privacy laws), self-host with `from`.
 * ========================================================================= */

export const FONT_WORDS = {
  weights: 'a weight (400), several (400 700), or a variable range (100..900)',
  italic: 'also load the italic of each weight',
  display: 'display <swap|block|fallback|optional>: how the text behaves while the font loads (default swap)',
  from: 'from "/path/to/file.woff2": use your own file instead of Google Fonts',
};
const DISPLAYS = ['swap', 'block', 'fallback', 'optional', 'auto'];
const FORMATS = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };

const words = (s) => {
  const out = []; let i = 0;
  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '"' || s[i] === "'") { const q = s[i]; let j = i + 1; while (j < s.length && s[j] !== q) j++; out.push(s.slice(i, j + 1)); i = j + 1; continue; }
    let j = i; while (j < s.length && !/\s/.test(s[j])) j++; out.push(s.slice(i, j)); i = j;
  }
  return out;
};
const unq = (w) => (/^(["']).*\1$/.test(w) ? w.slice(1, -1) : w);

/**
 * Parse the text inside `fonts { ... }`.
 * hooks.error(line, message, hint) reports a problem, hooks.suggest(word, list) gives a did-you-mean.
 * Returns { links: [{ url, line }], faces: [css], families: [name] }.
 */
export function parseFonts(body, firstLine, hooks) {
  const google = new Map();            // family -> { weights:Set<string>, italic:bool }
  let display = 'swap';
  const faces = [], families = [];
  const lines = String(body).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).split('\n');
  lines.forEach((raw, idx) => {
    const line = firstLine + idx;
    let text = raw.replace(/(^|\s)\/\/.*$/, '').trim().replace(/;$/, '');
    if (!text) return;
    // the family may be quoted, or bare words ("Hanken Grotesk"): everything before the first colon outside quotes
    let colon = -1, q = null;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === q) q = null; continue; } if (c === '"' || c === "'") { q = c; continue; } if (c === ':') { colon = i; break; } }
    if (colon === -1) { hooks.error(line, `expected "Family: weights" in "${text.slice(0, 40)}"`, 'e.g.  Fraunces: 500 700 800'); return; }
    const family = unq(text.slice(0, colon).trim()).replace(/\s+/g, ' ');
    if (!family) { hooks.error(line, 'a font line needs a family name before the colon'); return; }
    const w = words(text.slice(colon + 1));
    const weights = []; let italic = false, from = null, disp = null;
    for (let i = 0; i < w.length; i++) {
      const x = w[i];
      if (/^\d{1,4}$/.test(x) || /^\d{1,4}\.\.\d{1,4}$/.test(x)) {
        const [a, b] = x.split('..').map(Number);
        if (a < 1 || a > 1000 || (b !== undefined && (b < 1 || b > 1000 || b <= a))) { hooks.error(line, `"${x}" is not a font weight`, FONT_WORDS.weights); return; }
        weights.push(x);
      } else if (x === 'italic') italic = true;
      else if (x === 'display') {
        if (!DISPLAYS.includes(w[i + 1])) { hooks.error(line, `display needs one of: ${DISPLAYS.join(', ')}`, FONT_WORDS.display); return; }
        disp = w[++i];
      } else if (x === 'from') {
        if (!w[i + 1]) { hooks.error(line, 'from needs a file, e.g. from "/fonts/brand.woff2"', FONT_WORDS.from); return; }
        from = unq(w[++i]);
      } else {
        hooks.error(line, `unknown font setting "${x}"`, (hooks.suggest && hooks.suggest(x, ['italic', 'display', 'from'])) || 'a line is: Family: weights italic display swap, or Family: from "file" weight');
        return;
      }
    }
    if (!families.includes(family)) families.push(family);
    if (from) {
      if (weights.length > 1) { hooks.error(line, 'one font file holds one weight (or one variable range), so give from a single weight', 'add one line per file'); return; }
      const ext = (from.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1];
      const fmt = ext && FORMATS[ext.toLowerCase()];
      const weight = weights[0] ? weights[0].replace('..', ' ') : '400';
      faces.push(`@font-face {\n  font-family: "${family}";\n  src: url("${from}")${fmt ? ` format("${fmt}")` : ''};\n  font-weight: ${weight};\n  font-style: ${italic ? 'italic' : 'normal'};\n  font-display: ${disp || 'swap'};\n}`);
      return;
    }
    if (disp) display = disp;
    const g = google.get(family) || { weights: new Set(), italic: false };
    for (const x of weights) g.weights.add(x);
    if (italic) g.italic = true;
    google.set(family, g);
  });

  const links = [];
  if (google.size) {
    const parts = [];
    for (const [fam, g] of google) {
      const name = fam.replace(/ /g, '+');
      const ws = [...g.weights].sort((a, b) => parseInt(a) - parseInt(b));
      if (!ws.length) { parts.push(g.italic ? `${name}:ital@0;1` : name); continue; }
      if (g.italic) {
        const axis = [];
        for (const it of [0, 1]) for (const x of ws) axis.push(`${it},${x}`);
        parts.push(`${name}:ital,wght@${axis.join(';')}`);
      } else parts.push(`${name}:wght@${ws.join(';')}`);
    }
    links.push({ url: `https://fonts.googleapis.com/css2?family=${parts.join('&family=')}&display=${display}`, line: firstLine });
  }
  return { links, faces, families };
}
