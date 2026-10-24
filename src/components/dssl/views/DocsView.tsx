"use client";

import { useState } from "react";
import Link from "next/link";
import CodeBlock from "../CodeBlock";
import { PlayIcon } from "../icons";

const SIDE = [
  { head: "start here", id: "start", label: "Quickstart: 3 steps" },
  { head: null, id: null, label: "One-page cheat sheet", href: "/cheat" },
  { head: "language", id: "syntax", label: "Syntax" },
  { head: null, id: "tokens", label: "Tokens" },
  { head: null, id: "selectors", label: "Selectors & nesting" },
  { head: null, id: "states", label: "States" },
  { head: null, id: "pseudo-elements", label: "Pseudo-elements" },
  { head: null, id: "world", label: "Conditions" },
  { head: null, id: "cascade", label: "Cascade & layers" },
  { head: "reference", id: "semantic", label: "Semantic properties" },
  { head: null, id: "behaviors", label: "Behaviors" },
  { head: null, id: "overlap", label: "Overlap" },
  { head: null, id: "motion", label: "Motion" },
  { head: null, id: "deform", label: "Deform: bend & stretch" },
  { head: null, id: "gradients", label: "Gradient tools" },
  { head: null, id: "errors", label: "Errors" },
  { head: null, id: "api", label: "JS API" },
  { head: null, id: "performance", label: "Performance: freeze & explain" },
  { head: null, id: "interop", label: "Interop (React & co.)" },
];

