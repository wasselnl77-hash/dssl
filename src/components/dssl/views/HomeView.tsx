"use client";

import { useState } from "react";
import CodeBlock from "../CodeBlock";
import { highlightDssl } from "../highlight";
import { ArrowIcon, PlayIcon } from "../icons";
import type { ViewName } from "../SiteRoot";

const DEMOS = {
  tokens: `.demo-card {
  background: color.card
  radius: md
  shadow: md

  .demo-chip {
    color: color.accent
    background: color.accent/12
  }

  .demo-swatch {
    background: linear-gradient(
      135deg, color.accent, color.accent/45)
  }
}`,
  states: `.demo-card {
  transition: 200
}

.demo-card:hover {
  translate: 0 -5px
  shadow: lg
  border-color: color.accent/40

  .demo-swatch {
    background: linear-gradient(
      135deg, color.accent/60, color.ink/80)
  }
}`,
  motion: `motion rise-in {
  from {
    opacity: 0
    translate: 0 12
  }
}

.demo-card {
  animate: rise-in 500 snap both
}`,
  // v0.4.0 — the reveal tab: seen + stagger, both engine-native
  reveal: `motion rise-in {
  from {
    opacity: 0
    translate: 0 12
  }
}

.feature-grid {
  stagger: 60        // child i waits i × 60ms
}

.feature {
  seen {             // engine-native state: fires once,
    animate: rise-in 480 snap   // as the card scrolls into view
  }
}`,
};

type DemoKey = keyof typeof DEMOS;

