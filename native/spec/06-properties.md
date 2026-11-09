# 6. Properties

A declaration `prop: value` becomes zero or more *output declarations*. An output declaration
is either an ordinary CSS declaration `{ prop, value }`, or an *engine-native declaration*
whose property starts with `@` (6.8).

## 6.1 Lookup order

- **PRP-1.** For each declaration, the resolver does the first of these that applies:
  1. If the value contains `!important` (VAL-15): report the error, emit nothing.
  2. If `prop` starts with `--`: it is a custom property (TOK-15, TOK-16).
  3. If `prop` is a semantic property (the names in 6.2 to 6.7, and appendix A): call that
     property's expansion. It returns its own output declarations.
  4. If `prop` is `animation` or `animation-name`: resolve the value with `bareIdents: true`
     and `unitless` per the unitless list. (Motion names are bare words, and must not be
     reported as unknown values.)
  5. If the value is `fluid ...` and `prop` is in the fluid list: VAL-12 to VAL-14.
  6. If `prop` is not a known CSS property (appendix A): report
     `unknown property "<prop>"`, hint = did-you-mean over the known properties and the
     semantic property names. Emit nothing.
  7. Otherwise: one output declaration with the same property and the value resolved by
     chapter 3.

The known-property list holds every property that CSS defines, plus a few vendor ones. It is
generated from the engine's vocabulary module (appendix A).

Each output declaration also carries the `line` of the source declaration.

```dssl error
.a { colour: red }
```

## 6.2 Size and flow words

- **PRP-2.** `size: w [h]`. Two declarations `width` and `height`. The height defaults to the
  width. Both are lengths.
- **PRP-3.** `circle: s`. `width: s`, `height: s`, `border-radius: 50%`.
- **PRP-4.** `z: n` is `z-index: n` (a plain number). `grow`, `shrink` are `flex-grow`,
  `flex-shrink` (a plain number, default 1 when empty). `basis: l` is `flex-basis: l`.
- **PRP-5.** `cover [position]` is `position: <position or absolute>` and `inset: 0`.
  `sticky [top]` is `position: sticky` and `top: <top or 0>`.
- **PRP-6.** `truncate` (no value) is `overflow: hidden`, `text-overflow: ellipsis`,
  `white-space: nowrap`.
- **PRP-7.** `visually-hidden` (no value) is `position: absolute; width: 1px; height: 1px;
  padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;
  border: 0`, in that order.

## 6.3 Row, column, grid, stack, place, center

*Place words* map to two values, `(cross, main)`:

| word | cross | main |
|---|---|---|
| `center` | `center` | `center` |
| `start` | `start` | `flex-start` |
| `end` | `end` | `flex-end` |
| `between` | `center` | `space-between` |
| `around` | `center` | `space-around` |
| `evenly` | `center` | `space-evenly` |
| `stretch` | `stretch` | `flex-start` |
| `baseline` | `baseline` | `flex-start` |

- **PRP-8.** `row: words` and `column: words` start with `display: flex` and
  `flex-direction: row|column`, then read the words in order:
  - `gap N`: `gap: N` (a length). Missing `N` is the error `gap needs a value`.
  - `wrap` / `nowrap`: `flex-wrap`.
  - `reverse`: the direction becomes `row-reverse` or `column-reverse`.
  - `inline`: `display` becomes `inline-flex`.
  - a place word: see PRP-9.
  - anything else: error `unknown word "<w>" in <row|column>`, hint = did-you-mean over
    `gap center start end between around evenly stretch baseline wrap nowrap reverse inline`.
- **PRP-9.** Each place word has an axis role. `between`, `around`, `evenly` are *main*
  (they write `justify-content`). `stretch` and `baseline` are *cross* (they write
  `align-items`). `center`, `start`, `end` are *both*: they write whichever axes have not been
  written yet by an earlier word in this declaration.
  - A word that writes an axis a second time overrides it, with a warning:
    `two words in <dir> write <prop>: "<new>" overrides "<old>"`, or when the same word, `"<w>"
    is written twice in <dir> - the second copy wins`.
  - A *both* word with both axes already taken writes nothing and warns
    `"<w>" has nowhere to go: justify-content came from "<a>", align-items came from "<b>"`
    (or the "written twice" form when it is the same word).
- **PRP-10.** `grid: words`. Words `gap N` and `rows N` are taken out first. The rest are the
  column spec:
  - nothing: error `grid needs columns`, columns are `none`,
  - one integer `N`: `repeat(N, 1fr)`,
  - `auto-fill L` or `auto-fit L`: `repeat(auto-fill, minmax(L, 1fr))` with `L` a length,
  - otherwise each word is a length, joined by spaces.
  The output is `display: grid`, `grid-template-columns`, then `gap` if given, then
  `grid-template-rows` if given (`repeat(N, 1fr)` for an integer, a length otherwise).
- **PRP-11.** `stack: word` (default `center`) is `display: grid`,
  `place-items: <cross> <main>` and `@stack: "1"`. An unknown word is the error
  `unknown place "<w>" in stack` and only `@stack` is emitted.
