/* test-v090.mjs: the pure half of 0.9.0 (no browser needed).
 *   color, texture, aura, slider: parsing, vocabulary and error messages
 *   the resolver: properties, slider shadow rules, engine-native declarations
 *   lint: contrast, focus, tap targets
 *   import: CSS to DSSL
 *   share links
 * The browser half is scripts/test-browser-v090.mjs. */
import { parseColor, contrast, evalColorExpr, mix, over, toHex } from '../public/dssl/color.js';
import { PRESETS, PRESET_NAMES, GENERATORS, TEXTURE_KEYS, parseTexture, buildTexture, makeMask, rng } from '../public/dssl/texture.js';
import { parseAura, resolveLayer, GLOW_KEYS, PARTICLE_KEYS } from '../public/dssl/aura.js';
import { parseSlider, sliderCss } from '../public/dssl/slider.js';
import { importCss, parseCss } from '../public/dssl/import.js';
import { compile, VERSION } from '../public/dssl/index.js';
import { didYouMean } from '../public/dssl/utils.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ok  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); }
};
const section = (t) => console.log(`\n== ${t}`);

const hooks = () => {
  const errors = [];
  return { errors, error: (m, h) => errors.push({ message: m, hint: h }), color: (w) => w, suggest: (w, l) => { const h = didYouMean(w, l); return h ? `did you mean "${h}"?` : null; } };
};
const decls = (src, i = 0) => compile(src).doc.rules[i]?.decls || [];
const errs = (src) => compile(src).errors.map((e) => e.message);
const warns = (src) => compile(src).warnings.map((e) => e.message);

/* ------------------------------------------------------------------ */
section('color');
ok('hex, rgb, hsl, oklch and named colours parse', [parseColor('#f00'), parseColor('rgb(0 255 0)'), parseColor('hsl(240 100% 50%)'), parseColor('oklch(0.7 0.1 200)'), parseColor('rebeccapurple')].every(Boolean));
ok('8-digit hex carries alpha', Math.abs(parseColor('#ff000080').a - 0.502) < 0.01);
ok('color-mix and color(srgb) (what getComputedStyle returns) parse', parseColor('color-mix(in oklab, #ff0000 40%, transparent)').a > 0.39 && parseColor('color(srgb 1 0 0 / 0.5)').a === 0.5);
ok('garbage and var() are null, not a crash', parseColor('nonsense') === null && parseColor('var(--x)') === null && parseColor('') === null && parseColor(null) === null);
ok('contrast matches the WCAG reference points (white/black 21, same colour 1)', Math.abs(contrast(parseColor('#fff'), parseColor('#000')) - 21) < 0.01 && Math.abs(contrast(parseColor('#777'), parseColor('#777')) - 1) < 0.001);
ok('over() composites alpha onto a background', (() => { const c = over({ r: 255, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 255, a: 1 }); return c.r === 128 && c.b === 128 && c.a === 1; })());
ok('mix() halfway between black and white in srgb is mid grey', toHex(mix(parseColor('#000'), parseColor('#fff'), 0.5, 'srgb')) === '#808080');
ok('evalColorExpr reads tokens, token/alpha and literals', (() => { const lk = (n) => ({ 'color.ink': '#102030', 'color.paper': 'color.ink' })[n]; return toHex(evalColorExpr('color.paper', lk)) === '#102030' && evalColorExpr('color.ink/40', lk).a === 0.4 && evalColorExpr('color.nope', lk) === null; })());

