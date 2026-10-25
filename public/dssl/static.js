/* =========================================================================
 * DSSL - static.js - the exit lane
 *
 * toCSS(doc) compiles a resolved document into a real CSS stylesheet:
 *   tokens      → :root custom properties (inside @layer tokens)
 *   states      → native pseudo-classes (:hover, :focus-visible, …)
 *   @media      → as-is          ·   @container → as-is
 *   layers      → native @layer (tokens < base < components < utilities < pin)
 *   pin { }     → !important (the one must-win block, same as the engine)
 *   motions     → @keyframes (so `animation: name` shorthand works too)
 *   raw { }     → verbatim
 *   ::before …  → shadow-rule output, as-is
 *   seen        → applied unconditionally (graceful no-JS state)
 *
 * What stays engine-only (skipped, and counted in the report):
 *   @signal rules (the JS bridge), `animate:`/engine-native properties
 *   (WAAPI lives in the runtime).
 *
 * The point: the SAME source can ship as a .css file when a page needs
 * no-JS, a strict CSP, first-paint-before-JS, or 4.5x smaller HTML.
 * ========================================================================= */

import { buildTexture, composeTextureInto } from './texture.js';
import { makeColorResolver, alignWithoutBox } from './lint.js';

const LAYER_RANK = { tokens: 0, base: 1, components: 2, utilities: 3, pin: 4 };
const LAYER_NAMES = ['tokens', 'base', 'components', 'utilities', 'pin'];

const kebab = (p) => p.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

const declLine = (d, pin) => {
  const value = pin && !/^--/.test(d.prop) ? d.value + ' !important' : d.value;
  return `  ${d.prop}: ${value};`;
};

const isEngineProp = (p) => p && p.startsWith('@');

function emitRule(r, { pin = false, pseudo = null, flat = true } = {}) {
  // DSSL has no specificity: the later rule wins. Native CSS does have it, so `.code-head + .code` would beat a later
  // `.code-plain` in a build and not in the engine. Wrapping the selector in :where() gives every rule zero
  // specificity, so source order decides, exactly as it does in the engine. (A pseudo-element cannot sit inside :where.)
  let sel = flat ? `:where(${r.sel})` : r.sel;
  if (pseudo) sel = sel + '::' + pseudo;
  let out = `${sel} {\n${r.decls.map(d => declLine(d, pin)).join('\n')}\n}`;
  // where each generated line came from, relative to the first line of this rule: the selector line maps to the
  // rule's line in the .dssl file, each declaration line to its own line (0.13.0, for source maps)
  const maps = [{ dl: 0, file: r.file, line: r.line }];
  r.decls.forEach((d, i) => maps.push({ dl: 1 + i, file: r.file, line: d.line || r.line }));
  let wrap = 0;
  for (const q of [...(r.containers || [])].reverse()) { out = `@container ${q} {\n${out}\n}`; wrap++; }
  for (const q of [...(r.media || [])].reverse()) { out = `@media ${q} {\n${out}\n}`; wrap++; }
  return { css: out, maps: maps.map((m) => ({ ...m, dl: m.dl + wrap })) };
}

/** @keyframes for every motion, so `animation: name` in plain CSS works (the engine writes the same into its own stylesheet) */
export function keyframesCss(motionFrames) {
  const out = [];
  for (const [name, m] of Object.entries(motionFrames || {})) {
    const frames = (m.frames || []).map((f) => {
      const off = f.offset === 0 ? '0%' : f.offset === 100 ? '100%' : `${f.offset}%`;
      const body = Object.entries(f.props).map(([p, v]) => `  ${kebab(p)}: ${v};`).join('\n');
      return `${off} {\n${body}\n}`;
    });
    if (frames.length) out.push(`@keyframes ${name} {\n${frames.join('\n')}\n}`);
  }
  return out;
}

