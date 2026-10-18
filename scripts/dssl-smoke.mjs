// Smoke test for the DSSL compiler (parser + resolver, no DOM)
import { parse } from '../public/dssl/parser.js';
import { resolve } from '../public/dssl/resolver.js';

const sample = `
// tokens + defaults override
tokens {
  color {
    ink: #16161d
    paper: #faf7f2
    accent: oklch(62% 0.19 35)
  }
  radius {
    sm: 8
    md: 14
  }
}

behavior focus-ring {
  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
  }
}

motion rise-in {
  from {
    opacity: 0
    translate: 0 12
  }
}

.card {
  background: color.card
  padding: space.4
  radius: md
  shadow: md
  transition: 150 snap
  font: 16/1.5 color.ink
  use focus-ring
  animate: rise-in 400 snap both

  .title {
    font-weight: 700
    color: color.ink/80
  }

  hover {
    translate: 0 -2px
    shadow: lg

    .tip { opacity: 1 }
  }

  ::before {
    content: ""
    background: color.accent
  }
}

gallery {
  grid: auto-fill 220
  gap: space.4
}

// v0.3.2 regression: repeat() counts used to get px'd → repeat(4px, 1fr)
.feature-grid {
  display: grid
  grid-template-columns: repeat(4, 1fr)
  gap: 24
}

.span-2 { grid-column: span 2 }
.auto-grid { grid-template-columns: repeat(auto-fill, minmax(200, 1fr)) }

@media (width >= 768) {
  .card { padding: space.6 }
}

// v0.3 one-word / bare-width sugar
@media dark { .card { color: color.ink } }
@media light { .card { color: color.ink } }
@media reduced-motion { .card { transition: none } }
@media 768 { .card { padding: space.6 } }
@media <= 480 { .card { padding: space.2 } }
@media 480..960 { gallery { grid: 2 } }

@signal theme == dark {
  tokens { color { paper: #14121a } }
  .card { background: color.card }
}

@layer utilities {
  .mt-0 { margin-top: 0 }
}

pin { .hero-title { color: red } }

// deliberate errors below (should produce did-you-mean hints):
.badge {
  colour: red
  background: color.acnt
  flex-direction: banana
}
`;

const { ast, errors: parseErrors } = parse(sample, 'smoke.dssl');
console.log('parse errors:', parseErrors.length);
for (const e of parseErrors) console.log(`  PARSE line ${e.line}: ${e.message}${e.hint ? `  (${e.hint})` : ''}`);
const doc = resolve(ast, 'smoke.dssl');

console.log('--- resolve errors:', doc.errors.length);
for (const e of doc.errors) console.log(`  line ${e.line}: ${e.message}${e.hint ? `  (did you mean "${e.hint}"?)` : ''}`);

console.log('--- rules:', doc.rules.length, ' shadowRules:', doc.shadowRules.length);
for (const r of doc.rules) {
  const conds = [
    r.media.length ? `@media[${r.media.join(' ')}]` : '',
    r.signals.length ? `@signal[${r.signals.map(s => s.name + s.op + s.value).join(' ')}]` : '',
  ].filter(Boolean).join(' ');
  console.log(`  #${r.id} L${r.layer} ord${r.order} ${conds} ${r.sel}  ->  ${r.decls.map(d => d.prop).join(', ')}`);
}
console.log('--- shadow rules:');
for (const s of doc.shadowRules) console.log(`  ${s.sel}::${s.pseudo} -> ${s.decls.map(d => d.prop + ':' + d.value).join('; ')}`);
console.log('--- media queries:', doc.mediaQueries.join(' | '));
console.log('--- sample token values:');
for (const k of ['color.ink', 'space.4', 'radius.sm', 'font.sans']) console.log('  ', k, '=', doc.tokens[k]);

