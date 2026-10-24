/* =========================================================================
 * DSSL: slider.js
 *
 *   input[type=range] {
 *     slider: track 6 color.line radius full, fill color.accent,
 *             thumb 24 color.paper shape circle, ring 3 color.accent,
 *             glow color.accent 14, ticks 10 color.muted
 *   }
 *
 * A range input is styled through vendor pseudo-elements, and every engine has
 * its own: ::-webkit-slider-runnable-track and ::-webkit-slider-thumb for
 * Chrome, Edge, Safari and Opera, ::-moz-range-track, ::-moz-range-thumb and
 * ::-moz-range-progress for Firefox. Writing both sets by hand is the pain.
 * `slider:` writes both from one description.
 *
 * It is plain CSS, with one small helper: the filled part of the track (and
 * the coloured bars of a graph) follow the value, which CSS cannot know, so
 * the engine keeps --dssl-p (the value as 0..1) up to date on the input.
 *
 * Clauses, comma separated:
 *   track <height> [color] [radius <n>|full]
 *   fill <color> | fill none
 *   thumb <size> [color]
 *   shape circle | square | diamond | pill | bar
 *   ring <width> <color>              a border around the thumb
 *   glow <color> <radius>             a soft light around the thumb
 *   ticks <count> [color] [length]    little marks along the track
 *   graph <v1> <v2> ...               bars (0 to 100) behind the track, a histogram slider
 *   graph-height <px>   graph-gap <px>
 *
 * Pure: no DOM.
 * ========================================================================= */

import { splitWords } from './texture.js';

export const SLIDER_CLAUSES = {
  track: 'track [height] [color] [radius <n>|full]',
  fill: 'fill <color> | fill none',
  thumb: 'thumb <size> [color]',
  shape: 'shape circle | square | diamond | pill | bar',
  ring: 'ring <width> <color>',
  glow: 'glow <color> <radius>',
  ticks: 'ticks <count> [color] [length]',
  graph: 'graph <v1> <v2> ... (each 0 to 100)',
  'graph-height': 'graph-height <px>',
  'graph-gap': 'graph-gap <px>',
};
export const THUMB_SHAPES = ['circle', 'square', 'diamond', 'pill', 'bar'];

