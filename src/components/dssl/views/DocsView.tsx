"use client";

import CodeBlock from "../CodeBlock";
import { PlayIcon } from "../icons";

const SIDE = [
  { head: "start here", id: "start", label: "Quickstart — 3 steps" },
  { head: null, id: null, label: "One-page cheat sheet →", href: "#/cheat" },
  { head: "language", id: "syntax", label: "Syntax" },
  { head: null, id: "tokens", label: "Tokens" },
  { head: null, id: "selectors", label: "Selectors & nesting" },
  { head: null, id: "states", label: "States" },
  { head: null, id: "world", label: "@media · @container · @signal" },
  { head: null, id: "cascade", label: "Cascade & layers" },
  { head: "reference", id: "semantic", label: "Semantic properties" },
  { head: null, id: "behaviors", label: "Behaviors" },
  { head: null, id: "motion", label: "Motion" },
  { head: null, id: "errors", label: "Errors" },
  { head: null, id: "api", label: "JS API" },
  { head: null, id: "interop", label: "Interop (React & co.)" },
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
          DSSL is deliberately small: three steps to a working stylesheet, and everything
          past step three is opt-in. The live boxes on this page are styled by exactly the
          rules shown next to them.
        </p>
      </div>

      <div className="docs-layout">
        {/* ------------------------------------------------ sidebar */}
        <aside className="docs-side">
          {SIDE.map((s, i) => (
            <div key={s.label}>
              {s.head && <div className="side-head">{s.head}</div>}
              {s.id ? (
                <a href={`#${s.id}`}>{s.label}</a>
              ) : (
                <a href={s.href}>{s.label}</a>
              )}
            </div>
          ))}
        </aside>

        {/* ------------------------------------------------ body */}
        <div className="docs-body">
          <section className="doc-block" id="start">
            <h2 className="section-title">Quickstart — three steps</h2>
            <p className="doc-lead">
              No bundler, no build step, no dependencies. The engine is two static files;
              your styles are plain <code>.dssl</code> text the browser fetches and applies
              itself.
            </p>
            <CodeBlock file="step 1 — index.html" code={`<link rel="stylesheet/dssl" href="app.dssl">
<script type="module" src="dssl/boot.js"></script>

<!-- that is the whole install. works with any HTML —
     React, Vue, Svelte, plain files: the engine
     re-matches automatically when the DOM changes -->`} />
            <CodeBlock file="step 2 — app.dssl" code={`.go {
  padding: 12 20
  radius: md
  background: color.accent     // a built-in default token
  color: white
  font-weight: 700
  transition: 150

  hover  { translate: 0 -2; shadow: md }
  active { translate: 0 }
}`} />
            <CodeBlock file="step 3 — use it" code={`<button class="go">Hello, DSSL</button>`} />
            <div className="note">
              <b>That&apos;s the entire mental model.</b> Bare numbers are pixels, known
              token names just resolve, and nested blocks like <code>hover</code> are
              states. You never have to touch the machinery below — but it&apos;s there
              when you want it.
            </div>
            <p className="doc-lead">
              <b>What you can safely ignore on day one:</b> layers (your rules silently
              live in <code>components</code>), your own tokens (a useful default set is
              built in), behaviors, <code>@signal</code>, <code>@container</code> and
              motion. Each section below starts with the 20% you&apos;ll actually use.
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
              Tokens are the variables. A sensible default set ships with the engine —{" "}
              <code>color.ink</code>, <code>color.accent</code>, <code>space.1–.8</code>,{" "}
              <code>radius</code>, <code>shadow</code>, <code>font</code> — so your first
              stylesheet needs zero setup. Define your own when the design outgrows the
              defaults; any bare identifier in a value resolves against them, and a
              misspelling is an error, not silence. A slash adds alpha via{" "}
              <code>color-mix</code>.
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
              Built-ins: <code>space.1–.8</code>, <code>radius.sm–full</code>,{" "}
              <code>shadow.sm–xl</code>, <code>font.sans/mono</code>, and the{" "}
              <code>color.*</code> set. Override any of them from your own{" "}
              <code>tokens</code> block.
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
              listens to the events and re-evaluates live, both entering{" "}
              <b>and leaving</b> a state. Rules inside a state block can target
              descendants (tooltips, dropdowns) or the element itself.
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
                  This card lifts on hover — and settles back down when you leave.
                </span>
              </div>
              <button type="button" className="doc-btn">Tab to me — focus-visible ring</button>
            </div>
          </section>

          <section className="doc-block" id="world">
            <h2 className="section-title">@media · @container · @signal</h2>
            <p className="doc-lead">
              The world around the element is one shape: CSS-shaped conditions, composed
              by nesting. v0.3 added one-word sugar for the conditions everyone writes —{" "}
              <code>@media dark</code>, <code>@media 768</code> (this wide or wider),{" "}
              <code>@media 480..960</code> (a range) — while the full CSS form keeps
              working.
            </p>
            <CodeBlock file="world.dssl" code={`.panel {
  padding: space.3

  @media dark {                   // prefers-color-scheme, one word
    background: color.ink
  }

  @media 768 {                    // viewport ≥ 768px
    padding: space.6
  }

  @media 480..960 {               // between 480 and 960
    grid: 2
  }

  @media (width >= 768) {         // full CSS shape still works
    padding: space.6
  }

  @container (min-width: 480px) { // container queries: same shape
    grid: 2
  }

  @signal theme == dark {         // JS: DSSL.signal('theme', 'dark')
    background: color.ink
  }

  @media <= 860 {
    @signal nav == open {         // composed: narrow AND menu open
      display: block
    }
  }
}`} />
            <p className="tbl-note">
              Also one word: <code>@media light</code> and <code>@media reduced-motion</code>.
            </p>
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
              default to <code>components</code> — most stylesheets never name a layer at
              all. The <code>pin</code> block is the single sanctioned escape hatch.
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
                <tr><td><code>place</code> / <code>align</code></td><td><code>place: center</code></td><td>place-items/content · align-items — alignment implies a formatting context (see <code>center</code>)</td></tr>
                <tr><td><code>center</code></td><td><code>center: both</code> · <code>center: x</code> · <code>center: y</code></td><td>the centering primitive. The engine promotes any element to a grid/flex context first (inline → inline-grid, block → grid; an explicit <code>display:</code> still wins), so centering works on a span, a button, anything</td></tr>
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
              rings, chip styles, reset-ish bundles. No parameters in v0.3; compose by
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
            <p className="tbl-note">
              Auto-boot picks up <code>link[rel=&quot;stylesheet/dssl&quot;]</code> and{" "}
              <code>style[type=&quot;text/dssl&quot;]</code>, then fires{" "}
              <code>dssl-ready</code> on <code>window</code>.{" "}
              <code>&lt;html data-dssl-reset&gt;</code> enables the small built-in reset.
            </p>
          </section>

          <section className="doc-block" id="interop">
            <h2 className="section-title">Interop — React, hydration &amp; friends</h2>
            <p className="doc-lead">
              DSSL is deliberately framework-agnostic: it styles whatever DOM exists,
              so it works under React, Vue, Svelte or plain HTML. But if you render
              with React there is <b>one known, harmless notice</b> you should
              understand — and this very site is the living example.
            </p>
            <div className="note">
              <b>Why the notice happens.</b> The engine applies styles to the SSR DOM
              <i> before</i> React hydrates — that is the whole anti-flash design. React
              then compares the DOM against its virtual render, finds extra
              <code> style="--dssl-*…"</code> attributes it did not put there, and logs
              one hydration diff to the console. React explicitly <b>does not patch
              them away</b> — it leaves the engine&apos;s styles alone. Nothing is wrong:
              the styles are working exactly as intended.
            </div>
            <p className="doc-lead">
              In dev builds that single notice can surface as a "1 Issue" overlay badge,
              because Next&apos;s dev tools wrap <code>console.error</code> and count
              everything they see. This site installs an <i>assignment trap</i>: the moment
              Next assigns its own collector, the shim captures it and re-publishes the
              filter as the <b>outermost</b> layer — so DSSL&apos;s own diff is swallowed
              and re-logged as an explained info line <b>before</b> Next can count it.
              Any genuine hydration mismatch still flows through to the collector at full
              volume. In production React does not diff attributes at all, so the notice
              disappears entirely; the shim is dev-only.
            </p>
            <CodeBlock file="dev-only console shim (this site's layout.tsx)" code={`// assignment trap: become the OUTERMOST console.error
// the moment Next assigns its own collector
let inner = console.error, trapped = false;
Object.defineProperty(console, 'error', {
  configurable: true,
  get: () => (trapped ? outer : inner),
  set: (fn) => { inner = fn; trapped = true; }
});
function outer(...args) {
  const s = args.map(String).join(' ');
  // swallow ONLY the DSSL-attribute hydration diff
  if (s.includes('A tree hydrated but some attributes')
      && s.includes('--dssl')) {
    console.info('DSSL styled this page before React hydrated. Expected interop.');
    return;
  }
  return inner.apply(console, args);  // genuine issues flow through
}`} />
            <p className="doc-lead">
              Two more interop notes worth knowing. First, if a framework re-renders a
              subtree and <i>removes</i> elements the engine had styled, the touched
              registry notices the removal via MutationObserver and cleans up — no
              leaked inline styles. Second, if your framework toggles attributes the
              engine matches on (like <code>data-dssl-*</code> signal mirrors), change
              them through <code>DSSL.signal()</code> rather than DOM writes, so rules
              re-evaluate on the same tick instead of waiting for the observer.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