// sanity asserts
const assert = (cond, msg) => { if (!cond) { console.error('ASSERT FAIL:', msg); process.exitCode = 1; } };
assert(parseErrors.length === 0, 'no parse errors');
assert(doc.errors.length >= 3, 'expected at least 3 resolver errors (typos)');
assert(doc.errors.some(e => e.hint === 'color'), 'did-you-mean for color.acnt -> color');
assert(doc.errors.some(e => e.message.includes('banana')), 'unknown value error for flex-direction: banana');
const cardRule = doc.rules.find(r => r.sel === '.card');
assert(cardRule, '.card rule exists');
assert(cardRule.decls.some(d => d.prop === 'background' && d.value.includes('var(--dssl-color-card)')), 'background resolved to var');
assert(cardRule.decls.some(d => d.prop === 'padding' && d.value.includes('var(--dssl-space-4)')), 'space.4 resolved to var ref');
assert(cardRule.decls.some(d => d.prop === '@animate' && d.value.frames && d.value.frames.length === 1), 'animate wired with frames');
assert(doc.rules.some(r => r.sel === '.card:focus-visible'), 'behavior expanded into state selector');
assert(doc.rules.some(r => r.sel === '.card:hover .tip'), 'nested state descendant composed');
assert(doc.rules.some(r => r.sel === ':root' && r.signals.length === 1), 'signal token override rule');
assert(doc.rules.some(r => r.layer === 'utilities' && r.sel === '.mt-0'), 'layer assignment');
assert(doc.rules.some(r => r.layer === 'pin' && r.sel === '.hero-title'), 'pin layer');
assert(doc.rules.some(r => r.sel === 'gallery' && r.decls.some(d => String(d.value).includes('minmax(220px'))), 'grid sugar');
// v0.3.2: repeat() regression — the count must stay an integer, tracks may px
const fg = doc.rules.find(r => r.sel === '.feature-grid');
assert(fg && fg.decls.some(d => d.prop === 'grid-template-columns' && d.value === 'repeat(4, 1fr)'), `repeat(4, 1fr) stays integer (got: ${fg?.decls.find(d => d.prop === 'grid-template-columns')?.value})`);
assert(fg && fg.decls.some(d => d.prop === 'gap' && d.value === 'var(--dssl-space-4)') === false, 'gap: 24 resolved (not token)');
assert(fg && fg.decls.some(d => d.prop === 'gap' && d.value === '24px'), 'bare gap gets px');
const span2 = doc.rules.find(r => r.sel === '.span-2');
assert(span2 && span2.decls.some(d => d.value === 'span 2'), `grid-column: span 2 unitless (got: ${span2?.decls[0]?.value})`);
const autoGrid = doc.rules.find(r => r.sel === '.auto-grid');
assert(autoGrid && autoGrid.decls.some(d => d.value === 'repeat(auto-fill, minmax(200px, 1fr))'), `repeat(auto-fill, minmax) works (got: ${autoGrid?.decls[0]?.value})`);
assert(doc.rules.some(r => r.sel === '.card' && r.media.length === 1), 'media rule for .card');
assert(doc.rules.some(r => r.media.includes('(prefers-color-scheme: dark)')), '@media dark sugar');
assert(doc.rules.some(r => r.media.includes('(prefers-color-scheme: light)')), '@media light sugar');
assert(doc.rules.some(r => r.media.includes('(prefers-reduced-motion: reduce)')), '@media reduced-motion sugar');
assert(doc.rules.some(r => r.media.includes('(min-width: 768px)')), '@media 768 sugar');
assert(doc.rules.some(r => r.media.includes('(max-width: 480px)')), '@media <= 480 sugar');
assert(doc.rules.some(r => r.media.includes('(min-width: 480px) and (max-width: 960px)')), '@media 480..960 range sugar');
const shadow = doc.shadowRules.find(s => s.pseudo === 'before');
assert(shadow && shadow.decls.some(d => d.prop === 'content' && d.value === '""'), 'content autoclosed');
console.log(process.exitCode ? 'SMOKE TEST FAILED' : 'SMOKE TEST OK');
