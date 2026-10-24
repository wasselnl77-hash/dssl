# DSSL Guide

Everything in the repo, in one file. Written for the person who just cloned this
and wants to know what exists, what works, and what to reach for. Every `.dssl`
example in this guide is compiled by `scripts/test-guide-examples.mjs` on every
release, so the examples cannot drift from the compiler. If an example here
stops compiling, that is a release blocker, not a docs bug.

Status up front: DSSL is a real, tested style engine at v0.9.0, and it is
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

Each place word owns an axis (v0.8.0, the example above used to silently
lose the `between` because every word wrote both axes):

- `between`, `around`, `evenly` are main-axis words (`justify-content`)
- `stretch`, `baseline` are cross-axis words (`align-items`)
- `center`, `start`, `end` fill whichever axes are still free

One distribution word + one alignment word is the whole grammar. A word
whose axes are already taken warns loudly ("has nowhere to go") instead of
overwriting, and a word written twice warns too.

### Sizing that moves: fluid

`font-size: fluid 16 24` (and any length-ish property: width, height, gap,
padding, margin, their `-top` / `-bottom` / `-inline` / `-block` longhands,
letter-spacing and border-radius) makes a size that grows smoothly with the window.
It is 16px on a 360px wide screen, 24px on a 1200px wide one, and in between it
slides along a straight line. Past either end it stays put.

```dssl
h1 { font-size: fluid 28 44 }          // 28px on a small phone, 44px on a big desktop
.stack { gap: fluid 8 16 }             // works on any length property
.hero { font-size: fluid 16 24 400 800 }   // your own viewport range
.old { fluid: 16, 24 }                 // the comma form still works
```

What you get at a few window widths for `fluid 16 24`:

| window | 360 | 375 | 600 | 800 | 1200 |
|---|---|---|---|---|---|
| size | 16px | 16.1px | 18.3px | 20.2px | 24px |

A few things worth knowing:

- `padding: fluid 8 16` sets all four sides. To make just one side fluid, use the
  longhand: `padding-top: fluid 36 80`. (0.8.1 had no way to say that.)
- Sizes can be px (bare numbers are px), rem or em. Both sizes need the same unit.
- Percentages are refused with an error, because a percentage cannot follow the
  window width.
- Going down works too: `fluid 24 16` shrinks as the window grows.
- If you used `fluid` in 0.8.0, your text will be a little smaller on phones and
  tablets after updating. That is the fix, not a regression. 0.8.0 had the
  right slope but forgot where the line starts, so sizes ran ahead of the
  window and hit their maximum around 840px instead of 1200px.

### raw { }: the escape hatch

DSSL has no sugar for `@font-face`, `@keyframes`, `@supports`, `@import` or
`@property` yet. `raw { }` (alias `@css { }`) drops verbatim CSS into the
page stylesheet, top-level only:

```dssl
raw {
  @font-face {
    font-family: Inter;
    src: url(/fonts/inter.woff2);
  }
}
```

One thing to remember: inside `raw { }` you are writing real CSS, so semicolons
are required there, unlike everywhere else in DSSL. If you leave one out, the
browser would quietly throw the whole rule away. DSSL cannot fix that for you
(the text is passed through untouched on purpose), but it does warn you with the
line number:

```
styles.dssl:3 warning: raw { } is verbatim CSS, so this line needs a ";" at the end
```

Unknown at-rules outside `raw { }` are skipped whole, with one clean error
and a pointer here, they never leak their inner rules (that was a real
0.7.2 bug: `@supports (display:grid) { .a { … } }` applied `.a` everywhere
after erroring).

### The cascade is (layer, order)

(This holds across stylesheets too: a sheet loaded later beats one loaded before it.
Versions up to 0.8.1 got that wrong. Each sheet counted its own rules from zero and
the engine compared those numbers across sheets, so a later sheet could lose just
because the earlier one was longer. 0.8.2 gives every rule one position in load
order.)

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

### Texture

`texture:` lays a generated image on top of whatever background an element already
has. It works over a plain colour, over a gradient, or over several layers, written
as `background:` or as `background-image:`. The author's own background is never
replaced, and taking the texture away puts it back exactly as it was.

```dssl
.card   { background: #c9a66b; texture: wood }
.sheet  { background: linear-gradient(135deg, #ff7a00, #7a1fff); texture: grain intensity 0.6 }
.poster { background: #e9e2d0; texture: paper, scanlines intensity 0.1 }   // a comma stacks layers
```

