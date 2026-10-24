/* =========================================================================
 * DSSL - Domain Specific Style Language
 * parser.js - tokenizer + parser for the braces syntax
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

export const STATE_WORDS = new Set([
  'hover', 'focus', 'focus-visible', 'active', 'disabled', 'checked',
  'empty', 'target', 'required', 'invalid', 'valid', 'open', 'closed',
  'placeholder-shown', 'read-only', 'read-write', 'enabled',
  'indeterminate', 'first-child', 'last-child', 'only-child',
  'first-of-type', 'last-of-type', 'link', 'visited',
  'seen', // v0.4.0 - engine-native: fires once when the element enters the viewport
]);

// v0.5.0 - exported so the resolver can validate the `::name` half whenever a
// full selector (.card::before) carries a pseudo-element. The resolver splits
// those into element + pseudo and routes them into shadow CSS - previously a
// top-level `.card::before { }` compiled ok and then matched NOTHING.
export const PSEUDO_ELEMENTS = new Set([
  'before', 'after', 'placeholder', 'selection', 'marker',
  'first-line', 'first-letter', 'backdrop', 'file-selector-button',
  // v0.7.2 - ::part() rides the shadow-CSS pipeline (a document stylesheet
  // CAN style shadow parts of custom elements). ::slotted() is accepted by
  // the parser but rejected by the resolver with a loud explanation: it only
  // exists inside a shadow tree, which is not a place DSSL styles.
  'part', 'slotted',
]);

// v0.4.2 - vendor pseudo-elements pass through verbatim (::-webkit-scrollbar
// and friends). The DOM gives you no other way to reach native scrollbars,
// so they ride the same shadow-CSS exception as ::before/::after. The name
// may carry trailing state (::hover, :horizontal) - it is emitted as-is.
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

/** find index of LAST top-level occurrence of `ch` (skips strings + parens) */
function scanForLast(str, ch) {
  let depth = 0, q = null, found = -1;
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (q) { if (c === q && str[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); continue; }
    if (depth === 0 && c === ch) found = i;
  }
  return found;
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

/** find index of the matching close brace for the '{' just before `from`
 * (string-aware). Returns -1 when the block is never closed. */
function matchBrace(str, from) {
  let depth = 1, q = null;
  for (let i = from; i < str.length; i++) {
    const c = str[i];
    if (q) { if (c === q && str[i - 1] !== '\\') q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
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
      // v0.7.1 bugfix: this handler used to emit its own '\n' AND rewind so
      // the main loop emitted the same newline again - every // comment
      // doubled a line, and every line number after the first comment
      // drifted +1 (diagnostics pointed one line late). The newline is now
      // emitted exactly once by the main loop.
      while (i < src.length && src[i] !== '\n') i++;
      if (i < src.length) i--; // reprocess the newline once, below
      continue;
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
    if (h === 'raw' || h === '@css') return { kind: 'raw' };
    if (h.startsWith('behavior ')) return { kind: 'behavior', name: h.slice(9).trim() };
    if (h.startsWith('motion ')) return { kind: 'motion', name: h.slice(7).trim() };
    if (h.startsWith('@layer ')) return { kind: 'layer', name: h.slice(7).trim() };
    if (h.startsWith('@media ')) return { kind: 'media', query: h.slice(7).trim() };
    if (h.startsWith('@container')) return { kind: 'container', query: h.slice(10).trim() };
    if (h.startsWith('@signal ')) return { kind: 'signal', expr: h.slice(8).trim() };
    if (h.startsWith('@')) {
      // v0.8.0 - unknown at-rules are skipped WHOLE (balanced braces). They
      // used to error and then keep parsing inside their block, so the inner
      // rules leaked out unconditionally: `@supports (display:grid) { .a { … } }
      // applied .a everywhere. The block is now dropped in its entirety -
      // and raw { } is the documented escape hatch for CSS DSSL has no sugar
      // for yet (@font-face, @keyframes, @supports, @import…).
      err(line, `unknown at-rule "${h.split(' ')[0]}"`, 'the whole block is skipped - for verbatim CSS like @font-face / @keyframes / @supports, wrap it in raw { }');
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
        // v0.7.2 - declarations and a nested block sharing one line:
        // `.card { background: red; hover { ... } }`. Everything before the
        // header used to be swallowed whole into it, so `background: red`
        // silently became part of a selector named "background: red; hover"
        // and vanished. Declarations before the LAST top-level ';' are now
        // processed as declarations; the header is what follows them.
        if (header) {
          const semi = scanForLast(header, ';');
          if (semi !== -1) {
            processContent(header.slice(0, semi), line);
            const realHeader = header.slice(semi + 1).trim();
            if (!realHeader) { err(line, 'block is missing a header before "{"'); rest = rest.slice(open + 1); continue; }
            const meta = classify(realHeader, line);
            const node = { ...meta, line, children: [] };
            stack[stack.length - 1].children.push(node);
            const after = openBlock(meta, node, rest, open, line);
            if (after === null) { rest = rest.slice(open + 1); if (meta.kind !== 'bogus') stack.push(node); continue; }
            rest = after;
            continue;
          }
        }
        if (!header) { err(line, 'block is missing a header before "{"'); rest = rest.slice(open + 1); continue; }
        const meta = classify(header, line);
        const node = { ...meta, line, children: [] };
        stack[stack.length - 1].children.push(node);
        const after = openBlock(meta, node, rest, open, line);
        if (after === null) { rest = rest.slice(open + 1); if (meta.kind !== 'bogus') stack.push(node); continue; }
        rest = after;
        continue;
      }

      processContent(rest, line);
      return;
    }
  };

  /** v0.8.0 - what happens right after a block header opens.
   *  - raw { } (top level): capture the block body VERBATIM as node.css and
   *    return the remainder of the chunk - or enter multi-line capture mode
   *    (returns '' with rawCapture armed).
   *  - bogus (unknown at-rule / pseudo-element): skip the whole balanced
   *    block so its content can never leak into the parent.
   *  - anything else: return null so the caller pushes the node and keeps
   *    parsing normally. */
  let rawCapture = null; // { node, depth } while a multi-line raw { } is open
  const openBlock = (meta, node, rest, open, line) => {
    if (meta.kind === 'raw') {
      if (stack.length > 1) {
        err(line, 'raw { } must be top-level - it drops verbatim CSS into the page stylesheet', 'move it out of the enclosing block');
        const close = matchBrace(rest, open + 1);
        return close === -1 ? '' : rest.slice(close + 1);
      }
      const close = matchBrace(rest, open + 1);
      if (close !== -1) {
        node.css = rest.slice(open + 1, close);
        return rest.slice(close + 1);
      }
      // multi-line: start the body empty (it used to start undefined, which
      // put a literal "undefined" in front of the CSS) and feed whatever
      // followed the "{" on this same line, so `raw { @font-face {` keeps
      // its first line.
      node.css = '';
      rawCapture = { node, depth: 1 };
      feedRawCapture(rest.slice(open + 1), line);
      return '';
    }
    if (meta.kind === 'bogus') {
      const close = matchBrace(rest, open + 1);
      if (close === -1) {
        err(line, `the "${(meta.sel || '').slice(0, 30) || 'block'}" block was never closed with "}"`, 'every "{" needs a matching "}"');
        return '';
      }
      return rest.slice(close + 1);
    }
    return null;
  };

  /** consume one source line while a multi-line raw { } is being captured */
  const feedRawCapture = (raw, line) => {
    let q = null;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (q) { if (c === q && raw[i - 1] !== '\\') q = null; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '{') rawCapture.depth++;
      else if (c === '}') {
        rawCapture.depth--;
        if (rawCapture.depth === 0) {
          rawCapture.node.css += raw.slice(0, i);
          const rest = raw.slice(i + 1);
          rawCapture = null;
          if (rest.trim()) processChunk(rest, line);
          return;
        }
      }
    }
    rawCapture.node.css += raw + '\n';
  };

  const processContent = (content, line) => {
    for (const piece of splitTop(content, ';')) {
      const part = piece.trim();
      if (!part) continue;
      const colon = scanFor(part, ':');
      if (colon === -1) {
        // `use behavior-name` - keyword declaration with a name argument
        const useMatch = part.match(/^use\s+([A-Za-z][\w-]*)$/);
        if (useMatch) {
          stack[stack.length - 1].children.push({ kind: 'decl', prop: 'use', value: useMatch[1], line });
          continue;
        }
        // valueless semantic property (e.g. `truncate`) - resolver decides if legal
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
      // v0.7.0 - numeric token keys. `tokens { space { 9: 96 } }` is legal:
      // the built-in spacing scale stops at 8, and real pages need 9, 10, 12…
      // Numbers are keys ONLY inside a tokens subtree - anywhere else a bare
      // numeric property is a typo, and the error now says exactly that
      // instead of the old "not a valid property name" shrug.
      if (/^[0-9]+(\.[0-9]+)?$/.test(prop)) {
        if (stack.some(n => n.kind === 'tokens')) {
          stack[stack.length - 1].children.push({ kind: 'decl', prop, value, line });
          continue;
        }
        err(line, `"${prop}" is not a valid property name`,
          'numeric names are token keys only inside tokens { } - e.g. tokens { space { 9: 96 } } - and then referenced as space.9; property names must start with a letter');
        continue;
      }
      // v0.4.0: dotted custom properties are legal - `--color.accent: …` is
      // scoped-token sugar (resolver maps it to the engine's token variable)
      if (!/^(-{1,2}[a-z][a-z0-9.-]*|[a-z][a-z0-9-]*)$/i.test(prop)) {
        err(line, `"${prop}" is not a valid property name`,
          'property names are lower-case words with dashes (my-prop), or dotted tokens (color.accent)');
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
    if (!trimmed) { if (rawCapture) rawCapture.node.css += raw + '\n'; return; } // blank lines never split a pending chunk
    if (rawCapture) { feedRawCapture(raw, line); return; }
    const candidate = buf ? buf + ' ' + trimmed : raw;
    if (buf && needsMore(candidate)) { buf = candidate; return; }
    if (buf) { processChunk(candidate, bufLine || line); buf = ''; return; }
    if (needsMore(candidate)) { buf = candidate; bufLine = line; return; }
    processChunk(candidate, line);
  });
  if (buf.trim()) processChunk(buf, bufLine);
  if (rawCapture) {
    err(lines.length, 'the raw { } block was never closed with "}"', 'every "{" needs a matching "}" - the CSS captured so far is discarded');
  }

  if (stack.length > 1) {
    err(lines.length, `${stack.length - 1} block(s) were never closed with "}"`, 'every "{" needs a matching "}"');
  }

  return { ast: root, errors };
}
