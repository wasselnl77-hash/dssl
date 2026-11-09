# 8. Effects

Effects are the parts of DSSL that CSS has no equivalent for, or only a clumsy one. Each effect
has two halves:

- a **description**: the text the author writes and the record the resolver produces from it.
  This half is fully specified here and a Level 2 implementation MUST produce the same records.
- a **rendering contract**: what a Level 4 renderer must draw. Where the contract depends on
  generator code that is not yet written down as prose, this chapter says so. Those parts are
  *defined by the reference implementation* (`public/dssl/texture.js`, `aura.js`, `slider.js`)
  until a prose definition replaces them. They are marked **Pending**.

All vocabulary tables (setting names, ranges, presets) are generated into appendix A.

## 8.1 Texture

`texture:` lays a generated image on top of an element's own background.

```dssl
.card   { background: #c9a66b; texture: wood }
.sheet  { background: linear-gradient(135deg, #ff7a00, #7a1fff); texture: grain intensity 0.6 }
.poster { background: #e9e2d0; texture: paper, scanlines intensity 0.1 }
```

**Description.**

- **FX-1.** The value is `none`, or a comma-separated list of layers. `none` writes
  `@texture: null`. An empty value is the error `texture needs a name`. Any error anywhere in
  the value drops the whole declaration.
- **FX-2.** Each layer starts with a preset name or a generator name (appendix A). Otherwise
  the error is `unknown texture "<w>"`, with a did-you-mean over presets and generators.
