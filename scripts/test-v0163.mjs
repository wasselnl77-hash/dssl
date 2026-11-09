#!/usr/bin/env node
/* test-v0163.mjs: seven known divergences fixed (D-1 to D-5, D-7, D-8): unquoted url() with //, token prefix matching,
 * unknown @layer, undefined radius word, escaped quotes in values, selector lists when nesting, HTML element names
 * that look like state typos. Pure Node, no browser. */
import { compile } from '../public/dssl/index.js';

let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log(`  ok  ${name}`); } else { fail++; console.log(`FAIL  ${name}${extra !== undefined ? '; ' + extra : ''}`); } };
const section = (t) => console.log(`\n== ${t}`);
const run = (src) => compile(src, 't.dssl');
const sels = (src) => run(src).doc.rules.filter((r) => r.layer !== 'tokens').map((r) => r.sel);
const shadow = (src) => run(src).doc.shadowRules.map((r) => `${r.sel}::${r.pseudo}`);
const decl = (src, prop) => { for (const r of run(src).doc.rules) for (const d of r.decls) if (d.prop === prop) return d.value; return undefined; };
const J = JSON.stringify;

section('D-1. // inside an unquoted url()');
{
  const r = run('.a { background: url(http://x.com/a.png) }');
  ok('unquoted url with // compiles clean', r.errors.length === 0 && r.ok, J(r.errors));
  ok('and keeps the whole url', decl('.a { background: url(http://x.com/a.png) }', 'background') === 'url(http://x.com/a.png)');
  ok('a declaration after it on the next line survives', decl('.a { background: url(http://x.com/a.png)\n  color: red }', 'color') === 'red');
  ok('upper case URL( with spaces', run('.a { background: URL( http://x.com/a.png ) }').errors.length === 0);
  ok('inside raw { } the closing brace is kept', run('raw { .a { background: url(http://x.com/a.png) } }\n.b { color: red }').errors.length === 0);
  ok('quoted url still fine', run('.a { background: url("http://x.com/a.png") }').errors.length === 0 && decl('.a { background: url("http://x.com/a.png") }', 'background') === 'url("http://x.com/a.png")');
  ok('a real comment after the url still works', decl('.a { background: url(a.png) // note\n  color: red }', 'color') === 'red' && run('.a { background: url(a.png) // note\n  color: red }').errors.length === 0);
  ok('a // comment elsewhere still strips', run('.a { color: red } // trailing\n.b { color: blue }').errors.length === 0);
  const e = run('.a { background: url(http://x.com/a.png)\n  color: nonsense }').errors;
  ok('line numbers do not drift after the url', e.length === 1 && e[0].line === 2, J(e));
}

section('D-2. token lookup is exact');
{
  const src = 'tokens { color { ink2: #111 } }\n.a { color: color.ink2.bogus }';
  const r = run(src);
  ok('color.ink2.bogus is an unknown value', r.errors.length === 1 && /unknown value "color\.ink2\.bogus"/.test(r.errors[0].message), J(r.errors));
  ok('the error carries file, line, message, hint keys', r.errors[0] && ['file', 'line', 'message', 'hint'].every((k) => k in r.errors[0]));
  ok('color.ink2 itself still resolves', decl('tokens { color { ink2: #111 } }\n.a { color: color.ink2 }', 'color') === 'var(--dssl-color-ink2)');
  ok('alpha on an exact token still works', /color-mix/.test(decl('tokens { color { ink2: #111 } }\n.a { color: color.ink2/50 }', 'color')));
  ok('built-in tokens still resolve', run('.a { color: color.ink }').errors.length === 0);
}