/* ------------------------------------------------------------------ */
section('texture: vocabulary');
ok(`there are 38 to 44 presets: 30 general ones and the wood species (${PRESET_NAMES.length})`, PRESET_NAMES.length >= 38 && PRESET_NAMES.length <= 44);
ok('every preset has a one-line description', PRESET_NAMES.every((n) => PRESETS[n].doc && PRESETS[n].doc.length > 8));
ok('every preset is built only from known generators and settings', PRESET_NAMES.every((n) => PRESETS[n].layers.every((l) => GENERATORS.includes(l.gen) && Object.keys(l).every((k) => ['gen', 'stagger', 'preset'].includes(k) || k in TEXTURE_KEYS))));
ok('every setting documents itself', Object.values(TEXTURE_KEYS).every((k) => k.doc));
{
  const rc = parseColor;
  const empty = [];
  for (const n of PRESET_NAMES) {
    const h = hooks();
    const layers = parseTexture(n, h);
    const b = layers && buildTexture(layers, rc);
    if (!layers || !b || !b.image || h.errors.length) empty.push(n);
  }
  ok('every preset parses and builds CSS', empty.length === 0, empty.join(', '));
  // split a CSS list at top-level commas, ignoring the commas inside url("data:...,...") and gradients
  const split = (v) => { const out = []; let d = 0, cur = '', q = null; for (const ch of v) { if (q) { cur += ch; if (ch === q) q = null; continue; } if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; } if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; };
  const lists = PRESET_NAMES.map((n) => { const b = buildTexture(parseTexture(n, hooks()), rc); return [n, b.count, split(b.image).length, split(b.size).length, split(b.blend).length, split(b.position).length, split(b.repeat).length]; });
  const mismatched = lists.filter((l) => l.slice(2).some((x) => x !== l[1]));
  ok('every list has one entry per layer (images, sizes, blends, positions, repeats line up)', mismatched.length === 0, JSON.stringify(mismatched[0]));
  ok('building is deterministic: the same texture gives the same CSS', buildTexture(parseTexture('wood', hooks()), rc).image === buildTexture(parseTexture('wood', hooks()), rc).image);
}
section('texture: your own');
{
  const h = hooks();
  const l = parseTexture('noise scale 3 octaves 4 color #112233 color2 #ffffff blend multiply contrast 2 seed 9', h);
  ok('a bare generator with settings parses', l && l.length === 1 && l[0].gen === 'noise' && l[0].octaves === 4 && l[0].seed === 9 && l[0].blend === 'multiply', JSON.stringify(h.errors));
  const two = parseTexture('grain, lines angle 30', hooks());
  ok('comma separated textures stack', two.length === 2 && two[1].angle === 30);
  const over2 = parseTexture('paper intensity 0.2', hooks());
  ok('settings on a multi-layer preset apply to every layer', over2.length === 2 && over2.every((x) => x.intensity === 0.2));
  const keep = parseTexture('paper color #123456', hooks());
  ok('colour settings only retint the first layer of a preset, so its second tone survives', keep[0].color === '#123456' && keep[1].color === '#000');
  ok('none clears (an empty list, not an error)', (() => { const x = hooks(); const r = parseTexture('none', x); return Array.isArray(r) && r.length === 0 && !x.errors.length; })());
  ok('contour draws veins: it changes the SVG', buildTexture(parseTexture('noise contour 0.05', hooks()), parseColor).image !== buildTexture(parseTexture('noise', hooks()), parseColor).image);
}
section('texture: errors');
for (const [src, want] of [
  ['grian', /unknown texture "grian".*did you mean "grain"/], ['grain intensty 1', /unknown texture setting "intensty".*intensity/],
  ['grain intensity 9', /between 0 and 2/], ['grain intensity lots', /needs a number/], ['noise blend sparkly', /unknown blend "sparkly"/],
  ['wood stretch 4', /needs 2 values/], ['', /needs a name/], ['grain octaves 99', /between 1 and 8/], ['noise type fuzzy', /unknown type "fuzzy"/],
]) {
  const h = hooks();
  const r = parseTexture(src, h);
  const text = h.errors.map((e) => e.message + ' ' + (e.hint || '')).join(' ');
  ok(`"${src}" is refused with a useful message`, r === null && want.test(text), text);
}
ok('the same errors come through the real compiler, with the line', errs('.a { texture: grian }')[0].includes('unknown texture'));
ok('texture on a pseudo-element is refused, it has no DOM handle', errs('.a::before { texture: grain }').some((m) => /engine-native/.test(m)));
ok('texture compiles to one engine-native declaration', (() => { const d = decls('.a { texture: grain, lines }'); return d.length === 1 && d[0].prop === '@texture' && d[0].value.length === 2; })());
ok('a token colour resolves to a CSS var, not a literal', decls('.a { texture: noise color color.ink }')[0].value[0].color === 'var(--dssl-color-ink)');
ok('an unknown token colour is an error with a suggestion', errs('.a { texture: noise color color.inkk }').some((m) => /color\.inkk/.test(m)));

