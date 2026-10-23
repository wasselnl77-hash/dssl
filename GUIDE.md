# DSSL Guide

Everything in the repo, in one file. Written for the person who just cloned this
and wants to know what exists, what works, and what to reach for. Every `.dssl`
example in this guide is compiled by `scripts/test-guide-examples.mjs` on every
release, so the examples cannot drift from the compiler. If an example here
stops compiling, that is a release blocker, not a docs bug.

Status up front: DSSL is a real, tested style engine at v0.7.2, and it is
honest alpha. It needs JavaScript, it writes inline styles, and it has a
first-paint story you should read before shipping anything serious (see
"Honest limits"). Within those limits, it is genuinely nicer to write than
hand-rolled CSS for creative pages, docs, playgrounds and internal tools.

---

## 1. What this repo is

| Path | What it is |
|---|---|
| `public/dssl/` | The engine. Six zero-dependency ESM files: `parser.js`, `resolver.js`, `engine.js`, `index.js` (public API), `utils.js`, `boot.js`. This is the whole language. |
| `public/styles/*.dssl` | The stylesheets that drive the docs site itself. The site is styled entirely by its own engine, which makes it the de-facto test suite. |
| `public/examples/hello.dssl` | The starter stylesheet. Small, commented, every interaction real. |
| `package/` + `public/install.sh`, `install.ps1` | The downloadable engine package: `curl -fsSL https://dssl-sable.vercel.app/install.sh \| sh`. |
| `public/dssl-engine.zip`, `.tar.gz` | Same package as plain archives. |
| `dssl-vscode/` | The editor extension (VS Code and VSCodium). Bundles the real parser and resolver, so editor squiggles are browser-console errors. See its own README and PUBLISHING.md. |
| `src/` | The Next.js docs site: playground, bench page, spec, changelog. |
| `scripts/` | Tests, package builds, the extension engine sync, deploy helpers. |
| `llms.txt`, `AGENTS.md`, `PARITY.md` | The machine-reviewer layer and contributor rules. PARITY.md is the honest CSS feature matrix. |
| `worklog.md` | The full build history, every decision logged. |

Version rule: the engine version in `public/dssl/index.js` is the source of
truth. The site badge, footer, changelog and READMEs follow it on every release.

## 2. Quickstart

Two tags. No build step, no npm, nothing to compile:

```html
<link rel="stylesheet/dssl" href="styles.dssl">
<script src="dssl/index.js" type="module"></script>
```

Or embed DSSL directly in your HTML (this is the Tailwind-ish answer: the
language lives wherever you want it):

```html
<script src="dssl/index.js" type="module"></script>
<style type="text/dssl">
  .card {
    background: #26201a
    radius: 12
    hover { background: #3a2f26 }
  }
</style>
```

`<style type="text/dssl">` and `<script type="text/dssl">` both work; the
engine's auto-boot picks them up in document order, after any linked files.
You can use as many blocks as you like.

A real starter stylesheet with comments lives at
`public/examples/hello.dssl`.

## 3. The language, fast

### Bare numbers are px

`padding: 16` is 16px. Units still work when you want them: `width: 50%`,
`font-size: 1.2rem`, `margin: 0 auto`.

### Tokens

```dssl
tokens {
  color {
    ink: #16161d
    accent: oklch(62% 0.19 35)
  }
  space {
    1: 4
    2: 8
    4: 16
  }   // numeric keys are legal
  radius { md: 14 }
  shadow { md: 0 2 4 color.ink/10, 0 4 12 color.ink/8 }
}

.card {
  background: color.ink
  padding: space.4
  radius: md
  shadow: md
}
```

Alpha on any color: `color.ink/50`, `#ff0000/50` (compiles to color-mix).
Token overrides can be scoped under `@media` or `@signal` for themes.

### Layout is words

```dssl
.toolbar { row: gap 8 between center }
.sidebar { column: gap 16 }
.board   { grid: 3 gap 12 }        // 3 columns, 1fr each, gap 12
.board   { grid: auto-fill 220 }   // responsive columns
.gallery { grid: 2 rows 3 gap 8 }  // rows N is a word too
.modal   { stack: center }         // grid place-items center
.hero    { center: both }
```

Each place word owns an axis (v0.8.0 — the example above used to silently
lose the `between` because every word wrote both axes):

- `between`, `around`, `evenly` are main-axis words (`justify-content`)
- `stretch`, `baseline` are cross-axis words (`align-items`)
- `center`, `start`, `end` fill whichever axes are still free

One distribution word + one alignment word is the whole grammar. A word
whose axes are already taken warns loudly ("has nowhere to go") instead of
overwriting, and a word written twice warns too.

