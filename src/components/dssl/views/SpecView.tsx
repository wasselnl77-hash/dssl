"use client";

import CodeBlock from "../CodeBlock";

export default function SpecView() {
  return (
    <div className="wrap">
      <div className="page-head">
        <div className="kicker">normative</div>
        <h1 className="page-title">DSSL v0.2 — “First Light”, ratified</h1>
        <p className="page-sub">
          The v0.1 draft was put to a seven-point vote. This document is the ratified
          v0.2 result — every decision below is implemented by the engine serving this
          page. The engine itself has kept growing since: it is now at v0.3.3 (see the
          changelog for what the site demanded).
        </p>
      </div>

      <div className="docs-layout">
        <aside className="docs-side">
          {[
            ["decision", "Decision log"],
            ["architecture", "Architecture"],
            ["s-syntax", "Syntax"],
            ["s-tokens", "Tokens"],
            ["s-cascade", "Cascade"],
            ["s-conditions", "Conditions"],
            ["s-motion", "Motion"],
            ["s-signals", "Signals"],
            ["s-errors", "Errors"],
            ["s-limits", "Deliberate limits"],
            ["s-version", "Versioning"],
          ].map(([id, label]) => (
            <a key={id} href={`#${id}`}>{label}</a>
          ))}
        </aside>

        <div className="docs-body prose">
          <section className="doc-block" id="decision">
            <h2 className="section-title">Decision log</h2>
            <p className="doc-lead">
              Seven questions, seven answers — the draft spec was amended to match.
            </p>
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>Question</th><th>Decision</th><th>Consequence</th></tr>
              </thead>
              <tbody>
                <tr><td>1</td><td>Syntax style</td><td><b>Braces</b></td><td>C-shaped blocks; semicolons optional, newline-terminated declarations</td></tr>
                <tr><td>2</td><td>Styling engine</td><td><b>Own engine</b></td><td>No CSS output for regular rules — selectors matched against the live DOM, declarations applied directly; pseudo-elements excepted (shadow CSS)</td></tr>
                <tr><td>3</td><td>Bare numbers</td><td><b>px</b></td><td><code>padding: 16</code> is 16px; unitless preserved where CSS demands it</td></tr>
                <tr><td>4</td><td>Cascade</td><td><b>Layers + order</b></td><td>No specificity, no !important; five layers; pin as the only escape hatch</td></tr>
                <tr><td>5</td><td>Vocabulary</td><td><b>Moderate sugar</b></td><td>All CSS names valid + a small semantic set (row, grid, fluid, …)</td></tr>
                <tr><td>6</td><td>Conditions</td><td><b>CSS shapes</b></td><td>Nested state blocks (hover, focus…) + @media / @container; @signal added as the JS bridge</td></tr>
                <tr><td>7</td><td>Website shape</td><td><b>Docs site</b></td><td>Multi-view docs with live examples, playground, spec and changelog</td></tr>
              </tbody>
            </table>
          </section>

          <section className="doc-block" id="architecture">
            <h2 className="section-title">1 · Architecture</h2>
            <p>
              DSSL is a styling <b>language plus engine</b>. Source files use the{" "}
              <code>.dssl</code> extension. The engine — four dependency-free ES modules
              (parser, resolver, engine, API) — fetches stylesheets, parses them, resolves
              tokens, and computes styles for elements in the live DOM. It survives DOM
              mutations via a MutationObserver, re-evaluates states on interaction events,
              and re-runs media conditions through <code>matchMedia</code> listeners.
            </p>
            <p>
              Regular rules produce <b>no CSS</b>: winning declarations are applied to
              elements directly. Pseudo-elements, which cannot be expressed inline, are
              the single exception — they compile to a shadow stylesheet that references
              the same tokens. A tiny opt-in reset (<code>data-dssl-reset</code>) is
              likewise generated CSS, zero-specificity via <code>:where()</code>.
            </p>
            <CodeBlock file="pipeline.txt" code={`.dssl source
  └─ parser.js     braces syntax → node tree (loud, line-numbered errors)
      └─ resolver.js   tokens · semantic expansion · behaviors · flatten
          └─ engine.js   match → cascade (layer, order) → element.style
                          states via events · @media via matchMedia
                          motion via Web Animations API
              └─ shadow CSS  ::before/::after/::selection + reset only`} />
          </section>

          <section className="doc-block" id="s-syntax">
            <h2 className="section-title">2 · Syntax</h2>
            <ul>
              <li>Blocks open with <code>header {"{"}</code> and close with <code>{"}"}</code>; one-liners allowed.</li>
              <li>Declarations are <code>prop: value</code>, newline- or <code>;</code>-terminated. Valueless semantics (<code>truncate</code>) and <code>use name</code> need no colon.</li>
              <li>Comments: <code>{"//"}</code> and block comments. Strings are <code>&quot;…&quot;</code> or <code>&apos;…&apos;</code>.</li>
              <li>Values continue across lines while parens are open, or the line ends with a top-level comma or colon.</li>
              <li>Bare numbers are px; <code>16/1.4</code> size-over-lineheight in <code>font</code>; <code>token/40</code> is alpha.</li>
            </ul>
          </section>

          <section className="doc-block" id="s-tokens">
            <h2 className="section-title">3 · Tokens</h2>
            <p>
              <code>tokens {"{ }"}</code> blocks define named values in nested groups
              (<code>color.ink</code>, <code>space.4</code>). They compile to{" "}
              <code>--dssl-*</code> custom properties on <code>:root</code>. Reference
              resolution is strict: an identifier that matches no token and no known
              keyword is a compile error with a suggestion. Tokens may be defined
              conditionally (inside <code>@media</code>/<code>@signal</code>) — that is
              how theming works. Bundles share one token registry in load order.
            </p>
          </section>

          <section className="doc-block" id="s-cascade">
            <h2 className="section-title">4 · Cascade</h2>
            <p>
              For every element, the engine collects all structurally-matching rules
              whose conditions pass, sorts them by <b>(layer, source order)</b>, and
              applies declarations in sequence — later declarations overwrite earlier
              ones on the element. Layers, lowest first:
            </p>
            <CodeBlock plain code={`tokens < base < components < utilities < pin`} />
            <p>
              Author rules default to <code>components</code>. <code>@layer</code>{" "}
              re-assigns a subtree. <code>pin</code> blocks apply with{" "}
              <code>!important</code>-grade priority as the single sanctioned escape
              hatch. Selectors keep their native meaning — ids and pseudo-classes select
              exactly as in CSS — they simply carry <b>no weight</b> in conflict
              resolution.
            </p>
          </section>

          <section className="doc-block" id="s-conditions">
            <h2 className="section-title">5 · Conditions</h2>
            <ul>
              <li><b>Element states</b> — nested blocks named for the pseudo-class (<code>hover</code>, <code>focus-visible</code>, <code>active</code>, <code>disabled</code>, <code>checked</code>, …). The engine wires the events; rules re-evaluate live via <code>matches()</code>.</li>
              <li><b>@media</b> — any media query; bare numbers become px (<code>(width &gt;= 768)</code>).</li>
              <li><b>@container</b> — evaluated against the nearest ancestor with <code>container-type</code> set, tracked by the engine with a ResizeObserver.</li>
              <li><b>@signal</b> — <code>name</code> (truthy), <code>name == value</code>, <code>name != value</code>; driven from JS.</li>
              <li>Conditions compose by nesting; siblings AND together. Raw pseudo-classes in selector text (<code>.tab:hover</code>) also work.</li>
            </ul>
          </section>

          <section className="doc-block" id="s-motion">
            <h2 className="section-title">6 · Motion</h2>
            <p>
              <code>motion name {"{ }"}</code> declares keyframes (<code>from</code>,{" "}
              <code>to</code>, <code>at N%</code>); a single terminal block interpolates
              from the element&apos;s natural state. <code>animate: name duration easing fill</code>{" "}
              runs it via the Web Animations API — the engine deduplicates re-runs so
              recomputes never restart animations; <code>DSSL.replay()</code> does that
              on demand. Reduced-motion disables animations unless{" "}
              <code>essential: true</code>.
            </p>
          </section>

          <section className="doc-block" id="s-signals">
            <h2 className="section-title">7 · Signals</h2>
            <p>
              <code>DSSL.signal(name, value)</code> sets a named value in the engine and
              mirrors it onto <code>&lt;html&gt;</code> as{" "}
              <code>data-dssl-signal-&lt;name&gt;</code> — inspectable, framework-free
              theming and UI state. Clearing with <code>null</code> returns conditions to
              their system-preference defaults.
            </p>
          </section>

          <section className="doc-block" id="s-errors">
            <h2 className="section-title">8 · Errors</h2>
            <p>
              Unknown properties, unknown tokens, unknown motions, malformed conditions
              and bad header shapes are <b>compile errors</b> carrying file, line,
              message and — where the edit distance is close — a suggestion. Error
              objects are structured (<code>DSSL.errors()</code>) so tools like the
              playground can render them. Uncaught selector evaluation failures are
              contained per-rule and reported once.
            </p>
          </section>

          <section className="doc-block" id="s-limits">
            <h2 className="section-title">9 · Deliberate limits (v0.2)</h2>
            <ul>
              <li>No <code>@import</code>/module graph — bundles merge in load order.</li>
              <li>Behaviors take no parameters; no loops or user functions.</li>
              <li>Comma selector lists do not combine with nested state blocks (bind states per-rule instead).</li>
              <li>Pseudo-element rules accept declarations only.</li>
              <li>No minification or build step — the engine is the pipeline.</li>
            </ul>
            <div className="note">
              <b>The growth protocol:</b> anything the site needed that the language
              lacked was added to the language, logged in the changelog with the reason.
              That is how v0.1 became v0.2.
            </div>
          </section>

          <section className="doc-block" id="s-version">
            <h2 className="section-title">10 · Versioning</h2>
            <p>
              DSSL follows semver for the language surface: new semantic properties,
              condition kinds and API calls are minor versions; breaking grammar changes
              are major. The engine reports <code>DSSL.version</code> — currently{" "}
              <b>0.2.0</b>, “First Light”, ratified and grown during the construction of
              the site you are reading.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