section('texture: masks (for aura)');
{
  const a = makeMask({ gen: 'noise', scale: 3, octaves: 3, seed: 1 }, 64), b = makeMask({ gen: 'noise', scale: 3, octaves: 3, seed: 1 }, 64), c = makeMask({ gen: 'noise', scale: 3, octaves: 3, seed: 2 }, 64);
  ok('masks are deterministic for a seed', a.every((v, i) => v === b[i]));
  ok('and differ between seeds', a.some((v, i) => v !== c[i]));
  const mean = a.reduce((x, y) => x + y, 0) / a.length;
  ok('a noise mask is neither empty nor solid', mean > 30 && mean < 225, mean.toFixed(0));
  const lines = makeMask({ gen: 'lines', scale: 8, thickness: 2, angle: 0 }, 32);
  ok('horizontal lines are constant along a row (angle 0) and vary down the column', lines[0] === lines[31] && (lines[0] !== lines[4 * 32] || lines[0] !== lines[2 * 32]));
  const r1 = rng(5), r2 = rng(5);
  ok('the PRNG repeats for a seed', [r1(), r1(), r1()].join() === [r2(), r2(), r2()].join());
}

/* ------------------------------------------------------------------ */
section('aura: vocabulary');
ok('every aura setting documents itself', [...Object.values(GLOW_KEYS), ...Object.values(PARTICLE_KEYS)].every((k) => k.doc));
ok('there are no built-in aura presets: the vocabulary has no "fire" or "ki"', !('fire' in PARTICLE_KEYS) && !('fire' in GLOW_KEYS) && (() => { const h = hooks(); return parseAura('aura', 'fire', h) === null; })());
section('aura: parsing');
{
  const h = hooks();
  const g = parseAura('aura-glow', 'color.accent 24 pulse 1600 flicker 0.4', h);
  ok('aura-glow: positional colour and radius, then named settings', g.glow[0].color === 'color.accent' && g.glow[0].radius === 24 && g.glow[0].pulse === 1600 && g.glow[0].flicker === 0.4 && g.particles === undefined, JSON.stringify(h.errors));
  const p = parseAura('aura-particle', '#fd0 -> #f60 -> transparent 70 up size 12 6 life 600 1100 from bottom shape flame glowing', hooks());
  const L = p.particles[0];
  ok('aura-particle: colour stops, count, direction, ranges, words', L.colors.length === 3 && L.count === 70 && L.dir === -90 && L.size[0] === 6 && L.size[1] === 12 && L.life[0] === 600 && L.from === 'bottom' && L.shape === 'flame' && L.glowing === true, JSON.stringify(L));
  ok('a single number is a fixed value (a range of one)', parseAura('aura-particle', '#fff size 5', hooks()).particles[0].size.join() === '5,5');
  const gp = parseAura('glow-particle', '#fff 30 out', hooks());
  ok('glow-particle is a glowing particles layer', gp.particles[0].glowing === true && gp.particles[0].count === 30 && gp.particles[0].dir === 'out');
  const both = parseAura('aura-glow-particle', '#ff7a00 28 pulse 900 count 50 up', hooks());
  ok('aura-glow-particle fills both slots from one description', both.glow.length === 1 && both.particles.length === 1 && both.glow[0].pulse === 900 && both.particles[0].count === 50 && both.particles[0].glowing === true);
  const full = parseAura('aura', 'glow #f60 30 flicker 0.3, particles #fc4 -> #f30 count 60 shape flame', hooks());
  ok('aura: takes glow and particles layers, comma separated', full.glow.length === 1 && full.particles.length === 1);
  const stacked = parseAura('aura', 'glow #f60 30, glow #fff 10, particles #fff count 5, particles #f00 count 9', hooks());
  ok('you can stack several layers of each kind', stacked.glow.length === 2 && stacked.particles.length === 2);
  ok('plural spellings are the same property (aura-particles, glow-particles)', parseAura('aura-particles', '#fff 5', hooks()).particles.length === 1 && parseAura('glow-particles', '#fff 5', hooks()).particles[0].glowing);
  const tex = parseAura('aura-glow', '#fff 20 texture(grain scale 2)', hooks());
  ok('texture(...) carries its own settings into an aura layer', tex.glow[0].texture[0].gen === 'noise' && tex.glow[0].texture[0].scale === 2);
  ok('behind and essential are flags', (() => { const x = parseAura('aura-particle', '#fff 5 behind essential', hooks()).particles[0]; return x.behind === true && x.essential === true; })());
  ok('a particle layer can be given a texture', parseAura('aura-particle', '#fff 5 texture(dots)', hooks()).particles[0].texture.length === 1);
}
section('aura: none clears only its own slot');
ok('aura: none clears both', (() => { const r = parseAura('aura', 'none', hooks()); return r.glow === null && r.particles === null; })());
ok('aura-glow: none clears only the glow slot (it used to clear both)', (() => { const r = parseAura('aura-glow', 'none', hooks()); return r.glow === null && r.particles === undefined; })());
ok('aura-particle: none clears only the particles slot', (() => { const r = parseAura('aura-particle', 'none', hooks()); return r.particles === null && r.glow === undefined; })());
ok('glow-particle: none clears only the particles slot', (() => { const r = parseAura('glow-particle', 'none', hooks()); return r.particles === null && r.glow === undefined; })());
ok('through the compiler: aura-glow: none writes one slot only', (() => { const d = decls('.a { aura-glow: none }'); return d.length === 1 && d[0].prop === '@aura-glow' && d[0].value === null; })());
section('aura: errors');
for (const [prop, src, want] of [
  ['aura', 'sparkle #fff', /starts with glow or particles/], ['aura-glow', '#fff radius 9999', /between 1 and 400/], ['aura-particle', 'count lots', /needs a number/],
  ['aura-particle', '#fff shape flaim', /unknown shape "flaim".*flame/], ['aura-particle', '#fff dir sideways', /unknown direction/], ['aura-particle', '#fff speedd 4', /unknown aura setting "speedd".*speed/],
  ['aura-particle', '#fff from middle', /unknown from "middle"/], ['aura-glow', '#fff pulse -5', /between 0 and 60000/], ['aura-particle', '#fff count 0', /between 1 and 600/],
  ['aura-particle', '#fff size', /needs a number/], ['aura-glow', '#fff texture(grian)', /unknown texture "grian"/], ['aura-glow', '', /needs a value/],
]) {
  const h = hooks();
  const r = parseAura(prop, src, h);
  const text = h.errors.map((e) => e.message + ' ' + (e.hint || '')).join(' ');
  ok(`${prop}: ${src || '(empty)'} is refused clearly`, r === null && want.test(text), text);
}
ok('a mistyped token colour in an aura is caught by the compiler with a suggestion', errs('.a { aura-glow: colr.accent 24 }').some((m) => /colr\.accent/.test(m)));
ok('aura on a pseudo-element is refused', errs('.a::after { aura: glow #f00 10 }').some((m) => /engine-native/.test(m)));
ok('aura compiles to engine-native declarations, one per slot', (() => { const d = decls('.a { aura: glow #f00 10, particles #fff 5 }'); return d.map((x) => x.prop).join() === '@aura-glow,@aura-particles'; })());
ok('`dssl build` leaves aura in the runtime and says so', (() => { const r = compile('.a { aura-glow: #f00 10 }'); return r.doc.rules[0].decls.every((d) => d.prop.startsWith('@')); })());
section('aura: resolving a layer for drawing');
{
  const rc = (css) => parseColor(css);
  const fb = { r: 9, g: 9, b: 9, a: 1 };
  const glow = resolveLayer(parseAura('aura-glow', '#ff0000 20', hooks()).glow[0], rc, fb);
  ok('glow: defaults fill in (intensity 1, depth .35, no pulse)', glow.intensity === 1 && glow.pulse === 0 && glow.depth === 0.35 && glow.rgba.r === 255);
  const none = resolveLayer(parseAura('aura-glow', 'radius 12', hooks()).glow[0], rc, fb);
  ok('a glow with no colour falls back to the element colour', none.rgba.r === 9);
  const one = resolveLayer(parseAura('aura-particle', '#ff0000 5', hooks()).particles[0], rc, fb);
  ok('one colour fades itself out (a second, transparent stop is added)', one.stops.length === 2 && one.stops[1].a === 0);
  const add = resolveLayer(parseAura('glow-particle', '#fff 5', hooks()).particles[0], rc, fb);
  ok('glowing particles blend additively by default, plain ones normally', add.blend === 'add' && one.blend === 'normal');
  ok('defaults: 40 particles, size 4, life 900, speed 40, up', one.count === 5 && one.size[0] === 4 && one.life[0] === 900 && one.speed[0] === 40 && one.dir === -90);
}

