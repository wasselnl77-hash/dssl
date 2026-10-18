"use client";

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
        <div className="kicker">the one-pager</div>
        <h1 className="page-title">Cheat sheet</h1>
        <p className="page-sub">
          Every day-to-day feature of DSSL on one page. When a line here isn&apos;t
          obvious, the <a href="#/docs"><code>docs</code></a> chapter with the same name
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
            No tokens, layers, or config required — rules land in the{" "}
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
truncate                  // ellipsis
transition: 150 snap      // all 150ms, named easing
easings: snap smooth bounce ease-in-out…

motion pop { from { opacity: 0; translate: 0 16 } }
animate: pop 400 snap both`} />
          <p className="cheat-p">
            Motion runs on the Web Animations API; re-run with{" "}
            <code>DSSL.replay(sel)</code>. Disabled under reduced-motion unless the
            motion says <code>essential: true</code>.
          </p>
        </div>

        {/* ---------------------------------------------- states */}
        <div className="cheat-card">
          <span className="cheat-k">states & selectors</span>
          <CodeBlock plain code={`hover { … }        focus { … }
focus-visible { … } active { … }
disabled checked empty open

// states can restyle descendants too
hover { .tip { opacity: 1 } }

// full CSS selectors work, incl. nesting
.gallery > .tile:nth-child(2n) { translate: 0 -2 }
&.featured { border-color: color.accent }`} />
          <p className="cheat-p">
            The engine listens to pointer/focus events itself and re-evaluates entering
            and leaving the state — no CSS involved.
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
            <Row k="(default)" v="your rules are components — layers are opt-in" />
            <Row k="@layer utilities { }" v="name a layer when you care" />
            <Row k="pin { } / pin:" v="the one escape hatch, beats everything" />
            <Row k="inside one block" v="later lines win too — put display: none AFTER row:/column:/grid: (they set display: flex)" />
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
}   // → var(--dssl-color-accent), shared across files`} />
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
            Unknown property, unknown token, bad value, unclosed block — all refuse to
            compile with <b>file, line, and a did-you-mean</b> over every known property,
            token and motion. In the console, or live in the{" "}
            <a href="#/playground"><code>playground</code></a> error panel.
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