section('D-3. unknown @layer warns');
{
  const r = run('@layer weird { .a { color: red } }');
  ok('warns, never errors', r.errors.length === 0 && r.ok && r.warnings.length === 1, J(r.warnings));
  ok('message and hint', r.warnings[0].message === 'unknown layer "weird", treated as "components"' && r.warnings[0].hint === 'the layers are tokens, base, components, utilities, pin', J(r.warnings));
  ok('warning has the usual shape', ['file', 'line', 'message', 'hint'].every((k) => k in r.warnings[0]) && r.warnings[0].line === 1);
  ok('still compiled as components', r.doc.rules.find((x) => x.sel === '.a').layer === 'components');
  const t = run('@layer compnents { .a { color: red } }');
  ok('a near miss gets a did-you-mean', t.warnings.length === 1 && t.warnings[0].hint === 'components', J(t.warnings));
  ok('known layers are silent', ['tokens', 'base', 'components', 'utilities', 'pin'].every((l) => run(`@layer ${l} { .a { color: red } }`).warnings.length === 0));
  ok('pin { } is silent', run('pin { .a { color: red } }').warnings.length === 0);
}

section('D-4. radius word with no token');
{
  const r = run('.a { radius: xl }');
  ok('radius: xl warns', r.errors.length === 0 && r.ok && r.warnings.some((w) => w.message === 'radius "xl" is not defined, so it will not apply' && w.hint === 'add it with  tokens { radius { xl: 32 } }'), J(r.warnings));
  ok('same declaration is still emitted', decl('.a { radius: xl }', 'border-radius') === 'var(--dssl-radius-xl)');
  ok('no default token was added', !('radius.xl' in run('.a { radius: xl }').doc.tokens));
  ok('defining it silences the warning', run('tokens { radius { xl: 32 } }\n.a { radius: xl }').warnings.length === 0);
  ok('sm, md, lg, full are silent', ['sm', 'md', 'lg', 'full'].every((w) => run(`.a { radius: ${w} }`).warnings.length === 0));
  ok('a number is silent', run('.a { radius: 8 }').warnings.length === 0);
  ok('a custom radius token is silent', run('tokens { radius { pill: 99 } }\n.a { radius: pill }').warnings.length === 0);
}

section('D-5. a backslash escapes a quote in a value');
{
  const r = run('.a { content: "a\\"b" }');
  ok('content: "a\\"b" has no error', r.errors.length === 0, J(r.errors));
  ok('and is passed through', decl('.a { content: "a\\"b" }', 'content') === '"a\\"b"');
  ok('single quotes too', run(".a { content: 'it\\'s' }").errors.length === 0);
  ok('inside a function', run('.a { content: attr(x) "q\\"r" }').errors.length === 0 && run('.a { background: image-set("a\\"b.png" 1x) }').errors.length === 0);
  ok('a plain string is unchanged', decl('.a { content: "ab" }', 'content') === '"ab"');
  ok('an unknown word after an escaped string is still an error', run('.a { content: "a\\"b" nonsense }').errors.length === 1);
}

