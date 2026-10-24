#!/usr/bin/env node
// Reproduces every compiler-level claim from the external agent review (0.7.2 cycle).
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';

let fails = 0;
function show(name, source, opts = {}) {
  const { ast } = parse(source, 'repro.dssl');
  const out = resolve(ast, 'repro.dssl', {});
  console.log('== ' + name);
  if (out.errors?.length) console.log('  ERRORS:', out.errors.map(e => e.message || e).join(' | '));
  if (out.warnings?.length) console.log('  WARNINGS:', out.warnings.map(e => e.message || e).join(' | '));
  for (const r of (out.rules || [])) {
    console.log('  rule:', r.selector, JSON.stringify(r.decls || r.sets || r).slice(0, 220));
  }
  return out;
}

// 1. THE BIG ONE: nested state must sort after base
show('nested hover vs base (cascade)', `
.card {
  background: #26201a
  hover { background: #c0392b }
}
`);

// 2. raw hex alpha
show('raw hex /50 alpha', `
.card { background: #ff0000/50 }
`);

// 3. transition-delay units
show('transition-delay 200', `
.card { transition-delay: 200 }
`);

// 4. grid gap shorthand
show('grid: 3 gap 12', `
.grid { grid: 3 gap 12 }
`);

// 5. shadow token def with bare ink
show('shadow { md: 0 2 4 ink/10 }', `
shadow { md: 0 2 4 ink/10 }
`);

// 6. seen block
show('seen { opacity: 0 -> 1 } block', `
.card { seen { opacity: 0 -> 1 } }
`);
show('seen as motion decl', `
.card { seen: opacity 0 -> 1 }
`);

// 7. hovr typo nested
show('nested hovr typo', `
.card { hovr { background: red } }
`);

// 8. missing properties
show('fill/stroke/text-wrap/content-visibility', `
.card { fill: red; stroke: blue; stroke-width: 2; text-wrap: balance; content-visibility: auto }
`);

// 9. ::part / ::slotted
show('::part selector', `
my-card::part(header) { background: red }
`);

// 10. shadow: sm / hover shadow lg quickstart pattern
show('README quickstart pattern', `
.card { shadow: sm; hover { shadow: lg } }
`);