export default function DocsView() {
  const [ovOff, setOvOff] = useState(false);
  const toggleDocSignal = (hot: boolean) => {
    window.DSSL?.signal("docdemo", hot ? "hot" : null);
  };

  return (
    <div className="wrap">
      <div className="page-head">
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
                <Link href={s.href ?? "/docs"}>{s.label}</Link>
              )}
            </div>
          ))}
        </aside>

        {/* ------------------------------------------------ body */}
        <div className="docs-body">
          <section className="doc-block" id="start">
            <h2 className="section-title">Quickstart: three steps</h2>
            <p className="doc-lead">
              No bundler, no build step, no dependencies. The engine is two static files;
              your styles are plain <code>.dssl</code> text the browser fetches and applies
              itself.
            </p>
            <CodeBlock file="step 1: index.html" code={`<link rel="stylesheet/dssl" href="app.dssl">
<script type="module" src="dssl/boot.js"></script>

<!-- that is the whole install. works with any HTML,
     React, Vue, Svelte, plain files: the engine
     re-matches automatically when the DOM changes -->`} />
            <CodeBlock file="step 2: app.dssl" code={`.go {
  padding: 12 20
  radius: md
  background: color.accent     // a built-in default token
  color: white
  font-weight: 700
  transition: 150

  hover  { translate: 0 -2; shadow: md }
  active { translate: 0 }
}`} />
            <CodeBlock file="step 3: use it" code={`<button class="go">Hello, DSSL</button>`} />
            <div className="note">
              <b>That&apos;s the entire mental model.</b> Bare numbers are pixels, known
              token names just resolve, and nested blocks like <code>hover</code> are
              states. You never have to touch the machinery below, but it&apos;s there
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
              Tokens are the variables. A sensible default set ships with the engine,{" "}
              <code>color.ink</code>, <code>color.accent</code>, <code>space.1–.8</code>,{" "}
              <code>radius</code>, <code>shadow</code>, <code>font</code>, so your first
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
                These dots resolve <code>color.*</code> tokens, flip the theme in the nav
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
            <p className="doc-lead" style={{ marginTop: 14 }}>
              <b>v0.7: numeric token keys.</b> The built-in spacing scale stops at 8,
              but big pages need more room, so token keys can be numbers now: define{" "}
              <code>tokens {'{ space { 9: 96 } }'}</code> and reference it as{" "}
              <code>space.9</code> like any other token. Outside a <code>tokens</code>{" "}
              block a numeric property name is still an error, but the error now says
              exactly that instead of a shrug.
            </p>
            <p className="doc-lead" style={{ marginTop: 14 }}>
              <b>v0.4: tokens can be re-declared per element.</b> Assign to a dotted
              token inside any rule and the custom property lands on that element;
              since custom properties inherit, every <code>var()</code> in the subtree
              re-resolves. This is how one card goes dangerous without a second
              stylesheet, and the re-declaration is still a validated token name, not
              a free-form string.
            </p>
            <CodeBlock file="scoped-tokens.dssl" code={`.danger {
  --color.accent: color.err   // re-declare accent for this subtree
  --radius.md: 4              // sharper corners too, why not
}

// everything below re-resolves automatically:
.danger .badge {
  color: color.accent-ink
  background: color.accent    // ← now the error red
}`} />
            <div className="demo-box">
              <div className="tok-scope">
                <div className="tok-demo">
                  <button type="button" className="tok-dot">accent</button>
                  <button type="button" className="tok-dot">err</button>
                  <button type="button" className="tok-dot">muted</button>
                </div>
                <p className="doc-lead fine-print">
                  Inside this dashed box, <code>--color.accent: color.ok</code>, hover
                  the dots and their hover accent comes out <i>green</i>, while the same
                  dots anywhere else on this page hover oxblood. One declaration, whole
                  subtree re-resolved.
                </p>
              </div>
            </div>
          </section>

          <section className="doc-block" id="selectors">
            <h2 className="section-title">Selectors & nesting</h2>
            <p className="doc-lead">
              Every CSS selector works, elements, classes, ids, attributes, combinators,
              structural pseudo-classes. Nesting is native: a nested selector is a
              descendant; <code>&amp;</code> substitutes the parent explicitly.
            </p>
            <p className="doc-lead">
              The structural set rides native matching, so it all just works:{" "}
              <code>:nth-child()</code>, <code>:nth-of-type()</code>, <code>:not()</code>,{" "}
              <code>:is()</code>, <code>:where()</code> and <code>:has()</code>. You do
              not need a class per list item, stop at the container and let the
              structure do the counting.
            </p>
            <CodeBlock file="selectors.dssl" code={`.gallery {
  gap: space.4

  .tile { shadow: sm }              // .gallery .tile
  &.featured { border-color: color.accent }   // .gallery.featured
  > .tile:nth-child(2n) { translate: 0 -2 }
  > .tile:has(img) { shadow: lg }   // relational: tiles that contain an image

  hover {                            // states nest too (next section)
    .tile { shadow: lg }
  }
}`} />
          </section>

          <section className="doc-block" id="states">
            <h2 className="section-title">States</h2>
            <p className="doc-lead">
              An element&apos;s own pseudo-states are plain nested blocks,{" "}
              <code>hover</code>, <code>focus</code>, <code>focus-visible</code>,{" "}
              <code>active</code>, <code>disabled</code>, <code>checked</code>… The engine
              listens to the events and re-evaluates live, both entering{" "}
              <b>and leaving</b> a state. Rules inside a state block can target
              descendants (tooltips, dropdowns) or the element itself.
            </p>
            <p className="doc-lead">
              One state is not CSS at all: <code>seen</code> is engine-native, it fires
              once, the first time the element scrolls into the viewport. It is how you
              build reveal-on-scroll without a line of JavaScript (see <b>Motion</b> for
              the full choreography).
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
                  This card lifts on hover, and settles back down when you leave.
                </span>
              </div>
              <button type="button" className="doc-btn">Tab to me: focus-visible ring</button>
            </div>
          </section>

          <section className="doc-block" id="pseudo-elements">
            <h2 className="section-title">Pseudo-elements</h2>
            <p className="doc-lead">
              Inline styles reach every element in the DOM, but a pseudo-element has no
              DOM handle, so <code>::before</code>, <code>::after</code>,{" "}
              <code>::selection</code> and friends are the one thing DSSL compiles into a
              real stylesheet. Both spellings are the same rule: nested inside the block,
              or written as a full selector. Before v0.5 the full-selector form compiled{" "}
              <code>ok: true</code> and then matched nothing, a silent dead rule in a
              language whose whole pitch is loud errors. The trap is closed: the resolver
              splits any selector carrying <code>::</code> and routes it down the same
              shadow-CSS pipeline as the nested form.
            </p>
            <CodeBlock file="pseudo.dssl" code={`// all three spellings are the same rule now
.card::before { content: "" }        // full selector
.card {
  ::before { content: "" }           // nested
  &::before { content: "" }          // explicit &
}

// states, @media, @container and @signal compose as everywhere else
.card:hover::before { background: color.accent }

// vendor pseudo-elements pass through verbatim, trailing states included
input::-webkit-slider-thumb { background: color.accent }

// and the loud errors stayed loud:
//   .card::befor { }        →  error: unknown pseudo-element "::befor"
//   .card:seen::before { }  →  error: seen can't cross into shadow CSS
//   .a, .b::before { }      →  error: mixed selector list, split it`} />
            <div className="demo-box">
              <div className="pe-demo">
                <span className="pe-tag">styled by .pe-tag::before, the full-selector form</span>
                <span className="pe-dot" />
                <span className="pe-tail">pe-pulse · 1200ms · infinite alternate</span>
              </div>
              <p className="doc-lead fine-print">
                The oxblood square is a <code>.pe-tag::before</code> rule written in the
                full-selector form in this page&apos;s stylesheet, the spelling that used
                to die silently. The dot runs{" "}
                <code>animate: pe-pulse 1200 infinite alternate</code>, v0.5&apos;s first
                loop. If both look right, the trap is staying closed.
              </p>
            </div>
          </section>

          <section className="doc-block" id="world">
            <h2 className="section-title">@media · @container · @signal</h2>
            <p className="doc-lead">
              The world around the element is one shape: CSS-shaped conditions, composed
              by nesting. v0.3 added one-word sugar for the conditions everyone writes,{" "}
              <code>@media dark</code>, <code>@media 768</code> (this wide or wider),{" "}
              <code>@media 480..960</code> (a range), while the full CSS form keeps
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
              <div className="signal-box">@signal docdemo == hot: cold</div>
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
              default to <code>components</code>, most stylesheets never name a layer at
              all. The <code>pin</code> block is the single sanctioned escape hatch.
            </p>
            <CodeBlock file="cascade.dssl" code={`#hero .title { color: color.ink }

.legacy .panel .title { color: color.paper }
// ↑ WINS in DSSL (it is later), CSS would score the #id higher

@layer utilities {
  .mt-0 { margin-top: 0 }
}

.wonky-badge {
  pin: color color.accent-ink    // beats everything DSSL emitted
}`} />
            <div className="note">
              <b>Why no specificity?</b> Because it never survives contact with a real
              codebase. Source order is readable, predictable, and refactorable, and when
              you truly need to win, <code>pin</code> says so explicitly instead of
              leaking <code>!important</code> into every stylesheet.
            </div>
          </section>

          <section className="doc-block" id="semantic">
            <h2 className="section-title">Semantic properties</h2>
            <p className="doc-lead">
              All standard CSS properties pass through untouched. On top of them, DSSL
              speaks a small design vocabulary, properties that expand to the machinery
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
                <tr><td><code>place</code> / <code>align</code></td><td><code>place: center</code></td><td>place-items/content · align-items: alignment implies a formatting context (see <code>center</code>)</td></tr>
                <tr><td><code>center</code></td><td><code>center: both</code> · <code>center: x</code> · <code>center: y</code></td><td>the centering primitive. The engine promotes any element to a grid/flex context first (inline → inline-grid, block → grid; an explicit <code>display:</code> still wins), so centering works on a span, a button, anything</td></tr>
                <tr><td><code>cover</code></td><td><code>cover: fixed</code></td><td>position + inset: 0</td></tr>
                <tr><td><code>sticky</code></td><td><code>sticky: 0</code></td><td>position: sticky; top: 0px</td></tr>
                <tr><td><code>font</code></td><td><code>font: 16/1.4 ink</code></td><td>font-size / line-height / color</td></tr>
                <tr><td><code>fluid</code></td><td><code>fluid: 16, 24</code></td><td>a size that grows smoothly from 16px at a 360px window to 24px at 1200px (px, rem or em)</td></tr>
                <tr><td><code>shadow</code> / <code>radius</code></td><td><code>shadow: lg</code></td><td>token presets (sm/md/lg/xl) or raw values</td></tr>
                <tr><td><code>circle</code></td><td><code>circle: 36</code></td><td>width + height + border-radius: 50%</td></tr>
                <tr><td><code>grow</code> / <code>shrink</code> / <code>basis</code></td><td><code>grow: 1</code></td><td>flex-grow / flex-shrink / flex-basis</td></tr>
                <tr><td><code>truncate</code></td><td><code>truncate</code></td><td>ellipsis overflow (overflow hidden, nowrap)</td></tr>
                <tr><td><code>visually-hidden</code></td><td><code>visually-hidden</code></td><td>the a11y classic, invisible to eyes, announced by screen readers (clip pattern, one word instead of nine lines)</td></tr>
                <tr><td><code>z</code></td><td><code>z: 50</code></td><td>z-index</td></tr>
                <tr><td><code>transition</code></td><td><code>transition: 150 snap</code> · <code>transition: 150 snap background-color, 300 transform</code></td><td>all 150ms, or per-property specs: duration · easing · property per comma part</td></tr>
                <tr><td><code>animate</code></td><td><code>animate: pop 400 snap</code></td><td>Web Animations API run of a motion block</td></tr>
                <tr><td><code>stagger</code></td><td><code>stagger: 60</code> · <code>stagger: none</code></td><td>choreography, each element child&apos;s animation delay is offset by its DOM position × 60ms (works with <code>seen</code>; see Motion)</td></tr>
              </tbody>
            </table>
            <p className="tbl-note">Named easings: <code>snap</code>, <code>smooth</code>, <code>bounce</code> + the standard set.</p>
          </section>

          <section className="doc-block" id="behaviors">
            <h2 className="section-title">Behaviors</h2>
            <p className="doc-lead">
              A behavior is a named chunk of DSSL, declarations, states, even nested
              rules, spliced into any rule with <code>use</code>. Perfect for focus
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
// reused by @media and @signal, define once, apply twice`} />
          </section>

          <section className="doc-block" id="overlap">
            <h2 className="section-title">Overlap</h2>
            <p className="doc-lead">
              CSS will stack any two boxes on top of each other and say nothing, even when
              one of them sits at 45% opacity and the blend underneath turns to mud. DSSL
              refuses. The <code>overlap</code> property is a policy, not a paint
              instruction: after layout, the engine measures real boxes and, when a
              transparent element lands on something, it escapes along the shortest axis.
              The nudge travels through the separate <code>translate</code> channel, the
              one property <code>transform</code> never touches, so your transforms and
              animations never notice a fight, and a <code>transition</code> on
              <code> translate</code> makes the escape glide.
            </p>
            <CodeBlock file="overlap.dssl" code={`// one line, site-wide: nothing below 100% opacity may overlap anything
body { overlap: auto }

// or per element: this box always yields, opaque or not
.badge { overlap: deny }

// the deliberate exceptions, scrims, veils, translucent navs, opt out
.veil { overlap: allow }`} />
            <p className="doc-lead">
              The policy inherits like <code>font-family</code>: set it once on
              <code> body</code> and every descendant carries it until something overrides.
              <code> auto</code> means <b>yield only while your computed opacity is below
              100%</b>, an opaque element is never touched, and an element whose animation
              pulses opacity in and out becomes a candidate exactly while it is translucent.
              Bigger boxes anchor first, so decorations yield to content, and an element is
              never counted as an obstacle to its own subtree (that is containment, not
              collision). Unknown policies fail loud, like everything else:
              <code> overlap: never</code> → <i>unknown overlap policy “never”</i>.
            </p>
            <p className="doc-lead">
              <b>The sibling feature:</b> a decorative overlay parked on top of text
              also eats clicks and text selection, the pointer hits the veil, not the
              words underneath. <code>pointer-events: none</code> is the one-liner: the
              overlay keeps rendering, but the pointer falls through, so selection and
              buttons work again. Pair it with <code>overlap: allow</code> when the veil
              is intentional, the geometry stays honest while hit-testing gets out of
              the way.
            </p>
            <CodeBlock file="veil.dssl" code={`.veil {
  position: absolute
  inset: 0
  gradient: linear to bottom, color.ink/20 -> transparent
  pointer-events: none     // look, don't touch, selection passes through
  overlap: allow           // it is SUPPOSED to sit there
}`} />
            <div className="demo-box">
              <div className="ov-stage" data-ov-off={ovOff ? "" : undefined}>
                <div className="ov-card">
                  <span className="ov-card-title">opaque card, it never moves</span>
                  <span className="ov-card-sub">
                    the ghost badge is opacity: 0.45, parked on top of this text. Under
                    the site-wide policy it is not allowed to stay there.
                  </span>
                </div>
                <span className="ov-ghost">ghost · opacity: 0.45</span>
              </div>
              <button type="button" className="doc-btn" onClick={() => setOvOff(!ovOff)}>
                {ovOff ? "re-arm the policy: remove the opt-out" : "exempt the ghost · overlap: allow"}
              </button>
              <p className="doc-lead fine-print">
                This is the site&apos;s real policy working, not a picture: this page loads
                <code> body </code>with <code>{"{ overlap: auto }"}</code>, the ghost is a
                genuine 45%-opacity element, and the shove you see is the engine&apos;s
                shortest-escape math running after layout. Flip the switch and the ghost
                gets its own <code>overlap: allow</code>, the same opt-out a scrim or a
                translucent nav uses, and glides right back on top.
              </p>
            </div>
          </section>

          <section className="doc-block" id="motion">
            <h2 className="section-title">Motion</h2>
            <p className="doc-lead">
              Declare a <code>motion</code> with keyframe blocks (<code>from</code>,{" "}
              <code>to</code>, <code>at 40%</code>), the missing end interpolates from the
              element&apos;s natural state. Apply it with <code>animate</code>. The engine
              runs it through the Web Animations API, and every animation silently
              disables under reduced-motion unless the motion is{" "}
              <code>essential: true</code>. v0.5 adds <code>infinite</code>, loop
              forever, and <code>alternate</code>, which ping-pongs the direction
              instead of restarting.
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
}

