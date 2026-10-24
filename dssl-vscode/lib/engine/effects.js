/* =========================================================================
 * DSSL: effects.js (0.10.0)
 *
 *   glass: 18                          frosted glass: blur what is behind it
 *   glass: 24 saturate 1.8 tint white/12
 *   tilt: 10                           follows the pointer in 3D
 *   tilt: 12 lift 1.04 glare           also scales up, and exposes --dssl-gx/--dssl-gy
 *
 * glass is plain CSS (backdrop-filter plus a translucent background), so it
 * survives `dssl build`. tilt needs the pointer, so it stays in the engine.
 * ========================================================================= */

import { splitWords } from './texture.js';

const isNum = (w) => w !== undefined && w !== '' && !Number.isNaN(Number(w));

export const GLASS_WORDS = {
  blur: 'a number: how many px to blur what is behind the element (default 16)',
  saturate: 'saturate <n>: colour boost for what shows through, 1 is unchanged (default 1.5)',
  bright: 'bright <n>: brightness of what shows through, 1 is unchanged',
  tint: 'tint <color> | tint none: the milky layer on top (default: a faint wash of the text colour)',
};

export const TILT_WORDS = {
  max: 'a number: the largest tilt in degrees (default 8)',
  lift: 'lift <n>: scale while the pointer is over it, e.g. 1.04',
  perspective: 'perspective <px>: how strong the 3D depth looks (default 900)',
  speed: 'speed <0.05 to 1>: how quickly it follows (default 0.18)',
  invert: 'invert: tilt away from the pointer instead of toward it',
  glare: 'glare: also keep --dssl-gx and --dssl-gy (0% to 100%) pointing at the pointer, for your own highlight',
};

/** `glass:` value -> declarations, or null after reporting an error */
export function glassDecls(value, hooks) {
  const w = splitWords(String(value || '').trim());
  if (w[0] === 'none') return [{ prop: 'backdrop-filter', value: 'none' }];
  let blur = 16, sat = 1.5, bright = null, tint;
  const bad = (m, h) => { hooks.error(m, h); return null; };
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    if (isNum(x)) { blur = Number(x); continue; }
    if (x === 'saturate' || x === 'bright') {
      if (!isNum(w[i + 1])) return bad(`${x} needs a number`, GLASS_WORDS[x]);
      if (x === 'saturate') sat = Number(w[i + 1]); else bright = Number(w[i + 1]);
      i++; continue;
    }
    if (x === 'tint') {
      const c = w[i + 1];
      if (!c) return bad('tint needs a color or "none"', GLASS_WORDS.tint);
      if (c === 'none') tint = null;
      else { const css = hooks.color(c); if (css === null) return null; tint = css; }
      i++; continue;
    }
    // a bare colour word is a tint, anything else is a typo
    if (hooks.looksLikeColor && hooks.looksLikeColor(x)) {
      const css = hooks.color(x); if (css === null) return null; tint = css; continue;
    }
    return bad(`unknown glass setting "${x}"`, hooks.suggest(x, ['saturate', 'bright', 'tint', 'none']) || 'settings: a blur number, saturate, bright, tint');
  }
  if (blur < 0) return bad('glass blur cannot be negative', GLASS_WORDS.blur);
  const fx = [`blur(${blur}px)`, `saturate(${sat})`];
  if (bright !== null) fx.push(`brightness(${bright})`);
  const out = [{ prop: 'backdrop-filter', value: fx.join(' ') }];
  if (tint === undefined) tint = 'color-mix(in srgb, currentColor 8%, transparent)';
  if (tint !== null) out.push({ prop: 'background-color', value: tint });
  return out;
}

/** `tilt:` value -> a spec for the engine, `null` to clear it, or undefined after an error */
export function parseTilt(value, hooks) {
  const w = splitWords(String(value || '').trim());
  if (!w.length) { hooks.error('tilt needs a number of degrees', 'e.g. tilt: 10'); return undefined; }
  if (w[0] === 'none') return null;
  const spec = { max: 8, lift: 1, perspective: 900, speed: 0.18, invert: false, glare: false };
  const bad = (m, h) => { hooks.error(m, h); return undefined; };
  const needNum = (name, i) => (isNum(w[i + 1]) ? Number(w[i + 1]) : null);
  for (let i = 0; i < w.length; i++) {
    const x = w[i];
    if (isNum(x)) { spec.max = Number(x); continue; }
    if (x === 'invert') { spec.invert = true; continue; }
    if (x === 'glare') { spec.glare = true; continue; }
    if (x === 'lift' || x === 'perspective' || x === 'speed') {
      const n = needNum(x, i);
      if (n === null) return bad(`${x} needs a number`, TILT_WORDS[x]);
      spec[x] = n; i++; continue;
    }
    return bad(`unknown tilt setting "${x}"`, hooks.suggest(x, ['lift', 'perspective', 'speed', 'invert', 'glare', 'none']) || 'settings: a degrees number, lift, perspective, speed, invert, glare');
  }
  if (spec.max < 0 || spec.max > 45) return bad('tilt degrees should be between 0 and 45', TILT_WORDS.max);
  if (spec.lift <= 0) return bad('lift must be above 0', TILT_WORDS.lift);
  if (spec.perspective < 100) return bad('perspective must be at least 100px', TILT_WORDS.perspective);
  if (spec.speed < 0.02 || spec.speed > 1) return bad('speed must be between 0.02 and 1', TILT_WORDS.speed);
  return spec;
}

/** the transform pieces tilt adds after whatever the author wrote; they read variables the engine updates */
export function tiltTransform(spec) {
  return `perspective(${spec.perspective}px) rotateX(var(--dssl-tx, 0deg)) rotateY(var(--dssl-ty, 0deg)) scale(var(--dssl-ts, 1))`;
}
