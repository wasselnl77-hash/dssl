"use client";

import Link from "next/link";
import CodeBlock from "../CodeBlock";

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="cr">
      <code>{k}</code>
      <span>{v}</span>
    </div>
  );
}

export default function CheatSheetView() {
  return (
    <div className="wrap">
      <div className="page-head">
        <h1 className="page-title">Cheat sheet</h1>
        <p className="page-sub">
          Every day-to-day feature of DSSL on one page. When a line here isn&apos;t
          obvious, the <Link href="/docs"><code>docs</code></Link> chapter with the same name
          has the long version and a live demo.
        </p>
      </div>

      <div className="cheat-grid">
        {/* ---------------------------------------------- minimal */}
        <div className="cheat-card cheat-wide">
          <span className="cheat-k">30-second version</span>
          <CodeBlock file="app.dssl" code={`.card {
  background: color.card      // built-in default token
  padding: space.4            // 16px, also built in
  radius: md
  transition: 150

  hover {                     // states are nested blocks
    translate: 0 -4
    shadow: lg
  }

  @media 768 {                // viewport ≥ 768px
    grid: 3
  }
}`} />
          <p className="cheat-p">
            Install: <code>&lt;link rel=&quot;stylesheet/dssl&quot; href=&quot;app.dssl&quot;&gt;</code>{" "}
            + <code>&lt;script type=&quot;module&quot; src=&quot;dssl/boot.js&quot;&gt;</code>.
            No tokens, layers, or config required, rules land in the{" "}
            <code>components</code> layer by default.
          </p>
        </div>

        {/* ---------------------------------------------- values */}
        <div className="cheat-card">
          <span className="cheat-k">values</span>
          <div className="cheat-list">
            <Row k="16" v="bare number → 16px" />
            <Row k="1.5" v="in unitless props (line-height…): stays 1.5" />
            <Row k="color.ink" v="token reference → var(--dssl-color-ink)" />
            <Row k="color.ink/40" v="token at 40% alpha (color-mix)" />
            <Row k="oklch(62% 0.19 35)" v="functions pass through, color fns keep numbers bare" />
            <Row k="calc(100% - 16)" v="calc-family: bare numbers are px" />
            <Row k="--my-var" v="custom properties pass through unvalidated" />
          </div>
        </div>

        {/* ---------------------------------------------- layout */}
        <div className="cheat-card">
          <span className="cheat-k">layout in one word</span>
          <CodeBlock plain code={`row: gap 12 center wrap
column: gap 8 start
grid: 3
grid: auto-fill 220
stack: center        // overlay children
center: both         // center: x / center: y, the engine guarantees a
                     // formatting context, so it can never silently no-op
place: center        align: center
cover: fixed         sticky: 0
size: 40 100%        circle: 36
grow: 1              z: 50`} />
        </div>

        {/* ---------------------------------------------- text */}
        <div className="cheat-card">
          <span className="cheat-k">text & motion</span>
          <CodeBlock plain code={`font: 16/1.4 color.ink    // size / leading / color
fluid: 16, 24             // clamp() 360→1200px
truncate
visually-hidden           // a11y: hidden to eyes, read by screen readers
transition: 150 snap      // all 150ms, named easing
transition: 150 snap background-color, 300 transform
                          // per-property specs
stagger: 60               // children cascade in, i × 60ms

easings: snap smooth bounce ease-in-out…

motion pop { from { opacity: 0; translate: 0 16 } }
animate: pop 400 snap both`} />
          <p className="cheat-p">
            Motion runs on the Web Animations API; re-run with{" "}
            <code>DSSL.replay(sel)</code>. Disabled under reduced-motion unless the
            motion says <code>essential: true</code>.
          </p>
        </div>

        {/* ---------------------------------------------- texture, aura, slider */}
        <div className="cheat-card">
          <span className="cheat-k">texture, aura, slider, glass, tilt</span>
          <CodeBlock plain code={`texture: wood                      // 30 presets; stacks with commas
texture: noise scale 3 color #123 blend multiply   // or your own

aura-glow: #ff7a00 30 pulse 900 flicker 0.3
aura-particle: #fd0 -> #f60 -> rgba(255,40,0,0) 60 up
glow-particle: #fff 30 out         // glowing particles
aura-glow-particle: #7cf 24 count 40 up
aura: glow #f80 30, particles #fd0 count 60   // both slots
aura-glow: none                    // clears one slot; aura: none clears both

behavior fire { aura-glow: ... aura-particle: ... }   // aura has no presets
.torch { use fire }

slider: track 6 #456 radius full, fill #f80, thumb 22 #fff, ring 3 #f80
slider: graph 20 45 70 90 60, graph-height 52   // a histogram slider

glass: 18 saturate 1.6             // frosted glass, plain CSS
tilt: 10 lift 1.04 glare           // follows the pointer, engine only
border: 1 solid white/30           // alpha works on named colours too`} />
          <p className="cheat-p">
            Runtime features: <code>dssl build</code> leaves them out and says so. Aura draws on one
            canvas, stills under reduced motion, and shares a budget of 1800 particles. Open the designer
            in the VS Code extension to build all three with sliders.
          </p>
        </div>

        {/* ---------------------------------------------- states */}
        <div className="cheat-card">
          <span className="cheat-k">states & selectors</span>
          <CodeBlock plain code={`hover { … }        focus { … }
focus-visible { … } active { … }
disabled checked empty open
seen { … }        // engine-native: fires once on scroll-in

// states can restyle descendants too
hover { .tip { opacity: 1 } }

// full CSS selectors work, incl. nesting
.gallery > .tile:nth-child(2n) { translate: 0 -2 }
&.featured { border-color: color.accent }`} />
          <p className="cheat-p">
            The engine listens to pointer/focus events itself and re-evaluates entering
            and leaving the state, no CSS involved.
          </p>
        </div>

        {/* ---------------------------------------------- conditions */}
        <div className="cheat-card">
          <span className="cheat-k">conditions</span>
          <CodeBlock plain code={`@media dark         @media light
@media reduced-motion
@media 768          // ≥ 768px
@media <= 768       // narrower
@media 480..960     // range
@media (width >= 768)   // full CSS form
@container (min-width: 480px)
@signal theme == dark   // JS bridge
@signal ready           // truthy form

// compose by nesting
@media <= 860 { @signal nav == open { … } }`} />
        </div>

        {/* ---------------------------------------------- cascade */}
        <div className="cheat-card">
          <span className="cheat-k">cascade</span>
          <div className="cheat-list">
            <Row k="later wins" v="source order beats every selector" />
            <Row k="layers trump order" v="tokens < base < components < utilities < pin" />
            <Row k="(default)" v="your rules are components: layers are opt-in" />
            <Row k="@layer utilities { }" v="name a layer when you care" />
            <Row k="pin { } / pin:" v="the one escape hatch, beats everything" />
            <Row k="inside one block" v="later lines win too, put display: none AFTER row:/column:/grid: (they set display: flex)" />
          </div>
          <p className="cheat-p">No specificity. No <code>!important</code>. Ever.</p>
        </div>

        {/* ---------------------------------------------- behaviors */}
        <div className="cheat-card">
          <span className="cheat-k">behaviors & tokens</span>
          <CodeBlock plain code={`behavior focus-ring {
  focus-visible { outline: 2 solid color.accent }
}
button { use focus-ring }

tokens {
  color { accent: oklch(62% 0.19 35) }
  space { lg: 24 }
}   // → var(--dssl-color-accent), shared across files

.danger {
  --color.accent: color.err   // re-declare a token per subtree
}                             // descendants re-resolve automatically`} />
        </div>

        {/* ---------------------------------------------- deform & gradients */}
        <div className="cheat-card">
          <span className="cheat-k">deform &amp; gradients</span>
          <CodeBlock plain code={`.btn {
  transition: 180 snap transform
  active { bend: 16; stretch: 0.94 }   // flex under the pointer
}
.flag     { bend-y: -18 }              // sideways bow
.mini     { hover { bend-up: 14 } }    // drawbridge
.page     { hover { fold: 14 } }       // folds over the top edge
.pill-row { bend-around: -22 }         // children on a smile arc

.banner {
  gradient: linear 135, color.accent -> color.ok
  gradient-flow: 6s alternate         // the gradient drifts forever
}
.head { gradient-text: linear to right, color.accent, color.ink }`} />
          <p className="cheat-p">
            Deform composes into <code>transform</code>, so one <code>transition</code>{" "}
            tweens it and it works in <code>motion</code> keyframes too.{" "}
            <code>stretch</code> keeps volume; <code>gradient</code> stops take tokens,
            alpha (<code>color.ink/40</code>) and <code>%</code> positions, a stop that
            is not a color fails loud.
          </p>
        </div>

        {/* ---------------------------------------------- api */}
        <div className="cheat-card">
          <span className="cheat-k">js api</span>
          <CodeBlock plain code={`DSSL.load(['/styles/app.dssl'])
DSSL.apply(src, { scope: '#el', name: 'pg', replace: true })
DSSL.compile(src)          // parse+resolve, no DOM
DSSL.signal('theme', 'dark')   // null clears
DSSL.replay(sel)  DSSL.refresh()
DSSL.errors                // from the last apply`} />
          <p className="cheat-p">
            Auto-boot: <code>link[rel=&quot;stylesheet/dssl&quot;]</code> +{" "}
            <code>style[type=&quot;text/dssl&quot;]</code>, then{" "}
            <code>window</code> fires <code>dssl-ready</code>.
          </p>
        </div>

        {/* ---------------------------------------------- errors */}
        <div className="cheat-card">
          <span className="cheat-k">errors</span>
          <p className="cheat-p">
            Unknown property, unknown token, bad value, unclosed block, all refuse to
            compile with <b>file, line, and a did-you-mean</b> over every known property,
            token and motion. In the console, or live in the{" "}
            <Link href="/playground"><code>playground</code></Link> error panel.
          </p>
          <CodeBlock plain code={`.badge {
  colour: red             // ✗ did you mean "color"?
  background: color.acnt  // ✗ did you mean "color.accent"?
}`} />
        </div>
      </div>
    </div>
  );
}