- **PRP-12.** `place: word` is `place-items` and `place-content`, both `<cross> <main>`.
  Unknown: `unknown place "<w>"`.
- **PRP-13.** `center: both|x|y` (default `both`). `both`: `place-items: center center` and
  `place-content: center center`. `x`: `justify-items: center`, `justify-content: center`.
  `y`: `align-items: center`, `align-content: center`. Unknown:
  `unknown center axis "<v>"`.
- **PRP-14.** `align: center|start|end|stretch|baseline` is `align-items` with that word.
  Unknown: `unknown align "<v>"`.

```dssl
.toolbar { row: gap 8 between center }
.board   { grid: 3 gap 12 }
.pane    { stack: center }
.hero    { center: both }
```

The first rule gives `display: flex; flex-direction: row; gap: 8px;
justify-content: space-between; align-items: center`.

## 6.4 Text and look

- **PRP-15.** `font: size[/line-height] [color]`. DSSL's `font:` is not the CSS shorthand.
  It writes `font-size` (a length, default `16`), then `line-height` (a plain number) if a `/`
  part is there, then `color` if more words follow.
  If the value looks like the CSS shorthand (it contains `"`, `'` or `,`, or its first word is
  one of `italic oblique bold bolder lighter normal small-caps condensed expanded caption icon
  menu message-box small-caption status-bar system-ui serif sans-serif monospace`, or it is a
  weight `100`..`900` followed by a sized word), the result is the error
  `font: "<v>" looks like the CSS font shorthand, but DSSL's font: means size, line height and
  colour` and nothing is emitted.
- **PRP-16.** `fluid: a, b[, v0, v1]` is `font-size` through VAL-12 to VAL-14.
- **PRP-17.** `shadow` and `radius`: TOK-17, TOK-18.
- **PRP-18.** `text-stroke: width [color] [inside]`, or `none`. It writes
  `-webkit-text-stroke: <width> <color>` (width in px if bare, color default `currentcolor`),
  and `paint-order: stroke fill` unless `inside` is given. `none` writes
  `-webkit-text-stroke: 0` and `paint-order: normal`. A missing or non-numeric width is the
  error `text-stroke needs a width first`.
- **PRP-19.** `outline-shape: width [color]`, or `none`. It writes one `filter` made of four
  `drop-shadow(x y 0 color)` terms for `(w,0)`, `(-w,0)`, `(0,w)`, `(0,-w)`. `none` is
  `filter: none`. A missing width is the error `outline-shape needs a width first`.
- **PRP-20.** `rotate: v`. A bare number `n` is `n` degrees. `x|y|z n` and four numbers also
  get `deg`. Anything else is resolved as a unitless value.

## 6.5 transition

`transition: part, part, ...` or `none`. Each part is `duration [easing] [property]`.

- **PRP-21.** The duration is a number with an optional `ms` or `s` unit. A bare number is
  milliseconds. The easing is an easing name (appendix A) or a `cubic-bezier(...)` or
  `steps(...)` call. The property is a known CSS property, or one of the deform names
  (`bend`, `bend-y`, `bend-up`, `fold`, `stretch`, which mean `transform`), and defaults to
  `all`. The part becomes `<property> <duration> <easing>`, with the easing defaulting to
  `ease`. Parts are joined by `, `.
- **PRP-22.** If a part does not start with a time but contains one (the CSS habit,
  `color .2s ease`), the error is `transition: the CSS form (property first) is not DSSL`,
  with a hint that rewrites the part in DSSL order. A part with no time at all is the error
  `transition duration "<d>" is not a time`. An unknown property is
  `unknown transition property "<p>"`. A part with an error is dropped. If no part survives,
  nothing is emitted.

## 6.6 gradient

`gradient: layer + layer + ...`. The first layer is on top. Each layer is a *kind sentence*
optionally followed by *layer options*.

- **PRP-23.** Layers are split on a top-level `+` that has white space on both sides.
- **PRP-24.** Layer options may follow the sentence, in any order, each at the end of the text:
  `tile W [H]` (background size, bare numbers are px, H defaults to W), `offset X Y`
  (background position) and one of `no-repeat`, `repeat-x`, `repeat-y`.
- **PRP-25.** If the layer (after options) starts with a CSS gradient function, `url(`,
  `image-set(` or `-webkit-`, it is resolved as an ordinary value. Otherwise it is a sentence.
- **PRP-26.** A sentence is `[repeating] linear|radial|conic <head> <stops>` or
  `mesh <base>, <blob>, ...`. The output is the CSS function `linear-gradient(...)`,
  `radial-gradient(...)`, `conic-gradient(...)` (with `repeating-` first when asked).
- **PRP-27.** Stops are separated by `->` or by commas. Each is a color (a token, hex, named
  color, color function, alpha form) with up to two trailing positions, or a lone position
  (a midpoint hint). Bare numbers in positions are px (degrees for `conic`), except `0`
  which stays `0`. A stop word that is a plain word but not a color name is the error
  `gradient stop "<s>" is not a color`.