- **FX-3.** After the name come settings. A setting is a key from the texture settings table
  (appendix A), followed by as many values as that key takes. A key has one *kind*:
  `flag` (no value), `number`, `numbers` (several), `word` (one of a list) or `color`.
  - A number outside the key's range is the error `texture "<key>" must be between <min> and
    <max>`. A non-number is `texture setting "<key>" needs a number, got "<v>"`.
  - A word not in the list is `unknown <key> "<w>"` with a did-you-mean.
  - A missing value is `texture setting "<key>" needs a value` (or `N values`). A value that is
    itself a setting key counts as missing.
  - A color value is resolved by chapter 3 (tokens, alpha and all). A bad color drops the
    declaration.
  - An unknown key is `unknown texture setting "<key>"` with a did-you-mean.
  - A key marked *optional* (`symmetrical`) may stand alone, and then takes its first listed
    value.
- **FX-4.** A preset is a stored list of layers. Writing a preset name gives those layers.
  Settings apply to every layer of the preset, except that `color` and `color2` apply only to
  the first layer when the preset has several. A generator name gives one layer made of the
  generator's defaults.
- **FX-5.** The output is `@texture` with the list of layer records, each being the preset or
  generator layer with the author's overrides applied, and a `preset` field naming the preset
  (null for a bare generator).

**Rendering contract.**

- **FX-6.** The texture is drawn above the element's own background and below its content. The
  author's background (a color, a gradient, or several layers, written as `background` or
  `background-image`) is never replaced, and removing the texture gives back exactly the
  original.
- **FX-7.** A texture is deterministic. The same layer record, including `seed`, MUST give the
  same pixels on every machine and every engine. The tile MUST repeat without a visible seam.
  (Why: the reference implementation draws from `seed` and plain arithmetic only.)
- **FX-8.** `symmetrical` mirrors every other tile on the chosen axis (`x`, `y`, or both), so
  the pattern repeats twice as far apart and each tile edge meets its own reflection. It applies
  to textures made as images (noise, bump, rings, waves, hex) and is ignored by the pure
  pattern generators (lines, dots, grid, checker, carbon).
- **FX-9.** `animate N` steps the texture every `N` ms. It stands still when the user prefers
  reduced motion.
- **FX-10.** Colors given as tokens follow the token, including under a theme change.

**Pending.** The generators (`noise`, `bump`, `lines`, `dots`, `grid`, `checker`, `weave`,
`carbon`, `waves`, `hex`, `rings`) and the seeded random number generator are defined by
`texture.js`. A prose definition of each is the first item of the Level 4 work.

## 8.2 Aura

An aura is light and particles around an element. There are no presets. Fire, snow and sparks
are written by the author, usually as a `behavior`.

**Description.**

- **FX-11.** The properties are `aura`, `aura-glow`, `aura-particle` (and `aura-particles`),
  `glow-particle` (and `-particles`), `aura-glow-particle` (and `-particles`). They write two
  slots, `@aura-glow` and `@aura-particles`. A property that does not touch a slot leaves it
  out of its output.

  | Property | Writes |
  |---|---|
  | `aura` | both slots, as `glow ..., particles ...` clauses; it replaces both |
  | `aura-glow` | the glow slot |
  | `aura-particle(s)` | the particles slot |
  | `glow-particle(s)` | the particles slot, with every particle glowing |
  | `aura-glow-particle(s)` | both slots, with shared settings; both a glow and particles are required |

- **FX-12.** `none` clears exactly the slots the property owns (`aura-glow: none` leaves the
  particles alone). An empty value is the error `<prop> needs a value`. An empty list writes
  `null` for the slot.
- **FX-13.** A value is a comma-separated list of layers. In `aura`, each layer starts with
  `glow`, `particles` or `particle`, otherwise the error
  `an aura layer starts with glow or particles, not "<w>"`.
- **FX-14.** Inside a layer, the first color (or `->`-joined color list) and the first number
  are positional: for a glow they are the color and the radius, for particles they are the
  colors and the count. Everything else is a named setting from the glow or particle table
  (appendix A). A leftover or unknown word is an error, with a did-you-mean.
- **FX-15.** The output is `@aura-glow` and/or `@aura-particles`, each a list of layer records
  or `null`.

**Rendering contract.** (From the reference implementation. All of it is **Pending** as prose.)

- **FX-16.** The glow is drawn only outside the element's box. `behind` does the same for
  particles.
- **FX-17.** An element that is off screen, hidden, clipped away by an overflow container, or
  removed emits nothing. When no aura is active, the renderer stops its loop.
- **FX-18.** At most 1800 particles are alive across the page. When requests exceed that, every
  emitter gets a fair share.
- **FX-19.** Under reduced motion, glows stand still and particles are not emitted, unless the
  layer says `essential`.
- **FX-20.** A state block can change the aura. Leaving the state lets live particles finish,
  then the emitter goes.
- **FX-21.** `from thumb` makes particles leave a range slider's thumb at the current value.

## 8.3 Slider

`slider:` styles `<input type="range">` from one description. Without it, every engine needs
its own vendor pseudo-elements.

```dssl
input.volume {
  slider: track 6 color.line radius full, fill color.accent,
          thumb 24 color.paper, ring 3 color.accent, glow color.accent 14,
          ticks 10 color.muted
}
```

**Description.**

- **FX-22.** The value is a comma-separated list of clauses. A clause starts with one of
  `track`, `fill`, `thumb`, `shape`, `ring`, `glow`, `ticks`, `graph`, `graph-height`,
  `graph-gap`. An unknown head is `unknown slider setting "<w>"` with a did-you-mean. An empty
  value is `slider needs a description`.
- **FX-23.** Every word after a clause's head MUST be used by that clause. A leftover is the
  error `unexpected "<words>" in the <head> setting`, with a hint about the missing comma.
- **FX-24.** The default record is: track height 6, color `var(--dssl-color-line)`, radius
  `full`; fill `var(--dssl-color-accent)`; thumb size 22, color `var(--dssl-color-accent)`;
  shape `circle`; no ring, no glow, no ticks, no graph; graph height 40, graph gap 2. Clauses
  change the record in order.
- **FX-25.** Clause forms and limits are in appendix A. The notable ones: `ticks` needs a count
  of at least 2, `graph` needs 2 to 120 numbers each in 0 to 100, `graph-height` is at least 8,
  `graph-gap` is not negative.
- **FX-26.** The output is `@slider` with the record. When the rule is emitted (5.4), the
  resolver turns the record into CSS: base declarations on the element, put *first* in the rule
  so the author's own declarations in the same rule win, plus one shadow rule per vendor
  pseudo-element. That CSS is defined by `sliderCss`. **Pending.**

**Rendering contract.**

- **FX-27.** The fill and the graph bars follow the value, which CSS cannot know. The renderer
  keeps `--dssl-p` (the value as 0 to 1) up to date on the input, for typing, dragging, arrow
  keys and programmatic changes.
- **FX-28.** A native engine that styles the slider parts itself does not need the vendor
  pseudo-elements. It MUST give the same appearance as the record describes.

## 8.4 Glass and tilt

```dssl
.pane {
  glass: 18 saturate 1.6
  tilt: 10 lift 1.04 glare
}
```

**Glass (plain CSS).**

- **FX-29.** `glass: words` or `none`. `none` writes `backdrop-filter: none`. Otherwise the
  words are: a number (blur in px, default 16, not negative), `saturate N` (default 1.5),
  `bright N`, `tint <color>` or `tint none`, and a bare color word counts as a tint. A word
  that is none of these is `unknown glass setting "<w>"`. A missing number is
  `<word> needs a number`. A color is recognised as a bare tint when it starts with `#`, `rgb`,
  `hsl`, `oklch`, `oklab` or `color`, contains `/`, looks like `name.key`, or is `white`,
  `black` or `transparent`.
