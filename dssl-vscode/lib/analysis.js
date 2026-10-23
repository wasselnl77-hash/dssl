/* analysis.js — pure analysis over .dssl text. No vscode imports here; the
 * extension layer feeds it text and offsets, tests feed it strings.
 * The point of this module: diagnostics come from the REAL parser and
 * resolver (the same code the browser runs), and completions come from the
 * real token registry folded across the workspace. */

import { parse, PSEUDO_ELEMENTS } from './engine/parser.js';
import { resolve, DEFAULT_TOKENS, CSS_KEYWORDS } from './engine/resolver.js';
import { SEMANTIC, CSS, STATES, AT_RULES, BLOCKS, PROPERTY_NAMES } from './props-docs.js';

/* ---- workspace analysis ------------------------------------------------ */

/* docs: Map<absolute path, text>. Fold order: tokens*.dssl first, then
 * alphabetical — the same convention the site uses (tokens first). */
export function analyzeWorkspace(docs) {
  const paths = [...docs.keys()].sort((a, b) => {
    const ta = /tokens[^/]*\.dssl$/.test(a) ? 0 : 1;
    const tb = /tokens[^/]*\.dssl$/.test(b) ? 0 : 1;
    return ta - tb || a.localeCompare(b);
  });

  const registry = { ...DEFAULT_TOKENS };
  const motions = new Set();
  const behaviors = new Set();
  const perFile = new Map();

  for (const p of paths) {
    const text = docs.get(p);
    const { ast, errors: parseErrors } = parse(text, p);
    const doc = resolve(ast, p, { ...registry });
    for (const [k, v] of Object.entries(doc.tokens || {})) registry[k] = v;
    for (const m of Object.keys(doc.motions || {})) motions.add(m);
    collectBehaviors(text, behaviors);
    perFile.set(p, { errors: [...parseErrors, ...doc.errors], warnings: doc.warnings || [], doc });
  }
  return { registry, motions, behaviors, perFile };
}

function collectBehaviors(text, into) {
  const re = /^\s*behavior\s+([\w-]+)/gm;
  let m;
  while ((m = re.exec(text))) into.add(m[1]);
}

/* ---- diagnostics ------------------------------------------------------- */

/* Returns [{ line (0-based), col, message, severity: 'error'|'warning', hint, source }] */
export function diagnosticsFor(analysis, path) {
  const file = analysis.perFile.get(path);
  if (!file) return [];
  const out = [];
  for (const e of file.errors) {
    out.push({
      line: Math.max(0, (e.line ?? 1) - 1),
      col: 0,
      message: e.message + (e.hint ? `  (did you mean "${e.hint}"?)` : ''),
      severity: 'error',
      hint: e.hint,
      source: 'dssl',
    });
  }
  for (const w of file.warnings) {
    out.push({
      line: Math.max(0, (w.line ?? 1) - 1),
      col: 0,
      message: w.message + (w.hint ? `  ${w.hint}` : ''),
      severity: 'warning',
      hint: w.hint,
      source: 'dssl',
    });
  }
  return out;
}

/* ---- context detection ------------------------------------------------- */

/* Strip comments and strings so brace/paren tracking and line inspection
 * never trip on them. Returns masked text (same offsets). */
function maskCode(text) {
  let out = '';
  let i = 0;
  let mode = null; // 'line' | 'block' | 'dq' | 'sq'
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (mode === null) {
      if (c === '/' && n === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && n === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === '"') { mode = 'dq'; out += ' '; i += 1; continue; }
      if (c === "'") { mode = 'sq'; out += ' '; i += 1; continue; }
      out += c; i += 1; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = null; out += '\n'; } else out += ' '; i += 1; continue; }
    if (mode === 'block') { if (c === '*' && n === '/') { mode = null; out += '  '; i += 2; } else { out += c === '\n' ? '\n' : ' '; i += 1; } continue; }
    // strings: terminate or newline kills them
    if ((mode === 'dq' && c === '"') || (mode === 'sq' && c === "'")) { mode = null; out += ' '; i += 1; continue; }
    if (c === '\n') { mode = null; out += '\n'; i += 1; continue; }
    out += ' '; i += 1;
  }
  return out;
}

