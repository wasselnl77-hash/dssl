# 11. Browser integration

This chapter is informative. It says how a browser could host DSSL natively, stage by stage,
and which parts are cheap and which are real engineering. Nothing here is proposed to a
standards body, no browser implements it, and the reference crate has not been wired into any
engine. It is written so that a browser team can judge the size of the job.

## 11.1 Delivery

DSSL needs a way to reach the parser, the way CSS has `<link rel="stylesheet">` and `<style>`.

- **INT-1.** A DSSL stylesheet is text with the media type `text/dssl`. (No registration is
  proposed. This is a placeholder name.)
- **INT-2.** `<link rel="stylesheet" type="text/dssl" href="...">` and
  `<style type="text/dssl">...</style>` load DSSL. A browser that does not know the type does
  not load it, which is how CSS has always been introduced.
- **INT-3.** Several stylesheets are one cascade in load order (CAS-16), the same as CSS.
  Tokens and motions flow from earlier files to later ones (4.5, 7.3) in that order.

Authors who need a page to work in a browser with no DSSL support can ship the output of
`dssl build` as CSS. That is the *static lane*. It is an author's choice, not a part of native
support, and it is described in 11.5.

## 11.2 Where the parser sits

In every engine, a stylesheet becomes a list of rule objects, and nothing after that stage
cares what syntax the rules came from. A DSSL front end replaces the tokenizer and parser (CSS
stage 1) and produces the same kind of rule objects.

```
CSS text   --> CSS tokenizer + parser   --\
                                           >--> rule objects --> style resolution --> layout --> paint
DSSL text  --> DSSL parser + resolver   --/
```

- **INT-4.** The resolved document (chapter 10) is the hand-off. Each rule record maps to an
  engine rule: `sel` to the selector list, `decls` to the declaration block, `layer` to a
  cascade layer, `media` and `containers` to conditional wrappers, and `order` to source order.
- **INT-5.** Engine-native declarations (`@...`, 6.8) are not properties. They go to the feature
  that owns them (11.4), not to the style system's property table.

This is also how new CSS syntax has entered engines before. Nesting and cascade layers are
parsed into the same rule tree as everything else.

## 11.3 The part that lowers to CSS

A large part of DSSL is already expressible in CSS. The proof is `dssl build`, which does exactly
that. Here is real output, from the reference engine, for a small source:

```dssl
tokens { color { brand: #c2185b } }
.card {
  background: color.brand
  padding: 16
  row: gap 8 between center
  radius: md
  hover { background: color.brand/80 }
  @media dark { background: #181310 }
}
```

compiles to the following (reformatted, and without the built-in token declarations):

```css
@layer tokens, base, components, utilities, pin;

@layer tokens {
  :where(:root) { --dssl-color-brand: #c2185b; }
}

@layer components {
  :where(.card) {
    background: var(--dssl-color-brand);
    padding: 16px;
    display: flex;
    flex-direction: row;
    gap: 8px;
    justify-content: space-between;
    align-items: center;
    border-radius: var(--dssl-radius-md);
  }
  :where(.card:hover) {
    background: color-mix(in oklab, var(--dssl-color-brand) 80%, transparent);
  }
  @media (prefers-color-scheme: dark) {
    :where(.card) { background: #181310; }
  }
}
```

The mapping:

| DSSL | CSS it lowers to |
|---|---|
| tokens | custom properties on `:root`, inside `@layer tokens` |
| layers and `pin` | `@layer`, with `!important` for `pin` |
| no specificity | every selector wrapped in `:where()` so order alone decides |
| states | pseudo-classes |
| `@media`, `@container` | the same at-rules |
| semantic properties (`row`, `grid`, `radius`, `fluid`, ...) | longhand properties and `clamp()` |
| alpha (`color.ink/20`) | `color-mix(in oklab, ..., transparent)` |
| `motion` | `@keyframes` |
| `raw` | verbatim |
| `glass` | `backdrop-filter` and a background color |

- **INT-6.** A native engine MAY implement this part by lowering to its own CSS rule objects.
  The result must equal the cascade of chapter 5. In particular, the `:where()` wrapping is how
  CSS reproduces "no specificity", and the layer ranks reproduce CAS-1.

## 11.4 The part that needs engine work

| Feature | What is missing from CSS | What a native engine adds |
|---|---|---|
| `@signal` | Named values set by the page, readable by the cascade | A page-visible store of named values, with ancestor lookup (CAS-39), invalidating style when one changes. The nearest CSS feature is a container style query on a custom property. Support differs between engines and must be checked before relying on it. |
| `seen` | A pseudo-class that matches once an element has been in view | An element flag set by the same machinery as intersection observation, and style invalidation when it flips (CAS-27). |
| `animate` | Per-element motion lists with `jitter`, `essential` and `stagger` | Mapping to the engine's keyframe animation, with a delay offset per child. `essential` and reduced motion are policy on top. |
| `texture` | A generated image layer that sits on the author's own background | A background image generator keyed by the layer record (FX-7), cached per tile. |
| `aura` | Glow and particles outside the box, over everything, with a particle budget | A page-level paint layer above content that does not take pointer events, with the budget of FX-18. |
| `slider` | One description for all engines' range-input parts | Direct styling of the control parts, plus a value-as-fraction the style can read (FX-27). |
| `tilt` | Pointer-driven 3D transform without restyling | A compositor-driven transform from pointer position (FX-32). |
| `bend`, `fold`, `bend-around` | Transforms that need the element's own box, or a container's children | These run during or after layout, because they need box sizes (FX-37, FX-38). |
| `overlap` | A rule that moves elements out of overlaps | Hook after layout (FX-40). This is the hardest item and is not specified yet. |
| alignment promotion | A box type chosen from an alignment word | Rule CAS-47 at computed-value time. |

- **INT-7.** For each row, the spec's description half (chapter 8) and corpus fixes what the
  feature means. How the engine realises it is the engine's business, as long as the rendering
  contract holds.

## 11.5 The static lane and native support

`dssl build` already exists. Today it is the exit lane for pages that need no JavaScript. With
native support, the rows of 11.3 stop needing it, because the browser lowers them itself. What
stays on the author's side is what 11.4 lists and nothing else.

The build report already counts those leftovers (`@signal` rules, engine-native declarations),
so it is a ready measure of how much of a given page is the cheap part and how much is the
engine-work part.

## 11.6 How a browser team would check their work

- Level 1 and 2: run the corpus (chapter 10). The expected JSON is committed. No browser
  needed.
- Level 3: element-level tests, in the style of the web platform tests. A fixture is a small
  HTML file, a DSSL file and the expected computed value of chosen properties on chosen
  elements. These do not exist yet. They are the first thing to write after milestone 1.
- Level 4: reftests, comparing a rendering to a reference rendering, and pixel tests for the
  effects (the repository already has pixel helpers in `scripts/lib/pixels.mjs`).

## 11.7 What is not claimed

- No browser supports DSSL natively today, and this repository does not change that.
- The reference crate does not exist yet beyond a stub (see `native/README.md`). When it does,
  it will parse and resolve. It will not match elements, compute styles or paint.
- The lowering table in 11.3 is the claim of the existing build lane, checked by the repository's
  static parity test. It has not been run in browsers other than Chromium.
