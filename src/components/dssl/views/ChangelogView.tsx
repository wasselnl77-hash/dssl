"use client";

import CodeBlock from "../CodeBlock";

const ENTRIES: {
  version: string;
  date: string;
  title: string;
  why?: string;
  body: string;
  code?: string;
  kind?: "spec" | "vote" | "add";
}[] = [
  {
    version: "v0.1",
    date: "phase 1 · draft",
    title: "“First Light” draft published",
    kind: "spec",
    body:
      "The full language spec goes up for review: thesis (CSS talks to the engine, DSSL talks to the design), tokens, one-cascade-sentence, semantic properties, behaviors, motion, signals, loud errors — and a deliberate list of what v0.1 would NOT do.",
  },
  {
    version: "v0.1 → v0.2",
    date: "phase 1 · ratification",
    title: "Seven votes, seven decisions",
    kind: "vote",
    body:
      "Braces over indentation. Own engine over compile-to-CSS (the bold pick). Bare numbers are px. Cascade: layers + order, no specificity, no !important. Moderate vocabulary. CSS-shaped conditions (@media, nested state blocks — plus @signal as the JS bridge). Docs site shape. The spec was amended to match.",
  },
  {
    version: "v0.2.0",
    date: "build phase",
    title: "Engine skeleton",
    kind: "add",
    body:
      "parser.js → resolver.js → engine.js → index.js: the four-module runtime. Braces grammar with one-liners, flattening, behaviors, motion, scoped engines, event-delegated states, MutationObserver re-matching. ~1,000 lines, zero dependencies.",
  },
  {
    version: "v0.2.1",
    date: "build phase",
    title: "Color-aware functions",
    why: "tokens.dssl — the palette",
    body:
      "The first stylesheet broke the compiler: oklch(62% 0.19 35) had its chroma and hue gaining phantom px. Bare numbers inside color functions (oklch, rgb, color-mix, cubic-bezier, steps…) must stay bare; calc-family keeps px.",
    code: `// before: oklch(62% 0.19px 35px)  ← nonsense
accent: oklch(62% 0.19 35)   // now: untouched`,
  },
  {
    version: "v0.2.2",
    date: "build phase",
    title: "Color-space & gradient vocabulary",
    why: "site.dssl — chrome",
    body:
      "Real stylesheets say “in oklab”, “to bottom right”, “flex-end”, “thin”, “collapse”, “vertical”. The keyword pass-list grew from ~200 to ~260 words. Loud errors need a generous dictionary.",
  },
  {
    version: "v0.2.3",
    date: "build phase",
    title: "circle: sugar",
    why: "theme toggle & feature icons",
    body:
      "size: 36 + border-radius: 50% appeared four times before anyone admitted it was one concept. circle: N sets width, height and a 50% radius.",
    code: `.theme-btn {
  circle: 36
  place: center
}`,
  },
  {
    version: "v0.2.4",
    date: "build phase",
    title: "Multi-atom radius presets",
    why: "code block headers",
    body:
      "radius: md md 0 0 — a corner-aware radius that mixes token presets with raw values, per atom. The single-atom shortcut had to become a real parser.",
    code: `.code-head + .code {
  radius: 0 0 md md
}`,
  },
  {
    version: "v0.2.5",
    date: "build phase",
    title: "Multi-line values & selector lists",
    why: "hero gradients, nav active states",
    body:
      "The parser was strictly line-oriented, which died the moment a radial-gradient wanted two lines or the nav wanted a five-selector list. Logical chunks now continue while parens are open or the line ends with a top-level comma/colon.",
    code: `background:
  radial-gradient(ellipse at 30% 0%, color.accent/14,
    transparent 55%),
  color.card

[data-view="home"] .nl-home,
[data-view="docs"] .nl-docs {
  color: color.accent
}`,
  },
  {
    version: "v0.2.6",
    date: "build phase",
    title: "align: property",
    why: "nav & footer centering",
    body:
      "align: center → align-items: center. The one-word grid/flex alignment the vocabulary was missing.",
  },
  {
    version: "v0.2.7",
    date: "build phase",
    title: "Top-level pseudo-elements",
    why: "site.dssl — ::selection",
    body:
      "::selection at the top level now means “every element” (::selection with a * base) instead of an error.",
  },
  {
    version: "v0.2.8",
    date: "build phase",
    title: "Shared token registry",
    why: "every view referencing the palette",
    body:
      "Each bundle resolved in isolation, so color.code-bg — defined in tokens.dssl — was invisible to site.dssl. Bundles now resolve against a registry that folds in every previous bundle's tokens, in load order.",
  },
  {
    version: "v0.2.9",
    date: "build phase",
    title: "Scoped stylesheets & scoped tokens",
    why: "the playground",
    body:
      "The playground applies user code with DSSL.apply(src, { scope: '#pg-canvas', name: 'pg', replace: true }). Scoped engines keep stylesheets sandboxed, and :root rules map onto the scope element so presets can define their own tokens without touching the page.",
    code: `DSSL.apply(src, {
  scope: '#pg-canvas',
  name: 'pg',
  replace: true,
})`,
  },
  {
    version: "v0.2.11",
    date: "browser testing",
    title: "Stale-style cleanup",
    why: "the theme toggle",
    body:
      "Cycling auto → light → dark → auto left the theme icons invisible: computeAll only enumerated elements whose rules CURRENTLY matched, so elements a rule had stopped matching were never cleaned up. The engine now keeps a registry of every element it ever styled (with mutation-driven garbage collection) and re-evaluates all of them.",
  },
  {
    version: "v0.2.12",
    date: "browser testing",
    title: "Registry as a base bundle",
    why: "dark mode itself",
    body:
      "Every stylesheet bundle re-emitted the full token map unconditionally, so site.dssl's light tokens out-cascaded tokens.dssl's @signal dark palette — dark mode silently stayed light. Bundles now emit only the tokens they actually declare, and the shared registry is installed once as a base bundle that sorts below every author rule.",
  },
];

export default function ChangelogView() {
  return (
    <div className="wrap">
      <div className="page-head">
        <div className="kicker">built with itself</div>
        <h1 className="page-title">Changelog</h1>
        <p className="page-sub">
          The deal was: build the language, then build its website, and every time the
          website needs something the language lacks — add it, honestly. This page is
          that list.
        </p>
      </div>

      <div className="tl">
        {ENTRIES.map((e) => (
          <div key={e.version + e.title} className={`tl-item ${e.kind === "add" ? "tl-item-add" : ""}`}>
            <span className="tl-date">{e.date}</span>
            <span className="tl-version">{e.version}</span>
            {e.why && <span className="tl-why">needed by: {e.why}</span>}
            <h3>{e.title}</h3>
            <p>{e.body}</p>
            {e.code && <CodeBlock plain code={e.code} />}
          </div>
        ))}
      </div>
    </div>
  );
}