.pe-dot {
  animate: pe-pulse 1200 infinite alternate   // v0.5: loops, ping-pongs
}`} />
            <div className="demo-box">
              <div className="motion-box">motion pop: replay me</div>
              <button type="button" className="doc-btn" onClick={() => window.DSSL?.replay(".motion-box")}>
                <span className="tok-demo"><PlayIcon /> DSSL.replay(&apos;.motion-box&apos;)</span>
              </button>
            </div>
            <p className="doc-lead" style={{ marginTop: 18 }}>
              <b>v0.4: choreography.</b> Two additions turn motion into a
              reveal-on-scroll system, still with zero JavaScript. <code>seen</code> is
              an engine-native state that fires once when the element enters the
              viewport, content can never be trapped invisible, because with no
              IntersectionObserver everything counts as seen. And a parent with{" "}
              <code>stagger: 60</code> offsets each element child&apos;s animation delay
              by its DOM position, so grids and lists cascade in instead of arriving as
              one wall.
            </p>
            <CodeBlock file="reveal.dssl" code={`motion rise-in {
  from { opacity: 0; translate: 0 14 }
}

.pt-grid { stagger: 70 }        // child i waits i × 70ms

.pt-card {
  seen {                        // engine-native: fires once on scroll-in
    animate: rise-in 420 snap
  }
}`} />
            <div className="demo-box">
              <div className="pt-grid">
                {["1 parse", "2 resolve", "3 match", "4 style"].map((s) => {
                  const [n, ...rest] = s.split(" ");
                  return (
                    <div key={s} className="pt-card">
                      <span className="pt-num">{n}</span>
                      <span>{rest.join(" ")}</span>
                    </div>
                  );
                })}
              </div>
              <p className="doc-lead fine-print">
                These four cards were below your scroll position a moment ago, they
                cascaded in via <code>seen</code> + <code>stagger: 70</code>, no JS.
                Reload the page and scroll back here to watch it again.
              </p>
            </div>
          </section>

          <section className="doc-block" id="deform">
            <h2 className="section-title">Deform: bend, stretch, fold</h2>
            <p className="doc-lead">
              The deform family gives a box give. <code>bend</code> bows the element in
              3D, positive tips the top away from you, negative leans it forward, and{" "}
              <code>bend-y</code> bows it sideways. <code>bend-up</code> rocks it back on
              its bottom edge like a drawbridge, <code>fold</code> swings it up over its
              top edge like a page closing, and <code>stretch</code> is cartoon squash
              and stretch that keeps volume: stretched 1.2 wide, it honestly shrinks to
              1/1.2 tall. Every member composes into the one <code>transform</code>{" "}
              channel, alongside anything you wrote there, so a single{" "}
              <code>transition</code> tweens them and states fire them for free.
            </p>
            <CodeBlock file="deform.dssl" code={`.btn {
  transition: 200 snap transform

  hover  { bend: 5 }                    // a gentle lean
  active { bend: 16; stretch: 0.94 }    // flex under the pointer
}

