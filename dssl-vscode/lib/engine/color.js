/* =========================================================================
 * DSSL: color.js
 *
 * One small colour library for everything that has to know what a colour
 * actually IS: the contrast lint, aura particles painted on a canvas, texture
 * tints baked into SVG. No dependencies, no DOM.
 *
 * Colours are { r, g, b, a } with r/g/b in 0..255 and a in 0..1.
 *
 * parseColor handles what the browser hands back as well as what people
 * write: #rgb #rgba #rrggbb #rrggbbaa, rgb()/rgba(), hsl()/hsla(), oklab(),
 * oklch(), color(srgb ...), color-mix(in <space> A p%, B), the CSS names, and
 * transparent. Anything it cannot read returns null, and callers decide
 * whether that is an error (a texture colour) or silence (a lint check).
 * ========================================================================= */

const NAMED = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff', aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc', bisque: '#ffe4c4', black: '#000000',
  blanchedalmond: '#ffebcd', blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a', burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed', cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff', darkblue: '#00008b',
  darkcyan: '#008b8b', darkgoldenrod: '#b8860b', darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9', darkkhaki: '#bdb76b', darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f', darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000', darksalmon: '#e9967a', darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b', darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f', darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969', dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0', forestgreen: '#228b22',
  fuchsia: '#ff00ff', gainsboro: '#dcdcdc', ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520', gray: '#808080', green: '#008000',
  greenyellow: '#adff2f', grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4', indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0', khaki: '#f0e68c',
  lavender: '#e6e6fa', lavenderblush: '#fff0f5', lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6', lightcoral: '#f08080',
  lightcyan: '#e0ffff', lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3', lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa', lightslategray: '#778899', lightslategrey: '#778899', lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0', lime: '#00ff00', limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff', maroon: '#800000', mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd', mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371', mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc', mediumvioletred: '#c71585', midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1', moccasin: '#ffe4b5',
  navajowhite: '#ffdead', navy: '#000080', oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23', orange: '#ffa500', orangered: '#ff4500',
  orchid: '#da70d6', palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee', palevioletred: '#db7093', papayawhip: '#ffefd5',
  peachpuff: '#ffdab9', peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6', purple: '#800080', rebeccapurple: '#663399', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513', salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57', seashell: '#fff5ee',
  sienna: '#a0522d', silver: '#c0c0c0', skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090', slategrey: '#708090', snow: '#fffafa',
  springgreen: '#00ff7f', steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080', thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0', violet: '#ee82ee',
  wheat: '#f5deb3', white: '#ffffff', whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
};

export const TRANSPARENT = { r: 0, g: 0, b: 0, a: 0 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round = (x) => Math.round(x);

/* ---------- colour-space maths ---------- */

const srgbToLinear = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const linearToSrgb = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return clamp(v, 0, 1) * 255; };

function oklabToSrgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

function srgbToOklab(r, g, b) {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); l = clamp(l, 0, 1);
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/* ---------- parsing ---------- */

/** a number or a percentage; `scale` is what 100% means (255 for rgb, 1 for alpha...) */
function num(tok, scale = 1) {
  if (tok === undefined || tok === null) return null;
  const t = String(tok).trim();
  if (t === 'none') return 0;
  if (t.endsWith('%')) { const n = parseFloat(t); return Number.isNaN(n) ? null : (n / 100) * scale; }
  const n = parseFloat(t);
  return Number.isNaN(n) ? null : n;
}

function angle(tok) {
  const t = String(tok).trim();
  if (t === 'none') return 0;
  const n = parseFloat(t);
  if (Number.isNaN(n)) return null;
  if (t.endsWith('turn')) return n * 360;
  if (t.endsWith('rad')) return (n * 180) / Math.PI;
  if (t.endsWith('grad')) return n * 0.9;
  return n;
}