/** an `animate:` spec as a CSS animation shorthand, for motions on ::before and ::after (WAAPI cannot reach a pseudo-element) */
export function animationShorthand(spec) {
  if (!spec || !spec.motion || spec.broken) return null;
  const parts = [spec.motion, `${spec.duration}ms`, spec.easing || 'ease', `${spec.delay || 0}ms`, spec.iterations === Infinity ? 'infinite' : String(spec.iterations || 1)];
  if (spec.direction && spec.direction !== 'normal') parts.push(spec.direction);
  parts.push(spec.fill || 'both');
  return parts.join(' ');
}

/** a source map needs base64 VLQ numbers */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function vlq(n) {
  let v = n < 0 ? ((-n) << 1) | 1 : n << 1, out = '';
  do { let digit = v & 31; v >>>= 5; if (v > 0) digit |= 32; out += B64[digit]; } while (v > 0);
  return out;
}

/** several compiled files as one document, later files after earlier ones, the way the browser applies them */
export function mergeDocs(docs) {
  const out = { rules: [], shadowRules: [], raws: [], fontLinks: [], motionFrames: {}, motions: {}, tokens: {}, registryRule: null, errors: [], warnings: [] };
  let offset = 0;
  for (const d of docs) {
    let max = -1;
    for (const list of [['rules', d.rules], ['shadowRules', d.shadowRules], ['raws', d.raws]]) {
      for (const r of list[1] || []) { out[list[0]].push({ ...r, order: (r.order ?? 0) + offset }); max = Math.max(max, r.order ?? 0); }
    }
    offset += max + 1;
    out.fontLinks.push(...(d.fontLinks || []));
    Object.assign(out.motionFrames, d.motionFrames || {});
    Object.assign(out.motions, d.motions || {});
    Object.assign(out.tokens, d.tokens || {});
    if (d.registryRule) out.registryRule = d.registryRule;   // the last file knows every token
    out.errors.push(...(d.errors || [])); out.warnings.push(...(d.warnings || []));
  }
  return out;
}

const RESET_CSS = `:where(html) { box-sizing: border-box; -webkit-text-size-adjust: 100%; }
:where(html *, html *::before, html *::after) { box-sizing: border-box; }
:where(body) { margin: 0; }
:where(h1,h2,h3,h4,h5,h6,p,figure,blockquote,dl,dd,pre) { margin: 0; }
:where(ul,ol) { margin: 0; padding: 0; list-style: none; }
:where(img,picture,video,canvas,svg) { display: block; max-width: 100%; }
:where(input,button,textarea,select) { font: inherit; color: inherit; letter-spacing: inherit; }
:where(a) { color: inherit; text-decoration: none; }
:where(button) { background: none; border: none; padding: 0; cursor: pointer; }
:where(table) { border-collapse: collapse; }`;

/** split one rule into { static, engineProps } - static decls survive */
function splitDecls(decls, kinds) {
  const keep = [];
  let engineProps = 0;
  for (const d of decls) {
    if (isEngineProp(d.prop)) { engineProps++; if (kinds) kinds.add(d.prop.replace(/^@/, '')); continue; }
    keep.push(d);
  }
  return { keep, engineProps };
}

/**
 * `texture:` is engine-native, but most textures are just images laid over a background, and
 * an image is plain CSS. When every colour is known at build time (tokens are), the layers are
 * built here with the same code the engine uses and written as background-image longhands, so the
 * texture survives the build. What stays in the runtime: a texture that animates, one with a colour
 * that is not a token or a literal, and a rule whose own background is something a build cannot
 * merge with (it is left alone and counted).
 */
