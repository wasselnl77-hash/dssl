#!/usr/bin/env node
/* build-wood.mjs: compile the wood showcase's static look into real CSS.
 * tokens.dssl + static.dssl -> wood.css, with every texture baked in.
 *   node scripts/build-wood.mjs            writes public/showcase/wood/wood.css
 *   node scripts/build-wood.mjs --check    fails if the committed wood.css is out of date */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compile, toCSS } from '../public/dssl/index.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'showcase', 'wood');
const source = ['tokens.dssl', 'static.dssl'].map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');
const r = compile(source, 'wood.dssl');
if (r.errors.length) { for (const e of r.errors) console.error(`wood.dssl:${e.line} ${e.message}${e.hint ? ' (' + e.hint + ')' : ''}`); process.exit(1); }
const built = toCSS(source, { file: 'tokens.dssl + static.dssl' });
if (process.argv.includes('--check')) {
  const have = readFileSync(path.join(dir, 'wood.css'), 'utf8');
  if (have !== built.css) { console.error('wood.css is out of date: run node scripts/build-wood.mjs'); process.exit(1); }
  console.log('wood.css is up to date'); process.exit(0);
}
writeFileSync(path.join(dir, 'wood.css'), built.css);
console.log(`wood.css: ${(built.css.length / 1024).toFixed(0)} KB, ${built.report.rules} rules, ${built.report.bakedTextures} textures baked, ${built.report.engineDecls} engine declarations left`);
for (const n of built.report.notBaked || []) console.log(`  not baked: ${n.sel} (${n.why})`);
for (const w of r.warnings) console.log(`  warning: line ${w.line} ${w.message}`);