.flag { bend-y: -18 }                   // sideways bow
.card { hover { bend-up: 14 } }         // drawbridge, bottom edge planted
.sheet { hover { fold: 14 } }           // folds over its top edge

motion wobble {
  from { bend: 0; stretch: 1 }
  to   { bend: 24; stretch: 1.12 }      // deform works in keyframes too
}
.bouncy { animate: wobble 900 infinite alternate }`} />
            <p className="doc-lead">
              And <code>bend-around</code> curves a container&apos;s children along an arc
              instead of deforming one element: positive degrees wrap the row around an
              invisible ball (a dome), negative opens it into a smile. The engine reads
              the container&apos;s real width, plants a pivot per child and rotates each
              one into place, hover states and bends on the children keep working,
              because their own transforms run inside the arc rotation. Unknown values
              fail loud like everywhere else: <code>stretch: 0</code> →{" "}
              <i>would flatten the element to nothing</i>, <code>bend-around: 200</code>{" "}
              → <i>caps at ±170°</i>.
            </p>
            <div className="demo-box">
              <div className="df-row">
                <button type="button" className="df-btn">press and hold: I bend</button>
                <div className="df-mini df-up">hover · bend-up</div>
                <div className="df-mini df-fold">hover · fold</div>
              </div>
              <div className="df-arc">
                {["alpha", "beta", "gamma", "delta", "epsilon"].map((w) => (
                  <span key={w} className="df-chip">{w}</span>
                ))}
              </div>
              <p className="doc-lead fine-print">
                All of it is live. The button flexes under <code>:active</code> because
                its cascade owns a <code>transition</code> on <code>transform</code>,
                the deform family lands in that same channel. The chip row is a real{" "}
                <code>bend-around: -22</code> container; resize the page and the engine
                re-lays the arc from the measured width. The mini cards bend up and fold
                over on hover, <code>bend-up</code> plants the bottom edge,{" "}
                <code>fold</code> plants the top one, and both pivots are baked into the
                transform, so your own <code>transform-origin</code> is never touched.
              </p>
            </div>
          </section>

          <section className="doc-block" id="gradients">
            <h2 className="section-title">Gradient tools</h2>
            <p className="doc-lead">
              <code>gradient</code> replaces the function soup with a sentence: a kind,{" "}
              <code>linear</code>, <code>radial</code> or <code>conic</code>, an optional
              direction or shape, then color stops. Join stops with <code>-&gt;</code>{" "}
              arrows, or just commas; both read the same. A stop can be a hex, a color
              name, a token, an alpha mix like <code>color.ink/40</code>, and may carry a
              trailing <code>%</code> position. And because a stop is a color by
              definition, one that is not fails loud at compile time instead of becoming
              a silently missing background.
            </p>
            <CodeBlock file="gradient.dssl" code={`.banner {
  gradient: linear 135, color.accent -> color.ok
  gradient-flow: 6s alternate    // the gradient drifts, forever
}

