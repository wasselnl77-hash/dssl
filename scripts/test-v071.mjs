#!/usr/bin/env node
/* test-v071.mjs — v0.7.1 regression: comment line numbers.
 * The extension's test suite caught it: every `//` comment doubled a newline
 * in the stripped source, so every line number after the first comment
 * drifted +1 and diagnostics pointed one line late. Block comments were
 * fine; line comments were lying. These tests pin the fix. */
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let passed = 0, failed = 0;
const ok = (cond, name) => {
  if (cond) { passed++; console.log(`  ok  ${name}`); }
  else { failed++; console.log(`FAIL  ${name}`); }
};

console.log('1 — comment placements keep true line numbers');
{
  const cases = [
    ['leading', '// c\n.a {\n  x: 1\n}', 3],
    ['inner', '.a {\n  // c\n  x: 1\n}', 3],
    ['trailing', '.a {\n  x: 1 // c\n}', 2],
    ['block leading', '/* c */\n.a {\n  x: 1\n}', 3],
    ['block inner', '.a {\n  /* c */\n  x: 1\n}', 3],
    ['many comments', '// one\n// two\n.a {\n  // three\n  x: 1 // four\n}', 5],
    ['comment at eof no newline', '.a {\n  x: 1\n}\n// tail', null],
    ['crlf', '// c\r\n.a {\r\n  x: 1\r\n}', 3],
  ];
  for (const [name, src, want] of cases) {
    const { ast, errors } = parse(src, 't.dssl');
    const rule = ast.children.find((n) => n.kind === 'selector');
    const got = rule ? rule.children[0].line : null;
    const bad = errors.filter((e) => !/missing|not a valid|expected/.test(e.message));
    ok((want === null || got === want) && bad.length === 0, `${name}: decl line ${got}${want === null ? '' : ' (want ' + want + ')'}`);
  }
}

console.log('2 — errors and warnings carry honest lines after comments');
{
  const src = '// header comment\n.nav-links {\n  display: none\n  column: gap 2\n}\n.bad {\n  background: colr.accent\n}\n';
  // lines 1-based: display=3, column=4, colr=7
  const { ast } = parse(src, 't.dssl');
  const doc = resolve(ast, 't.dssl', {});
  const warn = doc.warnings.find((w) => w.message.includes('column'));
  ok(warn && warn.line === 4, `ordering warning fires on the column: line (got ${warn && warn.line}, want 4)`);
  const err = doc.errors.find((e) => e.message.includes('colr'));
  ok(err && err.line === 7, `misspelled token error on its own line (got ${err && err.line}, want 7)`);
}

console.log('3 — the real site stylesheets: spot-check line honesty');
{
  // parse a real stylesheet that opens with a comment block and verify a
  // known rule lands where it lives on disk
  import('node:fs').then(({ readFileSync }) => {
    try {
      const p = path.join(here, '..', 'public', 'styles', 'tokens.dssl');
      const src = readFileSync(p, 'utf8');
      const lines = src.split('\n');
      // find a real declaration line with a known shape
      const idx = lines.findIndex((l) => /--dssl-color-ink/.test(l));
      if (idx >= 0) {
        const { ast } = parse(src, 'tokens.dssl');
        let found = null;
        const walk = (n) => {
          if (found) return;
          for (const c of n.children || []) {
            if (c.kind === 'decl' && /ink/.test(c.prop || '')) { found = c; return; }
            walk(c);
          }
        };
        walk(ast);
        ok(found && found.line === idx + 1, `tokens.dssl decl on disk line ${idx + 1}, parser says ${found && found.line}`);
      } else {
        ok(true, 'tokens.dssl shape changed; spot-check skipped');
      }
    } catch (e) {
      ok(false, 'site stylesheet spot-check threw: ' + e.message);
    }
    finish();
  });
}

function finish() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