There are 30 presets. They are not magic: each one is a stored combination of a few
generators (`noise`, `bump`, `lines`, `dots`, `grid`, `checker`, `weave`, `carbon`, `waves`, `hex`) and the settings below, so anything a preset does you
can write yourself.

| preset | what it looks like |
|---|---|
| `grain` | fine film grain, neutral on any colour |
| `noise` | coarser static |
| `rough` | gritty relief, like a rough cast wall |
| `sand` | warm fine sand grains |
| `paper` | soft paper fibre with a little unevenness |
| `cloud` | big soft cloudy variation |
| `concrete` | pitted concrete |
| `stone` | carved stone with broad relief |
| `crumpled` | crumpled foil or paper, big creases |
| `glitter` | sparse bright sparkles |
| `frost` | fine icy crystals |
| `marble` | veined marble |
| `wood` | long wood grain, along x (use angle 90 for vertical) |
| `bark` | rough vertical bark |
| `leather` | pebbled leather |
| `brushed` | brushed metal, fine lines along x |
| `canvas` | artist canvas weave |
| `linen` | loose linen weave with slubs |
| `denim` | diagonal twill, blue by default |
| `carbon` | carbon fibre twill |
| `scanlines` | CRT scanlines |
| `halftone` | newsprint dots |
| `dots` | a plain dot grid |
| `lines` | diagonal hairlines |
| `grid` | a square grid, like graph paper |
| `checker` | checkerboard |
| `crosshatch` | crossed hairlines |
| `stripes` | bold diagonal stripes |
| `waves` | soft repeating waves |
| `hex` | honeycomb |

Settings go after the name, in any order. Only write the ones you want to change.

| setting | what it does |
|---|---|
| `scale n` | feature size in px: how big the grains, cells or lines are |
| `intensity n` | how strong the layer is, 0 to 1 (more than 1 over-drives it) |
| `contrast n` | noise contrast: 1 is as generated, higher is harsher |
| `threshold n` | noise cut-off: only values above it show (glitter uses a high one) |
| `contour n` | draw thin lines where the noise crosses the threshold, instead of a plain cut: veins, rings, contours |
| `octaves n` | noise detail layers, 1 is smooth, 5 is rough |
| `seed n` | a different random pattern with the same look |
| `stretch x y` | stretch noise features along x and y, e.g. stretch 40 1 for wood grain |
| `depth n` | bump height: how deep the relief looks |
| `light n` | bump light direction in degrees |
| `angle n` | direction of lines and patterns, in degrees |
| `thickness n` | line or grid-line width in px |
| `radius n` | dot size as a fraction of the cell |
| `softness n` | how soft the edges of dots and lines are |
| `animate n` | milliseconds per shimmer step (film-grain flicker); 0 is still |
| `type n` | noise flavour: fractal is clouds, turbulence is veins |
| `blend n` | how the layer mixes with what is under it |
| `color color` | the main colour (dark end of noise, ink of lines and dots) |
| `color2 color` | the second colour (light end of noise, background cell of patterns) |
| `invert` | swap the two colours |

Make your own from a bare generator, and name it with a `behavior` so it is one word
everywhere you use it:

```dssl
behavior old-leather {
  texture: bump scale 6 depth 4 octaves 3 color #1b1008 color2 #6b4a2b blend overlay
}

.sofa   { background: #5a3a22; use old-leather }
.marble { background: #f4f1ea; texture: noise scale 120 octaves 5 contour 0.04 color #6c6877 color2 #f4f1ea blend multiply }
```

A few things worth knowing:

- Colours can be tokens: `texture: noise color color.ink color2 color.paper`. They follow the
  token when it changes, in light and dark mode too.
- `animate 90` makes film-grain shimmer by stepping the texture every 90 ms. It stands still
  for visitors who ask for reduced motion, and `DSSL.freeze()` stops it.
- Textures are SVG filters and gradients, drawn once and cached. A page full of them is cheap.
- `texture` is an engine feature, so `dssl build` leaves it in the runtime and says so in its report.
- Inside an aura, `texture(grain)` makes the light and the particles grainy. See below.

### Aura

An aura is light and particles around an element. **There are no presets.** Fire, an
energy aura, snow and sparks are all just parameters, and you name your own with a
`behavior`. That is the point: you get the knobs, not someone else's idea of fire.

An aura has two kinds of layer, and each kind lives in its own slot, so rules stack
through the cascade like anything else:

| property | what it sets |
|---|---|
| `aura-glow` | the glow slot: a soft light around the element |
| `aura-particle` (or `aura-particles`) | the particles slot |
| `glow-particle` (or `glow-particles`) | the particles slot, every particle glowing |
| `aura-glow-particle` (or `-particles`) | both slots at once, settings shared |
| `aura` | both slots, written as `glow ..., particles ...`; it replaces whatever was there |

`aura-glow: none` clears only the glow. `aura: none` clears both.

```dssl
.orb { aura-glow: color.accent 28 pulse 1600 }                                  // colour, then radius
.hot { aura-particle: #ffd24a -> #ff6a00 -> rgba(255,40,0,0) 60 up from top }   // colour stops, count, direction
.big { aura: glow #ff7a00 30 flicker 0.3, particles #fd0 count 60 shape flame glowing behind }
```

The first colour and number are positional (a glow's colour and radius, a particle's
colours and count); everything else is a named setting. Colour stops are joined with
`->` and blend along a particle's life. Give one colour and it simply fades out.

**Glow settings**

| setting | what it does |
|---|---|
| `color` | the light colour (default: the element's text colour) |
| `radius` | how far the glow reaches, in px |
| `intensity` | brightness, 1 is normal |
| `pulse` | milliseconds for one breath in and out; 0 is steady |
| `depth` | how deep the pulse goes, 0 to 1 |
| `flicker` | random flicker, like a flame: 0 is steady, 1 is wild |
| `seed` | a different random flicker with the same look |
| `texture` | texture(grain scale 2): break the light up with a texture |
| `essential` | keep animating even when the visitor prefers reduced motion |

**Particle settings**

| setting | what it does |
|---|---|
| `color` | colours over a particle's life: color #ff0 -> #f60 -> transparent |
| `count` | how many particles are alive at once |
| `size` | diameter in px: size 4, or size 10 4 (start and end of a random range) |
| `life` | how long one lives, in ms: life 900, or life 600 1200 |
| `speed` | px per second: speed 60, or speed 30 90 |
| `dir` | where they head: up, down, left, right, out, in, or degrees (-90 is up) |
| `spread` | how wide the fan of directions is, in degrees |
| `gravity` | px/s squared; negative pulls up (flames), positive down (snow) |
| `drag` | air resistance: how fast particles slow down |
| `turbulence` | random sideways wobble, px/s |
| `from` | where they are born: edge, bottom, top, left, right, center, corners, thumb (range sliders) |
| `shape` | circle, spark, square, ring, star, flame, smoke or line |
| `grow` | size at the end of life as a multiple of the start: 0.2 shrinks, 3 swells |
| `blend` | add makes overlapping particles brighter, normal just stacks them |
| `glowing` | soft glowing particles that add light |
| `behind` | draw only outside the element's box, as if the element hid them |
| `seed` | a different random pattern with the same look |
| `texture` | texture(grain): grainy particles |
| `essential` | keep animating even when the visitor prefers reduced motion |

Here are five, written the way you would write your own. These are recipes, not built-ins:
copy one, change it, rename it.

```dssl
behavior fire {
  aura-glow: #ff7a00 36 pulse 900 flicker 0.35
  aura-particle: #ffe27a -> #ff8a1f -> rgba(255,40,0,0) count 70 size 8 18 life 650 1100 speed 40 120 dir up spread 40 from top gravity -40 turbulence 70 shape flame glowing behind
}

behavior ki {
  aura-glow: #ffe14a 50 pulse 700 depth 0.45 flicker 0.15
  aura-particle: #fff7b0 -> #ffd21f -> rgba(255,180,0,0) count 90 size 4 12 life 500 900 speed 90 220 dir up spread 55 from edge gravity -120 turbulence 120 shape spark glowing behind
}

behavior embers {
  aura-glow: #ff5a1f 22 pulse 2200 flicker 0.2
  aura-particle: #ffb347 -> #ff4d00 -> rgba(120,10,0,0) count 36 size 2 5 life 1800 3200 speed 20 60 dir up spread 70 from bottom gravity -10 drag 0.4 turbulence 30 shape circle glowing
}

behavior electric {
  aura-glow: #6cf 26 flicker 0.85 pulse 260
  aura-particle: #d8f1ff -> #4db8ff -> rgba(77,184,255,0) count 36 size 3 7 life 140 320 speed 120 320 dir out spread 360 from edge shape spark glowing
}

behavior snow {
  aura-particle: #ffffff -> rgba(210,235,255,0) count 90 size 2 6 life 2600 4200 speed 14 42 dir down spread 40 from top turbulence 22 shape circle
}

.torch  { use fire }
.hero   { use ki; hover { use electric } }
```

Because they are plain declarations, you can change one thing about a recipe at the use site:

```dssl
behavior fire { aura-glow: #ff7a00 36 pulse 900 flicker 0.35 }   // (the full recipe is above)

.blue-fire { use fire; aura-glow: #3a7bff 36 pulse 900 flicker 0.35 }
```

How it behaves:

- **Where it draws.** One transparent canvas covers the page, above everything, and never catches
  the pointer. The glow is drawn only outside the element. `behind` does the same for a particle layer,
  so flames can lick out from behind a box instead of crossing its face.
- **It only works when it can be seen.** Elements that are off screen, hidden, scrolled out of an
  overflow container or removed from the page emit nothing. When the last aura goes, the loop stops.
- **Budget.** At most 1800 particles are alive across the page. If everyone asks for more, everyone
  gets a fair share. Glows are drawn once and re-lit each frame, so 40 pulsing glows cost under a millisecond.
- **Reduced motion.** Visitors who ask for it get a still glow and no particles. Add `essential` to a
  layer that must keep moving anyway.
- **States.** `hover { aura-particle: ... }` works. Moving away lets what is alive finish, then the emitter goes.
- **Tokens.** Colours written as tokens follow them, so an aura can retint with the theme.
- **Sliders.** `from thumb` makes particles leave a range slider's thumb, wherever the value is.
- **Textures.** `texture(grain scale 2)` inside a layer breaks the light or the particles up with a texture.
- **Freeze.** `DSSL.freeze()` stops every aura and `unfreeze()` brings them back.
- **Not for no-JavaScript.** Aura is a canvas, so `dssl build` leaves it in the runtime and says so.
  Light-coloured glows look like paint on a light page, because they add light rather than darkness.

### Range sliders

A range input is styled through vendor pseudo-elements, and every engine has its own set:
`::-webkit-slider-runnable-track` and `::-webkit-slider-thumb` for Chrome, Edge, Safari and Opera,
`::-moz-range-track`, `::-moz-range-thumb` and `::-moz-range-progress` for Firefox. Writing both
by hand is the chore. `slider:` writes both from one description.

```dssl
input.volume {
  slider: track 6 color.line radius full, fill color.accent,
          thumb 24 color.paper, ring 3 color.accent, glow color.accent 14,
          ticks 10 color.muted
}
```

| setting | form |
|---|---|
| `track` | `track [height] [color] [radius <n>|full]` |
| `fill` | `fill <color> | fill none` |
| `thumb` | `thumb <size> [color]` |
| `shape` | `shape circle | square | diamond | pill | bar` |
| `ring` | `ring <width> <color>` |
| `glow` | `glow <color> <radius>` |
| `ticks` | `ticks <count> [color] [length]` |
| `graph` | `graph <v1> <v2> ... (each 0 to 100)` |
| `graph-height` | `graph-height <px>` |
| `graph-gap` | `graph-gap <px>` |

A histogram slider puts bars behind the track. They colour themselves as the value passes them:

```dssl
input.price {
  slider: graph 20 45 70 90 60 35 50 80 95 40 60 75, graph-height 52, graph-gap 3,
          fill #77ccff, track 3 #34445a, thumb 14 #fff, shape bar
}
```

Clauses are separated by commas. A leftover word is an error, not noise: `thumb 16 #fff shape bar`
is rejected with a reminder about the missing comma.

The fill and the bars follow the value, which CSS cannot know, so the engine keeps `--dssl-p` (the value
as 0 to 1) up to date on the input. Typing, dragging and arrow keys all update it. If you set
`input.value` from JavaScript, call `DSSL.refresh()` (or dispatch an `input` event) to repaint.
The WebKit and Blink rules are tested in Chrome. The Firefox rules are written alongside them but
have not been run in Firefox yet.

### Glass and tilt

`glass:` frosts whatever is behind an element. `tilt:` turns an element toward the pointer in 3D.
Both work on any element.

```dssl
.pane {
  glass: 18 saturate 1.6            // blur what is behind it
  tilt: 10 lift 1.04 glare          // follow the pointer
  border: 1 solid white/35
  background-image: radial-gradient(circle at var(--dssl-gx, 50%) var(--dssl-gy, 50%), white/28, transparent 55%)
}
```

`glass` writes a `backdrop-filter` and a faint wash of the text colour (so it works on light and dark
pages). It is plain CSS, so `dssl build` keeps it. Settings: a blur number, `saturate <n>`,
`bright <n>`, `tint <color>` or `tint none`, and a bare colour also counts as the tint. Write your own
`background` after it to replace the wash. `glass: none` clears it.

`tilt` is runtime only. The engine adds `perspective(...) rotateX() rotateY() scale()` after whatever
`transform` you wrote, driven by custom properties, so moving the mouse never restyles anything.
Settings: a number of degrees (0 to 45, default 8), `lift <n>` (scale while hovered),
`perspective <px>` (default 900), `speed <0.02 to 1>` (default 0.18), `invert`, and `glare`, which also
keeps `--dssl-gx` and `--dssl-gy` (0% to 100%) pointing at the pointer so you can draw a shine.
It ignores touch, stays flat under reduced motion, stops while the page is frozen, and combines with
`translate`, `scale` and `rotate`, but not with `bend` or `fold` (they also write the transform).

Also new in 0.10.0: alpha on a named colour works. `white/12` used to compile to `white/12px`, which
the browser dropped with no error. It now becomes a real colour, like tokens and hex always did.

### Warnings that help (lint)

Some things compile, run, and are still wrong for the people using the page. DSSL warns about three.
Warnings never stop a build unless you ask for `dssl check --strict`.

- **Contrast.** A text colour and a background written in the same rule are compared. Under 4.5:1
  (3:1 for large text) is flagged, with the numbers. Tokens, token alpha and `color-mix` are followed.
  Rules inside `@media` or `@signal` are skipped, because they might be the dark theme.
- **Focus.** `outline: none` on a link, button or input with no `focus-visible` block to replace it
  leaves keyboard users lost.
- **Target size.** A button or link with an explicit width or height under 24px.

The linter found four real contrast failures in this site's own stylesheets the day it was written.

### Importing CSS

```sh
node cli/dssl.mjs import styles.css -o styles.dssl
```

It converts what is mechanical and reports what is not: semicolons go, pixel lengths become bare
numbers (except where a bare number would change the meaning, like `line-height: 24px`),
`transition: color .2s ease` becomes `transition: 200 ease color`, `font:` becomes its longhands
(DSSL's own `font:` means something else), `@keyframes` becomes a `motion`, `!important` moves into
`pin { }`, and `@font-face`, `@supports`, `@import` and friends go into one `raw { }` block. A property DSSL
does not know, or a value its stricter checker rejects (`scroll-snap-type: x mandatory`), is commented out
and listed, so the file you get always compiles.


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

1. VSCodium: open the Extensions tab, search "DSSL" and install. It is on Open VSX:
   https://open-vsx.org/extension/ehs-studio/dssl-vscode
2. VS Code: download `dssl-vscode/dssl-vscode-0.10.0.vsix` from the repo files, then
   Extensions panel, `...`, Install from VSIX. (The Microsoft Marketplace listing is not published yet.)
3. Build it yourself: `cd dssl-vscode && npx @vscode/vsce package --no-dependencies`.

What it does: real-compiler diagnostics (same errors the browser prints,
did-you-mean included), completions folded from your workspace token registry,
hover docs, and a TextMate grammar for `.dssl`. Since 0.9.0 it also completes and
explains the new vocabulary: after `texture:` it offers the 30 presets and every
setting, after `aura-glow:` only glow settings, after `aura-particle:` only particle
ones, after `slider:` the clauses.

### The designer

The interactive part of DSSL lives in the editor, not on the website. Run **DSSL: Open the designer**
from the command palette (or the paint-can button on a `.dssl` tab):

- **Aura tab.** Sliders and pickers for every glow and particle setting, with colour stops you can add
  and remove, a live preview drawn by the same renderer the engine uses (on dark, light or slate),
  a graph of one particle's opacity and size over its life, and a live graph of particles alive and
  frame time.
- **Texture tab.** All 30 presets and 10 generators as thumbnails, up to four stacked layers, every
  setting as a slider, colour pickers, a preview over the colour you choose.
- **Slider tab.** A live range input styled with the generated rules, with a bar editor for histogram sliders.

Every tab writes the DSSL for you in a box at the bottom and checks it with the real compiler as you go
(`compiles`, or the error). **Insert at cursor** puts it in your file (indented to match the line, and
replacing a selection if you have one). **Load from selection** reads an existing `aura-glow:`,
`texture:` or `slider:` declaration back into the controls, so you can tune what you already wrote.
A colour written as a token cannot go on a colour picker, so it is replaced by a default and the panel says so.

There is also **DSSL: Convert a CSS file to DSSL** (right-click a `.css` file), which runs the importer
described in the chapter above and shows what it could not carry over.

### The exit lane: dssl check + dssl build

v0.8.0 answers the honest limits below without giving up the language:

```sh
node cli/dssl.mjs check styles.dssl --strict   # CI: real compiler, exit 1 on errors, --json
node cli/dssl.mjs build styles.dssl -o styles.css
node cli/dssl.mjs build styles.dssl -o styles.css --strict   # CI: warnings fail the build too
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
npm test                          # everything: every suite below, in one report (needs Chrome)
npm run test:fast                 # the same without the browser suites
node cli/dssl.mjs check public/styles/*.dssl   # compile everything, exit code for CI (--strict, --json)
node cli/dssl.mjs build styles.dssl -o styles.css   # the static subset as real CSS
node cli/dssl.mjs import styles.css -o styles.dssl  # CSS to DSSL, with a report
```

The browser suites drive a real Chrome or Chromium through `playwright-core` (no browser download).
They look for one in the usual places; set `DSSL_CHROME` to point at another.

```sh
node scripts/test-v090.mjs              # 0.9.0 pure logic: colour, texture, aura, slider, lint, import, share links
node scripts/test-browser-v090.mjs      # 0.9.0 in Chrome: pixels, lifecycle, reduced motion, stress
node scripts/test-v0100.mjs             # 0.10.0: glass, tilt, named-colour alpha, playground examples, HTML filter
node scripts/test-designer.mjs          # the designer's state to DSSL and back, plus a random sweep
node scripts/test-designer-browser.mjs  # the designer panel, driven like a person would
node scripts/test-designer-host.mjs     # the extension's wiring, against a fake of the editor API
node scripts/test-v082.mjs              # 0.8.2: one cascade across stylesheets, fluid longhands
node scripts/test-v081.mjs              # 0.8.1: fluid math, raw blocks, packaged CLI
node scripts/test-v073.mjs              # 0.8.0: the exit lane
node scripts/test-guide-examples.mjs    # every guide example compiles
node scripts/test-guide-browser.mjs     # the original guide examples asserted in Chrome
node scripts/test-v072.mjs  test-v071.mjs  test-v070.mjs  test-v060.mjs  test-v050.mjs   # earlier releases
node scripts/dssl-styles-check.mjs      # the site's own stylesheets compile
node scripts/texture-gallery.mjs out.png    # render every texture preset to a picture
node scripts/sync-extension-engine.mjs  # run after ANY engine change
bash scripts/build-engine-package.sh    # rebuild the zip and tarball
```

House rule from AGENTS.md: if you touch `public/dssl/`, run the suites, then
run the sync script so the editor extension ships the same compiler.

## 7. Honest limits

Read this before choosing DSSL for a real site.

- **JavaScript is required** for the live engine. No JS, no styles at runtime.
  v0.8.0 adds the exit lane: `dssl build styles.dssl -o styles.css` compiles
  the static subset to a real stylesheet you can `<link>` instead of the
  engine, tokens as custom properties, states as `:hover`, layers as
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
  DSSL wants `unsafe-inline` for styles today, or use the `dssl build`
  output, which is a normal external stylesheet and CSP-clean.
- **Interop is invasive.** DSSL normal declarations beat external CSS, and
  `pin` beats external `!important`. Mixing with an existing CSS design
  system works but the engine wins by design.
- **Large interactive pages** pay a real per-recompute cost. `freeze()`
  makes static pages viable; live hover on thousands of elements is bounded
  since v0.7.2 but is still not free.
- **Aura and texture need the engine.** Both are engine features, so `dssl build` leaves them in
  the runtime and its report names them. A page that must work without JavaScript simply does not
  get its aura or texture; everything else it styled still arrives as real CSS.
- **Aura is a canvas over the page.** It is not clipped by an ancestor's `overflow`, particles of
  an element scrolled partly out of a scroll box are cut only by the box's visibility check, and a
  light-coloured glow on a light page looks like paint because it adds light.
- **Sliders are tested in Chrome.** The `::-moz-range-*` rules for Firefox are generated but nobody
  has run them in Firefox yet. Vertical sliders and right-to-left layouts are not styled specially.
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