### Sizing that moves: fluid

`font-size: fluid 16 24` (and any length-ish property: width, height, gap,
padding, margin…) compiles to the linear `clamp()` between 360px and 1200px
viewports — the formula everyone writes wrong by hand. Custom bounds:
`font-size: fluid 16 24 400 800`. The comma form still works: `fluid: 16, 24`.

### raw { } — the escape hatch

DSSL has no sugar for `@font-face`, `@keyframes`, `@supports`, `@import` or
`@property` yet. `raw { }` (alias `@css { }`) drops verbatim CSS into the
page stylesheet, top-level only:

```dssl
raw {
  @font-face {
    font-family: Inter
    src: url(/fonts/inter.woff2)
  }
}
```

Unknown at-rules outside `raw { }` are skipped whole, with one clean error
and a pointer here — they never leak their inner rules (that was a real
0.7.2 bug: `@supports (display:grid) { .a { … } }` applied `.a` everywhere
after erroring).

### The cascade is (layer, order)

No specificity, no `!important`. Later wins inside a layer. Layers sort
`tokens < base < components < utilities < pin`. Nested blocks do what the
indentation says they do (fixed in v0.7.2, it used to be the engine's worst
bug):

```dssl
.card {
  background: #26201a
  shadow: sm
  hover { background: #3a2f26; shadow: lg }   // beats the base now, by order

  @media dark { background: #181310 }         // condition is kept, sorts after base

  @layer utilities { margin-top: 0 }
}
```

Declarations after a nested block keep working too: they become a later
fragment of the same rule, and later still wins.

### States

All the usual suspects ride native matching: `hover`, `focus`,
`focus-visible`, `active`, `disabled`, `checked`, `target`, `open` (details),
and structural ones via selectors. Two engine details worth knowing:

- `checked` and `open` listen to real events (`change`, `toggle`), so
  keyboard toggles restyle immediately. For programmatic control, set the
  property and dispatch a bubbling change event:
  `el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true }))`.
- Attribute changes (`disabled` and friends) are picked up by the engine's
  MutationObserver automatically.

### Conditions

```dssl
.card {
  @media dark { background: #181310 }       // one-word sugar
  @media 768 { padding: 24 }                // bare width = min-width
  @media <= 480 { padding: 12 }
  @container (min-width: 400px) { column: gap 4 }
  @signal theme==dark { border-color: color.accent }
}
```

`@media reduced-motion` is honored by every motion unless the motion declares
`essential`.

### Motion and seen

```dssl
motion rise-in {
  from { opacity: 0; translate: 0 18 }
}

motion lift {
  from { translate: 0 2 }
}

.gallery { stagger: 60 }

.card {
  seen { animate: rise-in 480 snap }   // plays once, when scrolled into view
  hover { animate: lift 200 }          // WAAPI, reduced-motion aware
}
```

The arrow `->` is motion/gradient syntax (keyframes and gradient stops). It
does nothing inside a `seen { }` block, and the compiler now says so loudly.

### Behaviors, deform, overlap

