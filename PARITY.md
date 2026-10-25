# PARITY.md: DSSL vs CSS, honestly

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
| `@supports` | `raw { }` passes it through verbatim | partial | no sugar; the engine feature-detects itself, and `dssl import` moves it into `raw { }` |
| `@font-face` | `raw { }` passes it through verbatim (semicolons required inside) | partial | `font.*` tokens can name any loaded family; a missing `;` in `raw` is a warning with a line number |
| `@keyframes` | `motion name { from {} to {} }` via WAAPI | shipped | `animate: name 600 ease-out infinite alternate` |
| View transitions | not implemented | planned | |
| Scroll-driven animations | not implemented | planned | pairs naturally with `seen` + `stagger` |
| Custom properties (`--*`) | pass through unvalidated, plus dotted token re-declaration per subtree | shipped | `--color.accent: color.err` re-themes a subtree via inheritance |
| Design tokens | first-class: `tokens { }`, numeric keys, alpha suffix `/85`, scoped per file and subtree | shipped | no CSS-native equivalent at this ergonomics level |
| Flexbox / Grid | raw properties pass through + `row:` `column:` `grid:` `stack:` sugar | shipped | shorthands write `display`; the compiler warns when that clobbers an explicit `display:` |
| `place-items` / alignment | `center: both` | shipped | the engine promotes a formatting context when missing, so alignment cannot silently no-op |
| Transitions | per-property: `transition: 200 snap transform` | shipped | honors `reduced-motion` |
| Background patterns and noise | `texture:` (40 presets including ten wood species, 11 generators, your own) | shipped | there is no CSS shorthand for "grain on top of my background"; this one keeps the author's background and removes cleanly. Runtime-only |
| Glow, particles, fire | `aura-glow`, `aura-particle`, `glow-particle`, `aura-glow-particle`, `aura:` | shipped | CSS has `box-shadow` and `filter: drop-shadow`, and nothing for particles. No presets by design. Runtime-only |
| Styling `<input type="range">` | `slider:` writes the `::-webkit-slider-*` and `::-moz-range-*` rules together | shipped | Chrome tested; the Firefox rules are generated but not run yet. Histogram sliders via `graph` |
| Accessibility hints in the compiler | contrast, removed focus outline, small targets (warnings) | shipped | CSS says nothing; these never fail a build unless you pass `--strict` |
| Moving existing CSS over | `dssl import styles.css` | shipped | converts the mechanical differences and reports the rest; the output always compiles |
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
compiles the static subset to a real stylesheet before you ever ship, no runtime,
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

## v0.15.0: the second game review

| Review item | Status |
|---|---|
| Aura redraws 1.5 times a second under reduced motion | done: follows what moves, rests when nothing does |
| Aura emitters linger when hidden | done: invisible emitters (opacity 0, display none, visibility hidden, on it or an ancestor) stop |
| One canvas on `<body>`, never behind a hill | done as `z N` per layer; interleaves with the root stacking context only |
| Silent file-order losses | done: `dssl check`, console and `DSSL.lint` name rules a later rule always beats |
| Styling is asynchronous | done: `DSSL.flush()`, `await DSSL.settled()`, `DSSL.computed()` |
| Signals typed | done |
| `DSSL.lint` noisy | done: invisible text skipped, outline and tight shadow count |
| `DSSL.signal` costs 50 ms | done: only the elements its rules select are restyled |
| Several `animate:` per element | done |
| Scoped signals | done (`DSSL.signal(name, value, el)`) |
| `outline-shape` | done (square corners, uses `filter`) |
| `DSSL.play` on pseudo-elements | done |
| CLI `--engine` | done |
| Test helpers (final value, pause, step) | done |
| `rotate: 5`, nested state in `::after`, `font:` trap, gradient docs | done |

Not verified: Firefox and Safari. Scoped signals on `::before`/`::after` use a marker attribute the engine keeps on the element.

## v0.14.0: made for games

From a review by an agent that built a game on DSSL. Twelve problems and ten wishes; each has an assertion in `scripts/test-v0140.mjs`.