.headline {
  gradient-text: linear to right, color.accent, color.ink
}

.glow { gradient: radial circle at 30% 20%, color.card -> transparent }
.pie  { gradient: conic from 45, color.accent, color.line, color.card, color.accent }`} />
            <p className="doc-lead">
              <code>gradient-text</code> clips the same grammar into the glyphs (standard
              and <code>-webkit</code> plumbing included). <code>gradient-flow</code> loops{" "}
              <code>background-position</code> through the Web Animations API so the
              gradient drifts endlessly, duration, an optional easing, and{" "}
              <code>alternate</code> to ping-pong, and it holds still under
              reduced-motion, like every other motion here. If the element has no
              background to flow, the engine says so instead of animating nothing.
            </p>
            <div className="demo-box">
              <div className="gd-banner">this banner flows: gradient-flow: 7s alternate</div>
              <div className="gd-headline">gradient text, one line of DSSL</div>
              <div className="gd-sw-row">
                <div className="gd-sw gd-lin" />
                <div className="gd-sw gd-rad" />
                <div className="gd-sw gd-con" />
              </div>
              <p className="doc-lead fine-print">
                The banner is a real <code>gradient-flow</code> loop, the headline is{" "}
                <code>gradient-text</code>, and the three swatches are the kinds in one
                line each: linear with an angle, radial with a shape and position, conic
                with a start angle. The engine sized the banner&apos;s background to 200%
                automatically, a gradient at 100% has nowhere to slide.
              </p>
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
              friends are your business, the loud checks protect the design vocabulary,
              not the pressure valve.
            </div>
            <p className="doc-lead" style={{ marginTop: 14 }}>
              <b>v0.7: compiler warnings.</b> Some things compile, run, and are still
              probably not what you meant. Those are warnings: <code>ok</code> stays{" "}
              <code>true</code>, but the console says it out loud. The first one: inside
              a single rule, a layout shorthand that expands to <code>display</code>{" "}
              (<code>column:</code>, <code>row:</code>, <code>grid:</code>,{" "}
              <code>stack:</code>) silently overriding an explicit{" "}
              <code>display:</code> written earlier in the same rule, later wins, so
              your <code>display: none</code> is dead and the menu stays open. The
              warning names both lines and tells you which order wins.
            </p>
            <CodeBlock file="warning.dssl" code={`.nav-links {
  display: none      // ✗ warning: "column:" expands to display: flex,
  column: gap 2      //   overrides the earlier "display: none" (line 2)
                     //  , the menu stays open
}

