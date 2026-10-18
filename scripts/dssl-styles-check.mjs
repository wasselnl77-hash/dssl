// Compile the real site stylesheets through the DSSL compiler,
// sharing a token registry exactly like the runtime does (tokens.dssl first).
import { readFileSync, readdirSync } from 'fs';
import { parse } from '../public/dssl/parser.js';
import { resolve, DEFAULT_TOKENS } from '../public/dssl/resolver.js';

const dir = new URL('../public/styles/', import.meta.url).pathname;
const order = ['tokens.dssl', 'site.dssl', 'home.dssl', 'docs.dssl', 'playground.dssl', 'changelog.dssl'];
const files = readdirSync(dir).filter(f => f.endsWith('.dssl'));
const sorted = order.filter(f => files.includes(f)).concat(files.filter(f => !order.includes(f)));
const registry = new Map(Object.entries(DEFAULT_TOKENS));
let failed = false;

for (const f of sorted) {
  const src = readFileSync(dir + f, 'utf8');
  const { ast, errors: perrs } = parse(src, f);
  const doc = resolve(ast, f, Object.fromEntries(registry));
  for (const [k, v] of Object.entries(doc.tokens)) registry.set(k, v);
  const errs = [...perrs, ...doc.errors];
  console.log(`\n=== ${f}: ${doc.rules.length} rules, ${doc.shadowRules.length} shadow, ${errs.length} error(s)`);
  for (const e of errs) {
    failed = true;
    console.log(`   line ${e.line}: ${e.message}${e.hint ? `  (did you mean "${e.hint}"?)` : ''}`);
  }
}

console.log(failed ? '\nSTYLESHEET CHECK FAILED' : '\nSTYLESHEET CHECK OK');
process.exitCode = failed ? 1 : 0;
