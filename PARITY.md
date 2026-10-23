# PARITY.md — DSSL vs CSS, honestly

The point of this table is to stop two bad arguments: "DSSL is missing everything" and
"DSSL replaces all of CSS". Both are false. Here is the ledger. Status: shipped / partial
/ planned / by-design-no.

| CSS feature | In DSSL | Status | Notes |
|---|---|---|---|
| Type / class / id / attribute selectors | native (rides browser matching) | shipped | |
| Combinators (`>`, `+`, `~`, descendant) | native | shipped | |
| Nesting | native, `&` substitution | shipped | predates CSS nesting; no build step needed |
| `:nth-child()`, `:nth-of-type()`, `:not()`, `:is()`, `:where()`, `:has()` | native | shipped | the browser does the matching; v0.7 docs say so loudly |
| Pseudo-classes (`:hover`, `:focus`...) | engine-native states as nested blocks | shipped | real events, enter + leave, descendants re-evaluated; `seen` (first viewport entry) has no CSS equivalent |
| Pseudo-elements | one compiled shadow stylesheet | shipped | the ONE place DSSL emits real CSS; inline styles cannot reach them |
| `@media` queries | `@media (max-width: 860)`, sugar: `dark`, `light`, `reduced-motion`, bare widths, `<=` ranges | shipped | |
| `@container` queries | `@container (min-width: 480)` | shipped | nearest ancestor (or self) with container-type |
| `@layer` cascade layers | `@layer base\|components\|utilities` + `pin {}` | shipped | cascade is (layer, source order); no specificity, no !important |
| `@supports` | not implemented | planned | low priority: the engine feature-detects itself |
| `@font-face` | not implemented | planned | `font.*` tokens can name any loaded family today |
| `@keyframes` | `motion name { from {} to {} }` via WAAPI | shipped | `animate: name 600 ease-out infinite alternate` |
| View transitions | not implemented | planned | |
| Scroll-driven animations | not implemented | planned | pairs naturally with `seen` + `stagger` |
| Custom properties (`--*`) | pass through unvalidated, plus dotted token re-declaration per subtree | shipped | `--color.accent: color.err` re-themes a subtree via inheritance |
| Design tokens | first-class: `tokens { }`, numeric keys, alpha suffix `/85`, scoped per file and subtree | shipped | no CSS-native equivalent at this ergonomics level |
| Flexbox / Grid | raw properties pass through + `row:` `column:` `grid:` `stack:` sugar | shipped | shorthands write `display`; the compiler warns when that clobbers an explicit `display:` |
| `place-items` / alignment | `center: both` | shipped | the engine promotes a formatting context when missing, so alignment cannot silently no-op |
| Transitions | per-property: `transition: 200 snap transform` | shipped | honors `reduced-motion` |
| print styles (`@media print`) | not implemented | planned | |
| `!important` | by design no | by-design-no | `pin { }` is the must-win block; specificity wars are the thing DSSL deletes |
| Cascade | (layer, source order) | shipped | later wins; identical selectors resolve by order, deterministically |
| Static extraction / view-source styling | `dssl build` emits real CSS (v0.8.0); prerender snapshot for live pages planned | partially shipped | freeze() already makes big static pages zero-cost after first paint |
| DevTools story | `DSSL.explain(el)` returns the cascade as data | shipped | matched rules with file/line, winning declaration per property, pseudo rules; browser-extension panel planned |
| Work without JavaScript | `dssl build` emits the static subset as real CSS (v0.8.0); `@signal`/`animate:` stay runtime-only and counted | shipped for the static subset; prerender snapshot still planned for live pages | the honest trade has an exit now |

## The exit story

Abandoning DSSL leaves you: a DOM of valid inline styles, one small `<style>` element
(pseudo-element rules), and token values sitting in `--dssl-*` custom properties. The page
keeps working with the engine removed. No other styling replacement can say that, because
no other replacement styles with the platform's own primitives.

