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
    version: "v0.4.2",
    date: "growth phase · distribution",
    title: "Themed scrollbars — vendor pseudo-elements join the grammar",
    why: "native scrollbars were the last thing on this page wearing browser defaults",
    kind: "add",
    body:
      "Styling a native scrollbar takes ::-webkit-scrollbar-thumb and friends — vendor pseudo-elements the parser refused by name; the curated list ended at ::selection. There is no DOM handle on a scrollbar, so they were the one styling job this language literally could not say. The rule grew the honest way: any ::-webkit-*, ::-moz-* or ::-ms-* name now passes through to the shadow-CSS exception verbatim, trailing states included, which is what makes the hover state on the thumb expressible. The scrollbars themselves are an ink pill floating on the paper track (transparent border + padding-box clip), waking to full attention on hover, with a rounded corner and an accent-tinted ::selection to match. Firefox keeps its native bars on purpose: standard scrollbar-color would be easy to add, but one non-auto value disables the webkit customization in Chromium, and the custom look wins.",
    code: `::-webkit-scrollbar { width: 12 }
::-webkit-scrollbar-thumb {
  background: color.ink/25
  border: 3 solid transparent
  radius: 999
  background-clip: padding-box
}

::-webkit-scrollbar-thumb:hover {
  background: color.ink/45     // states work on vendor pseudos
}`,
  },
  {
    version: "v0.4.1",
    date: "growth phase · stability",
    title: "The steady hand — idempotent styling, twitch eliminated",
    why: "the UI kept twitching under hover and resize storms",
    kind: "add",
    body:
      "A recompute is a pure function of (DOM, rules, state) — so this release makes the engine keep that promise literally. computeElement used to wipe every property it owned and rewrite them all on every recompute, even when nothing had changed: hundreds of no-op style mutations per second under pointer boundary storms, plus a nastier feedback loop — a rewrite could move a container being watched for @container queries, the ResizeObserver re-fired, the engine recomputed and rewrote again, forever. That churn was the twitch. Now the engine builds the winning declaration set first, diffs it against what it already owns, and writes only the difference: an identical recompute touches the DOM zero times. Ambient triggers (resize, media flips, signals, reduced-motion) are also coalesced into one compute per microtask burst, stack children's grid-area and stagger delays are only rewritten when their slot actually changes. Zero behavior change — every style lands exactly where it did before; it just stops being written when it already is.",
    code: `// the fix, in one sentence:
//   recompute(el) resolves the same decls twice
//     → second run performs ZERO style writes
//
// before:  removeProperty × 22, setProperty × 22   (every hover, every tick)
// after:   removeProperty × 0,  setProperty × 0    (when nothing changed)`,
  },
  {
    version: "v0.4.0",
    date: "growth phase · power tools",
    title: "Reveal, choreograph, re-scope — the power tools release",
    why: "the site wanted scroll-in reveals, and one card to go dangerous",
    kind: "add",
    body:
      "Four features, all grown the honest way — something the site itself wanted to do, so the language learned to say it. (1) seen — a state that fires once when an element scrolls into view, engine-native because no CSS selector can know that; with no IntersectionObserver everything counts as seen, so content can never be trapped invisible. (2) stagger — a parent declaration that offsets each child's animation delay by its DOM position, turning motion blocks into cascading reveals. (3) scoped tokens — re-declare color.accent inside one rule and the whole subtree re-resolves, no second stylesheet. (4) per-property transitions — transition: 150 snap background-color, 300 transform — plus visually-hidden, the accessibility classic as a single word. The docs page got a live seen + stagger demo and a scoped-token box whose dots hover green inside the box and oxblood everywhere else.",
    code: `// the reveal, end to end, zero JavaScript:
.pt-grid { stagger: 70 }          // child i waits i × 70ms
.pt-card {
  seen {                          // engine-native scroll state
    animate: rise-in 420 snap
  }
}

// one subtree, different brand:
.danger { --color.accent: color.err }`,
  },
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
  {
    version: "v0.3.1",
    date: "bug report → fix",
    title: "Hover effects stopped going away",
    why: "user report: “hover effect not going away”",
    kind: "add",
    body:
      "The engine collected state-recompute candidates by querying each rule's full selector — including the state pseudo-class. The instant pointerout fired, the element that had just LEFT hover no longer matched its own “.card:hover” selector, so it was never recomputed and the hover styles stuck forever. (Active and focus had the same bug; earlier tests only looked clean because full recomputes kept wiping the evidence.) The engine now queries the state-stripped base selector and re-evaluates the real match, so both entering and leaving a state are handled.",
    code: `// engine.js — stateEvent(), fixed
const base = rule.sel
  .replace(STATE_PSEUDO_RE, "")   // ".card:hover" → ".card"
  .trim() || "*";
// recompute the superset; computeElement() re-checks
// the live :hover / :active / :focus match itself`,
  },
  {
    version: "v0.3.0",
    date: "user feedback → release",
    title: "The Less-Is-More release",
    why: "user report: “it's KINDA complicated ngl”",
    kind: "add",
    body:
      "Complexity attack on three fronts. (1) One-word conditions: @media dark, @media light, @media reduced-motion, and bare-width sugar — @media 768 means “this wide or wider”, @media <= 768 narrower, @media 480..960 a range; the full CSS form still works. (2) A new one-page Cheat sheet view: the whole day-to-day language without the prose. (3) The docs now open with a three-step quickstart and say out loud what you can ignore on day one — layers, tokens, behaviors, signals — instead of implying you must learn all of it.",
    code: `@media dark { background: color.ink }   // was (prefers-color-scheme: dark)
@media 768  { grid: 3 }                 // was (width >= 768px)
@media 480..960 { grid: 2 }             // range, no paren-math`,
  },
  {
    version: "v0.3.2",
    date: "bug report → fix",
    title: "Grids collapsed to one column",
    why: "user report: “these arent centered”",
    body:
      "The bare-number→px rule treated repeat()'s leading count as a length: repeat(4, 1fr) resolved to repeat(4px, 1fr), the browser rejected the whole declaration, and every grid silently fell back to a single full-width column — the home feature grid, the pain grid, all of them. repeat() now keeps its count integer, grid-row/column/area are unitless properties, and — most importantly — the engine no longer swallows browser rejections: a value the browser refuses is announced in the console. A language that promises loud errors cannot fail quietly.",
    code: `grid-template-columns: repeat(4, 1fr)
// was:  repeat(4px, 1fr)   ← count got px'd, browser dropped it
// now:  repeat(4, 1fr)    ✓ four centered columns`,
  },
  {
    version: "v0.3.2",
    date: "user feedback → release",
    title: "The page styles before first paint now",
    why: "user report: “DSSL loads painfully slow”",
    kind: "add",
    body:
      "The boot chain was: wait for React hydration, inject the engine script, import four modules over the network, then fetch six stylesheets strictly one-after-another — on localhost that was ~600 ms before the last rule applied; on a real connection, seconds of unstyled page. Now the stylesheets ride inside the server-rendered HTML as <style type=\"text/dssl\"> tags and the engine module loads from the document head, so parsing finishes and the page is fully styled before first paint — no hydration wait, no fetch waterfall. DSSL.load() itself also switched to parallel fetch with in-order apply for everyone else.",
    code: `<!-- before: engine injected post-hydration, then 6 × await fetch -->
<!-- after: -->
<style type="text/dssl" data-dssl-name="tokens.dssl">…</style>
<script type="module" src="/dssl/boot.js"></script>  <!-- in <head> -->`,
  },
  {
    version: "v0.3.3",
    date: "user feedback → release",
    title: "The Classic Edition — and a company name",
    why: "user request: “name the company DSSL. inc, make the website look more classic”",
    kind: "add",
    body:
      "The company is called DSSL. inc. The founder describes the choice as boring; we describe it as honest — the company is named after the thing it ships, and now the footer says so. The re-skin went classic: serif display type (a Charter/Iowan/Palatino stack — no webfonts, still zero dependencies), parchment paper with ink text and an oxblood accent, squared corners, hairline rules instead of glow shadows, book-page code blocks, a candlelit dark mode, and calmer hovers — cards darken their border instead of flying off the page. The § now stands where the comment slash used to. Best part: the entire re-skin is ONE file. radius tokens went 14→4, the palette swapped, serif entered the font tokens — and all six views followed, because that is the whole argument DSSL makes about tokens.",
    code: `// tokens.dssl — the only file the re-skin touched
radius { md: 14  →  md: 4 }
color  { paper: #faf8f4 → #f5f0e4, accent: oklch(…) → #7c2d2d }
font   { serif: "Charter", "Iowan Old Style", "Palatino", … }   // new`,
  },
  {
    version: "v0.3.4",
    date: "bug report → fix",
    title: "Centering that always works",
    why: "user report: “the {} and stuff in The Engine are still not centered in their circle”",
    kind: "add",
    body:
      "Every glyph chip on this site asked for centering — place: center — and place-items/place-content only arrange children inside flex or grid containers. On a <span> or a <button> they silently did nothing, so the feature icons, the theme toggle and the docs token dots all hugged the top-left of their circles. The fix is engine-level, because the engine is the only part that knows what an element actually is: alignment declarations now IMPLY a formatting context. When a winning declaration asks to align but the element has no layout context, the engine promotes it — inline elements become inline-grid (flow preserved), blocks become grid — while an explicit display: still wins the cascade. And the vocabulary gained the word people actually reach for first: center: both / x / y.",
    code: `.icon-chip {
  size: 40
  circle: 40
  center: both      // works on a span, a button, anything
}

// engine rule: alignment implies a formatting context
// inline → inline-grid · block → grid · explicit display: still wins`,
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