function bakeTexture(rule, toColor, report) {
  const at = (rule.decls || []).findIndex((d) => d.prop === '@texture');
  if (at < 0) return rule;
  const layers = rule.decls[at].value;
  if (!Array.isArray(layers) || !layers.length) return rule;           // texture: none
  if (layers.some((l) => l.animate > 0)) { (report.notBaked ||= []).push({ sel: rule.sel, why: 'it animates' }); return rule; }
  for (const l of layers) {
    for (const key of ['color', 'color2']) {
      if (l[key] !== undefined && !toColor(l[key])) { (report.notBaked ||= []).push({ sel: rule.sel, why: `its ${key} (${l[key]}) is not known at build time` }); return rule; }
    }
  }
  const tex = buildTexture(layers, (css) => toColor(css));
  if (!tex.count) return rule;
  // last declaration of each property wins, as in the cascade within one rule
  const owned = new Map();
  for (const d of rule.decls) if (!isEngineProp(d.prop) && /^background/.test(d.prop)) owned.set(d.prop, { value: d.value, imp: '' });
  composeTextureInto(owned, tex);
  const decls = rule.decls.filter((d, i) => i !== at && !(/^background/.test(d.prop) && !isEngineProp(d.prop)));
  const line = rule.decls[at].line;
  for (const [prop, v] of owned) decls.push({ prop, value: v.value, line });
  report.bakedTextures++;
  return { ...rule, decls };
}

/**
 * --inline-tokens: replace var(--dssl-x) with the token's own value wherever the token is defined once and never changed.
 * A custom property costs the browser a lookup per use, and thousands of cards use dozens of them. The :root table stays, so
 * your own CSS and JavaScript can still read the tokens; what you give up is changing a token at run time and having the
 * compiled rules follow, so tokens that any rule redefines (a dark theme in a media query, a scoped --color.accent) are
 * never inlined, and neither is anything the page changes with DSSL.apply after load.
 */