- **PRP-28.** A *linear* head is an angle (a bare number is degrees, `45deg` also works) or
  `to <side> [<side>]`. Default `180deg`. A *radial* head is made of `circle`, `ellipse`,
  position words, lengths and `at`. A *conic* head is `from <angle>` and/or `at <position>`.
  Anything else is an error saying what is not part of the gradient. An interpolation space
  (`in oklch`, `in hsl longer hue`, ...) may end the head.
- **PRP-29.** `mesh` takes a base color first (an item without `at`), then blobs
  `color at X Y [size S]` (size defaults to 60%). Each blob is
  `radial-gradient(circle farthest-side at X Y, color, transparent S)`. The base is
  `linear-gradient(base, base)`. The blobs come first, the base last.
- **PRP-30.** Errors: `gradient needs a kind: ...`, `gradient needs at least two stops`,
  `"<s>" is a midpoint, so it has to sit between two colours`, `a gradient stop is missing its
  color`, `mesh needs a base colour and at least one blob`, `mesh item "<i>" needs a position`,
  `mesh needs a base colour first (an item without "at")`.
- **PRP-31.** `gradient:` writes `background-image` marked as coming from a gradient, plus
  `background-size`, `background-position` and `background-repeat` only when some layer set
  one (with `auto`, `0 0` and `repeat` for the layers that did not).
- **PRP-32.** `gradient-text: layers` writes the same image, then `background-clip: text`,
  `-webkit-background-clip: text`, `color: transparent`, `-webkit-text-fill-color: transparent`.
- **PRP-33.** `gradient-flow: duration [easing] [alternate|alternate-reverse]` or `none`
  writes `@gradient-flow` with `{ duration (ms), easing, direction }`. `none` and an empty
  value write `@gradient-flow: null`. The easing default is `linear` and the direction
  default is `normal`.

```dssl
.stripes { gradient: repeating linear 45, #fff 0 10, color.ink 10 20 }
.blend   { gradient: linear 90 in oklch, #ff0055 -> #00d4ff }
.sheen   { gradient: radial at top left, #fff/40 -> transparent + linear 135, #123 -> #456 }
```

## 6.7 yield

`yield: name name ...` hands properties back to ordinary CSS.

- **PRP-34.** The names are separated by spaces or commas and lowercased. Each MUST be a known
  CSS property or a semantic property name, otherwise the error
  `yield: "<n>" is not a CSS property` and nothing is emitted. An empty list is the error
  `yield needs the properties to hand back`. `none` writes `@yield: null`. Otherwise it writes
  `@yield` with the list of names.
- **PRP-35.** For a name that is a shorthand, its longhands are handed back too (`padding`
  hands back `padding-top` and the rest).

## 6.8 Engine-native declarations

Declarations whose property starts with `@` are not CSS. They describe behavior that needs
more than a computed style. Each is produced by exactly one DSSL property and consumed by the
feature it belongs to.

| Output property | Produced by | Value | Chapter |
|---|---|---|---|
| `@animate` | `animate:` | a spec record, or null | 7 |
| `@stagger` | `stagger:` | milliseconds or null | 7 |
| `@overlap` | `overlap:` | `allow`, `deny`, `auto` | 8.6 |
| `@stack` | `stack:` | `"1"` | 6.3 |
| `@bend`, `@bend-y`, `@bend-up`, `@fold` | `bend`, `bend-y`, `bend-up`, `fold` | degrees | 8.5 |
| `@stretch` | `stretch:` | `{ factor, axis }` | 8.5 |
| `@bend-around` | `bend-around:` | degrees | 8.5 |
| `@gradient-flow` | `gradient-flow:` | spec record or null | 6.6 |
| `@texture` | `texture:` | list of layers or null | 8.1 |
| `@aura-glow`, `@aura-particles` | the aura family | list of layers or null | 8.2 |
| `@slider` | `slider:` | spec record | 8.3 |
| `@tilt` | `tilt:` | spec record or null | 8.4 |
| `@yield` | `yield:` | list of names or null | 6.7 |

- **PRP-36.** Engine-native declarations are not CSS and a host MUST NOT pass them to the
  style system as properties. A Level 3 implementation combines them with the rule for each
  feature. The default combination is the CSS one: for each name, the last in cascade order
  wins. Exceptions are `@animate` (all of them are kept, 7.2) and `@yield` (names accumulate,
  5.11).

## 6.9 behavior and use

```dssl
behavior focus-ring {
  outline: 2 solid color.accent
  outline-offset: 2
}

.btn { use focus-ring }
```

- **PRP-37.** A top-level `behavior name { ... }` defines a named block of declarations and
  nested blocks. A second block with the same name is the error `behavior "<n>" is defined
  twice`. Behaviors are collected before the walk, so a behavior may be used above its
  definition. `behavior` is allowed only at the top level.
- **PRP-38.** `use name` inside a block replays the behavior's children there, as if they had
  been written in that place, with the same context. An unknown name is
  `unknown behavior "<n>"` with a did-you-mean over the defined names. A behavior that uses
  itself, directly or through others, is `behavior cycle involving "<n>"`.
- **PRP-39.** The declarations of a behavior are resolved at the place they are used, so
  tokens, conditions and layers there apply to them.
