---
license: mit
---

# DSSL

DSSL is a style language for the web. For the pages it fits, it replaces writing CSS entirely. It does not replace the CSS platform: the engine ends in inline styles that the browser parses, and it needs JavaScript. Where it wins is the authoring experience: tokens, words-as-layout, states and motion in one grammar, loud errors, zero build. PARITY.md keeps the honest feature ledger.

Not a preprocessor that spits out stylesheets. Not a utility class graveyard. You write `.dssl` files, the page loads a small engine, and the engine walks your DOM in real time and applies every rule it matches straight onto the elements it finds. Nothing compiles at runtime, and since v0.8.0 there is also an exit lane: `dssl build` compiles the static subset of the same source to a real `.css` file for pages that must work without JavaScript or sit behind a strict CSP. You choose per page: live engine, built CSS, or both.

Elements that show up later get styled the moment they appear. Change a rule and the page updates on the next pass. The language is the runtime.

This page carries the full documentation, so you can learn the language without opening the website. The same docs (with live demos) live at https://dssl-sable.vercel.app

## What it looks like

Shared behaviors with actual names:

```dssl
behavior focus-ring {
  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
    radius: 4
  }
}

a      { use focus-ring }
button { use focus-ring }
input  { use focus-ring }
```

Layout without memorizing thirty flexbox properties:

```dssl
.nav {
  position: sticky
  top: 0
  row: gap space.4 between
  height: 64
  background: color.paper/92
  backdrop-filter: blur(10)
  transition: 200
}
```

Design tokens are built in (`color.paper`, `space.4`, and the `/92` at the end is alpha). Numbers are unitless, there are no semicolons, and `@media (width <= 940)` does what you hope it does.

## Try it

The site is live. No setup, no build, nothing to install: https://dssl-sable.vercel.app

Want the engine on your own page? One line per platform.

macOS or Linux (any distro, bash not required):

```sh
curl -fsSL https://dssl-sable.vercel.app/install.sh | sh
```

Windows (PowerShell 5.1 or newer, no admin rights):

```powershell
irm https://dssl-sable.vercel.app/install.ps1 | iex
```

Both drop a `dssl-engine/` folder next to you: the engine, a starter token set, a tiny example stylesheet and a usage guide. The sh one is a POSIX script. It downloads with curl or wget, whichever you have, and unpacks with tar, which every distro and macOS already ship. If tar is missing it falls back to unzip, then python3. Want it somewhere specific? Append a folder: `... | sh -s -- ~/my-site`.