function inlineTokens(doc, report) {
  const reg = doc.registryRule;
  if (!reg) return;
  const redefined = new Set();
  for (const list of [doc.rules || [], doc.shadowRules || []]) {
    for (const r of list) {
      if (r === reg) continue;
      // a plain top-level tokens { } block is how the token is DEFINED (the registry already holds its final value);
      // the same property set under a media query, a signal, a container or a selector other than :root is a change of it
      const conditional = r.sel !== ':root' || (r.media || []).length || (r.signals || []).length || (r.containers || []).length;
      if (!conditional) continue;
      for (const d of r.decls || []) if (/^--dssl-/.test(d.prop)) redefined.add(d.prop);
    }
  }
  const values = new Map();
  for (const d of reg.decls) if (d.prop.startsWith('--dssl-') && !redefined.has(d.prop)) values.set(d.prop, String(d.value));
  const VAR = /var\((--dssl-[\w-]+)\)/g;
  // resolve tokens that point at other tokens, a few levels deep; anything still holding a var() is left alone
  for (let pass = 0; pass < 4; pass++) for (const [k, v] of values) values.set(k, v.replace(VAR, (m, n) => (values.has(n) && !/var\(/.test(values.get(n)) ? values.get(n) : m)));
  for (const [k, v] of [...values]) if (/var\(/.test(v)) values.delete(k);
  let n = 0;
  for (const list of [doc.rules || [], doc.shadowRules || []]) {
    for (const r of list) {
      if (r === reg) continue;
      for (const d of r.decls || []) {
        if (typeof d.value !== 'string' || !d.value.includes('var(--dssl-')) continue;
        const next = d.value.replace(VAR, (m, name) => (values.has(name) ? (n++, values.get(name)) : m));
        if (next !== d.value) d.value = next;
      }
    }
  }
  report.inlinedTokens = n; report.inlinableTokens = values.size;
}

export function toCSS(docIn, opts = {}) {
  let doc = Array.isArray(docIn) ? mergeDocs(docIn) : docIn;
  // inlining edits declaration values, so work on a copy and leave the caller's document alone
  if (opts.inlineTokens) doc = { ...doc, rules: (doc.rules || []).map((r) => ({ ...r, decls: (r.decls || []).map((d) => ({ ...d })) })), shadowRules: (doc.shadowRules || []).map((r) => ({ ...r, decls: (r.decls || []).map((d) => ({ ...d })) })) };
  const file = opts.file || 'styles.dssl';
  const report = {
    file,
    rules: 0, shadowRules: 0, keyframes: 0, raws: 0,
    skippedSignals: 0, skippedEngine: 0, seenStripped: 0,
    // every engine-native declaration left behind, even in a rule that kept other declarations
    engineDecls: 0, engineKinds: [],
    layers: [],
  };
  const kinds = new Set();
  if (opts.inlineTokens) inlineTokens(doc, report);

  const chunks = [];
  const header = opts.banner !== false
    ? `/* generated by dssl build from ${file} - the static subset of DSSL${opts.version ? ' v' + opts.version : ''}.\n   @signal rules and engine-native properties (animate, aura, tilt, ...) stay in the runtime.
   Textures are baked in as background images when their colours are known at build time. */\n`
    : '';
  // 0.12.0: fonts { } as @import. An @import has to come before every rule except @layer statements, so it goes right after the banner.
  // everything written goes through put(), which counts lines so the source map knows where each rule landed
  let out = '', line = 0;
  const mappings = [];
  const put = (text, maps) => {
    for (const m of maps || []) mappings.push({ genLine: line + m.dl, file: m.file, srcLine: m.line });
    out += text; line += (text.match(/\n/g) || []).length;
  };
  put(header);
  const fontUrls = [...new Set((doc.fontLinks || []).map((l) => l.url))];
  for (const u of fontUrls) put(`@import url("${u}");\n`);
  if (fontUrls.length) put('\n');

  const allRules = [...(doc.registryRule ? [doc.registryRule] : []), ...(doc.rules || [])];

  // ---- keyframes from motions (name kept, so `animation: name` works) ----
  const motionFrames = doc.motionFrames || {};
  for (const css of keyframesCss(motionFrames)) { chunks.push({ layer: null, css }); report.keyframes++; }

  // ---- regular rules ----
  const toColor = makeColorResolver(new Map(Object.entries(doc.tokens || {})));
  report.bakedTextures = 0;
  for (const r0 of allRules) {
    if (r0.signals && r0.signals.length) { report.skippedSignals++; continue; }
    const r = bakeTexture(r0, toColor, report);
    const { keep, engineProps } = splitDecls(r.decls || [], kinds);
    report.engineDecls += engineProps;
    if (!keep.length) { if (engineProps) report.skippedEngine++; continue; }
    const rule = { ...r, decls: keep };
    // seen → the no-JS graceful state: apply the final style unconditionally
    if (/:seen\b/.test(rule.sel)) {
      rule.sel = rule.sel.replace(/:seen\b/g, '').replace(/\s{2,}/g, ' ').trim();
      report.seenStripped++;
      if (!rule.sel) rule.sel = '*';
    }
    const pin = rule.layer === 'pin';
    chunks.push({ layer: rule.layer, ...emitRule(rule, { pin, flat: !opts.nativeSpecificity }), order: rule.order });
    report.rules++;
  }

  // ---- pseudo-element rules (the shadow-CSS lane, native in a build) ----
  for (const r0 of doc.shadowRules || []) {
    if (r0.signals && r0.signals.length) { report.skippedSignals++; continue; }
    // 0.14.0: motion on ::before and ::after becomes a real CSS animation (the keyframes are already in the file)
    let r = r0;
    let extraRule = null;
    const ans = (r0.decls || []).filter((d) => d.prop === '@animate' && d.value && animationShorthand(d.value));
    if (ans.length) {
      // the essential motions always run; everything else waits for the reduced-motion check (a second rule when they are mixed)
      const list = (xs) => xs.map((d) => animationShorthand(d.value)).join(', ');
      const ess = ans.filter((d) => d.value.essential);
      const rest = r0.decls.filter((d) => d.prop !== '@animate');
      r = { ...r0, decls: ess.length ? [...rest, { prop: 'animation', value: list(ess), line: ess[0].line }] : rest };
      if (ess.length < ans.length) extraRule = { ...r0, decls: [{ prop: 'animation', value: list(ans), line: ans[0].line }], media: [...(r0.media || []), '(prefers-reduced-motion: no-preference)'] };
      report.pseudoMotions = (report.pseudoMotions || 0) + 1;
    }
    for (const rr of [r, extraRule]) {
      if (!rr) continue;
      const { keep, engineProps } = splitDecls(rr.decls || [], kinds);
      if (rr === r) report.engineDecls += engineProps;
      if (!keep.length) { if (engineProps && rr === r) report.skippedEngine++; continue; }
      chunks.push({ layer: rr.layer, ...emitRule({ ...rr, decls: keep }, { pin: rr.layer === 'pin', pseudo: rr.pseudo, flat: !opts.nativeSpecificity }), order: rr.order });
      if (rr === r) report.shadowRules++;
    }
  }

  // ---- layers: emit the order statement once, then group ----
  const usedLayers = [...new Set(chunks.map(c => c.layer).filter(Boolean))]
    .sort((a, b) => (LAYER_RANK[a] ?? 2) - (LAYER_RANK[b] ?? 2));
  // 0.13.0: the engine's small reset is unlayered, which in a build would beat every layered rule. As the first layer it
  // loses to everything, which is what `:where()` was always meant to do.
  const withReset = !!opts.reset;
  if (usedLayers.length || withReset) {
    report.layers = usedLayers;
    put(`@layer ${(withReset ? ['reset', ...LAYER_NAMES] : LAYER_NAMES).join(', ')};\n\n`);
    if (withReset) put(`@layer reset {\n${RESET_CSS}\n}\n\n`);
    for (const layer of usedLayers) {
      const inLayer = chunks.filter(c => c.layer === layer).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      put(`@layer ${layer} {\n`);
      inLayer.forEach((c, i) => { put(c.css + (i < inLayer.length - 1 ? '\n\n' : ''), c.maps); });
      put(`\n}\n\n`);
    }
  }
  for (const c of chunks.filter(x => x.layer === null)) put(c.css + '\n\n', c.maps);

  // ---- raw { } verbatim ----
  for (const r of doc.raws || []) {
    if (!r.css) continue;
    put(`/* raw @ ${r.file || file}:${r.line} */\n` + r.css + '\n\n', [{ dl: 1, file: r.file, line: r.line }]);
    report.raws++;
  }

  report.needsBox = alignWithoutBox(allRules);   // rules the engine would have given a display, and a build cannot
  report.engineKinds = [...kinds].sort();
  let css = out.trimEnd() + '\n';
  let map = null;
  if (opts.sourceMap) {
    // sources: the files rules came from, in first-seen order. opts.sources may say where each one lives and what it holds
    const info = opts.sources || {};
    const seenFiles = new Set(mappings.map((m) => m.file).filter(Boolean));
    // the order the files were given in, then any stragglers
    const names = [...Object.keys(info).filter((n) => seenFiles.has(n)), ...[...seenFiles].filter((n) => !(n in info))];
    const lines = [];
    let prevSrc = 0, prevLine = 0;
    for (const m of mappings.sort((a, b) => a.genLine - b.genLine)) {
      if (!m.file) continue;
      while (lines.length <= m.genLine) lines.push([]);
      const idx = names.indexOf(m.file);
      const srcLine = Math.max(0, (m.srcLine || 1) - 1);
      // [generated column, source index, source line, source column], each relative to the one before it
      lines[m.genLine].push(vlq(0) + vlq(idx - prevSrc) + vlq(srcLine - prevLine) + vlq(0));
      prevSrc = idx; prevLine = srcLine;
    }
    map = {
      version: 3, file: opts.mapFile || 'styles.css',
      sources: names.map((n) => (info[n] && info[n].path) || n),
      sourcesContent: names.map((n) => (info[n] && info[n].content !== undefined ? info[n].content : null)),
      names: [], mappings: lines.map((l) => l.join(',')).join(';'),
    };
    if (opts.sourceMapUrl) css += `/*# sourceMappingURL=${opts.sourceMapUrl} */\n`;
  }
  return { css, report, map };
}