// fixed: shorthand first, or the display you mean to win last
.nav-links {
  column: gap 2
  display: none      // intentional, and now warning-free
}`} />
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
                <tr><td><code>DSSL.compile(src)</code></td><td>parse + resolve without touching the DOM, powers the playground</td></tr>
                <tr><td><code>DSSL.signal(name, value)</code></td><td>set/clear a signal; @signal rules re-evaluate instantly</td></tr>
                <tr><td><code>DSSL.replay(sel?)</code></td><td>re-run animations on matching elements</td></tr>
                <tr><td><code>DSSL.refresh()</code></td><td>full re-compute (rarely needed, the engine watches the DOM)</td></tr>
                <tr><td><code>DSSL.errors()</code></td><td>structured errors from the last apply</td></tr>
                <tr><td><code>DSSL.freeze() / unfreeze()</code></td><td>stop (or resume) all ambient restyling, see <a href="#performance"><b>Performance</b></a></td></tr>
                <tr><td><code>DSSL.explain(el, opts?)</code></td><td>matched rules, file/line, winning declarations for one element, see <a href="#performance"><b>Performance</b></a></td></tr>
              </tbody>
            </table>
            <p className="tbl-note">
              Auto-boot picks up <code>link[rel=&quot;stylesheet/dssl&quot;]</code> and{" "}
              <code>style[type=&quot;text/dssl&quot;]</code>, then fires{" "}
              <code>dssl-ready</code> on <code>window</code>.{" "}
              <code>&lt;html data-dssl-reset&gt;</code> enables the small built-in reset.
            </p>
          </section>

          <section className="doc-block" id="performance">
            <h2 className="section-title">Performance, freeze, explain &amp; the cost of live</h2>
            <p className="doc-lead">
              DSSL is a runtime: it walks the DOM, matches rules, and writes inline
              styles. That buys you live tokens, live signals and live layout, and it
              costs more than a static stylesheet, by design. Here is the honest ledger
              and the two tools that tip it back.
            </p>

            <h3 className="doc-h3">Wait for <code>dssl-ready</code>, not DOMContentLoaded</h3>
            <p className="doc-lead">
              The engine styles the DOM <i>after</i> the parser resolves, which lands
              after <code>DOMContentLoaded</code>. Code that measures layout too early
              will read a half-styled world, <code>padding: 0</code>,{" "}
              <code>border-radius: 0</code>, a default border, and then watch it
              resolve a moment later. If your script measures, animates, or mounts on
              top of styled geometry, wait for the engine:
            </p>
            <CodeBlock file="settle.js" code={`// wrong: reads geometry before the engine's first pass
