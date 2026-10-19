/* =========================================================================
 * DSSL — Domain Specific Style Language
 * parser.js — tokenizer + parser for the braces syntax
 *
 * Line-oriented parser:
 *   - blocks open with `header {` and close with `}`
 *   - declarations are `prop: value` (newline- or `;`-terminated)
 *   - one-liners like `.card { padding: 12 }` are allowed
 *   - comments: `// ...` and block comments
 *
 * Produces a node tree; classification of headers happens here, value
 * resolution happens in resolver.js.
 * ========================================================================= */

const STATE_WORDS = new Set([
  'hover', 'focus', 'focus-visible', 'active', 'disabled', 'checked',
  'empty', 'target', 'required', 'invalid', 'valid', 'open', 'closed',
  'placeholder-shown', 'read-only', 'read-write', 'enabled',
  'indeterminate', 'first-child', 'last-child', 'only-child',
  'first-of-type', 'last-of-type', 'link', 'visited',
  'seen', // v0.4.0 — engine-native: fires once when the element enters the viewport
]);

// v0.5.0 — exported so the resolver can validate the `::name` half whenever a
// full selector (.card::before) carries a pseudo-element. The resolver splits
// those into element + pseudo and routes them into shadow CSS — previously a
// top-level `.card::before { }` compiled ok and then matched NOTHING.
export const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'placeholder', 'selection', 'marker',
  'first-line', 'first-letter', 'backdrop', 'file-selector-button',
]);

// v0.4.2 — vendor pseudo-elements pass through verbatim (::-webkit-scrollbar
// and friends). The DOM gives you no other way to reach native scrollbars,
// so they ride the same shadow-CSS exception as ::before/::after. The name
// may carry trailing state (::hover, :horizontal) — it is emitted as-is.
export const VENDOR_PSEUDO = /^-(webkit|moz|ms)-/;

/** find index of first top-level occurrence of `ch` (skips strings + parens) */
function scanFor(str, ch, from = 0) {
  let depth = 0, q = null;
  for (let i = from; i < str.length; i++) {
    const c = str[i];
    if (q) { if (c === q && str[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && c === ch) return i;
  }
  return -1;
}

/** split a string on a top-level separator */
function splitTop(str, sep) {
  const out = [];
  let cur = '', depth = 0, q = null;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q) { cur += c; if (c === q && str[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === '(' || c === '[') { depth++; cur += c; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); cur += c; continue; }
    if (depth === 0 && c === sep) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** strip comments (respecting strings), newlines preserved so lines survive */
function stripComments(src) {
  let out = '', q = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) {
      out += c;
      if (c === q && src[i - 1] !== '\\') q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; out += c; continue; }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n'; i--; continue;
    }
    if (c === '/' && n === '*') {
      let j = i + 2;
      while (j < src.length && !(src[j] === '*' && src[j + 1] === '/')) {
        out += src[j] === '\n' ? '\n' : ' ';
        j++;
      }
      i = j + 1; // skip past the closing */
      continue;
    }
    out += c;
  }
  return out;
}

