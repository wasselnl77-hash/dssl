/* =========================================================================
 * DSSL: import.js
 *
 *   dssl import styles.css -o styles.dssl
 *
 * Turns an existing CSS file into DSSL, and tells you honestly what it could
 * not carry over. It is a translator for the mechanical differences, not a
 * magic wand:
 *
 *   semicolons dropped, bare numbers for pixel lengths (16px -> 16)
 *   transition: color .2s ease  ->  transition: 200 ease color
 *   font: italic 700 14px/1.5 Arial  ->  the five longhands (DSSL's font: means something else)
 *   @keyframes  ->  motion { from / at 40% / to }
 *   !important  ->  the same declaration inside pin { }
 *   @font-face, @supports, @import, @property ...  ->  one raw { } block, verbatim
 *   properties DSSL does not know  ->  commented out, and listed in the report
 *
 * Everything else is kept as written, because DSSL selectors and CSS values are
 * CSS. The result is then run through the real compiler and any error it still
 * has is in the report, so you know before you open the file.
 *
 * Pure: no DOM, no filesystem. importCss(text) -> { dssl, report }.
 * ========================================================================= */

import { parse } from './parser.js';
import { resolve, KNOWN_PROPS, UNITLESS_PROPS, EASINGS } from './resolver.js';

const RAW_AT_RULES = new Set(['font-face', 'supports', 'import', 'property', 'page', 'charset', 'namespace', 'counter-style', 'font-feature-values', 'font-palette-values', 'view-transition', 'scope', 'starting-style', 'position-try']);
const SEMANTIC_NAMES = new Set(['size', 'place', 'center', 'cover', 'sticky', 'radius', 'shadow', 'circle', 'z', 'grow', 'shrink', 'basis', 'stack', 'fluid', 'texture', 'aura', 'slider', 'bend', 'fold', 'stretch', 'gradient', 'animate', 'stagger', 'overlap']);

/* ------------------------------------------------------------------ *
 * 1. a small CSS parser
 * ------------------------------------------------------------------ */

/**
 * Parse CSS into a tree. Handles comments, strings, url(), parentheses and
 * nesting. Nodes:
 *   { type:'decl', prop, value, important, line }
 *   { type:'rule', sel, body:[nodes], line }
 *   { type:'at', name, prelude, body:[nodes]|null, raw, line }
 *   { type:'comment', text, line }
 */
export function parseCss(src) {
  let i = 0;
  const n = src.length;
  let line = 1;
  const lineAt = (idx) => { let l = 1; for (let k = 0; k < idx && k < n; k++) if (src.charCodeAt(k) === 10) l++; return l; };

  function skipString(q) {
    i++;
    while (i < n && src[i] !== q) { if (src[i] === '\\') i++; i++; }
    i++;
  }

  function parseBody(inBlock) {
    const nodes = [];
    let buf = '';
    let bufStart = i;
    let paren = 0;
    const flushDecl = (end) => {
      const text = buf.trim();
      buf = '';
      if (!text) return;
      const colon = text.indexOf(':');
      if (colon === -1) { nodes.push({ type: 'junk', text, line: lineAt(end) }); return; }
      const prop = text.slice(0, colon).trim();
      let value = text.slice(colon + 1).trim();
      let important = false;
      const im = /\s*!\s*important\s*$/i.exec(value);
      if (im) { important = true; value = value.slice(0, im.index).trim(); }
      nodes.push({ type: 'decl', prop, value, important, line: lineAt(bufStart) });
    };
    while (i < n) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end === -1 ? n : end + 2;
        if (!buf.trim()) nodes.push({ type: 'comment', text: src.slice(i + 2, end === -1 ? n : end).trim(), line: lineAt(i) });
        i = stop;
        continue;
      }
      if (c === '"' || c === "'") { const s = i; skipString(c); buf += src.slice(s, i); continue; }
      if (c === '(') { paren++; buf += c; i++; continue; }
      if (c === ')') { paren--; buf += c; i++; continue; }
      if (paren > 0) { buf += c; i++; continue; }
      if (c === ';') { const at = i; i++; flushAt(at); continue; }
      if (c === '{') {
        const prelude = buf.trim();
        const startIdx = bufStart;
        buf = '';
        const startLine = lineAt(startIdx);
        i++;
        const body = parseBody(true);
        const node = { line: startLine };
        const atm = prelude.startsWith('@') ? /^@([\w-]+)\s*([\s\S]*)$/.exec(prelude) : null;
        if (atm) {
          Object.assign(node, { type: 'at', name: atm[1].toLowerCase(), prelude: atm[2].trim(), body, raw: src.slice(startIdx, i).trim() });
        } else if (prelude && !prelude.startsWith('@')) {
          Object.assign(node, { type: 'rule', sel: prelude, body });
        } else {
          // "@@@ {" or a block with no selector at all: nothing sensible to convert
          Object.assign(node, { type: 'junk', text: prelude || '{ ... }' });
        }
        nodes.push(node);
        bufStart = i;
        continue;
      }
      if (c === '}') {
        if (inBlock) { flushDecl(i); i++; return nodes; }
        i++; continue; // a stray brace at the top level
      }
      if (!buf.trim()) bufStart = i;
      buf += c; i++;
    }
    flushDecl(i);
    return nodes;

    // a ";" ended something: a declaration, or an at-rule with no block (@import ...;)
    function flushAt(at) {
      const text = buf.trim();
      const m = text.startsWith('@') ? /^@([\w-]+)\s*([\s\S]*)$/.exec(text) : null;
      if (text.startsWith('@') && !m) { nodes.push({ type: 'junk', text, line: lineAt(bufStart) }); buf = ''; }
      else if (m) {
        nodes.push({ type: 'at', name: m[1].toLowerCase(), prelude: m[2].trim(), body: null, raw: text + ';', line: lineAt(bufStart) });
        buf = '';
      } else flushDecl(at);
      bufStart = i;
    }
  }
  return parseBody(false);
}

