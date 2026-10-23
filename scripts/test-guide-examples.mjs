#!/usr/bin/env node
// Compiles every ```dssl fenced block in GUIDE.md (strict: 0 errors allowed)
// and reports README.md blocks (the README may carry teaching examples that
// intentionally error; those are tagged with <!-- dssl:has-errors -->).
import { readFileSync } from 'node:fs';
import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';

const files = [
  { path: '/home/z/my-project/GUIDE.md', strict: true },
  { path: '/home/z/hf-mirror/README.md', strict: false },
];

let pass = 0, fail = 0;
for (const { path, strict } of files) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { console.log('(skip missing ' + path + ')'); continue; }
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
    if (errors.length === 0) { pass++; return; }
    if (!strict && /dssl:has-errors/.test(src)) { pass++; return; }
    fail++;
    console.error(`FAIL ${name}:`);
    for (const e of errors.slice(0, 4)) console.error('   line ' + (e.line ?? '?') + ': ' + e.message);
  });
  console.log(`${path.split('/').pop()}: ${blocks.length} blocks checked`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
