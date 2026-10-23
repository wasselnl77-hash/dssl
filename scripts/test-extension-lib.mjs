/* test-extension-lib.mjs — functional smoke for the editor extension lib.
 * Confirms the bundled engine copy (lib/engine) + analysis.js still agree:
 * diagnostics, did-you-mean, completions, and the v0.7.2 cascade fix all
 * behave through the exact code the .vsix ships. Run before packaging. */
import { resolve } from '../dssl-vscode/lib/engine/resolver.js';
import { parse, STATE_WORDS } from '../dssl-vscode/lib/engine/parser.js';
import { analyzeWorkspace, diagnosticsFor } from '../dssl-vscode/lib/analysis.js';

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}`); } };
const compileDoc = (src, file) => resolve(parse(src, file).ast, file);

// 1. the fixed quickstart pattern: nested hover must override base bg
const quickstart = 'card {\n  background: #fff\n  hover { background: #f5f0e8 }\n}\n';
const doc = compileDoc(quickstart, 'test.dssl');
const base = doc.rules.find(r => r.sel === 'card');
const hov = doc.rules.find(r => r.sel === 'card:hover');
ok('nested hover rule exists', !!hov);
ok('hover overrides base bg', hov && hov.decls.some(d => d.prop === 'background' && d.value === '#f5f0e8'));
ok('hover sorts AFTER base (same layer)', base && hov && base.layer === hov.layer && hov.order > base.order);
ok('no invalid hex-alpha in output', JSON.stringify(doc).includes('#f5f0e8') && !JSON.stringify(doc).includes('/14px'));

// 2. diagnostics: typo caught with did-you-mean, no false positive on valid code
const ws = analyzeWorkspace(new Map([['test.dssl', 'card {\n  bakground: red\n}\n']]));
const typoDiags = diagnosticsFor(ws, 'test.dssl');
ok('typo surfaces a diagnostic', typoDiags.some(d => /bakground|unknown property/i.test(d.message)));
ok('did-you-mean suggests background', typoDiags.some(d => /background/i.test(d.message)));
const cleanWs = analyzeWorkspace(new Map([['test.dssl', quickstart]]));
const cleanDiags = diagnosticsFor(cleanWs, 'test.dssl');
ok('valid quickstart produces zero errors', !cleanDiags.some(d => d.severity === 'error'));

// 3. raw hex alpha now legal (was the /50px bug)
const hexDoc = compileDoc('card { color: #ff0000/50 }', 'a.dssl');
ok('hex /50 compiles to color-mix, not /50px', hexDoc.rules[0].decls[0].value.includes('color-mix'));

// 4. STATE_WORDS export exists (used for the did-you-mean warning)
ok('STATE_WORDS exported by bundled parser', STATE_WORDS instanceof Set && STATE_WORDS.has('hover'));

// 5. TIME_PROPS fix reachable through the bundle: bare delay becomes ms
const tDoc = compileDoc('card { transition-delay: 200 }', 't.dssl');
ok('bare transition-delay becomes 200ms', /200\s*ms|200ms/.test(JSON.stringify(tDoc.rules[0].decls)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