`use` shares named blocks (the site's `focus-ring` is one). `bend`, `fold`,
`stretch` deform on scroll. `overlap:` declares allowed overlap policies.
The full vocabulary lives in the site's Docs and Cheat sheet views.

## 4. The engine API

```js
import { DSSL } from '/dssl/index.js'

DSSL.version()                    // "0.7.2"
DSSL.compile(source)              // { ok, errors, warnings, stats, doc }
DSSL.apply(source, { name, scope, replace })
await DSSL.load(['a.dssl', 'b.dssl'])
DSSL.signal('theme', 'dark')      // drives @signal rules
DSSL.refresh()                    // full recompute
DSSL.freeze() / DSSL.unfreeze()   // static snapshot: ambient restyling off
DSSL.explain(el)                  // which rules matched, what won, why
DSSL.errors()                     // last compile errors
```

`freeze()` is the big performance lever for static pages: the engine drops its
observers and listeners, keeps the resolved styles, and the page stops paying
for liveness. `unfreeze()` re-arms everything.

## 5. The editor extension

Three ways to get it:

1. Download `dssl-vscode/dssl-vscode-0.8.0.vsix` from the repo files, then
   Extensions panel, `...`, Install from VSIX. Works in VS Code and VSCodium.
2. Build it: `cd dssl-vscode && npx @vscode/vsce package --no-dependencies`.
3. Registry listing: staged for Open VSX (the registry VSCodium searches).
   See `dssl-vscode/PUBLISHING.md` for exactly what remains.

What it does: real-compiler diagnostics (same errors the browser prints,
did-you-mean included, line numbers accurate since the v0.7.1 parser fix),
completions folded from your workspace token registry, hover docs, a TextMate
grammar for `.dssl`.

### The exit lane: dssl check + dssl build

v0.8.0 answers the honest limits below without giving up the language:

```sh
node cli/dssl.mjs check styles.dssl --strict   # CI: real compiler, exit 1 on errors, --json
node cli/dssl.mjs build styles.dssl -o styles.css
```

`build` compiles the static subset to a real stylesheet: tokens become
custom properties, states become `:hover`, `@media`/`@container` pass
through, layers become `@layer`, motions become `@keyframes`, `pin` becomes
`!important`, `raw { }` passes through verbatim, and `seen` applies its
final state unconditionally (the graceful no-JS look). What needs the
runtime stays out and gets counted: `@signal` rules and `animate:`.
The same output is available in the browser as `DSSL.toCSS(source)`.

## 6. Tooling and tests

```sh
node cli/dssl.mjs check public/styles/*.dssl   # compile everything, exit code for CI
node scripts/test-v073.mjs      # 0.8.0 regression suite (65 assertions)
node scripts/test-guide-examples.mjs        # every guide example compiles
node scripts/test-guide-browser.mjs         # guide examples asserted in headless Chromium
node scripts/test-v072.mjs      # 0.7.2 regression suite (40 assertions)
node scripts/test-v071.mjs      # parser line-number suite
node scripts/test-v070.mjs      # v0.7 feature suite (60)
node scripts/test-v050.mjs      # v0.5 feature suite (61)
node scripts/dssl-smoke.mjs     # end-to-end compile of the smoke stylesheet
node scripts/dssl-styles-check.mjs  # all six site stylesheets compile
node scripts/sync-extension-engine.mjs  # run after ANY engine change
bash scripts/build-engine-package.sh    # rebuild the zip/tar packages
```

House rule from AGENTS.md: if you touch `public/dssl/`, run the suites, then
run the sync script so the editor extension ships the same compiler.

## 7. Honest limits

Read this before choosing DSSL for a real site.

- **JavaScript is required** for the live engine. No JS, no styles at runtime.
  v0.8.0 adds the exit lane: `dssl build styles.dssl -o styles.css` compiles
  the static subset to a real stylesheet you can `<link>` instead of the
  engine — tokens as custom properties, states as `:hover`, layers as
  `@layer`, motions as `@keyframes`, `raw { }` verbatim. What genuinely needs
  JS (`@signal`, `animate:`, deform, overlap) stays out and is counted in the
  report, so you always know what a no-JS page gives up. If a page must work
  without JS AND uses the dynamic features, use CSS.
- **First paint.** Styles are applied by the engine after it loads, so large
  pages can flash unstyled content (CLS). The build output fixes this for
  static pages (real CSS paints before any JS). For live pages, the docs site
  solves it by inlining its stylesheets into the SSR HTML. The planned
  prerender mode (server renders the final inline styles) is the real fix
  and is on the PARITY roadmap as the next big item.
- **CSP.** Pseudo-elements compile to one real stylesheet the engine injects;
  strict `style-src 'self'` blocks inline style attributes and that sheet.
  DSSL wants `unsafe-inline` for styles today — or use the `dssl build`
  output, which is a normal external stylesheet and CSP-clean.
- **Interop is invasive.** DSSL normal declarations beat external CSS, and
  `pin` beats external `!important`. Mixing with an existing CSS design
  system works but the engine wins by design.
- **Large interactive pages** pay a real per-recompute cost. `freeze()`
  makes static pages viable; live hover on thousands of elements is bounded
  since v0.7.2 but is still not free.
- **Not a CSS replacement.** It is a style language that ends in inline
  styles. When it is the better tool, it is because of the authoring
  experience: tokens, words-as-layout, states and motion in one grammar,
  loud errors, zero build.

## 8. FAQ

**Can I write DSSL in my HTML?** Yes, that is section 2. `<style
type="text/dssl">` blocks, or `<script type="text/dssl">` if you prefer.

**Where do docs examples get tested?** `scripts/test-guide-examples.mjs`
compiles every `.dssl` block in this guide and in the README. Green or the
release does not ship.

**Why does my nested hover not beat the base rule?** It does, since v0.7.2.
If you are on 0.7.1 or older, that was the cascade bug, upgrade.

**Is there a DSSL for something other than web styling?** Not yet. The
parser and resolver are domain-agnostic by design, so a domain-specific
DSSL2 is a plausible later project, not a current one.

**Who builds this?** One person plus AI agents, in the open. `worklog.md`
is the complete receipt trail.