/* ------------------------------------------------------------------ *
 * 2. value conversion
 * ------------------------------------------------------------------ */

/** split on top-level whitespace or commas, keeping rgb(1 2 3), url(a b) etc. whole */
function topSplit(s, sep) {
  const out = []; let depth = 0, cur = '', q = null;
  for (const ch of s) {
    if (q) { cur += ch; if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    const hit = sep === ',' ? ch === ',' : /\s/.test(ch);
    if (hit && depth === 0) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const PX = /^(-?\d*\.?\d+)px$/;

function stripPx(prop, value) {
  if (prop.startsWith('--') || UNITLESS_PROPS.has(prop)) return value;
  // only top-level words: a px inside calc() or min() is left as written
  return topSplit(value, ' ').map((w) => (PX.test(w) ? w.replace(PX, '$1') : w)).join(' ');
}

const msOf = (t) => {
  const m = /^(\d*\.?\d+)(ms|s)$/.exec(t);
  if (!m) return null;
  return m[2] === 's' ? Math.round(parseFloat(m[1]) * 1000) : Math.round(parseFloat(m[1]));
};

function convertTransition(value, note) {
  if (value.trim() === 'none') return 'none';
  const out = [];
  for (const seg of topSplit(value, ',')) {
    const atoms = topSplit(seg, ' ');
    const times = atoms.filter((a) => msOf(a) !== null);
    const ease = atoms.find((a) => EASINGS[a] || /^(cubic-bezier|steps)\(/.test(a));
    const props = atoms.filter((a) => msOf(a) === null && a !== ease);
    if (!times.length) { note(`transition "${seg}" has no duration, so it was dropped`); continue; }
    if (times.length > 1) note('a transition delay has no DSSL form here, so it was dropped (use transition-delay)');
    const prop = props.join(' ');
    out.push([String(msOf(times[0])), ease, prop && prop !== 'all' ? prop : ''].filter(Boolean).join(' '));
  }
  return out.join(', ');
}

/** font: [style] [weight] size[/line-height] family  ->  longhands */
function convertFont(value, note) {
  const SYSTEM = /^(caption|icon|menu|message-box|small-caption|status-bar|inherit|initial|unset)$/;
  if (SYSTEM.test(value.trim())) { note(`font: ${value} is a system font keyword with no DSSL equivalent`); return null; }
  const atoms = topSplit(value, ' ');
  const sizeIdx = atoms.findIndex((a) => /^(-?\d*\.?\d+)(px|em|rem|%|pt|vw|vh)?(\/.+)?$/.test(a) && !/^\d{3}$/.test(a) && !/^\d00$/.test(a)
    || /^(xx-small|x-small|small|medium|large|x-large|xx-large)(\/.+)?$/.test(a));
  if (sizeIdx === -1) { note(`font: ${value} has no size, so it could not be split`); return null; }
  const out = [];
  for (const a of atoms.slice(0, sizeIdx)) {
    if (/^(italic|oblique)$/.test(a)) out.push(['font-style', a]);
    else if (/^(\d{3}|bold|bolder|lighter)$/.test(a)) out.push(['font-weight', a]);
    else if (a === 'small-caps') out.push(['font-variant', a]);
  }
  const [size, lh] = atoms[sizeIdx].split('/');
  out.push(['font-size', size]);
  if (lh) out.push(['line-height', lh]);
  const fam = atoms.slice(sizeIdx + 1).join(' ');
  if (fam) out.push(['font-family', fam]);
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. the converter
 * ------------------------------------------------------------------ */

export function importCss(css, options = {}) {
  const tree = parseCss(String(css));
  const report = { rules: 0, declarations: 0, converted: 0, pinned: 0, raw: 0, motions: 0, dropped: [], notes: [], compile: null };
  const rawChunks = [];
  const pinBlocks = [];
  const note = (line, message, hint) => report.notes.push({ line, message, hint });
  const pad = (d) => '  '.repeat(d);

  const emitDecl = (d, depth, out, collectPin) => {
    report.declarations++;
    const line = d.line;
    const prop = d.prop.toLowerCase();
    if (!prop.startsWith('--') && !KNOWN_PROPS.has(prop) && prop !== 'transition' && prop !== 'font' && prop !== 'animation' && !SEMANTIC_NAMES.has(prop)) {
      out.push(`${pad(depth)}// dssl import dropped (unknown to DSSL): ${d.prop}: ${d.value}`);
      report.dropped.push({ line, text: `${d.prop}: ${d.value}`, reason: 'DSSL does not know this property' });
      return;
    }
    if (SEMANTIC_NAMES.has(prop) && prop !== 'font') {
      note(line, `"${d.prop}" is also a DSSL shorthand with a different meaning`, 'check this line after import');
    }
    if (d.important) {
      collectPin.push({ prop, value: d.value, line });
      report.pinned++;
      return;
    }
    let value = d.value;
    if (prop === 'transition') {
      value = convertTransition(value, (m) => note(line, m));
      if (!value) { report.dropped.push({ line, text: `${d.prop}: ${d.value}`, reason: 'no usable duration' }); out.push(`${pad(depth)}// dssl import dropped: ${d.prop}: ${d.value}`); return; }
      report.converted++;
      out.push(`${pad(depth)}transition: ${value}`);
      return;
    }
    if (prop === 'font') {
      const parts = convertFont(value, (m) => note(line, m));
      if (!parts) { report.dropped.push({ line, text: `${d.prop}: ${d.value}`, reason: 'font shorthand could not be split' }); out.push(`${pad(depth)}// dssl import dropped: ${d.prop}: ${d.value}`); return; }
      report.converted++;
      for (const [p, v] of parts) out.push(`${pad(depth)}${p}: ${stripPx(p, v)}`);
      return;
    }
    if (prop === 'grid') note(line, 'grid: is a CSS shorthand here but a different sugar in DSSL', 'it was kept as written; rewrite it with grid-template-* if the compiler complains');
    const next = stripPx(prop, value);
    if (next !== value) report.converted++;
    out.push(`${pad(depth)}${d.prop}: ${next}`);
  };

  const emitNodes = (nodes, depth, out) => {
    for (const node of nodes) {
      if (node.type === 'comment') { if (depth === 0 || true) out.push(`${pad(depth)}// ${node.text.replace(/\n\s*/g, ' ')}`); continue; }
      if (node.type === 'junk') { note(node.line, `could not read "${node.text.slice(0, 40)}"`); continue; }
      if (node.type === 'decl') { emitDecl(node, depth, out, out.__pin || (out.__pin = [])); continue; }
      if (node.type === 'rule') {
        report.rules++;
        const lines = [];
        lines.__pin = [];
        emitNodes(node.body, depth + 1, lines);
        out.push(`${pad(depth)}${node.sel} {`, ...lines, `${pad(depth)}}`);
        if (lines.__pin.length) pinBlocks.push({ sel: node.sel, decls: lines.__pin, depth });
        continue;
      }
      if (node.type === 'at') {
        const name = node.name;
        if (name === 'keyframes' || name.endsWith('-keyframes')) {
          if (name !== 'keyframes') { note(node.line, `@${name} is a vendor copy; the plain @keyframes is used`); continue; }
          report.motions++;
          out.push(`${pad(depth)}motion ${node.prelude} {`);
          for (const fr of node.body || []) {
            if (fr.type !== 'rule') continue;
            for (const label of fr.sel.split(',').map((s) => s.trim())) {
              const key = label === '0%' ? 'from' : label === '100%' ? 'to' : /%$/.test(label) ? `at ${label}` : label;
              const inner = [];
              inner.__pin = [];
              emitNodes(fr.body, depth + 2, inner);
              out.push(`${pad(depth + 1)}${key} {`, ...inner, `${pad(depth + 1)}}`);
            }
          }
          out.push(`${pad(depth)}}`);
          continue;
        }
        if (RAW_AT_RULES.has(name)) {
          report.raw++;
          rawChunks.push(node.raw);
          if (name === 'import') note(node.line, '@import was moved into raw { }', 'load other stylesheets with <link rel="stylesheet/dssl"> or <link rel="stylesheet"> instead');
          continue;
        }
        if (name === 'media' || name === 'container') {
          const lines = [];
          lines.__pin = [];
          emitNodes(node.body || [], depth + 1, lines);
          out.push(`${pad(depth)}@${name} ${node.prelude} {`, ...lines, `${pad(depth)}}`);
          if (lines.__pin.length) note(node.line, `!important inside @${name} was moved to pin { } and loses the media condition`, 'wrap it in @media inside pin by hand');
          continue;
        }
        if (name === 'layer') {
          if (!node.body) { note(node.line, `@layer ${node.prelude}; is dropped: DSSL's layers are fixed (tokens, base, components, utilities, pin)`); continue; }
          const lines = [];
          lines.__pin = [];
          emitNodes(node.body, depth + 1, lines);
          out.push(`${pad(depth)}@layer ${node.prelude} {`, ...lines, `${pad(depth)}}`);
          continue;
        }
        report.raw++;
        rawChunks.push(node.raw);
        note(node.line, `@${name} was kept verbatim in raw { }`);
      }
    }
  };

  const lines = [];
  lines.__pin = [];
  emitNodes(tree, 0, lines);

  let dssl = lines.join('\n');
  if (pinBlocks.length) {
    dssl += `\n\n// !important in CSS is pin { } in DSSL: the layer that always wins\npin {\n`;
    for (const b of pinBlocks) {
      dssl += `  ${b.sel} {\n${b.decls.map((d) => `    ${d.prop}: ${stripPx(d.prop, d.value)}`).join('\n')}\n  }\n`;
    }
    dssl += `}`;
  }
  if (rawChunks.length) {
    dssl = `// raw { } is real CSS, so semicolons are required inside it\nraw {\n${rawChunks.map((c) => '  ' + c.replace(/\n/g, '\n  ')).join('\n')}\n}\n\n` + dssl;
  }
  dssl = dssl.trim() + '\n';

  // Run the real compiler on the result. A declaration it rejects (valid CSS that DSSL's
  // stricter value checking does not accept, like scroll-snap-type: x mandatory) is commented
  // out and listed, so the file you get always compiles.
  const check = () => {
    try {
      const { ast, errors: parseErrors } = parse(dssl, 'imported.dssl');
      const doc = resolve(ast, 'imported.dssl');
      return { errors: [...parseErrors, ...doc.errors], warnings: doc.warnings.length };
    } catch (e) {
      return { errors: [{ line: 0, message: `the compiler threw: ${e.message}` }], warnings: 0 };
    }
  };
  let result = check();
  for (let pass = 0; pass < 4 && result.errors.length; pass++) {
    const lines = dssl.split('\n');
    const seen = new Set();
    let changed = false;
    for (const e of result.errors) {
      const idx = (e.line || 0) - 1;
      if (idx < 0 || idx >= lines.length || seen.has(idx)) continue;
      const text = lines[idx];
      if (!/^\s*[-\w]+\s*:/.test(text) || /^\s*\/\//.test(text)) continue; // only declaration lines
      seen.add(idx);
      const indent = text.match(/^\s*/)[0];
      lines[idx] = `${indent}// dssl import dropped (the compiler rejected it: ${e.message}): ${text.trim()}`;
      report.dropped.push({ line: e.line, text: text.trim(), reason: e.message });
      changed = true;
    }
    if (!changed) break;
    dssl = lines.join('\n');
    result = check();
  }
  report.compile = {
    ok: result.errors.length === 0,
    errors: result.errors.map((e) => ({ line: e.line, message: e.message, hint: e.hint })),
    warnings: result.warnings,
  };
  return { dssl, report };
}