/* ------------------------------------------------------------------ */
section('slider: parsing');
{
  const h = hooks();
  const s = parseSlider('track 8 #445566 radius full, fill #ff7a00, thumb 24 #fff, shape diamond, ring 3 #000, glow #ff7a00 14, ticks 5 #888 8', h);
  ok('all clauses parse', s && s.track.h === 8 && s.fill === '#ff7a00' && s.thumb.size === 24 && s.shape === 'diamond' && s.ring.w === 3 && s.glow.r === 14 && s.ticks.n === 5 && s.ticks.len === 8, JSON.stringify(h.errors));
  ok('track takes its parts in any order', (() => { const a = parseSlider('track #123456 6 radius 2', hooks()); return a.track.h === 6 && a.track.color === '#123456' && a.track.radius === 2; })());
  const g = parseSlider('graph 10 20 30 40, graph-height 50, graph-gap 2', hooks());
  ok('graph and its sizing', g.graph.length === 4 && g.graphHeight === 50 && g.graphGap === 2);
  ok('fill none turns the fill off', parseSlider('fill none', hooks()).fill === null);
}
section('slider: errors');
for (const [src, want] of [
  ['thumb big', /thumb needs a size/], ['shape cirle', /unknown thumb shape "cirle".*circle/], ['colour red', /unknown slider setting "colour"/],
  ['thumb 16 #fff shape bar', /unexpected "shape bar" in the thumb setting.*separate settings with commas/], ['fill red blue', /unexpected "blue"/], ['ticks 1', /at least 2/],
  ['graph 5', /at least two numbers/], ['graph 10 200', /0 to 100/], ['graph-height 3', /at least 8/], ['ring 3', /width and a colour/], ['glow', /colour and a radius/], ['', /needs a description/],
]) {
  const h = hooks();
  const r = parseSlider(src, h);
  const text = h.errors.map((e) => e.message + ' ' + (e.hint || '')).join(' ');
  ok(`slider: ${src || '(empty)'} is refused clearly`, r === null && want.test(text), text);
}
section('slider: generated CSS');
{
  const spec = parseSlider('fill #f80, thumb 20 #fff, ring 2 #000, shape circle', hooks());
  const css = sliderCss(spec);
  const pseudos = css.shadow.map((x) => x.pseudo);
  ok('both engines are covered: -webkit- track and thumb, -moz- track, thumb and progress', ['-webkit-slider-runnable-track', '-webkit-slider-thumb', '-moz-range-track', '-moz-range-thumb', '-moz-range-progress'].every((p) => pseudos.includes(p)), pseudos.join());
  ok('the input itself loses its native look', css.base.some((d) => d.prop === 'appearance' && d.value === 'none') && css.base.some((d) => d.prop === '-webkit-appearance'));
  const track = css.shadow.find((x) => x.pseudo === '-webkit-slider-runnable-track').decls.find((d) => d.prop === 'background-image').value;
  ok('the fill follows --dssl-p with a 0.5 fallback, so it works before the engine sets it', /var\(--dssl-p, 0\.5\)/.test(track));
  ok('the thumb is vertically centred on the track in WebKit (margin-top)', css.shadow.find((x) => x.pseudo === '-webkit-slider-thumb').decls.some((d) => d.prop === 'margin-top'));
  const graph = sliderCss(parseSlider('graph 10 50 90', hooks()));
  ok('a graph draws one layer per bar plus the baseline', graph.shadow[0].decls.find((d) => d.prop === 'background-image').value.split('linear-gradient(').length - 1 === 4);
  ok('graphs get small corners so the bars are not clipped into a semicircle', /4px/.test(graph.shadow[0].decls.find((d) => d.prop === 'border-radius').value));
}
section('slider: through the compiler');
{
  const r = compile('input[type=range] { slider: fill #f80, thumb 20 #fff }');
  ok('one slider rule yields the rule plus five vendor pseudo-element rules', r.ok && r.doc.shadowRules.length === 5 && r.doc.rules.length === 1);
  ok('the base declarations come FIRST so an author\'s own width wins', (() => { const d = r.doc.rules[0].decls; return d.findIndex((x) => x.prop === 'width') < d.findIndex((x) => x.prop === '@slider'); })());
  const own = compile('input { width: 200px\n slider: fill #f80 }');
  ok('an author width written before slider: still wins (declared later in the base order)', own.ok);
  ok('a selector list gets rules for every part', compile('input.a, input.b { slider: fill #f80 }').doc.shadowRules.length === 10);
  ok('slider on a pseudo-element is refused', errs('.a::before { slider: fill #f80 }').some((m) => /engine-native/.test(m)));
  ok('a bad slider rule is dropped as a whole, loudly', (() => { const x = compile('input { slider: thumb big }'); return !x.ok && x.doc.rules.length === 0; })());
}