section('D-7. nesting under selector lists');
{
  ok('.a, .b { .c { } }', J(sels('.a, .b { .c { color: red } }')) === J(['.a .c, .b .c']), J(sels('.a, .b { .c { color: red } }')));
  ok('.a, .b { hover { } }', J(sels('.a, .b { hover { color: red } }')) === J(['.a:hover, .b:hover']), J(sels('.a, .b { hover { color: red } }')));
  ok('.a { .c, .d { } }', J(sels('.a { .c, .d { color: red } }')) === J(['.a .c, .a .d']), J(sels('.a { .c, .d { color: red } }')));
  ok('.a, .b { .c, .d { } } is parent-major', J(sels('.a, .b { .c, .d { color: red } }')) === J(['.a .c, .a .d, .b .c, .b .d']), J(sels('.a, .b { .c, .d { color: red } }')));
  ok('.a, .b { &.on { } }', J(sels('.a, .b { &.on { color: red } }')) === J(['.a.on, .b.on']), J(sels('.a, .b { &.on { color: red } }')));
  ok('.a, .b { & > .c { } }', J(sels('.a, .b { & > .c { color: red } }')) === J(['.a > .c, .b > .c']));
  ok('.a { .x &, & + & { } } substitutes every &', J(sels('.a { .x &, & + & { color: red } }')) === J(['.x .a, .a + .a']), J(sels('.a { .x &, & + & { color: red } }')));
  ok('state inside a nested list child', J(sels('.a, .b { .c { hover { color: red } } }')) === J(['.a .c:hover, .b .c:hover']));
  ok('a comma inside :is( ) is NOT split (parent)', J(sels('.a:is(.x, .y) { .c { color: red } }')) === J(['.a:is(.x, .y) .c']));
  ok('a comma inside :is( ) is NOT split (child)', J(sels('.a { .c:is(.x, .y) { color: red } }')) === J(['.a .c:is(.x, .y)']));
  ok('a comma inside [ ] is NOT split', J(sels('.a { [data-x="1,2"] { color: red } }')) === J(['.a [data-x="1,2"]']));
  ok('a state on :is( ) parent', J(sels('.a:is(.x, .y) { hover { color: red } }')) === J(['.a:is(.x, .y):hover']));
  ok('plain .a { .b { } } is unchanged', J(sels('.a { .b { color: red } }')) === J(['.a .b']));
  ok('plain & is unchanged', J(sels('.a { &.on { color: red } }')) === J(['.a.on']));
  ok('plain state is unchanged', J(sels('.a { hover { color: red } }')) === J(['.a:hover']));
  ok('deep plain nesting is unchanged', J(sels('.a { .b { .c { color: red } } }')) === J(['.a .b .c']));
  ok('no errors for any of it', run('.a, .b { .c, .d { hover { color: red } } }').errors.length === 0);
  const sh = shadow('.a, .b { ::before { content: ""\n color: red } }');
  ok('.a, .b { ::before { } } gives one shadow rule per part', J(sh) === J(['.a::before', '.b::before']), J(sh));
  const sh2 = shadow('.a, .b { ::before { content: ""\n hover { color: red } } }');
  ok('and a state inside it follows each part', J(sh2) === J(['.a::before', '.a:hover::before', '.b::before', '.b:hover::before']), J(sh2));
  ok('plain .a { ::before { } } is unchanged', J(shadow('.a { ::before { content: "" } }')) === J(['.a::before']));
  ok('the shadow rules do not share declaration objects', (() => { const r = run('.a, .b { ::before { content: "" } }').doc.shadowRules; return r.length === 2 && r[0].decls !== r[1].decls && r[0].id !== r[1].id; })());
  ok('a top-level list of pseudo-elements is unchanged', J(shadow('.a::before, .b::before { content: "" }')) === J(['.a::before', '.b::before']));
}

section('D-8. HTML element names are not state typos');
{
  const w = (src) => run(src).warnings.filter((x) => /compiled as a descendant selector/.test(x.message));
  ok('li under a rule does not warn', w('.menu { li { color: red } }').length === 0);
  const names = 'a abbr address article aside audio b blockquote body br button canvas caption code col details dialog div em fieldset figure footer form h1 h2 h3 h4 h5 h6 header hr html i iframe img input label legend li main mark menu nav ol optgroup option p pre section select small span strong sub summary sup table tbody td textarea tfoot th thead time tr u ul video'.split(' ');
  const noisy = names.filter((n) => w(`.x { ${n} { color: red } }`).length);
  ok(`none of ${names.length} element names warn`, noisy.length === 0, noisy.join(','));
  ok('and they still compile as descendants', J(sels('.menu { li { color: red } }')) === J(['.menu li']));
  ok('hove still warns', w('.a { hove { color: red } }').length === 1 && /"hover"/.test(w('.a { hove { color: red } }')[0].hint));
  ok('focs still warns', w('.a { focs { color: red } }').length === 1 && /"focus"/.test(w('.a { focs { color: red } }')[0].hint));
  ok('warnings never become errors', run('.a { hove { color: red } }').errors.length === 0 && run('.a { hove { color: red } }').ok);
  ok('a custom word far from any state is silent', w('.a { widget { color: red } }').length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
