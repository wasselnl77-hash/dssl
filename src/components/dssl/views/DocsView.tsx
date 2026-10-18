"use client";

import CodeBlock from "../CodeBlock";
import { PlayIcon } from "../icons";

const SIDE = [
  { head: "language", id: "start", label: "Getting started" },
  { head: null, id: "syntax", label: "Syntax" },
  { head: null, id: "tokens", label: "Tokens" },
  { head: null, id: "selectors", label: "Selectors & nesting" },
  { head: null, id: "states", label: "States" },
  { head: null, id: "world", label: "@media · @container · @signal" },
  { head: null, id: "cascade", label: "Cascade & layers" },
  { head: "properties", id: "semantic", label: "Semantic properties" },
  { head: null, id: "behaviors", label: "Behaviors" },
  { head: null, id: "motion", label: "Motion" },
  { head: null, id: "errors", label: "Errors" },
  { head: "runtime", id: "api", label: "JS API" },
];

export default function DocsView() {
  const toggleDocSignal = (hot: boolean) => {
    window.DSSL?.signal("docdemo", hot ? "hot" : null);
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="kicker">language tour</div>
        <h1 className="page-title">The DSSL docs</h1>
        <p className="page-sub">
          Everything in v0.2, with live examples — the boxes you can hover, focus and
          toggle are styled by exactly the rules shown next to them.
        </p>
      </div>

      <div className="docs-layout">
        {/* ------------------------------------------------ sidebar */}
        <aside className="docs-side">
          {SIDE.map((s, i) => (
            <div key={s.id}>
              {s.head && <div className="side-head">{s.head}</div>}
              <a href={`#${s.id}`}>{s.label}</a>
            </div>
          ))}
        </aside>

        {/* ------------------------------------------------ body */}
        <div className="docs-body">
          <section className="doc-block" id="start">
            <h2 className="section-title">Getting started</h2>
            <p className="doc-lead">
              DSSL ships as plain ES modules. No bundler, no build step, no dependencies —
              drop two files on any HTML page (any vintage), point a link tag at your
              stylesheet, and the engine does the rest client-side.
            </p>
            <CodeBlock file="index.html" code={`<link rel="stylesheet/dssl" href="app.dssl">
<script type="module" src="dssl/boot.js"></script>

<!-- works with React, Vue, Svelte, anything that emits DOM:
     the engine re-matches automatically on mutations -->`} />
            <p className="doc-lead">
              Styles live in <code>.dssl</code> files. The engine fetches them, parses,
              resolves tokens, and applies the winning declarations straight onto elements.
            </p>
          </section>

          <section className="doc-block" id="syntax">
            <h2 className="section-title">Syntax</h2>
            <p className="doc-lead">
              Braces, one declaration per line, no required semicolons. Newlines end
              declarations; <code>;</code> is optional sugar for packing declarations.
              Comments are <code>{"// line"}</code> or block comments. Values span lines
              when parens are open or the line ends with a comma or colon.
            </p>
            <CodeBlock file="syntax.dssl" code={`.card {
  background: color.card   // no semicolon needed
  padding: space.4; radius: md   // optional semicolons

  .title {
    font: 16/1.4 color.ink   // size / line-height / color
  }
}

.one-liner { padding: 8; shadow: sm }

background:                     // values can continue
  linear-gradient(135deg,
    color.accent, color.accent/45)`} />
          </section>

          <section className="doc-block" id="tokens">
            <h2 className="section-title">Tokens</h2>
            <p className="doc-lead">
              Design tokens are the variables. They compile to custom properties on
              <code> :root</code> (inspectable in DevTools), and any bare identifier in a
              value resolves against them — misspell one and you get an error, not silence.
              A slash adds alpha via <code>color-mix</code>.
            </p>
            <CodeBlock file="tokens.dssl" code={`tokens {
  color {
    ink: #16161d
    accent: oklch(62% 0.19 35)
  }
  radius { md: 14 }
  shadow { md: 0 2 4 ink/10, 0 4 12 ink/8 }
}

.card {
  background: color.card
  color: color.ink/85      // alpha modifier
  radius: md
  shadow: md
}`} />
            <div className="demo-box">
              <div className="tok-demo">
                <button type="button" className="tok-dot">ink</button>
                <button type="button" className="tok-dot">muted</button>
                <button type="button" className="tok-dot">accent</button>
                <button type="button" className="tok-dot">ok</button>
                <button type="button" className="tok-dot">err</button>
              </div>
              <p className="doc-lead fine-print">
                These dots resolve <code>color.*</code> tokens — flip the theme in the nav
                and watch them re-evaluate.
              </p>
              <div className="scale-bar" aria-label="Spacing scale">
                {"space.1 space.2 space.3 space.4 space.5 space.6".split(" ").map(s => (
                  <div key={s} className="scale-step" title={s} style={{ height: (parseInt(s.slice(-1)) * 8 + 8) }} />
                ))}
              </div>
            </div>
            <p className="tbl-note">
              Built-ins ship with sensible defaults: <code>space.1–.8</code>,{" "}
              <code>radius.sm–full</code>, <code>shadow.sm–xl</code>, <code>font.sans/mono</code>.
              Override any of them from your own <code>tokens</code> block.
            </p>
          </section>

          <section className="doc-block" id="selectors">
            <h2 className="section-title">Selectors & nesting</h2>
            <p className="doc-lead">
              Every CSS selector works — elements, classes, ids, attributes, combinators,
              structural pseudo-classes. Nesting is native: a nested selector is a
              descendant; <code>&amp;</code> substitutes the parent explicitly.
            </p>
            <CodeBlock file="selectors.dssl" code={`.gallery {
  gap: space.4

  .tile { shadow: sm }              // .gallery .tile
  &.featured { border-color: color.accent }   // .gallery.featured
  > .tile:nth-child(2n) { translate: 0 -2 }

  hover {                            // states nest too (next section)
    .tile { shadow: lg }
  }
}`} />
          </section>

          <section className="doc-block" id="states">
            <h2 className="section-title">States</h2>
            <p className="doc-lead">
              An element&apos;s own pseudo-states are plain nested blocks —{" "}
              <code>hover</code>, <code>focus</code>, <code>focus-visible</code>,{" "}
              <code>active</code>, <code>disabled</code>, <code>checked</code>… The engine
              listens to the events and re-evaluates live. Rules inside a state block can
              target descendants (tooltips, dropdowns) or the element itself.
            </p>
            <CodeBlock file="states.dssl" code={`.doc-card {
  transition: 200

  hover {
    translate: 0 -4
    shadow: lg
  }

  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
  }

  active { translate: 0 -1 }
}`} />
            <div className="demo-box">
              <div className="doc-card">
                <span className="doc-card-title">Hover me</span>
                <span className="doc-card-sub">
                  This card lifts on hover — the engine matched <code>:hover</code> itself.
                </span>
              </div>
              <button type="button" className="doc-btn">Tab to me — focus-visible ring</button>
            </div>
          </section>

          <section className="doc-block" id="world">
            <h2 className="section-title">@media · @container · @signal</h2>
            <p className="doc-lead">
              The world around the element is one shape: CSS-shaped conditions.{" "}
              <code>@media</code> for viewport and preferences (bare numbers mean px),{" "}
              <code>@container</code> for container queries, and <code>@signal</code> —
              the JS bridge. Conditions compose by nesting.
            </p>
            <CodeBlock file="world.dssl" code={`.panel {
  padding: space.3

  @media (width >= 768) {
    padding: space.6
  }

  @container (min-width: 480px) {
    grid: 2
  }

  @media (prefers-color-scheme: dark) {
    background: color.ink
  }

  @signal theme == dark {          // JS: DSSL.signal('theme', 'dark')
    background: color.ink
  }

  @media (width <= 860) {
    @signal nav == open {          // composed: narrow AND menu open
      display: block
    }
  }
}`} />
            <div className="demo-box">
              <div className="signal-box">@signal docdemo == hot — cold</div>
              <div className="tok-demo">
                <button type="button" className="doc-btn" onClick={() => toggleDocSignal(true)}>heat it</button>
                <button type="button" className="doc-btn" onClick={() => toggleDocSignal(false)}>cool it</button>
              </div>
            </div>
          </section>

          <section className="doc-block" id="cascade">
            <h2 className="section-title">Cascade & layers</h2>
            <p className="doc-lead">
              The whole cascade in one sentence: <b>later wins, layers trump order.</b>{" "}
              No specificity arithmetic, no <code>!important</code>. Rules live in{" "}
              <code>tokens &lt; base &lt; components &lt; utilities &lt; pin</code>; yours
              default to <code>components</code>. The <code>pin</code> block is the single
              sanctioned escape hatch.
            </p>
            <CodeBlock file="cascade.dssl" code={`#hero .title { color: color.ink }

.legacy .panel .title { color: color.paper }
// ↑ WINS in DSSL (it is later) — CSS would score the #id higher

@layer utilities {
  .mt-0 { margin-top: 0 }
}

.wonky-badge {
  pin: color color.accent-ink    // beats everything DSSL emitted
}`} />
            <div className="note">
              <b>Why no specificity?</b> Because it never survives contact with a real
              codebase. Source order is readable, predictable, and refactorable — and when
              you truly need to win, <code>pin</code> says so explicitly instead of
              leaking <code>!important</code> into every stylesheet.
            </div>
          </section>

          <section className="doc-block" id="semantic">
            <h2 className="section-title">Semantic properties</h2>
            <p className="doc-lead">
              All standard CSS properties pass through untouched. On top of them, DSSL
              speaks a small design vocabulary — properties that expand to the machinery
              they mean. Bare numbers are pixels; unitless where CSS wants them.
            </p>
            <table className="tbl">
              <thead>
                <tr><th>Property</th><th>Example</th><th>Expands to</th></tr>
              </thead>
              <tbody>
                <tr><td><code>size</code></td><td><code>size: 40</code> · <code>size: 100% 40</code></td><td>width + height (one or two values)</td></tr>
                <tr><td><code>row</code> / <code>column</code></td><td><code>row: gap 8 center wrap</code></td><td>flexbox + only the words you name (between, reverse, inline…)</td></tr>
                <tr><td><code>grid</code></td><td><code>grid: 3</code> · <code>grid: auto-fill 220</code></td><td>repeat(3, 1fr) · repeat(auto-fill, minmax(220px, 1fr))</td></tr>
                <tr><td><code>stack</code></td><td><code>stack: center</code></td><td>overlay grid; children share cell 1/1</td></tr>
                <tr><td><code>place</code> / <code>align</code></td><td><code>place: center</code></td><td>place-items/content · align-items</td></tr>
                <tr><td><code>cover</code></td><td><code>cover: fixed</code></td><td>position + inset: 0</td></tr>
                <tr><td><code>sticky</code></td><td><code>sticky: 0</code></td><td>position: sticky; top: 0px</td></tr>
                <tr><td><code>font</code></td><td><code>font: 16/1.4 ink</code></td><td>font-size / line-height / color</td></tr>
                <tr><td><code>fluid</code></td><td><code>fluid: 16, 24</code></td><td>clamp() interpolating 16→24px across 360→1200px</td></tr>
                <tr><td><code>shadow</code> / <code>radius</code></td><td><code>shadow: lg</code></td><td>token presets (sm/md/lg/xl) or raw values</td></tr>
                <tr><td><code>circle</code></td><td><code>circle: 36</code></td><td>width + height + border-radius: 50%</td></tr>
                <tr><td><code>grow</code> / <code>shrink</code> / <code>basis</code></td><td><code>grow: 1</code></td><td>flex-grow / flex-shrink / flex-basis</td></tr>
                <tr><td><code>truncate</code></td><td><code>truncate</code></td><td>ellipsis overflow (overflow hidden, nowrap)</td></tr>
                <tr><td><code>z</code></td><td><code>z: 50</code></td><td>z-index</td></tr>
                <tr><td><code>transition</code></td><td><code>transition: 150 snap</code></td><td>all 150ms cubic-bezier(0.2, 0.9, 0.3, 1)</td></tr>
                <tr><td><code>animate</code></td><td><code>animate: pop 400 snap</code></td><td>Web Animations API run of a motion block</td></tr>
              </tbody>
            </table>
            <p className="tbl-note">Named easings: <code>snap</code>, <code>smooth</code>, <code>bounce</code> + the standard set.</p>
          </section>

          <section className="doc-block" id="behaviors">
            <h2 className="section-title">Behaviors</h2>
            <p className="doc-lead">
              A behavior is a named chunk of DSSL — declarations, states, even nested
              rules — spliced into any rule with <code>use</code>. Perfect for focus
              rings, chip styles, reset-ish bundles. No parameters in v0.2; compose by
              nesting behaviors.
            </p>
            <CodeBlock file="behaviors.dssl" code={`behavior focus-ring {
  focus-visible {
    outline: 2 solid color.accent
    outline-offset: 2
  }
}

button { use focus-ring }
.card  { use focus-ring }

// the dark palette on this very site is a behavior,
// reused by @media and @signal — define once, apply twice`} />
          </section>

          <section className="doc-block" id="motion">
            <h2 className="section-title">Motion</h2>
            <p className="doc-lead">
              Declare a <code>motion</code> with keyframe blocks (<code>from</code>,{" "}
              <code>to</code>, <code>at 40%</code>) — the missing end interpolates from the
              element&apos;s natural state. Apply it with <code>animate</code>. The engine
              runs it through the Web Animations API, and every animation silently
              disables under reduced-motion unless the motion is{" "}
              <code>essential: true</code>.
            </p>
            <CodeBlock file="motion.dssl" code={`motion pop {
  from {
    opacity: 0
    translate: 0 16
    scale: 0.9
  }
}

.motion-box {
  animate: pop 500 snap        // name · duration · easing · fill
}`} />
            <div className="demo-box">
              <div className="motion-box">motion pop — replay me</div>
              <button type="button" className="doc-btn" onClick={() => window.DSSL?.replay(".motion-box")}>
                <span className="tok-demo"><PlayIcon /> DSSL.replay(&apos;.motion-box&apos;)</span>
              </button>
            </div>
          </section>

          <section className="doc-block" id="errors">
            <h2 className="section-title">Errors that talk back</h2>
            <p className="doc-lead">
              CSS fails silently; DSSL refuses to compile and tells you where and what it
              expected, with a did-you-mean built from edit distance over every known
              property, token and motion. The playground shows this live.
            </p>
            <CodeBlock file="typo.dssl" code={`.badge {
  colour: red            // ✗ unknown property "colour"
                         //   → did you mean "color"?

  background: color.acnt // ✗ unknown value "color.acnt"
                         //   → did you mean "color.accent"?

  flex-direction: banana // ✗ unknown value "banana"
}`} />
            <div className="note">
              <b>Escape hatches are explicit.</b> Custom properties (<code>--*</code>) pass
              through unvalidated, and unknown identifiers inside <code>calc()</code> and
              friends are your business — the loud checks protect the design vocabulary,
              not the pressure valve.
            </div>
          </section>

          <section className="doc-block" id="api">
            <h2 className="section-title">JS API</h2>
            <p className="doc-lead">
              The engine exposes a small, synchronous surface. Signals are the bridge:
              they re-evaluate every <code>@signal</code> rule and mirror onto{" "}
              <code>data-dssl-*</code> attributes for DevTools visibility.
            </p>
            <table className="tbl">
              <thead>
                <tr><th>Call</th><th>What it does</th></tr>
              </thead>
              <tbody>
                <tr><td><code>DSSL.load(urls, opts?)</code></td><td>fetch + apply .dssl files in order (shared token registry)</td></tr>
                <tr><td><code>DSSL.apply(src, opts?)</code></td><td>apply a source string; <code>{"{ scope, name, replace }"}</code> for scoped stylesheets</td></tr>
                <tr><td><code>DSSL.compile(src)</code></td><td>parse + resolve without touching the DOM — powers the playground</td></tr>
                <tr><td><code>DSSL.signal(name, value)</code></td><td>set/clear a signal; @signal rules re-evaluate instantly</td></tr>
                <tr><td><code>DSSL.replay(sel?)</code></td><td>re-run animations on matching elements</td></tr>
                <tr><td><code>DSSL.refresh()</code></td><td>full re-compute (rarely needed — the engine watches the DOM)</td></tr>
                <tr><td><code>DSSL.errors()</code></td><td>structured errors from the last apply</td></tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}