/* ------------------------------------------------------------------ */
section('lint');
ok('low contrast between colour and background is flagged', warns('.a { color: #999; background: #aaa }').some((m) => /contrast is 1\.2:1/.test(m)));
ok('good contrast is quiet', warns('.a { color: #111; background: #fff }').length === 0);
ok('large text is held to 3:1, not 4.5:1', warns('.a { color: #777; background: #fff; font-size: 28 }').length === 0 && warns('.a { color: #777; background: #fff }').length === 1);
ok('tokens are followed, alpha included', warns('.a { color: color.ink/40; background: color.paper }').some((m) => /contrast/.test(m)));
ok('rules inside @media or @signal are not judged against the light tokens', warns('.a { @media dark { color: #999; background: #aaa } }').length === 0 && warns('@signal theme == dark { .a { color: #999; background: #aaa } }').length === 0);
ok('only a colour AND a background in the same rule are compared', warns('.a { color: #fff }').length === 0 && warns('.a { background: #fff }').length === 0);
ok('a gradient background is not guessed at', warns('.a { color: #fff; background: linear-gradient(red, blue) }').length === 0);
ok('a removed focus outline on a button is flagged', warns('button { outline: none }').some((m) => /focus outline is removed/.test(m)));
ok('unless a focus-visible block replaces it', warns('button { outline: none\n focus-visible { outline: 2 solid red } }').length === 0);
ok('a plain div is not nagged about focus', warns('.card { outline: none }').length === 0);
ok('outline: 0 and outline-style: none count too', warns('a { outline: 0 }').length === 1 && warns('input { outline-style: none }').length === 1);
ok('a button smaller than 24px is flagged', warns('button { width: 16; height: 16 }').some((m) => /below 24px/.test(m)));
ok('a normal button is quiet', warns('button { width: 48; height: 32 }').length === 0);
ok('lint never makes ok false (warnings only)', compile('.a { color: #999; background: #aaa }').ok === true);
ok('a lint failure can never break a compile (wrapped)', (() => { try { return compile('.a { color: var(--weird); background: var(--also) }').ok; } catch { return false; } })());