/* Returns { depth, inDecl, prop, valuePrefix, lineStart, lineToCursor } */
export function contextAt(text, offset) {
  const masked = maskCode(text.slice(0, offset));
  let depth = 0;
  let paren = 0;
  for (const c of masked) {
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
  }
  const nl = masked.lastIndexOf('\n');
  const lineToCursor = masked.slice(nl + 1);
  const tokenDot = lineToCursor.match(/([\w-]+)\.([\w-]*)$/);
  // declaration line: "prop: value..." anchored at line start, but a line
  // that also opens a block ("a:hover {") is a selector, not a declaration
  let declMatch = lineToCursor.match(/^(\s*)(-{0,2}[.\w-]+)\s*:\s*([\s\S]*)$/);
  if (declMatch && declMatch[3].includes('{')) declMatch = null;
  // the value prefix is the trailing word segment: after "gap " (typed +
  // space) it is empty, so completions re-open for the next word
  const valueRaw = declMatch ? declMatch[3] : '';
  const tail = valueRaw.match(/([^\s{;,]*)$/);
  return {
    depth,
    paren,
    inDecl: !!declMatch,
    prop: declMatch ? declMatch[2] : null,
    valuePrefix: tail ? tail[0] : '',
    tokenGroup: tokenDot ? tokenDot[1] : null,
    tokenPartial: tokenDot ? tokenDot[2] : null,
    lineToCursor,
  };
}

/* ---- completions ------------------------------------------------------- */

/* kind strings map to vscode.CompletionItemKind in extension.js */
export function completionsAt(analysis, path, text, offset) {
  const ctx = contextAt(text, offset);
  const items = [];

  // token dot-completion: color., space., anything the registry knows
  if (ctx.tokenGroup) {
    const prefix = ctx.tokenGroup + '.';
    const seen = new Set();
    for (const key of Object.keys(analysis.registry)) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length);
        if (!rest.includes('.') && !seen.has(rest)) {
          seen.add(rest);
          items.push({
            label: rest,
            kind: 'value',
            detail: String(analysis.registry[key]),
            documentation: `token ${prefix}${rest} = ${analysis.registry[key]}`,
          });
        }
      }
    }
    if (items.length) return { items, context: 'token' };
  }

  // inside a declaration: values
  if (ctx.inDecl) {
    const prop = (ctx.prop || '').replace(/^-/, '');
    // motions first for animate:, plus the animate-only grammar words
    if (prop === 'animate') {
      for (const m of analysis.motions) {
        items.push({ label: m, kind: 'value', detail: 'motion', documentation: `motion defined in the workspace` });
      }
      for (const k of ['infinite', 'alternate', 'reverse', 'alternate-reverse', 'snap', 'essential', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'forwards', 'backwards', 'both']) {
        items.push({ label: k, kind: 'keyword', detail: 'animate option', documentation: ANIMATE_EXTRAS[k] || 'animate option' });
      }
    }
    for (const k of CSS_KEYWORDS) {
      items.push({ label: k, kind: 'keyword', detail: 'keyword' });
    }
    for (const key of Object.keys(analysis.registry)) {
      items.push({ label: key, kind: 'value', detail: 'token = ' + analysis.registry[key], documentation: `token ${key} = ${analysis.registry[key]}` });
    }
    return { items, context: 'value' };
  }

  // property / block position
  for (const p of PROPERTY_NAMES) {
    items.push({ label: p, kind: 'property', detail: SEMANTIC[p] ? 'semantic' : 'css', documentation: SEMANTIC[p] || CSS[p] });
  }
  for (const [s, doc] of Object.entries(STATES)) {
    items.push({ label: s, kind: 'block', detail: 'state block', documentation: doc });
  }
  for (const [b, doc] of Object.entries(BLOCKS)) {
    items.push({ label: b, kind: 'block', detail: 'block', documentation: doc });
  }
  for (const [a, doc] of Object.entries(AT_RULES)) {
    items.push({ label: a, kind: 'block', detail: 'at-rule', documentation: doc });
  }
  for (const b of analysis.behaviors) {
    items.push({ label: 'use ' + b, kind: 'keyword', detail: 'behavior', documentation: 'apply the behavior "' + b + '"' });
  }
  for (const p of PSEUDO_ELEMENTS) {
    items.push({ label: '::' + p, kind: 'keyword', detail: 'pseudo-element', documentation: 'compiles to real shadow CSS' });
  }
  return { items, context: 'property' };
}

const ANIMATE_EXTRAS = {
  infinite: 'loop forever',
  alternate: 'ease back on every other cycle',
  snap: 'stepped timing',
  essential: 'run even under reduced-motion',
};

function startsWith(s, prefix) {
  if (!prefix) return true;
  return s.startsWith(prefix) || s.includes(prefix);
}

/* ---- hovers ------------------------------------------------------------ */

export function hoverAt(analysis, path, text, offset) {
  const before = text.slice(0, offset);
  const after = text.slice(offset);
  const m = before.match(/[\w.@-]+$/);
  const n = after.match(/^[\w.-]*/);
  const word = (m ? m[0] : '') + (n ? n[0] : '');
  if (!word) return null;

  const clean = word.replace(/^@/, '');

  // token (possibly dotted)
  if (clean.includes('.')) {
    const v = analysis.registry[clean];
    if (v !== undefined) {
      return { contents: `**${clean}** \u2192 \`${v}\`\n\n_design token_ (value resolved from the workspace registry)` };
    }
  }
  if (SEMANTIC[clean]) return { contents: `**${clean}** \u2014 ${SEMANTIC[clean]}` };
  if (STATES[clean]) return { contents: `**${clean}** _state_ \u2014 ${STATES[clean]}` };
  if (BLOCKS[clean]) return { contents: `**${clean}** \u2014 ${BLOCKS[clean]}` };
  if (AT_RULES[clean]) return { contents: `**${clean}** \u2014 ${AT_RULES[clean]}` };
  if (CSS[clean]) return { contents: `**${clean}** \u2014 ${CSS[clean]}` };
  if (analysis.motions.has(clean)) {
    return { contents: `**${clean}** _motion_ \u2014 keyframe animation. Run with \`animate: ${clean} 600 ease-out\`.` };
  }
  if (analysis.behaviors.has(clean)) {
    return { contents: `**${clean}** _behavior_ \u2014 apply with \`use ${clean}\`.` };
  }
  return null;
}