window.addEventListener('DOMContentLoaded', measure)

// right: the engine announces readiness (with its version)
window.addEventListener('dssl-ready', (e) => {
  measure()   // styles are fully applied, measure whatever you like
})`} />

            <h3 className="doc-h3"><code>DSSL.freeze()</code>, keep the look, drop the cost</h3>
            <p className="doc-lead">
              A page that does not need <i>live</i> restyling should not keep paying
              for it. <code>freeze()</code> detaches every observer and listener, the
              MutationObserver, ResizeObserver, IntersectionObserver, media listeners,
              state events, the overlap heartbeat, and leaves the resolved inline
              styles exactly where they are. The page keeps its look at zero engine
              cost, which is what makes ten-thousand-node pages viable. Explicit calls
              still work: <code>apply()</code>, <code>signal()</code>,{" "}
              <code>refresh()</code> and <code>replay()</code> each drain synchronously,
              and <code>unfreeze()</code> re-arms everything and recomputes once.
            </p>
            <CodeBlock file="freeze.js" code={`// render the whole product grid, then stop reacting
DSSL.load(['/styles/app.dssl']).then(() => {
  const stats = DSSL.freeze()
  // → { frozen: true, engine: 'global', elements: 10432, rules: 311, shadowRules: 4 }
})

// months later, a modal needs styling:
DSSL.apply(modalStyles)        // explicit calls still drain
DSSL.unfreeze()                // …or go fully live again`} />
            <div className="note">
              <b>Frozen means frozen.</b> While frozen, the page is a snapshot: hover
              styles, <code>seen</code> reveals, media flips and overlap nudges all
              sleep. If your page lives on interaction states, freeze is not for it,
              use it on the rendered-out pages that are just sitting there being read.
            </div>

            <h3 className="doc-h3"><code>DSSL.explain(el)</code>, the DevTools panel</h3>
            <p className="doc-lead">
              Inline styles trade the cascade for a style attribute, and "which rule
              wrote this one declaration?" is the honest cost. <code>explain()</code>{" "}
              hands the cascade back as data: every rule that matched, with its source
              file and line, every state/media/signal condition attached, the winning
              declaration per property, and the rule that beat the others for it.
            </p>
            <CodeBlock file="explain.js" code={`const rep = DSSL.explain(document.querySelector('.doc-card'))
// rep.matched, [{ id, sel, layer, file, line, states, media, signals, decls }]
// rep.wins   , [{ prop, value, by: { sel, file, line } }]  the final cascade
// rep.pseudo , ::before / ::after shadow rules touching this element
// + a readable group printed to the console (pass { quiet: true } for data only)`} />

            <h3 className="doc-h3">The honest ledger</h3>
            <p className="doc-lead">
              For creative sites, prototypes, docs and design-system playgrounds, the
              live model is the point, iteration speed beats parse speed. For a
              ten-thousand-node application page, combine the tools: keep stylesheets
              small, prefer structural selectors over class spam, freeze after the
              first paint when the page goes static, and use <code>explain()</code>{" "}
              instead of console archaeology when something looks off. The engine also
              pre-filters every rule through a cheap class/tag/id gate before native
              matching, so a full recompute skips the obvious non-matches instead of
              asking the browser rule by rule.
            </p>
          </section>

          <section className="doc-block" id="interop">
            <h2 className="section-title">Interop: React, hydration &amp; friends</h2>
            <p className="doc-lead">
              DSSL is deliberately framework-agnostic: it styles whatever DOM exists,
              so it works under React, Vue, Svelte or plain HTML. But if you render
              with React there is <b>one known, harmless notice</b> you should
              understand, and this very site is the living example.
            </p>
            <div className="note">
              <b>Why the notice happens.</b> The engine applies styles to the SSR DOM
              <i> before</i> React hydrates, that is the whole anti-flash design. React
              then compares the DOM against its virtual render, finds extra
              <code> style="--dssl-*…"</code> attributes it did not put there, and logs
              one hydration diff to the console. React explicitly <b>does not patch
              them away</b>, it leaves the engine&apos;s styles alone. Nothing is wrong:
              the styles are working exactly as intended.
            </div>
            <p className="doc-lead">
              In dev builds that single notice can surface as a "1 Issue" overlay badge,
              because Next&apos;s dev tools wrap <code>console.error</code> and count
              everything they see. This site installs an <i>assignment trap</i>: the moment
              Next assigns its own collector, the shim captures it and re-publishes the
              filter as the <b>outermost</b> layer, so DSSL&apos;s own diff is swallowed
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
              registry notices the removal via MutationObserver and cleans up, no
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
