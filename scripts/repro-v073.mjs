/* repro-v073.mjs - reproduce every claim from the 2026-10-23 Claude review
 * of v0.7.2 before touching any code. Green = the bug exists as reported. */
import { parse, STATE_WORDS } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';

const compileDoc = (src, file = 'repro.dssl') => {
  const { ast, errors } = parse(src, file);
  const doc = resolve(ast, file);
  return { parseErrors: errors, doc };
};

let found = 0;
const repro = (name, cond) => {
  if (cond) { found++; console.log(`REPRODUCED  ${name}`); }
  else console.log(`not repro'd  ${name}`);
};

// --- bug 1: row: gap 8 between center loses "between" --------------------
{
  const { doc } = compileDoc('toolbar { row: gap 8 between center }');
  const decls = doc.rules[0]?.decls || [];
  const jc = decls.filter(d => d.prop === 'justify-content');
  const ai = decls.filter(d => d.prop === 'align-items');
  console.log('  decls:', decls.map(d => `${d.prop}:${d.value}`).join(' | '));
  repro('bug1: justify-content written twice (last wins = center)', jc.length === 2 && jc[1].value === 'center');
  repro('bug1: bare center also writes align-items (both axes)', ai.length === 1);
}

// --- bug 2: @font-face crashes the compiler -------------------------------
{
  let threw = null, out = '';
  try {
    const r = compileDoc('@font-face { font-family: X; src: url(x.woff2) }');
    out = JSON.stringify(r.doc.rules || []);
  } catch (e) { threw = e; }
  repro('bug2: @font-face THROWS instead of compile error', !!threw);
  if (threw) console.log('  throw:', threw.message);
}

// --- bug 3: @supports leaks inner rule unconditionally --------------------
{
  const { parseErrors, doc } = compileDoc('@supports (display:grid) { .a { display: grid } }');
  const leaked = (doc.rules || []).some(r => (r.sel || '').includes('a'));
  const atErr = parseErrors.some(e => /@supports/.test(e.message));
  console.log('  parse errors:', parseErrors.map(e => e.message).join(' ; ').slice(0, 120));
  repro('bug3: unknown at-rule errors reported', atErr);
  repro('bug3: inner rule STILL APPLIES unconditionally', leaked);
}

// --- bug 4: unquoted url() gives false errors ------------------------------
{
  const { parseErrors, doc } = compileDoc('.a { background: url(a.png) no-repeat }');
  const msgs = parseErrors.map(e => e.message).join(' ; ');
  const badValue = /unknown value "(a\.png|no-repeat)"/.test(msgs);
  const emitted = (doc.rules[0]?.decls || []).some(d => /url\(a\.png\)/.test(d.value));
  console.log('  errors:', msgs.slice(0, 140) || '(none)');
  repro('bug4: false unknown-value errors for unquoted url parts', badValue);
  repro('bug4: declaration still emitted (error + emit confusion)', emitted);
  // control: quoted form is fine
  const q = compileDoc('.a { background: url("a.png") no-repeat }');
  console.log('  quoted errors:', q.parseErrors.map(e => e.message).join(';').slice(0, 100) || '(none)');
}

// --- bug 5a: animation: spin 1s infinite -> did you mean "span" -----------
{
  const { parseErrors } = compileDoc('.a { animation: spin 1s infinite }');
  const silly = parseErrors.some(e => /span/.test(e.message));
  console.log('  errors:', parseErrors.map(e => `${e.message}${e.hint ? ' [' + e.hint + ']' : ''}`).join(' ; ').slice(0, 160));
  repro('bug5a: silly "span" suggestion instead of motion guidance', silly);
}

// --- bug 5b: !important errors AND still emits ----------------------------
{
  const { parseErrors, doc } = compileDoc('.a { color: red !important }');
  const wrongErr = parseErrors.some(e => /unknown value "important"/.test(e.message));
  const emitted = (doc.rules[0]?.decls || []).some(d => /important/.test(d.value));
  console.log('  errors:', parseErrors.map(e => e.message).join(';').slice(0, 120));
  console.log('  emitted value:', doc.rules[0]?.decls.map(d => d.value).join('|'));
  repro('bug5b: !important reported as unknown value "important"', wrongErr);
  repro('bug5b: !important still emitted in the value', emitted);
}

// --- bug 5c: transition CSS form gives no conversion hint ------------------
{
  const { parseErrors } = compileDoc('.a { transition: color .2s ease }');
  const hint = parseErrors.some(e => /200/.test(e.hint || '') && /transition/.test(e.hint || ''));
  console.log('  errors:', parseErrors.map(e => `${e.message}${e.hint ? ' [' + e.hint + ']' : ''}`).join(' ; ').slice(0, 200) || '(none)');
  repro('bug5c: CSS transition form rejected with no DSSL-form hint', parseErrors.length > 0 && !hint);
}

console.log(`\n${found} claim(s) reproduced`);
