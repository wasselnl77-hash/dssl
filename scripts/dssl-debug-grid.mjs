// Debug v2: seed registry with tokens.dssl, then inspect .feature-grid decls
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';
import { readFileSync } from 'node:fs';

const load = (f) => {
  const src = readFileSync(new URL('../public/styles/' + f, import.meta.url), 'utf8');
  const { ast, errors } = parse(src, f);
  return { ast, errors, src };
};

const tokens = load('tokens.dssl');
const tokDoc = resolve(tokens.ast, 'tokens.dssl', {});
const registry = { ...tokDoc.tokens };
console.log('tokens errors:', tokDoc.errors.length, '| registry size:', Object.keys(registry).length);

const home = load('home.dssl');
const doc = resolve(home.ast, 'home.dssl', registry);
console.log('home errors:', doc.errors.length);
for (const e of doc.errors) console.log('  ERR', e.file + ':' + e.line, e.message, e.hint || '');

const interesting = doc.rules.filter(r => /feature-grid|pain-grid|compare /.test(r.sel) || /^(\.compare)$/.test(r.sel));
const seen = new Set();
for (const r of interesting) {
  const key = r.sel + '|' + JSON.stringify(r.media);
  if (seen.has(key)) continue;
  seen.add(key);
  console.log('\nRULE', JSON.stringify(r.sel), 'media:', JSON.stringify(r.media), 'layer:', r.layer, 'order:', r.order);
  for (const d of r.decls) console.log('   ', d.prop, '=>', JSON.stringify(d.value));
}