- **FX-30.** The output is `backdrop-filter: blur(Bpx) saturate(S)` followed by
  ` brightness(R)` when given. Then `background-color: <tint>` unless the tint is `none`, where
  the default tint is `color-mix(in srgb, currentColor 8%, transparent)`. The author's own
  `background` written after `glass:` replaces the wash.

**Tilt (needs the pointer).**

- **FX-31.** `tilt: words` or `none`. The words are a number (max degrees, 0 to 45, default 8),
  `lift N` (scale on hover, above 0), `perspective N` (px, at least 100, default 900),
  `speed N` (0.02 to 1, default 0.18), `invert` and `glare`. The record is
  `{ max, lift, perspective, speed, invert, glare }`. `none` writes `@tilt: null`. An empty value
  is `tilt needs a number of degrees`. Out-of-range values are errors that name the range.
- **FX-32.** The renderer adds, after the element's own `transform`:
  `perspective(<P>px) rotateX(var(--dssl-tx, 0deg)) rotateY(var(--dssl-ty, 0deg))
  scale(var(--dssl-ts, 1))`, and updates the three variables from the pointer, so that moving
  the pointer never triggers a restyle. With `glare`, it also keeps `--dssl-gx` and
  `--dssl-gy` (0% to 100%) pointing at the pointer.
- **FX-33.** Tilt ignores touch, stays flat under reduced motion, and stops when the page is
  frozen. It combines with `translate`, `scale` and `rotate`. It does not combine with `bend`
  or `fold`, because both write `transform`.

## 8.5 Deform

`bend`, `bend-y`, `bend-up`, `fold`, `stretch` and `bend-around` deform an element, or for
`bend-around` its children.

- **FX-34.** `bend`, `bend-y`, `bend-up`, `fold` take a bare number of degrees (or `Ndeg`).
  Anything else is `<name> takes a bare number of degrees`. They write `@bend`, `@bend-y`,
  `@bend-up`, `@fold` with the number.
- **FX-35.** `stretch: F [horizontal|vertical|x|y]` with `F` above 0. It writes `@stretch`
  `{ factor, axis }`, axis default `horizontal`. A bad value is
  `stretch needs a positive factor, ...`; `F <= 0` is `stretch: F would flatten the element to
  nothing`.
- **FX-36.** `bend-around: D` is a bare number of degrees between -170 and 170, otherwise
  `bend-around caps at ±170° ...`. It writes `@bend-around`.
