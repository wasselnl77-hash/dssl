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

// v0.3.4: the one-word centering primitive
.icon-chip {
  size: 40
  center: both
}
.chip-x { center: x }
.chip-y { center: y }

// ------------------- v0.4.0 — power tools -------------------

// stagger: choreograph the children's animations
.feature-grid-v4 {
  stagger: 60
}

// seen: engine-native scroll-into-view state (block form)
.reveal-card {
  seen {
    animate: rise-in 480 snap
  }
}

// seen: compound-selector form
.reveal-alt:seen { opacity: 1 }

// scoped tokens: dotted --names re-declare a token for the subtree
.scope-demo {
  --color.accent: color.ok
  --brand: 12
}

// visually-hidden: the a11y classic, one word
.sr-demo {
  visually-hidden
}

// transition: per-property specs
.transition-multi {
  transition: 150 snap background-color, 300 transform
}

// structural / relational selectors pass through to the engine's matches()
nth-demo:nth-child(2) { translate: 0 -2 }
nth-demo:first-child + nth-demo { border-top: none }
has-demo:has(.badge) { padding: space.5 }

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
// v0.3.4: center: primitive — alignment pair, engine promotes the context
const chip = doc.rules.find(r => r.sel === '.icon-chip');
assert(chip && chip.decls.some(d => d.prop === 'place-items' && d.value === 'center center'), `center: expands to place-items center center`);
assert(chip && chip.decls.some(d => d.prop === 'place-content' && d.value === 'center center'), `center: expands to place-content center center`);
const chipX = doc.rules.find(r => r.sel === '.chip-x');
assert(chipX && chipX.decls.some(d => d.prop === 'justify-items' && d.value === 'center') && chipX.decls.some(d => d.prop === 'justify-content' && d.value === 'center'), 'center: x axis emits justify pair');
const chipY = doc.rules.find(r => r.sel === '.chip-y');
assert(chipY && chipY.decls.some(d => d.prop === 'align-items' && d.value === 'center') && chipY.decls.some(d => d.prop === 'align-content' && d.value === 'center'), 'center: y axis emits align pair');
assert(!doc.errors.some(e => e.message.includes('center')), 'no false center errors');
// ------------------- v0.4.0 asserts -------------------
const stag = doc.rules.find(r => r.sel === '.feature-grid-v4');
assert(stag && stag.decls.some(d => d.prop === '@stagger' && d.value === 60), `stagger: 60 → @stagger 60 (got: ${JSON.stringify(stag?.decls)})`);
const reveal = doc.rules.find(r => r.sel === '.reveal-card:seen');
assert(reveal, 'seen state block compiles to .reveal-card:seen');
assert(reveal && reveal.states.has('seen'), 'seen registered in rule.states');
assert(reveal && reveal.decls.some(d => d.prop === '@animate' && d.value.motion === 'rise-in'), 'seen block carries the animate spec');
assert(doc.rules.some(r => r.sel === '.reveal-alt:seen'), 'compound .reveal-alt:seen passes through');
const scope = doc.rules.find(r => r.sel === '.scope-demo');
assert(scope && scope.decls.some(d => d.prop === '--dssl-color-accent' && d.value === 'var(--dssl-color-ok)'), `scoped token --color.accent → --dssl-color-accent (got: ${scope?.decls.map(d => d.prop + '=' + d.value).join('; ')})`);
assert(scope && scope.decls.some(d => d.prop === '--brand' && d.value === '12px'), 'plain --brand stays a free-form custom property');
const sr = doc.rules.find(r => r.sel === '.sr-demo');
assert(sr && sr.decls.some(d => d.prop === 'clip-path' && d.value === 'inset(50%)') && sr.decls.some(d => d.prop === 'position' && d.value === 'absolute'), 'visually-hidden expands to the clip pattern');
const tm = doc.rules.find(r => r.sel === '.transition-multi');
assert(tm && tm.decls.some(d => d.prop === 'transition' && d.value === 'background-color 150ms cubic-bezier(0.2, 0.9, 0.3, 1), transform 300ms ease'), `per-property transition (got: ${tm?.decls.find(d => d.prop === 'transition')?.value})`);
assert(doc.rules.some(r => r.sel === 'nth-demo:nth-child(2)'), ':nth-child() selector passes through');
assert(doc.rules.some(r => r.sel === 'nth-demo:first-child + nth-demo'), 'sibling combinator passes through');
assert(doc.rules.some(r => r.sel === 'has-demo:has(.badge)'), ':has() selector passes through');
assert(!doc.errors.some(e => /stagger|seen|visually-hidden|nth|has\(/.test(e.message)), 'no false errors on v0.4.0 features');
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