/** split "a b c / d" or "a, b, c, d" function arguments at the top level */
function splitArgs(body) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && (ch === ',' || ch === '/' || /\s/.test(ch))) {
      if (cur) out.push(cur);
      cur = '';
      if (ch === '/') out.push('/');
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** parse any one CSS colour. Returns {r,g,b,a} or null. */
export function parseColor(input) {
  if (input === null || input === undefined) return null;
  let s = String(input).trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { ...TRANSPARENT };
  if (NAMED[s]) s = NAMED[s];

  if (s[0] === '#') {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const [r, g, b, a] = [...h].map((c) => parseInt(c + c, 16));
      return { r, g, b, a: h.length === 4 ? a / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const fn = /^([a-z-]+)\((.*)\)$/s.exec(s);
  if (!fn) return null;
  const name = fn[1];
  const body = fn[2];

  if (name === 'color-mix') return parseColorMix(body);

  const parts = splitArgs(body);
  const slash = parts.indexOf('/');
  const main = slash === -1 ? parts : parts.slice(0, slash);
  let alpha = 1;
  if (slash !== -1) { alpha = num(parts[slash + 1], 1); if (alpha === null) return null; }
  else if ((name === 'rgba' || name === 'hsla') && main.length === 4) alpha = num(main.pop(), 1);
  else if ((name === 'rgb' || name === 'hsl') && main.length === 4) alpha = num(main.pop(), 1);
  alpha = clamp(alpha, 0, 1);

  if (name === 'rgb' || name === 'rgba') {
    if (main.length !== 3) return null;
    const [r, g, b] = main.map((t) => num(t, 255));
    if ([r, g, b].some((v) => v === null)) return null;
    return { r: clamp(round(r), 0, 255), g: clamp(round(g), 0, 255), b: clamp(round(b), 0, 255), a: alpha };
  }
  if (name === 'hsl' || name === 'hsla') {
    if (main.length !== 3) return null;
    const h = angle(main[0]), sat = num(main[1], 1), l = num(main[2], 1);
    if ([h, sat, l].some((v) => v === null)) return null;
    const [r, g, b] = hslToRgb(h, sat, l);
    return { r: round(r), g: round(g), b: round(b), a: alpha };
  }
  if (name === 'oklab') {
    if (main.length !== 3) return null;
    const L = num(main[0], 1), A = num(main[1], 0.4), B = num(main[2], 0.4);
    if ([L, A, B].some((v) => v === null)) return null;
    const [r, g, b] = oklabToSrgb(L, A, B);
    return { r: round(r), g: round(g), b: round(b), a: alpha };
  }
  if (name === 'oklch') {
    if (main.length !== 3) return null;
    const L = num(main[0], 1), C = num(main[1], 0.4), H = angle(main[2]);
    if ([L, C, H].some((v) => v === null)) return null;
    const rad = (H * Math.PI) / 180;
    const [r, g, b] = oklabToSrgb(L, C * Math.cos(rad), C * Math.sin(rad));
    return { r: round(r), g: round(g), b: round(b), a: alpha };
  }
  if (name === 'color') {
    // what getComputedStyle returns for colour-mix and wide-gamut colours
    const space = main[0];
    if (space !== 'srgb' && space !== 'srgb-linear' && space !== 'display-p3') return null;
    const [r, g, b] = main.slice(1, 4).map((t) => num(t, 1));
    if ([r, g, b].some((v) => v === null)) return null;
    if (space === 'srgb-linear') return { r: round(linearToSrgb(r)), g: round(linearToSrgb(g)), b: round(linearToSrgb(b)), a: alpha };
    // display-p3 is wider than sRGB; clipping to sRGB is fine for canvas and contrast purposes
    return { r: round(clamp(r, 0, 1) * 255), g: round(clamp(g, 0, 1) * 255), b: round(clamp(b, 0, 1) * 255), a: alpha };
  }
  return null;
}

/** color-mix(in oklab, red 30%, blue) / (in srgb, ...) , good enough for what DSSL emits */
function parseColorMix(body) {
  const parts = splitTopLevelCommas(body);
  if (parts.length < 3) return null;
  const spaceM = /^in\s+([a-z-]+)/.exec(parts[0].trim());
  if (!spaceM) return null;
  const space = spaceM[1];
  const one = (txt) => {
    const m = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(txt.trim());
    const color = parseColor(m[1].trim());
    return color ? { color, pct: m[2] === undefined ? null : parseFloat(m[2]) } : null;
  };
  const A = one(parts[1]), B = one(parts[2]);
  if (!A || !B) return null;
  let pa = A.pct, pb = B.pct;
  if (pa === null && pb === null) { pa = 50; pb = 50; }
  else if (pa === null) pa = 100 - pb;
  else if (pb === null) pb = 100 - pa;
  const total = pa + pb;
  if (total <= 0) return null;
  const t = pb / total; // share of B
  const alphaMul = Math.min(1, total / 100);
  const mixed = mix(A.color, B.color, t, space === 'srgb' ? 'srgb' : 'oklab');
  return { ...mixed, a: mixed.a * alphaMul };
}

function splitTopLevelCommas(body) {
  const out = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (depth === 0 && ch === ',') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/* ---------- operations ---------- */

/** premultiplied mix of two colours; t=0 is a, t=1 is b */
export function mix(a, b, t, space = 'oklab') {
  t = clamp(t, 0, 1);
  const alpha = a.a * (1 - t) + b.a * t;
  if (alpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const wa = (a.a * (1 - t)) / alpha, wb = (b.a * t) / alpha;
  if (space === 'srgb') {
    return { r: round(a.r * wa + b.r * wb), g: round(a.g * wa + b.g * wb), b: round(a.b * wa + b.b * wb), a: alpha };
  }
  const A = srgbToOklab(a.r, a.g, a.b), B = srgbToOklab(b.r, b.g, b.b);
  const [r, g, bl] = oklabToSrgb(A[0] * wa + B[0] * wb, A[1] * wa + B[1] * wb, A[2] * wa + B[2] * wb);
  return { r: round(r), g: round(g), b: round(bl), a: alpha };
}

/** paint `fg` over an opaque-or-not `bg` */
export function over(fg, bg) {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const f = (x, y) => round((x * fg.a + y * bg.a * (1 - fg.a)) / a);
  return { r: f(fg.r, bg.r), g: f(fg.g, bg.g), b: f(fg.b, bg.b), a };
}

export const withAlpha = (c, a) => ({ ...c, a: clamp(a, 0, 1) });

/** WCAG relative luminance */
export function luminance(c) {
  return 0.2126 * srgbToLinear(c.r) + 0.7152 * srgbToLinear(c.g) + 0.0722 * srgbToLinear(c.b);
}

/** WCAG contrast ratio between two colours (alpha must already be composited) */
export function contrast(a, b) {
  const L1 = luminance(a), L2 = luminance(b);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

export const toRgba = (c) => `rgba(${c.r}, ${c.g}, ${c.b}, ${+c.a.toFixed(3)})`;
export const toHex = (c) => '#' + [c.r, c.g, c.b].map((v) => round(v).toString(16).padStart(2, '0')).join('');

/**
 * Evaluate a colour EXPRESSION as DSSL writes it, using a token lookup:
 *   color.ink            a token (its value may itself be an expression)
 *   color.ink/40         a token with alpha
 *   #d1006f/50           a literal with alpha
 *   oklch(62% 0.19 35)   anything parseColor reads
 * `lookup(name)` returns the raw token string or undefined. Returns a colour
 * or null when it cannot be known at compile time (a runtime-only var()).
 */
export function evalColorExpr(expr, lookup, depth = 0) {
  if (depth > 8 || expr === null || expr === undefined) return null;
  const s = String(expr).trim();
  if (!s) return null;
  const direct = parseColor(s);
  if (direct) return direct;
  const m = /^(.*?)\/\s*([\d.]+%?)$/.exec(s);
  if (m && !s.includes('(')) {
    const base = evalColorExpr(m[1].trim(), lookup, depth + 1);
    if (!base) return null;
    const a = num(m[2], 1);
    if (a === null) return null;
    return withAlpha(base, (a > 1 && !m[2].endsWith('%') ? a / 100 : a) * base.a);
  }
  if (/^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/i.test(s) && lookup) {
    const raw = lookup(s);
    return raw === undefined ? null : evalColorExpr(raw, lookup, depth + 1);
  }
  return null;
}
