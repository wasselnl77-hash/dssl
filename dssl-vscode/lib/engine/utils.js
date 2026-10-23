/* DSSL — utils.js — tiny shared helpers */

export function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  let cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** best "did you mean ..." suggestion, or undefined */
export function didYouMean(word, candidates) {
  if (!word || !candidates || !candidates.length) return undefined;
  let best = undefined, bestDist = Infinity;
  const w = word.toLowerCase();
  for (const c of candidates) {
    if (!c) continue;
    const d = levenshtein(w, String(c).toLowerCase());
    if (d < bestDist) { bestDist = d; best = c; }
  }
  const tolerance = Math.max(2, Math.floor(w.length / 3));
  return bestDist <= tolerance ? String(best) : undefined;
}

/* ------------------------------------------------------------------ *
 * v0.6.0 — the deform family (bend / bend-y / bend-up / fold / stretch)
 *
 * These are engine-native properties (`@bend`, …) that compose into ONE
 * transform string, so transitions and WAAPI tween them like any other
 * transform. Edge-pinned members (fold plants the top edge, bend-up plants
 * the bottom edge) bake their pivot into the transform with the classic
 * translate · rotate · translate trick — that way they never fight a user
 * transform-origin. In keyframe mode there is no box yet, so they emit a
 * transformOrigin for WAAPI instead.
 * ------------------------------------------------------------------ */

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 1e4) / 1e4;

/**
 * Compose deform parts (+ optional base transform) into a transform string.
 *   d    — { bend, bendY, stretch, stretchAxis, fold, bendUp } numbers, 0 = off
 *   base — an existing transform string to run after the deform parts, or ''
 *   box  — { h } element height for edge-pinned pivots; null in keyframe mode
 * Returns { transform, origin } — origin is only set in keyframe mode.
 */
export function composeDeform(d, base, box) {
  const parts = [];
  let origin = null;
  const has3D = d.bend || d.bendY || d.fold || d.bendUp;
  if (has3D) parts.push('perspective(900px)');
  if (d.bend) parts.push(`rotateX(${d.bend}deg)`);
  if (d.bendY) parts.push(`rotateY(${d.bendY}deg)`);
  const h = box && box.h ? box.h : 0;
  if (d.fold) {          // top edge pinned, bottom folds up toward the viewer
    if (h > 0) parts.push(`translateY(${r2(-h / 2)}px)`, `rotateX(${d.fold}deg)`, `translateY(${r2(h / 2)}px)`);
    else { parts.push(`rotateX(${d.fold}deg)`); origin = '50% 0%'; }
  }
  if (d.bendUp) {        // bottom edge pinned, the element rocks back like a drawbridge
    if (h > 0) parts.push(`translateY(${r2(h / 2)}px)`, `rotateX(${d.bendUp}deg)`, `translateY(${r2(-h / 2)}px)`);
    else { parts.push(`rotateX(${d.bendUp}deg)`); origin = '50% 100%'; }
  }
  if (d.stretch && d.stretch !== 1) {   // squash & stretch — volume stays constant
    const inv = r4(1 / d.stretch);
    parts.push(d.stretchAxis === 'vertical'
      ? `scaleY(${d.stretch}) scaleX(${inv})`
      : `scaleX(${d.stretch}) scaleY(${inv})`);
  }
  const baseT = base && base !== 'none' ? String(base).trim() : '';
  const all = baseT ? [...parts, baseT] : parts;
  return { transform: all.length ? all.join(' ') : 'none', origin };
}

/**
 * v0.6.0 — bend-around: lay n children along a circular arc.
 * Positive deg wraps the row around an invisible ball (a dome, ends dip);
 * negative deg opens it into a smile (ends rise). Returns the pivot radius
 * R (px, measured from each child's center) and one rotation angle per
 * child, or null when there is nothing to arc (fewer than 2 children, no
 * width, or a near-zero angle).
 */
export function arcLayout(n, width, deg) {
  if (!n || n < 2 || !deg || !width || width <= 0) return null;
  const half = (Math.abs(deg) / 2) * Math.PI / 180;
  const sin = Math.sin(half);
  if (sin < 1e-4) return null;
  const R = r2((width / 2) / sin);
  const angles = [];
  for (let i = 0; i < n; i++) angles.push(r2(-deg / 2 + (deg * i) / (n - 1)));
  return { R, angles };
}