export function parse(source, file = 'inline.dssl') {
  const errors = [];
  const err = (line, message, hint) => errors.push({ file, line, message, hint });
  const root = { kind: 'root', children: [] };
  const stack = [root];

  const clean = stripComments(source);
  const lines = clean.split('\n');

  const classify = (header, line) => {
    const h = header.trim();
    if (h === 'tokens') return { kind: 'tokens' };
    if (h === 'pin') return { kind: 'pin' };
    if (h.startsWith('behavior ')) return { kind: 'behavior', name: h.slice(9).trim() };
    if (h.startsWith('motion ')) return { kind: 'motion', name: h.slice(7).trim() };
    if (h.startsWith('@layer ')) return { kind: 'layer', name: h.slice(7).trim() };
    if (h.startsWith('@media ')) return { kind: 'media', query: h.slice(7).trim() };
    if (h.startsWith('@container')) return { kind: 'container', query: h.slice(10).trim() };
    if (h.startsWith('@signal ')) return { kind: 'signal', expr: h.slice(8).trim() };
    if (h.startsWith('@')) {
      err(line, `unknown at-rule "${h.split(' ')[0]}"`, 'try @media, @container, @signal or @layer');
      return { kind: 'bogus' };
    }
    if (h.startsWith('::')) {
      const name = h.slice(2).split(/[\s(]/)[0];
      if (!PSEUDO_ELEMENTS.has(name) && !VENDOR_PSEUDO.test(name)) {
        err(line, `unknown pseudo-element "::${name}"`, 'try ::before, ::after, ::selection, or a vendor one like ::-webkit-scrollbar-thumb');
        return { kind: 'bogus' };
      }
      return { kind: 'pseudo', name };
    }
    if (STATE_WORDS.has(h)) return { kind: 'state', name: h };
    return { kind: 'selector', sel: h };
  };

  /** process a chunk, walking top-level braces so one-liners work */
  const processChunk = (chunk, line) => {
    let rest = chunk;
    while (rest.length) {
      rest = rest.trim();
      if (!rest) return;

      const open = scanFor(rest, '{');
      const close = scanFor(rest, '}');

      if (close !== -1 && (open === -1 || close < open)) {
        const before = rest.slice(0, close).trim();
        if (before) processContent(before, line);
        if (stack.length === 1) err(line, 'unexpected "}"');
        else stack.pop();
        rest = rest.slice(close + 1);
        continue;
      }

      if (open !== -1) {
        const header = rest.slice(0, open).trim();
        if (!header) { err(line, 'block is missing a header before "{"'); rest = rest.slice(open + 1); continue; }
        const meta = classify(header, line);
        const node = { ...meta, line, children: [] };
        stack[stack.length - 1].children.push(node);
        if (meta.kind !== 'bogus') stack.push(node);
        rest = rest.slice(open + 1);
        continue;
      }

      processContent(rest, line);
      return;
    }
  };

  const processContent = (content, line) => {
    for (const piece of splitTop(content, ';')) {
      const part = piece.trim();
      if (!part) continue;
      const colon = scanFor(part, ':');
      if (colon === -1) {
        // `use behavior-name` — keyword declaration with a name argument
        const useMatch = part.match(/^use\s+([A-Za-z][\w-]*)$/);
        if (useMatch) {
          stack[stack.length - 1].children.push({ kind: 'decl', prop: 'use', value: useMatch[1], line });
          continue;
        }
        // valueless semantic property (e.g. `truncate`) — resolver decides if legal
        if (/^[a-z][a-z0-9-]*$/i.test(part)) {
          stack[stack.length - 1].children.push({ kind: 'decl', prop: part.toLowerCase(), value: '', line });
        } else {
          err(line, `expected ":" in "${part.slice(0, 40)}"`, 'declarations look like  prop: value');
        }
        continue;
      }
      const prop = part.slice(0, colon).trim().toLowerCase();
      const value = part.slice(colon + 1).trim();
      if (!prop) { err(line, 'declaration is missing a property name'); continue; }
      // v0.4.0: dotted custom properties are legal — `--color.accent: …` is
      // scoped-token sugar (resolver maps it to the engine's token variable)
      if (!/^(-{1,2}[a-z][a-z0-9.-]*|[a-z][a-z0-9-]*)$/i.test(prop)) {
        err(line, `"${prop}" is not a valid property name`);
        continue;
      }
      stack[stack.length - 1].children.push({ kind: 'decl', prop, value, line });
    }
  };

  // ---- line loop with continuation buffering ----
  // A logical chunk grows across lines while:
  //   - parens/brackets are unbalanced   (multi-line values)
  //   - it ends with a top-level comma   (multi-line selector lists)
  //   - it ends with a top-level colon   (value on the next line)
  let buf = '', bufLine = 0;

  const needsMore = (s) => {
    let depth = 0, q = null;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (q) { if (c === q && s[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '(' || c === '[') depth++;
      else if (c === ')' || c === ']') depth--;
    }
    if (depth !== 0) return true;
    const t = s.trimEnd();
    const last = t[t.length - 1];
    return last === ',' || last === ':';
  };

  lines.forEach((raw, idx) => {
    const line = idx + 1;
    const trimmed = raw.trim();
    if (!trimmed) return; // blank lines never split a pending chunk
    const candidate = buf ? buf + ' ' + trimmed : raw;
    if (buf && needsMore(candidate)) { buf = candidate; return; }
    if (buf) { processChunk(candidate, bufLine || line); buf = ''; return; }
    if (needsMore(candidate)) { buf = candidate; bufLine = line; return; }
    processChunk(candidate, line);
  });
  if (buf.trim()) processChunk(buf, bufLine);

  if (stack.length > 1) {
    err(lines.length, `${stack.length - 1} block(s) were never closed with "}"`, 'every "{" needs a matching "}"');
  }

  return { ast: root, errors };
}