export default function HomeView({ go }: { go: (v: ViewName) => void }) {
  const [demo, setDemo] = useState<DemoKey>("tokens");
  const [signalOn, setSignalOn] = useState(false);

  const toggleSignal = () => {
    const next = !signalOn;
    setSignalOn(next);
    window.DSSL?.signal("demo", next ? "on" : null);
  };

  const replayMotion = () => window.DSSL?.replay(".demo-motion");

  return (
    <>
      {/* ------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <div className="hero-glow-2" aria-hidden="true" />
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <div className="kicker">domain specific style language</div>
            <h1 className="hero-title">
              CSS talks to the <em>engine</em>.
              <br />
              DSSL talks to the <em>design</em>.
            </h1>
            <p className="hero-sub">
              A styling language for the web that pairs with any HTML and any JavaScript.
              Its own cascade — no specificity math, no <code>!important</code> — design
              tokens as the vocabulary, states you can read, motion in four words, and
              errors that actually speak up. Zero dependencies, no build step.
            </p>
            <div className="hero-ctas">
              <button type="button" className="btn btn-primary" onClick={() => go("docs")}>
                Read the docs <ArrowIcon />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go("playground")}>
                <PlayIcon /> Try the playground
              </button>
              <a href="#get" className="btn btn-ghost">Get the engine</a>
            </div>
            <div className="hero-meta" aria-label="Engine facts">
              <span>~20 kB engine</span>
              <span>zero dependencies</span>
              <span>any HTML, any JS</span>
            </div>
          </div>

          {/* live demo stage — the tabs swap real DSSL, the card below is styled by it */}
          <div className="demo" aria-label="Live DSSL demo">
            <div className="demo-tabs">
              {(Object.keys(DEMOS) as DemoKey[]).map(k => (
                <button
                  key={k}
                  type="button"
                  className="demo-tab"
                  aria-pressed={demo === k}
                  onClick={() => setDemo(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            <div className="demo-stage">
              <pre className="code demo-code">
                <code dangerouslySetInnerHTML={{ __html: highlightDssl(DEMOS[demo]) }} />
              </pre>
              <div className="demo-canvas">
                <div className="demo-card">
                  <div className="demo-swatch" />
                  <h4>Styled by DSSL</h4>
                  <p>Hover me — states, tokens and motion are all handled by the engine.</p>
                  <span className="demo-chip">live</span>
                </div>
                {demo === "motion" && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.DSSL?.replay(".demo-card")}>
                    <PlayIcon /> replay rise-in
                  </button>
                )}
                {demo === "reveal" && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => window.DSSL?.replay(".demo-card")}>
                    <PlayIcon /> replay the reveal
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ pain points */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">why another language</div>
          <h2 className="section-title">Four fights CSS makes you pick. DSSL refuses all of them.</h2>
          <div className="pain-grid sect-gap">
            <div className="card card-hover pain-card">
              <span className="pain-label">CSS · specificity wars</span>
              <h3>Cascade by arithmetic</h3>
              <p>
                <code>#id</code> beats <code>.class</code> beats <code>tag</code>, then{" "}
                <code>!important</code> beats everyone. In DSSL the rule is one sentence:
                later wins, inside layers. That is the whole cascade.
              </p>
              <span className="pain-cure">DSSL · layers + source order</span>
            </div>
            <div className="card card-hover pain-card">
              <span className="pain-label">CSS · silent failures</span>
              <h3>Typo? Shipped anyway.</h3>
              <p>
                Misspell <code>background</code> or a variable and CSS quietly does nothing.
                DSSL refuses to compile: file, line, and a did-you-mean that usually nails it.
              </p>
              <span className="pain-cure">DSSL · loud errors</span>
            </div>
            <div className="card card-hover pain-card">
              <span className="pain-label">CSS · keyframe ceremony</span>
              <h3>Motion needs a paragraph</h3>
              <p>
                <code>@keyframes</code> plus an <code>animation</code> shorthand with five
                comma-separated values. DSSL: declare a motion once, then{" "}
                <code>animate: rise-in 400 snap</code>.
              </p>
              <span className="pain-cure">DSSL · motion blocks</span>
            </div>
            <div className="card card-hover pain-card">
              <span className="pain-label">CSS · invisible theming</span>
              <h3>JS ↔ styles is a hack</h3>
              <p>
                Theming from JavaScript means poking data-attributes or inline styles by hand.
                DSSL has a first-class bridge: <code>DSSL.signal(&apos;theme&apos;, &apos;dark&apos;)</code>{" "}
                re-styles the page, inspectably.
              </p>
              <span className="pain-cure">DSSL · signals</span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ side-by-side */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">same card, two languages</div>
          <h2 className="section-title">The vocabulary is the difference</h2>
          <div className="compare sect-gap">
            <div className="compare-col">
              <span className="compare-tag compare-tag-css">styles.css — 14 lines of machinery</span>
              <CodeBlock plain code={`.card {
  background-color: var(--card);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 2px 4px rgb(0 0 0 / .1),
              0 4px 14px rgb(0 0 0 / .08);
  transition: all 160ms cubic-bezier(.2,.9,.3,1);
}
.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 4px 8px rgb(0 0 0 / .12),
              0 14px 36px rgb(0 0 0 / .12);
}
.card:hover .chip { background: var(--accent-soft); }`} />
            </div>
            <div className="compare-col">
              <span className="compare-tag compare-tag-dssl">card.dssl — 8 lines of design</span>
              <CodeBlock plain code={`.card {
  background: color.card
  radius: md
  padding: space.4
  shadow: md
  transition: 160 snap

  hover {
    translate: 0 -4
    shadow: lg
    .chip { background: color.accent/12 }
  }
}`} />
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ features */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">the engine</div>
          <h2 className="section-title">No stylesheet is attached to this page</h2>
          <p className="section-sub">
            Every rule below is implemented by the DSSL engine — it matches selectors
            against the live DOM itself, runs its own cascade, and drives motion through
            the Web Animations API. Only pseudo-elements fall back to generated CSS.
          </p>
          <div className="feature-grid sect-gap">
            <div className="card card-hover feature">
              <span className="feature-icon">{"{}"}</span>
              <h3>Its own cascade</h3>
              <p>Later wins. Layers when you care. No specificity score, no !important — ever.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">◆</span>
              <h3>Tokens as vocabulary</h3>
              <p>color.ink, space.4, radius.md — references compile to inspectable custom properties.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">→</span>
              <h3>Readable states</h3>
              <p>hover, focus-visible, active as blocks. Nested rules under a state just work.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">≋</span>
              <h3>One-word conditions</h3>
              <p>@media dark. @media 768. @media 480..960. Same shape for @container and @signal — compose by nesting.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">✦</span>
              <h3>Motion in four words</h3>
              <p>animate: rise-in 400 snap both. seen + stagger reveal grids on scroll — reduced-motion is respected by default.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">§</span>
              <h3>Behaviors</h3>
              <p>Name a pattern once — focus rings, chips — and use it anywhere with one line.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">!</span>
              <h3>Loud errors</h3>
              <p>Unknown property, unknown token, bad value — each fails with file, line and a suggestion.</p>
            </div>
            <div className="card card-hover feature">
              <span className="feature-icon">⇄</span>
              <h3>JS bridge</h3>
              <p>dssl.signal() re-styles live, dssl.replay() re-runs motion, dssl.compile() powers tools.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ bridge demo */}
      <section className="section">
        <div className="wrap">
          <div className="kicker">javascript, meet styles</div>
          <h2 className="section-title">One call restyles the page</h2>
          <div className="compare sect-gap" style={{ alignItems: "center" }}>
            <div className="compare-col">
              <CodeBlock file="theme-toggle.js" code={`// flip a signal — DSSL re-evaluates
// every @signal rule in the page

DSSL.signal('demo', 'on')   // on
DSSL.signal('demo', null)   // off`} />
            </div>            <div className="compare-col demo-canvas" style={{ maxWidth: 480 }}>
              <button type="button" className="btn btn-primary" onClick={toggleSignal}>
                {signalOn ? "signal: demo == on" : "signal: demo == off"} — click
              </button>
              <div className="demo-signal-card">
                <strong>@signal demo == on</strong>
                <span>This card is styled by a signal-conditional rule. Flip the signal and the engine recomputes it — inspect the html element to see the mirror attribute.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ get the engine */}
      <section className="section" id="get">
        <div className="wrap">
          <div className="kicker">get the engine</div>
          <h2 className="section-title">One line, any platform</h2>
          <p className="section-sub">
            The whole engine is a folder of plain JavaScript files. No package
            manager, no build step, nothing installed globally. Pick your
            platform, paste the line, and a <code>dssl-engine</code> folder
            appears with the engine, a starter token set, an example stylesheet
            and the usage guide.
          </p>
          <div className="get-grid sect-gap">
            <div className="card card-hover get-card">
              <span className="get-os">macos · linux · bsd</span>
              <CodeBlock plain file="terminal" code="curl -fsSL https://dssl-sable.vercel.app/install.sh | sh" />
              <p className="get-note">
                Runs on plain sh — dash, ash and busybox included, bash not
                required. Downloads with curl or wget, whichever you have, and
                unpacks with tar, which every distro and macOS ship by default.
                No tar? It falls back to unzip, then python3.
              </p>
            </div>
            <div className="card card-hover get-card">
              <span className="get-os">windows</span>
              <CodeBlock plain file="powershell" code="irm https://dssl-sable.vercel.app/install.ps1 | iex" />
              <p className="get-note">
                PowerShell 5.1 or newer, no admin rights needed. Unpacks with
                Expand-Archive into your current folder.
              </p>
            </div>
            <div className="card card-hover get-card">
              <span className="get-os">any os, no terminal</span>
              <div className="get-downloads">
                <a className="btn btn-ghost btn-sm" href="/dssl-engine.zip" download>dssl-engine.zip</a>
                <a className="btn btn-ghost btn-sm" href="/dssl-engine.tar.gz" download>dssl-engine.tar.gz</a>
              </div>
              <p className="get-note">
                The exact package the one-liners fetch, straight from the
                browser. Unzip anywhere and follow USAGE.md inside.
              </p>
            </div>
          </div>

          <div className="get-wire">
            <div className="get-wire-code">
              <CodeBlock
                file="your page"
                code={`<script type="module" src="/dssl/boot.js"></script>
<link rel="stylesheet/dssl" href="/styles/tokens.dssl">
<link rel="stylesheet/dssl" href="/styles/hello.dssl">`}
              />
            </div>
            <div className="get-wire-copy">
              <h3>That is the whole install</h3>
              <p>
                Drop the <code>dssl/</code> folder where your page can serve
                it, load <code>boot.js</code> as a module, and list your{" "}
                <code>.dssl</code> files as links. The engine fetches them,
                walks your DOM, and keeps restyling live as elements come and
                go. Inline rules work too, via{" "}
                <code>&lt;style type="text/dssl"&gt;</code>. The full tour
                lives in the docs, and USAGE.md in the package covers the same
                ground in two minutes.
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => go("docs")}>
                Read the docs <ArrowIcon />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ cta */}
      <section className="section">
        <div className="wrap">
          <div className="cta-band">
            <h2>Write styles that read like design.</h2>
            <p>
              The full language tour takes about ten minutes. Or paste straight into the
              playground and break things — the errors will keep you company.
            </p>
            <div className="hero-ctas">
              <button type="button" className="btn btn-primary" onClick={() => go("docs")}>
                Language tour <ArrowIcon />
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => go("cheat")}>
                Skip to the cheat sheet
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
