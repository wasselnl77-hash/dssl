/* test-designer.mjs: the designer's state <-> DSSL core (dssl-vscode/media/designer-core.js).
 * What the panel writes must (1) compile with the real compiler, (2) read back to the same
 * state, and (3) leave out anything that is just the default. A seeded random sweep hammers
 * all three. The panel itself is exercised in a browser by test-designer-browser.mjs. */
import * as core from '../dssl-vscode/media/designer-core.js';
import { compile } from '../public/dssl/index.js';
import { rng } from '../public/dssl/texture.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const compiles = (snippet) => { const r = compile(core.wrapForCompile(snippet)); return { ok: r.ok, errors: r.errors.map((e) => e.message) }; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

section('aura');
{
  const d = core.defaultAuraState();
  for (const style of ['separate', 'single']) {
    const text = core.auraToDssl(d, style);
    const c = compiles(text);
    ok(`the default aura (${style}) compiles`, c.ok, c.errors.join(' | ') + '\n' + text);
    const back = core.auraFromDssl(text).state;
    ok(`and reads back to the same state (${style})`, same(back.particles, d.particles) && same(back.glow, d.glow), JSON.stringify(back.particles) + '\n' + JSON.stringify(d.particles));
  }
  const off = core.defaultAuraState(); off.glow.on = false; off.particles.on = false;
  ok('with both layers off it writes aura: none, which compiles', core.auraToDssl(off) === 'aura: none' && compiles('aura: none').ok);
  const g = core.defaultAuraState(); g.particles.on = false;
  ok('glow only writes only aura-glow', core.auraToDssl(g) === `aura-glow: #ff7a00 ${core.GLOW_DEFAULTS.radius}` && !/particle/.test(core.auraToDssl(g)));
  const plain = core.defaultAuraState();
  plain.glow.radius = 24; plain.particles = { ...plain.particles, ...core.PARTICLE_DEFAULTS, stops: [{ hex: '#ffffff', a: 1 }, { hex: '#ffffff', a: 0 }], count: 40, glowing: false, behind: false, dir: 'up', texture: '', blend: '', size: [4, 4], life: [900, 900], speed: [40, 40], spread: 30, gravity: 0, drag: 0, turbulence: 0, from: 'edge', shape: 'circle', grow: 0.3 };
  ok('settings left at their defaults are not written', core.auraToDssl(plain).split('\n')[1] === 'aura-particle: #ffffff -> rgba(255,255,255,0) count 40', core.auraToDssl(plain).split('\n')[1]);
  ok('a see-through colour is written as rgba, an opaque one as hex', core.colorToDssl({ hex: '#ff0000', a: 0.5 }) === 'rgba(255,0,0,0.5)' && core.colorToDssl({ hex: '#ff0000', a: 1 }) === '#ff0000');
  const withTok = core.auraFromDssl('aura-glow: color.accent 24');
  ok('a token colour cannot go on a picker: it is kept as the default and the user is told', withTok.state.glow.on && withTok.notes.some((n) => /token or variable/.test(n)));
  ok('text that is not an aura is ignored, not an error', (() => { const r = core.auraFromDssl('.card { color: red }'); return !r.state.glow.on && !r.state.particles.on && r.notes.length === 0; })());
  ok('a broken aura says what is wrong instead of throwing', core.auraFromDssl('aura-glow: #fff radius 99999').notes.length === 1);
  ok('degrees round-trip', (() => { const x = core.defaultAuraState(); x.particles.dir = 'deg'; x.particles.deg = -45; const t = core.auraToDssl(x); return /dir -45/.test(t) && core.auraFromDssl(t).state.particles.deg === -45; })());
  ok('multi-line aura: declarations are read as one', core.auraFromDssl(core.auraToDssl(d, 'single')).state.particles.on === true);
}

