#!/usr/bin/env node
// Compiles every ```dssl fenced block in GUIDE.md (strict: 0 errors allowed)
// and reports README.md blocks (the README may carry teaching examples that
// intentionally error; those are tagged with <!-- dssl:has-errors -->).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';

// paths are relative to the repo, so this works in any checkout
const repo = (f) => fileURLToPath(new URL('../' + f, import.meta.url));
const files = [
  { path: repo('GUIDE.md'), strict: true },
  { path: repo('README.md'), strict: false },
];

let pass = 0, fail = 0;
for (const { path, strict } of files) {
  let text;
  // a missing file used to be skipped quietly, which let the whole check
  // report "0 passed, 0 failed" and look green. A missing file is a failure.
  try { text = readFileSync(path, 'utf8'); } catch { console.error('FAIL cannot read ' + path); fail++; continue; }
  const blocks = [...text.matchAll(/```dssl\n([\s\S]*?)```/g)].map(m => m[1]);
  // whole-file workspace fold: seed with the engine's default tokens, collect
  // every token defined anywhere in the document, then compile each block
  // against the union. Guides are read non-linearly; examples may reference
  // tokens from any example on the page.
  let registry = { ...DEFAULT_TOKENS };
  for (const src of blocks) {
    const { ast, errors: pe } = parse(src, 'tokens-pass');
    const doc = resolve(ast, 'tokens-pass', registry);
    registry = { ...registry, ...doc.tokens };
  }
  blocks.forEach((src, i) => {
    const name = `${path.split('/').pop()} block ${i + 1}`;
    const { ast, errors: parseErrors } = parse(src, name);
    const doc = resolve(ast, name, registry);
    const errors = [...parseErrors, ...doc.errors];
    // raw { } needs real CSS, so a missing semicolon in a documented example is a docs bug
    if (strict) for (const w of doc.warnings || []) if (/needs a ";"/.test(w.message)) errors.push({ line: w.line, message: w.message });
    if (errors.length === 0) { pass++; return; }
    if (!strict && /dssl:has-errors/.test(src)) { pass++; return; }
    fail++;
    console.error(`FAIL ${name}:`);
    for (const e of errors.slice(0, 4)) console.error('   line ' + (e.line ?? '?') + ': ' + e.message);
  });
  console.log(`${path.split('/').pop()}: ${blocks.length} blocks checked`);
  if (blocks.length === 0) { console.error('FAIL no dssl blocks found in ' + path); fail++; }
}
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