/* ------------------------------------------------------------------ */
section('import: the CSS parser');
{
  const t = parseCss('a{color:red}/*c*/@media (x){b{margin:0 !important}}');
  ok('rules, comments, at-rules and !important are understood', t[0].type === 'rule' && t[1].type === 'comment' && t[2].type === 'at' && t[2].body[0].body[0].important === true);
  const nested = parseCss('.a{ color:red; &:hover{ color:blue } .b{ margin:0 } }');
  ok('modern nesting is parsed', nested[0].body.length === 3 && nested[0].body[1].type === 'rule');
  ok('semicolons and braces inside strings and url() do not split', (() => { const x = parseCss('a{content:";}{";background:url(a;b.png)}'); return x[0].body.length === 2 && x[0].body[0].value === '";}{"'; })());
  ok('a declaration with no final semicolon is kept', parseCss('a{color:red}')[0].body[0].value === 'red');
  ok('an at-rule statement (@import) is understood', parseCss('@import url("x.css");a{b:c}')[0].name === 'import' && parseCss('@import url("x.css");a{b:c}')[0].body === null);
}
section('import: conversion');
{
  const r = (css) => importCss(css);
  ok('semicolons go and px becomes a bare number', r('a{margin:0px 16px;padding:8px}').dssl.includes('margin: 0 16') && !/;/.test(r('a{margin:0px 16px;padding:8px}').dssl.replace(/\/\/.*/g, '')));
  ok('unitless properties keep their px (line-height: 24px is NOT 24)', r('a{line-height:24px;z-index:3}').dssl.includes('line-height: 24px'));
  ok('px inside calc() is left alone', r('a{width:calc(100% - 20px)}').dssl.includes('calc(100% - 20px)'));
  ok('transition is rewritten into DSSL order', r('a{transition:color .2s ease, transform 300ms ease-in-out}').dssl.includes('transition: 200 ease color, 300 ease-in-out transform'));
  ok('transition: all drops the property word', r('a{transition:all .2s ease}').dssl.includes('transition: 200 ease\n'));
  ok('font: shorthand becomes longhands (DSSL font: means something else)', (() => { const o = r('a{font: italic 700 14px/1.5 Arial, sans-serif}').dssl; return o.includes('font-style: italic') && o.includes('font-weight: 700') && o.includes('font-size: 14') && o.includes('line-height: 1.5') && o.includes('font-family: Arial, sans-serif'); })());
  ok('@keyframes becomes a motion with from, at N% and to', (() => { const o = r('@keyframes p{0%{opacity:1}50%{opacity:.5}100%{opacity:1}}').dssl; return o.includes('motion p {') && o.includes('from {') && o.includes('at 50% {') && o.includes('to {'); })());
  ok('!important moves into pin { }', (() => { const o = r('a{color:red !important;margin:0}').dssl; return o.includes('pin {') && /pin \{\s+a \{\s+color: red/.test(o) && !/a \{\s+color: red\s+margin/.test(o); })());
  ok('@font-face, @supports and @import go to one raw block, verbatim, with their semicolons', (() => { const o = r('@import url("a.css");@font-face{font-family:X;src:url(x.woff2)}@supports (display:grid){a{display:grid}}').dssl; return o.startsWith('//') && o.includes('raw {') && o.includes('font-family:X;src:url(x.woff2)') && o.includes('@supports (display:grid)'); })());
  ok('@media is kept and its rules converted inside', r('@media (max-width:600px){a{padding:12px}}').dssl.includes('@media (max-width:600px) {') && r('@media (max-width:600px){a{padding:12px}}').dssl.includes('padding: 12'));
  ok('custom properties are untouched (no px stripping)', r(':root{--gap:16px}').dssl.includes('--gap: 16px'));
  ok('selectors, pseudo-classes and pseudo-elements pass straight through', r('a:not(.x)::after{content:"x"}').dssl.includes('a:not(.x)::after {'));
  const rep = r('a{-moz-foo:1;color:red}').report;
  ok('a property DSSL does not know is commented out and reported, not lost silently', rep.dropped.length === 1 && /-moz-foo/.test(rep.dropped[0].text) && r('a{-moz-foo:1;color:red}').dssl.includes('// dssl import dropped'));
  ok('what the compiler rejects is commented out so the output always compiles', (() => { const x = r('a{scroll-snap-type:x mandatory;color:red}'); return x.report.compile.ok && x.report.dropped.some((d) => /scroll-snap-type/.test(d.text)); })());
  ok('a typical stylesheet round-trips into something that compiles', (() => { const x = r('body{margin:0;font:16px/1.5 system-ui}.card{border:1px solid #ddd;border-radius:14px;transition:all .2s ease}.card:hover{transform:translateY(-4px)}@media (max-width:600px){.card{padding:12px}}'); return x.report.compile.ok; })());
  ok('the report counts what it did', (() => { const x = r('a{margin:0px !important;color:red}@font-face{font-family:Q;src:url(q)}@keyframes k{from{opacity:0}to{opacity:1}}'); return x.report.pinned === 1 && x.report.raw === 1 && x.report.motions === 1; })());
  ok('empty input gives empty, valid output', (() => { const x = r(''); return x.dssl.trim() === '' && x.report.compile.ok; })());
  ok('garbage does not throw', (() => { try { return importCss('}}}{{{ ;;; @@@ a{').dssl !== undefined; } catch { return false; } })());
}

/* ------------------------------------------------------------------ */
section('share links');
{
  const { encodeShare, decodeShare, shareFromHash, MAX_SHARE_URL } = await import('../src/lib/share.ts');
  const samples = ['', 'a', '.card { color: red }\n', 'üñíçødé ✓ 日本語 😀', '.x { content: "-" }'.repeat(200), 'x'.repeat(20000)];
  let allOk = true;
  for (const s of samples) { const back = await decodeShare(await encodeShare(s)); if (back !== s) allOk = false; }
  ok('text survives a round trip (empty, unicode, 20 KB)', allOk);
  const big = await encodeShare('.card { color: red }\n'.repeat(400));
  ok('gzip makes repetitive source much smaller in the URL', big[0] === 'z' && big.length < 400, `${big.length} chars`);
  ok('the packed form is URL safe (no + / = )', /^[zp][A-Za-z0-9_-]+$/.test(big));
  ok('a damaged link is null, not a crash', (await decodeShare('zNOTVALID###')) === null && (await decodeShare('')) === null && (await decodeShare('q123')) === null);
  ok('only #s=... hashes are share links', shareFromHash('#s=zABC') === 'zABC' && shareFromHash('#/docs') === null && shareFromHash('#s=') === null && shareFromHash('') === null);
  ok('the URL limit is a sane number', MAX_SHARE_URL >= 2000 && MAX_SHARE_URL <= 16000);
}

/* ------------------------------------------------------------------ */
section('dssl build: what stays in the runtime');
{
  const { toCSS } = await import('../public/dssl/index.js');
  const r = toCSS('behavior fire { aura-glow: #f80 20\n aura-particle: #fd0 5 up }\n.torch { use fire\n background: #222\n texture: grain }\ninput[type=range] { slider: fill #f80 }');
  ok('aura, texture and slider are counted as engine-native even in a rule that keeps other declarations', r.report.engineDecls === 3, JSON.stringify(r.report.engineKinds));
  ok('the report names them (the texture was baked into the CSS, so it is not among them)', r.report.engineKinds.join() === 'aura-glow,aura-particles,slider' && r.report.bakedTextures === 1);
  { const flat = r.css.replace(/:where\(((?:[^()]|\([^()]*\))*)\)/g, '$1'); const rule = flat.slice(flat.indexOf('.torch {'), flat.indexOf('}', flat.indexOf('.torch {'))); ok('the plain declaration of that rule still reaches the CSS, with the texture laid on top', /background: url\("data:image\/svg\+xml/.test(rule) && /, #222;/.test(rule), rule.slice(0, 160)); }
  ok('the slider\'s vendor pseudo-element rules ARE emitted as real CSS (only the fill follower needs the engine)', /::-webkit-slider-thumb/.test(r.css) && /::-moz-range-thumb/.test(r.css));
  ok('the banner states the real version', r.css.includes(`DSSL v${VERSION}`));
}

/* ------------------------------------------------------------------ */
section('release');
ok('the engine version is 0.9 or later', /^0\.(9|1[0-3])\./.test(VERSION), VERSION);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