section('texture');
{
  const bad = [];
  for (const name of core.PRESET_NAMES) {
    const st = { layers: [core.defaultTextureLayer(name)], base: '#fff' };
    const text = core.textureToDssl(st);
    const c = compiles(text);
    const back = core.textureFromDssl(text).state;
    if (!c.ok || text !== `texture: ${name}` || back.layers[0].name !== name || back.layers.length !== 1) bad.push(name);
  }
  ok(`all ${core.PRESET_NAMES.length} presets write as just their name, compile, and read back`, bad.length === 0, bad.join(','));
  const custom = { layers: [{ name: 'wood', set: { scale: 9, intensity: 0.8, stretch: [20, 2], blend: 'multiply' }, color: { hex: '#331100', a: 1 }, color2: { hex: '#ddaa66', a: 1 } }], base: '#fff' };
  const t = core.textureToDssl(custom);
  ok('overrides are written, and only the ones that differ from the preset', /scale 9/.test(t) && /intensity 0.8/.test(t) && /stretch 20 2/.test(t) && !/blend/.test(t) && /color #331100/.test(t) && /color2 #ddaa66/.test(t), t);
  ok('custom textures compile', compiles(t).ok, compiles(t).errors.join('|'));
  const back = core.textureFromDssl(t).state.layers[0];
  ok('and read back with the same overrides', back.name === 'wood' && back.set.scale === 9 && back.set.intensity === 0.8 && same(back.set.stretch, [20, 2]) && back.color.hex === '#331100', JSON.stringify(back));
  const stack = { layers: [core.defaultTextureLayer('grain'), { name: 'lines', set: { angle: 30 }, color: null, color2: null }], base: '#fff' };
  ok('stacked layers use commas and read back as two layers', (() => { const s = core.textureToDssl(stack); const r = core.textureFromDssl(s).state; return /grain, lines angle 30/.test(s) && r.layers.length === 2 && r.layers[1].set.angle === 30 && compiles(s).ok; })());
  ok('a generator with no preset round-trips', (() => { const s = core.textureToDssl({ layers: [{ name: 'noise', set: { scale: 3, octaves: 4 }, color: null, color2: null }], base: '#fff' }); const r = core.textureFromDssl(s).state.layers[0]; return compiles(s).ok && r.name === 'noise' && r.set.scale === 3 && r.set.octaves === 4; })());
  ok('no layers writes texture: none', core.textureToDssl({ layers: [], base: '#fff' }) === 'texture: none' && compiles('texture: none').ok);
  ok('a texture with an unknown name reports a note, never throws', core.textureFromDssl('texture: grian').notes.length === 1);
}

section('slider');
{
  const d = core.defaultSliderState();
  const t = core.sliderToDssl(d);
  ok('the default slider compiles', compiles(t).ok, compiles(t).errors.join('|') + '\n' + t);
  const back = core.sliderFromDssl(t).state;
  ok('and reads back to the same state', same({ ...back, bars: null }, { ...d, bars: null }), JSON.stringify(back));
  const full = { ...d, shape: 'diamond', ring: true, glow: true, ticks: true, graph: true, trackRadius: 'px', trackRadiusPx: 3, fill: false };
  const ft = core.sliderToDssl(full);
  ok('every clause together compiles', compiles(ft).ok, compiles(ft).errors.join('|') + '\n' + ft);
  ok('and reads back with every clause on', (() => { const r = core.sliderFromDssl(ft).state; return r.shape === 'diamond' && r.ring && r.glow && r.ticks && r.graph && r.fill === false && r.trackRadius === 'px' && r.trackRadiusPx === 3 && same(r.bars, d.bars); })());
  ok('a token colour on a slider is kept as the default and flagged', core.sliderFromDssl('slider: fill color.accent').notes.some((n) => /token or variable/.test(n)));
}

section('random sweep: everything the panel can write compiles and reads back');
{
  const r = rng(20261024);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const num = (lo, hi, step = 1) => +(Math.round((lo + r() * (hi - lo)) / step) * step).toFixed(4);
  const col = () => ({ hex: '#' + [0, 0, 0].map(() => Math.floor(r() * 256).toString(16).padStart(2, '0')).join(''), a: r() < 0.3 ? +r().toFixed(2) : 1 });
  const range = (lo, hi) => { const a = num(lo, hi), b = num(lo, hi); return [Math.min(a, b), Math.max(a, b)]; };
  let n = 0, bad = [];
  for (let i = 0; i < 300; i++) {
    // aura
    const a = core.defaultAuraState();
    a.glow = { on: r() < 0.8, color: col(), radius: num(1, 200), intensity: num(0, 3, 0.1), pulse: r() < 0.5 ? 0 : num(100, 5000, 100), depth: num(0, 1, 0.05), flicker: r() < 0.5 ? 0 : num(0, 1, 0.05), texture: r() < 0.3 ? pick(['grain', 'dots', 'lines', 'cloud']) : '', seed: num(1, 50), essential: r() < 0.2 };
    a.particles = { on: r() < 0.9, stops: Array.from({ length: num(1, 4) }, col), count: num(1, 300), size: range(1, 60), life: range(100, 4000), speed: range(0, 400), dir: pick(['up', 'down', 'left', 'right', 'out', 'in', 'deg']), deg: num(-180, 180), spread: num(0, 360), gravity: num(-300, 300), drag: num(0, 5, 0.1), turbulence: num(0, 300), from: pick(core.FROM_WORDS), shape: pick(core.SHAPES), grow: num(0, 4, 0.1), glowing: r() < 0.5, behind: r() < 0.5, blend: pick(['', 'add', 'normal']), texture: r() < 0.3 ? pick(['grain', 'dots', 'lines']) : '', seed: num(1, 50), essential: r() < 0.2 };
    for (const style of ['separate', 'single']) {
      const text = core.auraToDssl(a, style);
      const c = compiles(text); n++;
      if (!c.ok) { bad.push(`aura ${style}: ${c.errors[0]} :: ${text.replace(/\n/g, ' | ')}`); continue; }
      const back = core.auraFromDssl(text).state;
      // depth only means something with a pulse, so it is not written (and reads back as the default) when pulse is 0
      const expGlow = { ...a.glow, depth: a.glow.pulse ? a.glow.depth : core.GLOW_DEFAULTS.depth };
      if (a.glow.on && !same(back.glow, expGlow)) bad.push(`aura glow round trip ${JSON.stringify(expGlow)} vs ${JSON.stringify(back.glow)}`);
      if (a.particles.on) {
        const exp = { ...a.particles }; if (exp.stops.length === 1) exp.stops = [exp.stops[0], { ...exp.stops[0], a: 0 }];
        if (exp.dir !== 'deg') exp.deg = back.particles.deg;
        else if (exp.deg === -90) { exp.dir = 'up'; } else if (exp.deg === 90) exp.dir = 'down'; else if (exp.deg === 180) exp.dir = 'left'; else if (exp.deg === 0) exp.dir = 'right';
        if (!same(back.particles, exp)) bad.push(`aura particle round trip\n  ${JSON.stringify(exp)}\n  ${JSON.stringify(back.particles)}`);
      }
    }
    // texture
    const layer = { name: pick([...core.PRESET_NAMES, ...core.GENERATORS]), set: {}, color: r() < 0.4 ? col() : null, color2: r() < 0.4 ? col() : null };
    if (r() < 0.6) layer.set.scale = num(1, 300); if (r() < 0.5) layer.set.intensity = num(0, 2, 0.05); if (r() < 0.3) layer.set.octaves = num(1, 8);
    if (r() < 0.3) layer.set.stretch = [num(1, 60), num(1, 60)]; if (r() < 0.3) layer.set.blend = pick(['multiply', 'screen', 'overlay', 'soft-light']);
    const ts = { layers: [layer], base: '#fff' }; const tt = core.textureToDssl(ts); const tc = compiles(tt); n++;
    if (!tc.ok) bad.push(`texture: ${tc.errors[0]} :: ${tt}`);
    else if (core.textureFromDssl(tt).state.layers[0].name !== layer.name) bad.push(`texture name lost :: ${tt}`);
    // slider
    const sl = core.defaultSliderState();
    Object.assign(sl, { trackH: num(2, 30), trackColor: col(), trackRadius: pick(['full', 'px']), trackRadiusPx: num(0, 12), fill: r() < 0.8, fillColor: col(), thumb: num(8, 48), thumbColor: col(), shape: pick(core.THUMB_SHAPES), ring: r() < 0.5, ringW: num(1, 8), ringColor: col(), glow: r() < 0.5, glowColor: col(), glowR: num(2, 40), ticks: r() < 0.5, tickCount: num(2, 20), tickColor: col(), tickLen: num(2, 14), graph: r() < 0.5, bars: Array.from({ length: num(2, 30) }, () => num(0, 100)), graphH: num(16, 90), graphGap: num(0, 8) });
    const st = core.sliderToDssl(sl); const sc = compiles(st); n++;
    if (!sc.ok) bad.push(`slider: ${sc.errors[0]} :: ${st.replace(/\n/g, ' | ')}`);
    else { const b = core.sliderFromDssl(st).state; if (b.shape !== sl.shape || b.trackH !== sl.trackH || b.graph !== sl.graph || b.fill !== sl.fill || (sl.graph && !same(b.bars, sl.bars))) bad.push(`slider round trip :: ${st.replace(/\n/g, ' | ')}`); }
  }
  ok(`${n} random designs all compile and read back (aura both styles, texture, slider)`, bad.length === 0, `${bad.length} problems; first: ${bad[0]}`);
}

// 0.11/0.12: the wood settings and the mirrored tile survive the designer both ways
{
  const mk = (set) => ({ layers: [{ name: 'oak', set, color: null, color2: null }], base: '#b8a58a' });
  const t1 = core.textureToDssl(mk({ planks: 120, knots: 2, figure: 0.8, symmetrical: 'both' }));
  ok('wood settings are written (planks, knots, figure, symmetrical)', /^texture: oak /.test(t1) && /planks 120/.test(t1) && /knots 2/.test(t1) && /figure 0.8/.test(t1) && /symmetrical(?! (x|y|both))/.test(t1), t1);
  ok('and the result compiles', compiles(t1).ok, JSON.stringify(compiles(t1)));
  const back = core.textureFromDssl(t1).state.layers[0];
  ok('and reads back into the same controls', back.name === 'oak' && back.set.planks === 120 && back.set.knots === 2 && back.set.figure === 0.8 && back.set.symmetrical === 'both', JSON.stringify(back));
  ok('x and y are kept', /symmetrical x/.test(core.textureToDssl(mk({ symmetrical: 'x' }))) && core.textureFromDssl('texture: oak symmetrical y').state.layers[0].set.symmetrical === 'y');
  ok('a preset that already says nothing special writes just its name', core.textureToDssl(mk({})) === 'texture: oak');
  ok('RINGS_ONLY lists exactly the settings that only mean something for wood', JSON.stringify(core.RINGS_ONLY) === JSON.stringify(['figure', 'warp', 'pores', 'knots', 'planks']));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