Prefer to click: [dssl-engine.zip](https://dssl-sable.vercel.app/dssl-engine.zip) or [dssl-engine.tar.gz](https://dssl-sable.vercel.app/dssl-engine.tar.gz). Same package, straight from the browser.

Writing your own .dssl? The official editor extension (`ehs-studio.dssl-vscode`) puts the real compiler in your editor: the squiggles are the same errors the browser console prints, completions come from your own token registry, and hovers explain the semantic vocabulary. One package for VS Code and VSCodium (same extension API): download `dssl-vscode/dssl-vscode-0.9.0.vsix` from the repo files, then Extensions panel -> ... -> Install from VSIX. An Open VSX listing (so it appears in VSCodium's Extensions tab, searchable) is staged and publishes with one Open VSX token; see `dssl-vscode/PUBLISHING.md`.

AI agents and machine reviewers: this repo ships `llms.txt` (dense, structured facts), `AGENTS.md` (how to work on the codebase) and `PARITY.md` (the honest feature matrix against CSS). The site serves the same `llms.txt` at https://dssl-sable.vercel.app/llms.txt

Then wire it into a page with two tags:

```html
<script type="module" src="/dssl/boot.js"></script>
<link rel="stylesheet/dssl" href="/styles/tokens.dssl">
```

Every `<link rel="stylesheet/dssl">` on the page gets fetched and applied automatically, and the engine keeps restyling the DOM live as elements come and go. That is the whole install. The package's USAGE.md covers the same ground in two minutes, and the source files also live in `package/` in this repo.

---

# The full docs

## Quickstart, three steps

One: drop the engine on the page (the two tags above, or the installer). Two: make a file, say `site.dssl`, and link it with `<link rel="stylesheet/dssl" href="/site.dssl">`. Three: write a rule.

```dssl
.card {
  background: color.card
  radius: md
  padding: space.5
  shadow: sm

  hover { shadow: lg }
}
```

That is a working stylesheet. Everything past step three is opt-in: tokens, signals, containers, choreography, gradients, bends. If a day-one page never touches them, they never cost you anything.

## Syntax

Rules are `selector { declarations }`. Braces, no semicolons, no colons after property values that are not property-value pairs. Numbers are bare and mean pixels (`12` is `12px`), and one-liners work when a rule is short:

```dssl
.badge { padding: 2 8; radius: full; background: color.accent/15 }
```

Comments are `//` to end of line or `/* ... */`. Nesting is native: a nested selector means a descendant, and `&` substitutes the parent explicitly. Trailing commas continue a selector list onto the next line; a trailing colon continues a value.

```dssl
.gallery {
  gap: space.4
  .tile { shadow: sm }                    // .gallery .tile
  &.featured { border-color: color.accent } // .gallery.featured
  > .tile:nth-child(2n) { translate: 0 -2 }
}
```

## Tokens

A sensible default set ships with the engine: `color.ink`, `color.accent`, `color.paper`, `color.card`, `color.muted`, `color.line`, `color.ok`, `color.err`, `space.1` through `space.8` (4 to 64), `radius.sm` through `radius.full`, `shadow.sm` through `shadow.xl`, and `font.sans` / `font.mono` / `font.serif`. Your first stylesheet needs zero setup.

Define your own in a `tokens` block. Any bare identifier in a value resolves against the registry, a misspelling is a compile error with a did-you-mean, and a trailing `/n` on a color adds alpha through `color-mix`:

```dssl
tokens {
  color {
    ink: #16161d
    accent: oklch(62% 0.19 35)
  }
  radius { md: 14 }
  shadow { md: 0 2 4 color.ink/10, 0 4 12 color.ink/8 }
  space  { 9: 96 }          // numeric keys are legal (v0.7)
}

.card {
  background: color.card
  color: color.ink/85       // alpha modifier
  radius: md
  shadow: md
  padding: space.9          // your 96px spacing step
}
```

Numbers as token keys exist because the built-in spacing scale stops at 8 and real pages need more room. Outside a `tokens` block a numeric property name is an error, and the error tells you exactly where numbers are legal.

Tokens can also be re-declared per subtree. Assign to a dotted token inside any rule and the custom property lands on that element; since custom properties inherit, every `var()` below it re-resolves:

```dssl
.danger {
  --color.accent: color.err   // this subtree's accent is now the error red
}
```

## Selectors

Every CSS selector works: elements, classes, ids, attributes, combinators, and the full structural set, which rides native matching: `:nth-child()`, `:nth-of-type()`, `:not()`, `:is()`, `:where()`, `:has()`. You do not need a class per list item. Stop at the container and let the structure count:

```dssl
menu {
  > li { padding: 8 0 }
  > li:nth-child(odd) { background: color.paper }
  > li:has(img) { row: gap 12 center }
  > li:not(.divider) { border-bottom: 1 solid color.line }
}
```

## States

Element pseudo-states are plain nested blocks: `hover`, `focus`, `focus-visible`, `active`, `disabled`, `checked`, `empty`, `target` and friends. The engine listens to real events and re-evaluates live, both entering and leaving a state. Rules inside a state block can target the element itself or its descendants, which is how you build tooltips and dropdowns without JavaScript.

```dssl
.doc-card {
  transition: 200

  hover {
    translate: 0 -4
    shadow: lg
  }

  focus-visible { outline: 2 solid color.accent }

  active { translate: 0 -1 }
}
```

One state is not CSS at all: `seen` fires once, the first time the element scrolls into the viewport. It is reveal-on-scroll with zero JavaScript, and it composes with `stagger` for choreography.

## Pseudo-elements

Inline styles reach every element in the DOM, but a pseudo-element has no DOM handle. So `::before`, `::after`, `::placeholder`, `::selection`, `::marker`, `::backdrop`, `::first-line`, `::first-letter` and the vendor ones (`::-webkit-scrollbar-thumb` and friends) are the one thing DSSL compiles into a real stylesheet, with tokens riding along as `var()`. Both spellings are the same rule: nested inside the block, or written as a full selector.

```dssl
.pe-tag::before {
  content: ""
  size: 10
  background: color.accent
}
```

Unknown pseudo names, `seen` mixed with a pseudo-element, and selector lists that mix pseudo and plain selectors are loud compile errors. Dead rules are impossible by construction.

## Conditions: @media, @container, @signal

```dssl
@media (max-width: 860) { .nav-links { display: none } }
@media dark   { .card { background: #1c1714 } }
@media reduced-motion { .hero { animate: none } }

@container (min-width: 480) { .widget { grid-template-columns: 1 1 1 } }

@signal menuOpen { .nav-links { column: gap 2; display: flex } }
```

Media gets sugar: `@media dark`, `@media light`, `@media reduced-motion`, bare widths, `<=` ranges. Containers evaluate against the nearest ancestor (or self) with a `container-type`. Signals are the JS bridge: `DSSL.signal('menuOpen', true)` re-evaluates every `@signal` rule on the next tick and mirrors onto `data-dssl-signal-*` attributes for DevTools visibility.

Cascade layers exist too: `@layer base { }`, `@layer components { }`, `@layer utilities { }`, and `pin { }` for must-win declarations. The engine's cascade is `(layer, source order)`. No specificity. No `!important` arms race. Later wins, layers rank tokens < base < components < utilities < pin.

## Layout and the semantic vocabulary

The flexbox and grid copies are real: `row:`, `column:`, `grid:`, `stack:`, plus every raw CSS property you know (`display`, `flex-direction`, `grid-template-columns`...). The sugar reads like the layout you mean:

```dssl
.nav {
  row: gap space.4 between center   // flex, gap, justify, align in one line
  height: 64
}
.sheet  { column: gap 2 }            // flex column, 8px gap
.board  { grid: 3 gap 12 }           // 3 columns, 1fr each
.modal  { stack: center }            // everything stacked and centered
.icon   { center: both }             // alignment can never silently no-op:
                                     // the engine promotes the box to a grid
```

`center:` exists because `place-items` silently does nothing on a plain `<span>`. When an alignment property wins on an element without a formatting context, the engine gives it one. Alignment that promises center delivers center.

The same idea runs through the vocabulary: `size: 40 20`, `shadow: lg`, `radius: md`, `truncate`, `visually-hidden`, `cover`. Semantic names expand to real properties at compile time, and unknown words fail loudly with a did-you-mean.

## Behaviors

A behavior is a named rule group you can `use` anywhere:

```dssl
behavior focus-ring {
  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
  }
}

input { use focus-ring }
```

## Motion

Per-property transitions, keyframe motions through the Web Animations API, `stagger:` for choreographed children, `reduced-motion` respected everywhere, `replay()` for testing:

```dssl
motion pulse {
  from { transform: scale(1) }
  to   { transform: scale(1.06) }
}

.pe-dot {
  animate: pulse 1200 infinite alternate   // loops forever, eases both ways
  transition: 200
}

.pt-grid {
  stagger: 70          // children's animations cascade in, 70ms apart
}

.pt-card {
  seen {
    animate: rise 600 ease-out   // the motion below owns the from-state
  }
}

motion rise {
  from {
    opacity: 0
    translate: 0 18
  }
}
```

`animate: name duration [easing] [delay] [fill] [infinite] [alternate]`. Every animation and transition honors `@media reduced-motion` unless the motion declares `essential`.

## Overlap and the pointer pass-through

Nothing below 100% opacity overlaps anything, unless you say so. The policy is a property:

```dssl
body { overlap: auto }      // engine watches opacity in (0, 1) and shoves
.ghost { overlap: deny }    // this one NEVER sits on anything
.veil  { overlap: allow     // exempt, and while you are at it:
         pointer-events: none }  // stop eating clicks and text selection too
```

`deny` is unconditional. `auto` kicks in only while the element is actually translucent. The engine measures real boxes, anchors the bigger one, and escapes along the shortest axis through the separate `translate` channel, so transforms and animations never notice. Ancestor/descendant pairs are containment, not collision, and are left alone.

## Deform: bend, stretch, fold

The deform family gives a box give. All of it composes into the one transform channel, so a single `transition` tweens it and states fire it:

```dssl
.btn {
  transition: 200 snap transform
  hover  { bend: 5 }                 // bow in 3D
  active { bend: 16; stretch: 0.94 } // press: bend + squash, volume kept
}

.flag  { bend-y: -18 }               // sideways bow
.mini  { hover { bend-up: 14 } }     // rocks back on its bottom edge
.sheet { hover { fold: 14 } }        // swings up over its top edge
.pills { bend-around: -22 }          // children ride a smile-shaped arc
```

`stretch: 0.94` squeezes to 0.94 wide and honestly shrinks to 1/0.94 tall. `bend-around` curves a container's children along a circle instead of deforming one element, and children keep their own hover bends because their transforms run inside the arc rotation. Bare numbers are degrees.

## Gradient tools

Gradients read like sentences. A stop can be a hex, a color name, a token, an alpha mix, and may carry a `%` position. A stop that is not a color is a compile error, not a silently missing background.

```dssl
.banner {
  gradient: linear 135, color.accent -> color.ok
  gradient-flow: 6s alternate       // the gradient drifts, forever, WAAPI
}
.head  { gradient-text: linear to right, color.accent, color.ink }
.sw    { gradient: radial circle at 30% 20%, color.card -> color.ink }
```

## Texture

`texture:` lays a generated image on top of an element's own background (a colour, a gradient, or
several layers) and takes it off again cleanly. Thirty presets, ten generators, and a setting for
everything, so you can make your own:

```dssl
.card   { background: #c9a66b; texture: wood }
.poster { background: #e9e2d0; texture: paper, scanlines intensity 0.1 }

behavior old-leather {
  texture: bump scale 6 depth 4 color #1b1008 color2 #6b4a2b blend overlay
}
.sofa { background: #5a3a22; use old-leather }
```

Presets: grain, noise, rough, sand, paper, cloud, concrete, stone, crumpled, glitter, frost, marble,
wood, bark, leather, brushed, canvas, linen, denim, carbon, scanlines, halftone, dots, lines, grid,
checker, crosshatch, stripes, waves, hex. The full list with what each one looks like, and every
setting, is in the [guide](GUIDE.md). `node scripts/texture-gallery.mjs out.png` renders all of them.

## Aura: light and particles, with no presets

An aura has a glow and particles, and you describe both. Fire, an energy aura, snow and sparks are
parameters you name yourself with a `behavior`, not presets someone else picked:

```dssl
behavior fire {
  aura-glow: #ff7a00 36 pulse 900 flicker 0.35
  aura-particle: #ffe27a -> #ff8a1f -> rgba(255,40,0,0) count 70 size 8 18 life 650 1100 speed 40 120 dir up spread 40 from top gravity -40 turbulence 70 shape flame glowing behind
}

.torch { use fire }
.orb   { aura-glow: color.accent 28 pulse 1600 }
.spark { glow-particle: #fff 30 out }                  // glowing particles, 30 of them, heading outward
.both  { aura-glow-particle: #7cf 24 count 40 up }     // a glow and glowing particles in one line
```

`aura-glow`, `aura-particle`, `glow-particle` and `aura-glow-particle` set the slots; `aura:` sets both
as `glow ..., particles ...`. One canvas covers the page, only visible elements animate, the whole
page shares a budget of 1800 particles, and visitors who ask for reduced motion get a still glow.
Five complete recipes (fire, an energy aura, embers, electric, snow) are in the [guide](GUIDE.md).

## Range sliders

```dssl
input[type=range] {
  slider: track 6 color.line radius full, fill color.accent,
          thumb 24 color.paper, ring 3 color.accent, glow color.accent 14
}
```

One description writes both the `::-webkit-slider-*` rules (Chrome, Edge, Safari) and the
`::-moz-range-*` rules (Firefox). `graph 20 45 70 90 60` puts a histogram behind the track, and
`aura-particle: ... from thumb` makes particles leave the thumb.

## Errors that talk back, and warnings

CSS fails silently. DSSL refuses to compile and tells you where and what it expected, with a did-you-mean built from edit distance over every known property, token and motion. Custom properties (`--*`) pass through unvalidated on purpose; the loud checks protect the design vocabulary, not the pressure valve.

v0.7 added warnings: things that compile, run, and are still probably not what you meant. The first one catches the ordering footgun that costs people real evenings, where a layout shorthand quietly expands to `display` and clobbers an explicit `display:` written earlier in the same rule:

```dssl
.nav-links {
  display: none
  column: gap 2   // warning: "column:" expands to display: flex and
                  // overrides the earlier "display: none", menu stays open
}
```

`ok` stays `true`. The console gets loud. If the override was intended, put the shorthand first and the warning goes away.

## The JS API

```js
DSSL.load(['/styles/site.dssl'])       // fetch + apply, in order
DSSL.apply(source, { scope, name })    // scoped engines for widgets
DSSL.compile(source)                   // parse + resolve, no DOM (powers the playground)
DSSL.signal('theme', 'dark')           // the JS → styles bridge
DSSL.replay(sel)                       // re-run animations
DSSL.refresh()                         // full recompute (rarely needed)
DSSL.errors()                          // structured errors from the last apply
DSSL.freeze() / DSSL.unfreeze()        // the speed escape hatch, next section
DSSL.explain(el)                       // the DevTools panel, next section
DSSL.version                           // '0.7.0'
```

Auto-boot picks up every `link[rel="stylesheet/dssl"]` and `style[type="text/dssl"]`, applies them, and fires `dssl-ready` on `window`. `<html data-dssl-reset>` enables the small built-in reset.

## The exit lane: dssl check + dssl build (v0.8.0)

The same compiler that runs in your browser runs in your terminal:

```sh
node cli/dssl.mjs check styles.dssl --strict    # CI: exit 1 on errors, --json for machines
node cli/dssl.mjs build styles.dssl -o styles.css
```

`build` emits real CSS from the static subset: tokens become custom properties,
states become `:hover`, `@media`/`@container` pass through, layers become
`@layer`, motions become `@keyframes`, `pin` becomes `!important`, `raw { }`
passes through verbatim, and `seen` applies its final state (the graceful
no-JS look). What genuinely needs the runtime (`@signal`, `animate:`, deform,
overlap) stays out and gets counted in the report, so the boundary is explicit
instead of folklore.

Two more tools from v0.8.0: `raw { }` (alias `@css { }`) drops verbatim CSS
like `@font-face` or `@keyframes` into the page stylesheet (it is real CSS, so
semicolons are required inside it, and DSSL warns if you forget one), and
`font-size: fluid 16 24` gives you a size that grows smoothly from 16px on a
360px wide window to 24px on a 1200px wide one. `dssl build --strict` makes
warnings fail the build, for CI.

## Importing CSS, and the designer (v0.9.0)

```sh
node cli/dssl.mjs import styles.css -o styles.dssl
```

converts what is mechanical (semicolons, `px`, `transition` order, `font:`, `@keyframes`,
`!important` into `pin { }`, `@font-face` and friends into `raw { }`) and reports what it could not
carry over. The file you get always compiles.

The editor extension has a **designer** (command palette: *DSSL: Open the designer*): sliders and
pickers for every aura, texture and slider setting, live previews, graphs, and the DSSL it writes,
compile-checked as you go, with *Insert at cursor* and *Load from selection*. The interactive tools
live there, in the editor, not on the website.

`dssl check` also warns about text with too little contrast, a focus outline removed with nothing to
replace it, and tiny tap targets.

## Performance: freeze, explain, and the cost of live

DSSL is a runtime. It walks the DOM, matches rules, and writes inline styles. That buys live tokens, live signals and live layout, and it costs more than a static stylesheet by design. Three things tip the ledger back:

**Wait for `dssl-ready`, not DOMContentLoaded.** The engine styles the DOM after it parses, which lands after DOMContentLoaded. Code that measures layout too early reads a half-styled world: `padding: 0`, `border-radius: 0`, a default border, and then watches it resolve a moment later. If your script measures, animates or mounts on styled geometry, wait for the event:

```js
window.addEventListener('dssl-ready', () => measure())
```

**`DSSL.freeze()` keeps the look and drops the cost.** It detaches every observer and listener (MutationObserver, ResizeObserver, IntersectionObserver, media listeners, state events, the overlap heartbeat) and leaves the resolved inline styles exactly where they are. The page keeps its look at zero engine cost, which is what makes ten-thousand-node pages viable. Explicit calls still drain on a frozen engine (`apply`, `signal`, `refresh`, `replay`), and `unfreeze()` re-arms everything and recomputes once. Frozen means frozen: hover styles, `seen` reveals, media flips and overlap nudges all sleep. Use it on pages that are being read, not pages that live on interaction.

```js
DSSL.load(['/styles/app.dssl']).then(() => {
  DSSL.freeze()   // { frozen: true, engine: 'global', elements: 10432, rules: 311 }
})
```

**`DSSL.explain(el)` is the DevTools panel.** Inline styles trade the cascade for a style attribute, and "which rule wrote this one declaration?" is the honest cost. `explain()` hands the cascade back as data: every matched rule with its source file and line, every state/media/signal condition, the winning declaration per property with the rule that won it, and the pseudo-element shadow rules touching the element. It prints a readable console group and returns the object; pass `{ quiet: true }` for data only.

```js
const rep = DSSL.explain(document.querySelector('.doc-card'))
// rep.matched: [{ id, sel, layer, file, line, states, media, signals, decls }]
// rep.wins   : [{ prop, value, by: { sel, file, line } }]
// rep.pseudo : the ::before / ::after rules touching this element
```

The matcher also pre-filters every rule through a cheap class/tag/id gate extracted from the selector's rightmost compound, so a recompute skips obvious non-matches instead of asking the browser rule by rule. The gate only ever says no; anything it does not fully understand falls back to native matching.

## What works today (v0.9.0)

- the full selector surface, including `:nth-child`, `:not`, `:is`, `:where`, `:has`
- flexbox and grid with `row:` / `column:` / `grid:` / `stack:` / `center:` sugar, place words now own an axis (`between` is main-axis, `stretch` is cross-axis) and conflicts warn instead of silently overwriting
- behaviors and `use`
- design tokens, numeric keys included, scoped per file and per subtree
- states, engine-native `seen`, `stagger` choreography
- per-property transitions and keyframe motions with `infinite` / `alternate`
- the deform family: `bend`, `bend-y`, `bend-up`, `fold`, `stretch`, `bend-around`
- gradient sentences: `gradient`, `gradient-text`, `gradient-flow`
- the overlap policy and `pointer-events` pass-through for veils
- pseudo-elements in any spelling (shadow CSS), themed scrollbars included
- `raw { }` / `@css { }` for verbatim CSS (`@font-face`, `@keyframes`, `@supports`); unknown at-rules skip their whole block with one clean error
- `fluid 16 24` sizing sugar on any length property, including `padding-top`, `margin-block` and the other longhands
- `texture:` (30 presets, 10 generators, your own), `aura-glow` / `aura-particle` / `glow-particle` / `aura-glow-particle` / `aura:` (no presets, you build them), `slider:` (WebKit and Firefox in one line)
- `dssl import file.css`, lint warnings (contrast, focus, target size), and the editor designer with live previews
- one cascade across every stylesheet: a sheet loaded later beats an earlier one (fixed in 0.8.2)
- the CLI: `dssl check` (CI, --json, --strict) and `dssl build` (real CSS from the static subset, also with --strict)
- compiler warnings for cascade-order footguns and duplicate axis words
- `DSSL.freeze()` / `DSSL.unfreeze()` / `DSSL.explain()` / `DSSL.toCSS()`
- bare font names, `hyphens: manual`, loud did-you-mean errors
- honest line numbers: a v0.7.1 parser bug (every `//` comment shifted later lines +1, so diagnostics pointed one line late) is fixed and regression-tested
- the editor extension bundles the real compiler, so editor squiggles and browser console agree
- every guide example is asserted in headless Chromium (computed styles, real mouse hover, real IntersectionObserver), so docs examples cannot drift from the engine again

## Repo layout

- `public/dssl/` the engine. `parser`, `resolver`, `engine`, `boot`, `index` and `static` (the build target), plus
  the 0.9.0 modules: `color` (parsing and contrast), `texture` (presets and generators), `aura` (the particle
  and glow renderer), `slider`, `lint` and `import`
- `public/styles/` the styles that drive the site
- `cli/dssl.mjs` the CLI: `check`, `build` and `import`, no dependencies
- `package/` and `engine-package/` what ships in the download: engine, starter files, usage guide, installers
- `src/` the Next.js site (docs, playground, changelog)
- `scripts/` regression suites, the headless-browser tests (`lib/` holds the shared browser harness), and release tooling
- `dssl-vscode/` the editor extension: diagnostics, completions, the designer panel (`media/`), the CSS converter
- `llms.txt`, `AGENTS.md`, `PARITY.md`, `GUIDE.md` for machine reviewers and contributors

## Status

v0.9.0, experimental, moving fast. The language grows whenever the site needs something it cannot express yet, so the site doubles as the test suite, and the docs examples are rendered and asserted in a real browser, so the guide cannot lie. Honest ledger: great for creative sites, prototypes, docs, playgrounds and internal tools; when a page must work without JavaScript, build the static subset with `dssl build` or pick another tool for that page. Freeze makes big static pages viable; live interaction is what the engine is for.

## License

MIT