| Review item | Status |
|---|---|
| Reduced motion silently kills every `animate:` | done: console says so once; `essential`, `DSSL.motion('full')`, `data-dssl-motion` |
| `gradient:` and `background-image:` overwrite each other | done: warning; layers with `+` |
| `animation-delay` etc. compile and do nothing | done: warning that names the replacement; `delay`/`jitter`/`iterations` words |
| Motions scoped to one file | done: shared registry, same as tokens |
| `paint-order: stroke fill`, `conic-gradient(from 0deg ...)` rejected | done |
| `shadow: pop`, `radius: pill` for custom tokens | done |
| Console noise "folded border-color" | done: removed |
| Lint misses cross-rule contrast, false align warning | done: `DSSL.lint(root)` computes it on the live page; the align warning moved to `dssl build`'s report where it applies |
| Docs drift | done: docs checked by a test against the real API and file list |
| `0% { }` keyframes | done |
| Engine overwrites inline styles | done: author styles win |
| Static subtree, play(), scoped aura, `check index.html`, richer `@signal`, gradient sugar, motions on pseudo-elements, `text-stroke`, per-element variation, runtime lint | done |

Not verified: Firefox and Safari (all checks ran in Chrome). The engine is still not at CSS parity for startup (see v0.13.0 below).

## v0.13.0: the compiled page is the page

| Promise | Status | Evidence |
|---|---|---|
| With JavaScript off, a compiled page renders its static styles correctly on first paint | done | test-static-parity.mjs: 7 pages, 5,000+ elements, identical to the engine (demo elements for engine-only features excluded); the site itself ships this way |
| Startup within 10% of equivalent CSS | done for the compiled page | bench-compiled.mjs: +0% (default build), -4% (`--inline-tokens`) |
| Churn at parity | done with `--inline-tokens` (0%); default build +7% churn, +20% on an inherited-value restyle | same benchmark |
| The same for the runtime engine | **no**: load 17x, churn 4x | the engine applies inline styles; a hybrid mode that skips what the CSS already did is not built |
| SSR | done | `public/dssl/server.js` (no DOM), real React `renderToStaticMarkup` tested; the site links compiled CSS in its server-rendered head |
| Strict CSP | done | no `<style>` made by script, zero violations under `style-src 'self'` with the engine, texture, slider, tilt, aura and inspector; textures need `img-src data:` |
| Devtools show .dssl source lines | done for built CSS | `--sourcemap`; Chrome's own DevTools shows `card.dssl:4` (checked in a real DevTools window). Runtime inline styles cannot carry a source: use `DSSL.inspect()` |

Bugs the comparison found, now fixed: compiled selectors had CSS specificity (now `:where()`), a later `border-style` or
`border-width` was dropped by the engine, a margin or padding shorthand did not reset an earlier longhand, the reset was unlayered.

## v0.12.0: the rest of the wood list

Fonts, richer gradients, an inspector, hot reload and mirrored tiling, from the same critic's list (rows marked "done in 0.12.0" below).

## v0.11.0 (wood): rings, species, planks, baked textures

Written after another AI built a wood site in DSSL and listed what hurt. What came of it:

| Their note | What DSSL does now |
|---|---|
| `texture: wood` is one generic grain | `oak`, `walnut`, `cherry`, `maple`, `pine`, `mahogany`, `ebony`, `birch`, plus `oak-planks` and `walnut-planks` |
| Stretched noise with a contour layer is not wood | the `rings` generator draws growth rings as curves, with `figure`, `warp`, `pores` and `knots` |
| No way to draw planks | `planks <px>`: boards with seams and a slightly different board each |
| Seamless tiling, stable seed | integer harmonics and a seeded generator: same seed, same board everywhere; tested for seams |
| `counter-reset` and `counter()` rejected | they work |
| Contrast false alarms on translucent backgrounds | judged on the light page, white and black; warns only if it fails on all |
| Flash of unstyled content | `dssl-ready` class on `<html>`, and `dssl build` for the static part (the wood page does this) |
| Textures missing from `dssl build` | baked into the CSS when colours are known; the report names the ones that could not be |
| `@font-face` in `raw {}` | done in 0.12.0: a `fonts { }` block (Google families, variable ranges, your own files) |
| Gradients only cover simple cases | done in 0.12.0: repeating, colour spaces, midpoints, hard bands, `mesh`, layers |
| Dev-tools inspector for which rule produced a style | done in 0.12.0 as an in-page panel, `DSSL.inspect()`. A real browser DevTools panel would need an extension and is still not done. |
| Hot reload | done in 0.12.0: `DSSL.watch()` and `dssl dev` |
| The wood tile repeats every 576px | `texture: ... symmetrical` mirrors the tile, so it never shows a seam |