And since v0.8.0 there is a second exit: `dssl build styles.dssl -o styles.css`
compiles the static subset to a real stylesheet before you ever ship — no runtime,
no inline styles, CSP-clean, works without JavaScript. Tokens become custom properties,
states become pseudo-classes, layers become `@layer`, motions become `@keyframes`,
`pin` becomes `!important`, `raw { }` passes through verbatim, `seen` applies its final
state. `@signal` rules and `animate:` stay runtime-only and are counted in the report,
so the boundary is explicit, not folklore.

## What DSSL adds that CSS does not have

- live tokens and signals: change one value or fire one bridge call, the whole DOM re-resolves
- `seen` reveal-on-scroll and `stagger` choreography with zero JavaScript
- the deform family composing into the transform channel
- gradients as sentences with compile-time stop validation
- the overlap policy: translucent boxes refuse to cover things unless you say so
- loud errors with did-you-mean, and a warnings channel for cascade-order footguns
- `freeze()` / `unfreeze()`: a live engine that can be parked at zero cost

## v0.8.0 review-driven corrections

The second external review (repro snippets, headless browser) found five bugs and
asked for the static build first. All fixed or shipped:

- `row: gap 8 between center` — the guide's own example — kept its `between`
  (every place word used to write both axes; the later word overwrote
  `justify-content` silently). Place words now own an axis: between/around/evenly
  are main-axis, stretch/baseline cross-axis, center/start/end fill free axes;
  conflicts and duplicates warn loudly.
- `@font-face { ... }` crashed the compiler with an uncaught throw. Unknown
  at-rules now skip their entire balanced block with one clean error.
- `@supports (...) { .a { ... } }` used to error AND still apply `.a`
  unconditionally. The whole block is skipped now; nothing leaks.
- Unquoted `url(a.png)` false-errored ("unknown value a.png"); `url()` is
  atomic now, and the missing background words (`no-repeat`, `repeat-x/y`,
  `space`, `round`, `scroll`, `local`) joined the vocabulary.
- `color: red !important` used to error AND emit `red !important` (which the
  browser then silently dropped). `!important` is now one loud error, nothing
  is emitted, and the hint names `pin { }` as the actual answer.
- `animation: spin ...` suggested "did you mean span"; it now passes motion
  names through, warns when the motion is undefined, and bare durations are ms.
- `transition: color .2s ease` (CSS order) is an error whose hint shows the
  exact DSSL conversion (`transition: 200 ease color`).

And the wishlist items that shipped: `raw { }` / `@css { }` verbatim passthrough,
`dssl build` + `dssl check` (the CLI, with `--json` and CI exit codes),
`DSSL.toCSS()`, headless-Chromium computed-style tests for every guide example
(`scripts/test-guide-browser.mjs`), and `font-size: fluid 16 24` clamp sugar.

## v0.7.2 review-driven corrections

An external agent review reproduced a batch of real bugs; all of them are fixed
and regression-tested (scripts/test-v072.mjs). Rows affected:

- Nested state blocks (hover/focus/... inside a rule) now sort AFTER the parent
  rule's own declarations, so nested overrides win the cascade. Nested @media,
  @signal and @layer blocks also keep their condition and layer (they used to
  be dropped, making nested dark mode silently dead).
- Declarations and a nested block can share one line (`.card { bg: red; hover { } }`)
  without the declaration being swallowed.
- Raw hex alpha is real: `#ff0000/50` compiles to color-mix (was invalid /50px).
- Time properties take bare numbers as ms (`transition-delay: 200` -> 200ms).
- `grid: 3 gap 12` works; `rows N` joined the shorthand.
- `seen { ... }` rejects motion-arrow syntax loudly and points at the real forms.
- SVG and modern properties added: fill, stroke (and friends), text-wrap,
  content-visibility.
- `::part()` rides the shadow pipeline; `::slotted()` is rejected with an
  explanation (it only exists inside shadow trees).
- The gate prefilter now actually runs before native matches().
- State events scope candidate recomputation to the hovered subtree and its
  ancestors instead of the whole page (a 1k-card hover went from ~4,100
  recomputes per event to the touched chain).
- checkbox/details states hear `change` and `toggle` events, so keyboard
  toggles and programmatic dispatch restyle immediately.