- **FX-37.** *Composition.* The deform parts of an element combine into one transform string,
  in this order, followed by the element's own transform (when it is not `none`). `d` is the
  record of numbers, `h` the element height in px (0 when there is no box yet):
  1. if any of bend, bend-y, fold, bend-up is non-zero: `perspective(900px)`;
  2. if bend: `rotateX(<bend>deg)`; if bend-y: `rotateY(<bend-y>deg)`;
  3. if fold: with `h > 0`: `translateY(<-h/2>px) rotateX(<fold>deg) translateY(<h/2>px)`;
     without a box: `rotateX(<fold>deg)` and the origin `50% 0%`;
  4. if bend-up: with `h > 0`: `translateY(<h/2>px) rotateX(<up>deg) translateY(<-h/2>px)`;
     without a box: `rotateX(<up>deg)` and the origin `50% 100%`;
  5. if stretch is set and not 1: for the horizontal axis
     `scaleX(<f>) scaleY(<1/f rounded to 4 places>)`, for vertical
     `scaleY(<f>) scaleX(<1/f>)`.

  Translations are rounded to 2 decimal places. The result is `none` when there are no parts.
  In keyframes (7.1) there is no box, so the second form of fold and bend-up is used.
- **FX-38.** *Arc layout.* `bend-around: D` lays `n` children along an arc. It does nothing
  when `n < 2`, the container has no width, or `|D|` is too small (`sin(|D|/2) < 0.0001`).
  Otherwise let `half = |D|/2` in radians, `R = round2((width/2) / sin(half))`, and the angle of
  child `i` (from 0) is `round2(-D/2 + D*i/(n-1))` degrees. `round2(v)` is
  `round(v * 100) / 100`. A positive `D` makes a dome, negative a smile.

## 8.6 Overlap

- **FX-39.** `overlap: allow|none|deny|auto`. It writes `@overlap` with `allow` (for `none` too),
  `deny` or `auto`. Anything else is `unknown overlap policy "<v>"`. The value inherits down the
  tree.
- **FX-40.** `deny`: the element yields out of any overlap with other elements. `auto`: it
  yields only while its opacity is below 100%. `allow` is the default. How an element yields is
  defined by the reference engine's `overlapNudge`. **Pending.**

## 8.7 Fonts

`fonts { }` loads fonts. A font is a stylesheet link or an `@font-face`, and neither belongs
in a rule, so it has its own block.

```dssl
fonts {
  Fraunces: 500 700 800
  "Hanken Grotesk": 400 700 italic
  Inter: 100..900 display optional
  Brand: from "/fonts/brand.woff2" 400
}
```

- **FX-41.** The body is verbatim text (2.7). Block comments are blanked, and a `//` comment
  that starts a line or follows white space is removed. Each remaining line has a trailing `;`
  removed and is `Family: words`. The family is everything before the first colon outside
  quotes, unquoted, with runs of white space collapsed to one space. A line with no colon is
  `expected "Family: weights" in "<text>"`.
- **FX-42.** The words are: weights (`400`, or a range `100..900`, each from 1 to 1000, a range
  rising), `italic`, `display <swap|block|fallback|optional|auto>`, `from "<file>"`. Anything
  else is `unknown font setting "<w>"`.
- **FX-43.** Without `from`, the font is from Google Fonts. All Google families together make
  one link:
  `https://fonts.googleapis.com/css2?family=<parts>&display=<d>` where each part is
  `Name:wght@400;700` (sorted by number, spaces in the name as `+`), or `Name:ital,wght@0,400;
  0,700;1,400;1,700` with italics (all weights, upright first), or `Name` alone for no weights,
  or `Name:ital@0;1` for italics with no weights. The `display` is the last one given on any
  Google line, default `swap`. The link records the line of the `fonts` block.
- **FX-44.** With `from`, the line makes an `@font-face` block (as a `raw` entry, so it goes into
  the page stylesheet) with `font-family`, `src: url("<file>")` plus `format("woff2"|"woff"|
  "truetype"|"opentype")` by extension, `font-weight` (a range written with a space),
  `font-style` and `font-display` (default `swap`). A `from` line takes at most one weight.
- **FX-45.** Google's servers see every visitor who loads one of their fonts. Authors who need
  to avoid that use `from`.