## v0.10.0: glass, tilt, and a silent colour bug

| Need | DSSL | Status | Notes |
|---|---|---|---|
| Frosted glass | `glass: 18 saturate 1.6` | shipped | plain CSS, survives `dssl build`; CSS needs `backdrop-filter` plus a matching background |
| Pointer-following 3D tilt | `tilt: 10 lift 1.04 glare` | shipped | engine only; flat under reduced motion, ignores touch; not combinable with bend or fold |
| Alpha on a named colour | `white/12` | fixed | used to compile to `white/12px` and be dropped by the browser with no error |

## v0.9.0: texture, aura, sliders, and what testing them found

New language: `texture`, the aura family, `slider`, lint warnings, `dssl import`, and an
interactive designer in the editor extension. Writing real-browser tests for them found bugs
that were fixed in the same release:

- `aura-glow: none` also wiped the particles slot. Each `none` now clears only its own slot.
- With reduced motion the loop kept redrawing a still glow 60 times a second. It now redraws on
  scroll, resize and a slow poll only (and still follows the page when you scroll).
- A glow was re-blurred every frame (11 ms for 40 glows). Each glow is now painted once into a
  cached bitmap and re-lit per frame (0.6 ms).
- `freeze()` stopped aura but not the texture shimmer. It stops both.
- A slider clause with a leftover word (`thumb 16 #fff shape bar`) was silently ignored. It is an error.
- A typo in an aura (`speedd 4`) was swallowed as a colour and never got its did-you-mean.
- `dssl build` did not count engine-native declarations inside a rule that kept other declarations,
  so it said nothing about the aura or texture it dropped. It now lists them.
- The downloadable package and the editor extension each copied a hardcoded list of engine files,
  so a new module would have crashed them. They copy the whole folder now, and a test guards it.
- `importCss` threw on a stray `@`. It never throws now.

The contrast lint also found four real contrast failures in this site's own stylesheets.

## v0.8.2: what rebuilding the site found

- Cross-stylesheet cascade. "Later wins" held inside one sheet and not between
  sheets: every sheet numbered its rules from zero and the engine compared those
  numbers across sheets, so a later sheet lost to an earlier one whenever the
  earlier one had more rules above the rule in question. Every rule now has one
  position in load order. A consequence: a later `tokens { }` block now overrides
  a token an earlier sheet set inside `@media` or `@signal`.
- `fluid` works on the longhands (`padding-top`, `margin-block`, `letter-spacing`,
  `border-radius` and the rest), not only on the four-sided shorthands.

## v0.8.1 follow-up corrections

A re-test of 0.8.0 found two bugs, and more showed up while writing the tests:

- `fluid` left out the intercept of its line, so `fluid 16 24` was 19.6px on a
  375px phone instead of 16.1px and reached 24px at about 840px instead of 1200px.
  Fixed, and the tests now evaluate the emitted `clamp()` at real window widths.
  The same fix repaired shrinking sizes (`fluid 24 16`, which produced a backwards
  `clamp()`) and rem sizes (the slope was 16 times too small). Percentages and
  mixed units are now refused with a message instead of producing nonsense.
- A multi-line `raw { }` started with the text `undefined`, and anything written
  on the same line as `raw {` was dropped. The guide's own example also had no
  semicolons, which is not valid CSS. All three fixed, and a missing semicolon
  inside `raw { }` is now a warning with the right line number.
- `dssl build` now takes `--strict`, like `dssl check`.
- The `dssl` command in the downloadable package crashed on start (module not found),
  because it looked for the engine in `public/dssl/` and the package keeps it in
  `dssl/`. It now finds it in either place, and a test runs it from the package layout.

## v0.8.0 review-driven corrections

The second external review (repro snippets, headless browser) found five bugs and
asked for the static build first. All fixed or shipped:

- `row: gap 8 between center`, the guide's own example, kept its `between`
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
