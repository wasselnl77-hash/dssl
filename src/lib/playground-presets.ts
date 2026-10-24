/* The playground's starting points. Each one is a stylesheet and, when it needs different
 * markup than the default cards, its own HTML for the canvas. */

export type Preset = { label: string; src: string; html?: string; buttons?: "signal" | "replay" };

export const DEFAULT_HTML = `<p class="pg-canvas-title">canvas: your dssl styles this</p>
<div class="pc-board">
  <article class="pc-card"><span class="pc-badge">one</span><h4 class="pc-title">Styled live</h4><p class="pc-text">Everything on the left is applied to this canvas by the DSSL engine, scoped, so the rest of the site is untouched.</p></article>
  <article class="pc-card"><span class="pc-badge">two</span><h4 class="pc-title">Tokens &amp; states</h4><p class="pc-text">Use color.*, space.*, radius.*, or define your own. Hover states work right here.</p></article>
  <article class="pc-card"><span class="pc-badge">three</span><h4 class="pc-title">Loud errors</h4><p class="pc-text">Misspell a token and the panel below explains what it thinks you meant.</p></article>
</div>`;

export const PRESETS: Record<string, Preset> = {
  cards: {
    label: "Cards",
    src: `// style the canvas, bare numbers are px,
// bare identifiers are tokens
tokens {
  color {
    hotspot: oklch(0.5 0.15 50)
  }
}

.pc-board {
  grid: auto-fill 190
  gap: space.4
  width: 100%
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  shadow: sm
  column: gap 8
  transition: 180

  hover {
    translate: 0 -4
    shadow: lg
    border-color: color.hotspot/45

    .pc-badge {
      background: color.hotspot
      color: color.accent-ink
    }
  }
}

.pc-badge {
  align-self: start
  font-family: font.mono
  font-size: 11
  background: color.accent/12
  color: color.ink
  padding: 3 9
  radius: full
  transition: 180
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13; line-height: 1.55 }

.pc-btn {
  padding: 8 14
  radius: sm
  background: color.ink
  color: color.paper
  font-size: 13
  font-weight: 600

  hover { translate: 0 -2 }
  active { translate: 0 0 }
}`,
  },
  tokens: {
    label: "Tokens",
    src: `// tokens compile to custom properties on the
// canvas element, try flipping these
tokens {
  color {
    pop: oklch(0.65 0.19 300)
    calm: oklch(0.68 0.13 190)
  }
  radius { md: 18 }
}

.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border-top: 4 solid color.pop
  radius: md
  padding: space.4
  column: gap 8
  shadow: sm
}

.pc-card:nth-child(2) {
  border-top-color: color.calm
}

.pc-card:nth-child(3) {
  border-top-color: color.pop/55
}

.pc-badge {
  background: color.pop/12
  color: color.ink
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }`,
  },
  motion: {
    label: "Motion",
    src: `// declare once, animate anywhere.
// reduced-motion users: this all politely
// does nothing unless marked essential
motion float {
  from {
    opacity: 0
    translate: 0 18
    scale: 0.94
  }
}

motion shimmer {
  at 0   { translate: 0 0 }
  at 50  { translate: 0 -10 }
  at 100 { translate: 0 0 }
}

.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  column: gap 8
  animate: float 600 snap both

  hover { shadow: lg; translate: 0 -4 }
}

.pc-card:nth-child(2) { animate: float 600 snap 150 both }
.pc-card:nth-child(3) { animate: float 600 snap 300 both }

.pc-badge {
  background: color.accent/12
  color: color.ink
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }

// press "replay" above to re-run the motion`,
  },
  signals: {
    label: "Signals",
    src: `// press the button in the canvas,
// DSSL.signal('pgdemo', 'hot') re-styles live
.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  column: gap 8
  transition: 250
}

@signal pgdemo == hot {
  .pc-card {
    background: color.accent
    border-color: color.accent
    color: color.accent-ink
    translate: 0 -3
    shadow: lg

    .pc-text { color: color.accent-ink/80 }
    .pc-badge {
      background: color.accent-ink/20
      color: color.accent-ink
    }
  }
}

.pc-badge {
  background: color.accent/12
  color: color.ink
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }`,
  },
  errors: {
    label: "Errors",
    src: `// this preset fails on purpose,
// read the panel below the editor
.pc-card {
  backgroud: color.card       // typo
  radius: md
  padding: space.4
  colr: color.ink             // typo
  shadow: color.acnt          // unknown token
}

.pc-title {
  font-weight: 700
  bananify: 12                // unknown property
}`,
  },
  aura: {
    label: "Aura: fire and ki",
    src: `// an aura has no presets. You write it, name it with
// behavior, and use it anywhere. Edit the numbers.
behavior fire {
  aura-glow: #ff7a00 36 pulse 900 flicker 0.35
  aura-particle: #ffe27a -> #ff8a1f -> rgba(255,40,0,0) count 70 size 8 18 life 650 1100 speed 40 120 dir up spread 40 from top gravity -40 turbulence 70 shape flame glowing behind
}

behavior ki {
  aura-glow: #ffe14a 50 pulse 700 depth 0.45 flicker 0.15
  aura-particle: #fff7b0 -> #ffd21f -> rgba(255,180,0,0) count 90 size 4 12 life 500 900 speed 90 220 dir up spread 55 from edge gravity -120 turbulence 120 shape spark glowing behind
}

behavior electric {
  aura-glow: #6cf 26 flicker 0.85 pulse 260
  aura-particle: #d8f1ff -> #4db8ff -> rgba(77,184,255,0) count 36 size 3 7 life 140 320 speed 120 320 dir out spread 360 from edge shape spark glowing
}

.stage {
  grid: auto-fit 140
  gap: 52
  padding: 60 20 40
  background: #0b0a12
  radius: lg
}

.orb {
  height: 90
  radius: lg
  background: #1c1a28
  color: #d9d4e6
  display: grid
  place-items: center
  font-size: 14
}

.fire { use fire }
.ki { use ki }
.electric { use electric }`,
    html: `<div class="stage">
  <div class="orb fire">fire</div>
  <div class="orb ki">ki</div>
  <div class="orb electric">electric</div>
</div>`,
  },
  textures: {
    label: "Textures",
    src: `// one word is a texture. Settings go after it, in any order.
// 30 presets exist; this wall shows a few and a custom one.
.wall {
  grid: auto-fill 130
  gap: 14
}

.sw {
  height: 84
  radius: md
  background-color: #b8a58a
  color: #1b1408
  padding: 8
  display: grid
  place-items: end start
  font-size: 12
}

.s1 { texture: grain }
.s2 { texture: marble }
.s3 { texture: wood }
.s4 { texture: carbon; color: white }
.s5 { texture: halftone }
.s6 { texture: hex }

// your own: pick a generator, then tune it
.custom {
  background-color: #1b2a3a
  texture: noise scale 3 intensity 0.9 contrast 1.5 color #8fd3ff
}

// stack several with commas
.stack { texture: grain, scanlines }`,
    html: `<div class="wall">
  <div class="sw s1">grain</div>
  <div class="sw s2">marble</div>
  <div class="sw s3">wood</div>
  <div class="sw s4">carbon</div>
  <div class="sw s5">halftone</div>
  <div class="sw s6">hex</div>
  <div class="sw custom">noise, tuned</div>
  <div class="sw stack">grain, scanlines</div>
</div>`,
  },
  sliders: {
    label: "Range sliders",
    src: `// slider: styles the WebKit and Firefox parts from one line.
// graph makes the track a histogram, particles can come off the thumb.
.panel {
  column: gap 30
  padding: 28 24
  background: #101018
  radius: lg
}

.label { color: #a79eba; font-size: 13; margin: 0 0 6 }

.warm {
  slider: track 6 #445566 radius full, fill #ff7a00, thumb 22 #ffffff, ring 3 #ff7a00, glow #ff7a00 14, ticks 10 #8890a0
}

.histo {
  slider: graph 20 45 70 90 60 35 50 80 95 40 60 75, graph-height 52, graph-gap 3, fill #77ccff, track 3 #34445a, thumb 14 #ffffff, shape bar
}

.gem {
  slider: track 10 #2b3040 radius 3, fill #5be2a0, thumb 24 #5be2a0, shape diamond
  aura-particle: #bfffe0 -> rgba(91,226,160,0) count 40 size 5 life 700 speed 30 70 dir up spread 50 from thumb glowing
}`,
    html: `<div class="panel">
  <div><p class="label">ring, glow and ticks</p><input class="warm" type="range" value="60"></div>
  <div><p class="label">a histogram</p><input class="histo" type="range" value="40"></div>
  <div><p class="label">a diamond thumb that sheds particles</p><input class="gem" type="range" value="70"></div>
</div>`,
  },
  glass: {
    label: "Glass and tilt",
    src: `// glass: blurs what is behind it. It is plain CSS,
// so "dssl build" keeps it. tilt: follows the pointer
// (move your mouse over the panes) and stays in the engine.
.scene {
  position: relative
  overflow: hidden
  radius: lg
  padding: 36
  min-height: 300
  background: linear-gradient(135deg, #ff7a00, #c2185b 55%, #3949ab)
  grid: auto-fit 180
  gap: 20
}

.blob { position: absolute; radius: full; filter: blur(2px) }
.b1 { width: 170; height: 170; left: 8%; top: -30; background: #ffe14a }
.b2 { width: 130; height: 130; right: 10%; bottom: -20; background: #40e0d0 }

.pane {
  position: relative
  glass: 18 saturate 1.6
  tilt: 10 lift 1.04 glare
  border: 1 solid white/35
  radius: lg
  padding: 22
  color: white
  min-height: 150
  background-image: radial-gradient(circle at var(--dssl-gx, 50%) var(--dssl-gy, 50%), white/28, transparent 55%)
}

.pane h4 { margin: 0 0 6; font-size: 17 }
.pane p { margin: 0; font-size: 13.5; line-height: 1.6; opacity: 0.9 }`,
    html: `<div class="scene">
  <div class="blob b1"></div>
  <div class="blob b2"></div>
  <div class="pane"><h4>Frosted</h4><p>glass: 18 saturate 1.6 blurs and lifts the colours behind this pane.</p></div>
  <div class="pane"><h4>Follows you</h4><p>tilt: 10 lift 1.04 glare turns toward the pointer and lights the spot you are on.</p></div>
</div>`,
  },
};