function splitCommas(s) {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
const isNum = (w) => w !== undefined && w !== '' && !Number.isNaN(Number(w));

/**
 * hooks: { error(msg, hint), color(word) -> css | null, suggest(word, list) -> string | null }
 * Returns a spec object, or null when something was wrong.
 */
export function parseSlider(value, hooks) {
  const text = String(value || '').trim();
  if (!text) { hooks.error('slider needs a description', 'e.g. slider: track 6 color.line, fill color.accent, thumb 22 color.accent'); return null; }
  const spec = { track: { h: 6, color: 'var(--dssl-color-line)', radius: 'full' }, fill: 'var(--dssl-color-accent)', thumb: { size: 22, color: 'var(--dssl-color-accent)' }, shape: 'circle', ring: null, glow: null, ticks: null, graph: null, graphHeight: 40, graphGap: 2 };
  const bad = (m, h) => { hooks.error(m, h); return null; };
  const col = (w) => hooks.color(w);

  for (const clause of splitCommas(text)) {
    const w = splitWords(clause);
    const head = w[0];
    if (!(head in SLIDER_CLAUSES)) {
      return bad(`unknown slider setting "${head}"`, hooks.suggest(head, Object.keys(SLIDER_CLAUSES)) || `settings: ${Object.keys(SLIDER_CLAUSES).join(', ')}`);
    }
    const rest = w.slice(1);
    // each clause reports how many words it understood; anything left over is a mistake, not noise
    let used = rest.length;
    if (head === 'track') {
      // any order: a number is the height, "radius <n>|full" the corners, anything else a colour
      let i = 0;
      while (i < rest.length) {
        const x = rest[i];
        if (x === 'radius') {
          const r = rest[i + 1];
          if (r === 'full') spec.track.radius = 'full';
          else if (isNum(r)) spec.track.radius = Number(r);
          else return bad('track radius needs a number or "full"', SLIDER_CLAUSES.track);
          i += 2;
        } else if (isNum(x)) { spec.track.h = Number(x); i++; }
        else { const c = col(x); if (c === null) return null; spec.track.color = c; i++; }
      }
    } else if (head === 'fill') {
      used = 1;
      if (rest[0] === 'none') spec.fill = null;
      else { const c = col(rest[0]); if (c === null) return null; spec.fill = c; }
    } else if (head === 'thumb') {
      if (!isNum(rest[0])) return bad('thumb needs a size in px', SLIDER_CLAUSES.thumb);
      spec.thumb.size = Number(rest[0]);
      used = 1;
      if (rest[1]) { used = 2; const c = col(rest[1]); if (c === null) return null; spec.thumb.color = c; }
    } else if (head === 'shape') {
      if (!THUMB_SHAPES.includes(rest[0])) return bad(`unknown thumb shape "${rest[0] ?? ''}"`, hooks.suggest(rest[0] || '', THUMB_SHAPES) || `use one of: ${THUMB_SHAPES.join(', ')}`);
      spec.shape = rest[0];
      used = 1;
    } else if (head === 'ring') {
      if (!isNum(rest[0]) || !rest[1]) return bad('ring needs a width and a colour', SLIDER_CLAUSES.ring);
      const c = col(rest[1]); if (c === null) return null;
      spec.ring = { w: Number(rest[0]), color: c };
      used = 2;
    } else if (head === 'glow') {
      if (!rest[0]) return bad('glow needs a colour and a radius', SLIDER_CLAUSES.glow);
      const c = col(rest[0]); if (c === null) return null;
      spec.glow = { color: c, r: isNum(rest[1]) ? Number(rest[1]) : 12 };
      used = isNum(rest[1]) ? 2 : 1;
    } else if (head === 'ticks') {
      if (!isNum(rest[0]) || Number(rest[0]) < 2) return bad('ticks needs a count of at least 2', SLIDER_CLAUSES.ticks);
      let color = 'var(--dssl-color-muted)', len = 6;
      for (const x of rest.slice(1)) { if (isNum(x)) len = Number(x); else { const c = col(x); if (c === null) return null; color = c; } }
      spec.ticks = { n: Math.round(Number(rest[0])), color, len };
    } else if (head === 'graph') {
      const vals = rest.map(Number);
      if (vals.length < 2 || vals.some((n) => Number.isNaN(n))) return bad('graph needs at least two numbers', SLIDER_CLAUSES.graph);
      if (vals.some((n) => n < 0 || n > 100)) return bad('graph values are 0 to 100', SLIDER_CLAUSES.graph);
      if (vals.length > 120) return bad('graph is limited to 120 bars', null);
      spec.graph = vals;
    } else if (head === 'graph-height') {
      if (!isNum(rest[0]) || Number(rest[0]) < 8) return bad('graph-height needs a number of px, at least 8', null);
      spec.graphHeight = Number(rest[0]);
      used = 1;
    } else if (head === 'graph-gap') {
      if (!isNum(rest[0]) || Number(rest[0]) < 0) return bad('graph-gap needs a number of px', null);
      spec.graphGap = Number(rest[0]);
      used = 1;
    }
    if (used < rest.length) {
      return bad(`unexpected "${rest.slice(used).join(' ')}" in the ${head} setting`, `separate settings with commas, e.g. thumb 16 #fff, shape bar. ${SLIDER_CLAUSES[head]}`);
    }
  }
  return spec;
}

const f = (n) => String(+Number(n).toFixed(2));

/**
 * Build the CSS for a parsed slider.
 * Returns { base: [{prop,value}], shadow: [{pseudo, decls:[{prop,value}]}] }
 * `base` goes on the element itself, `shadow` are the vendor pseudo-element rules.
 */
export function sliderCss(spec) {
  const T = spec.track.h;
  const hasGraph = !!spec.graph;
  const G = spec.graphHeight;
  const trackH = hasGraph ? G : T;
  const S = spec.thumb.size;
  // thumb box by shape
  let tw = S, th = S, tr = '0', rot = '';
  if (spec.shape === 'circle') tr = '50%';
  else if (spec.shape === 'square') tr = `${f(Math.min(6, S / 4))}px`;
  else if (spec.shape === 'diamond') { tr = '2px'; rot = 'rotate(45deg)'; tw = th = S * 0.82; }
  else if (spec.shape === 'pill') { tw = S * 0.7; th = S * 1.3; tr = '999px'; }
  else if (spec.shape === 'bar') { tw = Math.max(4, S * 0.25); th = hasGraph ? G + 6 : S * 1.4; tr = '2px'; }
  const ringW = spec.ring ? spec.ring.w : 0;
  // a fully rounded track would clip a graph's bars into a semicircle, so graphs default to small corners
  const trackRadius = spec.track.radius === 'full' ? (hasGraph ? '4px' : `${f(trackH / 2)}px`) : `${f(spec.track.radius)}px`;
  const inputH = Math.max(trackH, th) + (spec.ticks ? spec.ticks.len + 2 : 0);

  const p = 'var(--dssl-p, 0.5)';
  // where the thumb centre is, as a length along the track
  const along = `calc(${f(tw / 2)}px + ${p} * (100% - ${f(tw)}px))`;
  const trackColor = spec.track.color;
  const fill = spec.fill;

  // ---- the track's background
  const layers = []; // each: [image, size, position]
  if (hasGraph) {
    const n = spec.graph.length;
    const lineH = Math.max(2, T);
    const usable = G - lineH - 2;
    spec.graph.forEach((v, i) => {
      const x = n === 1 ? 50 : (i / (n - 1)) * 100;
      const bw = `calc((100% - ${f((n - 1) * spec.graphGap)}px) / ${n})`;
      const bh = Math.max(1, (usable * v) / 100);
      const mixer = fill
        ? `color-mix(in srgb, ${fill} calc(clamp(0, (${p} - ${f((i + 0.5) / n)}) * 1000, 1) * 100%), ${trackColor})`
        : trackColor;
      layers.push([`linear-gradient(${mixer}, ${mixer})`, `${bw} ${f(bh)}px`, `${f(x)}% calc(100% - ${f(lineH + 2)}px)`]);
    });
    const line = fill ? `linear-gradient(to right, ${fill} 0, ${fill} ${along}, ${trackColor} ${along}, ${trackColor} 100%)` : `linear-gradient(${trackColor}, ${trackColor})`;
    layers.push([line, `100% ${f(lineH)}px`, '0 100%']);
  } else if (fill) {
    layers.push([`linear-gradient(to right, ${fill} 0, ${fill} ${along}, ${trackColor} ${along}, ${trackColor} 100%)`, '100% 100%', '0 0']);
  } else {
    layers.push([`linear-gradient(${trackColor}, ${trackColor})`, '100% 100%', '0 0']);
  }
  const trackBg = [
    { prop: 'background-image', value: layers.map((l) => l[0]).join(', ') },
    { prop: 'background-size', value: layers.map((l) => l[1]).join(', ') },
    { prop: 'background-position', value: layers.map((l) => l[2]).join(', ') },
    { prop: 'background-repeat', value: 'no-repeat' },
  ];

  const thumbCommon = [
    { prop: 'box-sizing', value: 'border-box' },
    { prop: 'width', value: `${f(tw)}px` },
    { prop: 'height', value: `${f(th)}px` },
    { prop: 'background', value: spec.thumb.color },
    { prop: 'border-radius', value: tr },
    { prop: 'border', value: ringW ? `${f(ringW)}px solid ${spec.ring.color}` : '0' },
    { prop: 'cursor', value: 'pointer' },
  ];
  const glow = spec.glow ? [{ prop: 'box-shadow', value: `0 0 ${f(spec.glow.r)}px ${f(spec.glow.r / 3)}px ${spec.glow.color}` }] : [];
  if (rot) thumbCommon.push({ prop: 'transform', value: rot });

  const base = [
    { prop: 'appearance', value: 'none' },
    { prop: '-webkit-appearance', value: 'none' },
    { prop: 'background-color', value: 'transparent' },
    { prop: 'margin', value: '0' },
    { prop: 'width', value: '100%' },
    { prop: 'height', value: `${f(inputH)}px` },
    { prop: 'cursor', value: 'pointer' },
  ];
  if (spec.ticks) {
    const n = spec.ticks.n;
    base.push(
      { prop: 'background-image', value: `repeating-linear-gradient(to right, ${spec.ticks.color} 0, ${spec.ticks.color} 1px, transparent 1px, transparent calc((100% - 1px) / ${n - 1}))` },
      { prop: 'background-size', value: `calc(100% - ${f(tw)}px) ${f(spec.ticks.len)}px` },
      { prop: 'background-position', value: `center bottom` },
      { prop: 'background-repeat', value: 'no-repeat' },
    );
  }

  const shadow = [
    { pseudo: '-webkit-slider-runnable-track', decls: [{ prop: 'height', value: `${f(trackH)}px` }, { prop: 'border-radius', value: trackRadius }, ...trackBg] },
    { pseudo: '-webkit-slider-thumb', decls: [
      { prop: '-webkit-appearance', value: 'none' }, { prop: 'appearance', value: 'none' }, ...thumbCommon, ...glow,
      { prop: 'margin-top', value: `${f((trackH - th) / 2)}px` },
    ] },
    { pseudo: '-moz-range-track', decls: [{ prop: 'height', value: `${f(trackH)}px` }, { prop: 'border-radius', value: trackRadius }, ...trackBg] },
    { pseudo: '-moz-range-thumb', decls: [...thumbCommon, ...glow] },
    // Firefox can fill natively, but we paint the fill ourselves (above) so both engines match
    { pseudo: '-moz-range-progress', decls: [{ prop: 'background', value: 'transparent' }, { prop: 'height', value: `${f(trackH)}px` }] },
  ];
  return { base, shadow };
}
