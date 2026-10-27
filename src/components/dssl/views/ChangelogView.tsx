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
    version: "v0.16.0",
    date: "growth phase \u00b7 round three",
    title: "Your CSS wins when you say so, valid CSS is accepted, and light follows the shape.",
    why: "the builder came back a third time: plain CSS lost to DSSL's inline styles, env() and tabular-nums were refused, a one-line token pair confused the parser, and aura lit the box around a diamond instead of the diamond.",
    kind: "add",
    body:
      "yield: padding-top hands a property back, so a normal stylesheet rule (with env(safe-area-inset-top), say) wins without !important, and DSSL.lint names any CSS rule that loses. The compiler's lists of CSS words and properties are now generated from the MDN data, so env(), tabular-nums, touch-action, scroll-snap-type, -webkit-user-select and the rest are accepted while a typo is still an error. tokens { radius { pill: 999 card: 22 } } is two tokens, and a token error points at its own line. Aura reads the element's clip-path, border-radius and rotation, so a diamond, a star or a turned square glows in its own shape, and around picks one (diamond, star, heart, polygon(...), alpha for a sprite's pixels). New aura: inner glow, rays, ripples, heart, drop, bubble, snowflake, confetti and leaf particles, palette, spin, wind and orbit. 33 new textures (bricks, herringbone, tartan, scales, terrazzo, starfield, lava and more) built from nine new generators. Not verified: Firefox and Safari.",
    code: `.app { padding: 16; yield: padding-top padding-bottom }   // then plain CSS: padding-top: env(safe-area-inset-top)
.gem { aura-glow: #6cf 40 around diamond }
.party { aura-particle: #ff4d6d #ffd166 #06d6a0 count 60 shape confetti palette from top }
.wall { texture: bricks }  .floor { texture: herringbone }`,
  },
  {
    version: "v0.15.0",
    date: "growth phase \u00b7 the second game review",
    title: "Smoke that stops, scoped signals, and rules that tell you they never win.",
    why: "the builder came back after shipping a real game and listed what still hurt. Most of it was aura edge cases and silent losses.",
    kind: "add",
    body:
      "Aura keeps up with moving things under reduced motion (it used to redraw twice a second), stops emitting from anything you cannot see (opacity 0, display none, visibility hidden, on it or any ancestor), and takes z 5 to sit under a hill. There is no specificity, so a rule in an earlier file that a later rule always beats used to lose without a word; dssl check, the console and DSSL.lint now name both rules. Signals keep their type, DSSL.signal(name, value, el) scopes one to a subtree, and a signal restyles only the elements its rules select. await DSSL.settled() makes styling final the moment you need it, DSSL.computed(el, prop) reads the real value, and DSSL.pauseMotion(), stepMotion(ms) and resumeMotion() freeze and step every animation for tests. animate takes a list (blink and waddle on one element, also on ::before and in dssl build), DSSL.play takes a pseudo element, outline-shape draws an outline that follows the picture's alpha, rotate: 5 is 5deg, a state can sit inside ::after, and a CSS-style font: is now an error that says what DSSL's font: means. DSSL.lint skips invisible text and respects text-stroke and tight shadows. The dssl command takes --engine ./dssl. Not verified: Firefox and Safari.",
    code: `.duck { animate: blink 300 infinite, waddle 900 infinite alternate }
.sprite { outline-shape: 3 color.ink }
.btn { ::after { content: ""; opacity: 0; hover { opacity: 1 } } }
DSSL.signal('screen', 'shop', paneB)
await DSSL.settled()`,
  },
  {
    version: "v0.14.0",
    date: "growth phase \u00b7 made for games",
    title: "A review from an agent that built a game, and all twelve problems fixed.",
    why: "someone built a real game on DSSL and wrote down what bit them. Most of it was fair: motion that vanished without a word, two rules fighting over one background, settings that compiled and did nothing, docs that did not match the code.",
    kind: "add",
    body:
      "Reduced motion no longer kills animate: in silence. The console says so once and how to get out: write essential in the motion, or call DSSL.motion('full'). animate: reads delay, jitter (a different random delay per element, the same on every load), iterations and essential. Motions are shared across files like tokens, keyframes take 0% and 40%, every motion is also a real @keyframes, and animate: works on ::before and ::after. DSSL.play(el, 'boing', { hold: true }) returns a promise. Your own inline styles now win over rules, a data-dssl-static subtree is styled once and left alone, and an aura is clipped to its stage, follows its scale, and can sit under a menu with DSSL.auraZ(). Gradients layer with + and take tile, offset and no-repeat, text-stroke is a real word, shadow: pop and radius: pill work for your own tokens, @signal takes in (a, b), not in and !=. DSSL.lint(root) checks the text colour against the real composited background, which found cream-on-cream that no single rule showed. dssl check and dssl build take an index.html and read the stylesheets it links. The docs were out of date in six places; a test now compares them with the real API. Not verified: Firefox and Safari.",
    code: `motion boing { 0% { scale: 1 } 40% { scale: 1.3 } 100% { scale: 1 } }
.coin { animate: boing 600 infinite jitter 400 essential }
await DSSL.play(hero, 'boing', { hold: true })
@signal screen in (menu, shop) { .hud { opacity: 0 } }`,
  },
  {
    version: "v0.13.0",
    date: "growth phase \u00b7 the compiled page is the page",
    title: "A built page matches the engine, with JavaScript off. And here are the numbers.",
    why: "three promises that were easy to say and had to be proved: no-JS first paint, startup and churn close to plain CSS, and server rendering with a strict CSP and devtools that show your .dssl lines.",
    kind: "add",
    body:
      "Every page of this site was rendered twice, once by the engine and once from dssl build output with JavaScript switched off, and about 100 computed properties, the box and the pseudo-elements were compared on over 5,000 elements. That found real differences. Built selectors had CSS specificity, so a more specific earlier rule beat a later one (they are now wrapped in :where(), so the later rule wins like in the engine). The engine dropped a border-style or border-width written after border, and kept a margin-top even when margin came later (both now follow the cascade). The reset was unlayered (now the first layer). dssl build takes several files, writes a source map (Chrome DevTools shows card.dssl:4 next to the rule), and has --inline-tokens for the fastest CSS. The engine now runs under a strict Content-Security-Policy with zero violations, and server.js compiles with no DOM for server rendering. The site itself links its compiled CSS, so it is styled on first paint with scripts off. Numbers, measured: a compiled page starts as fast as hand-written CSS; churn is +7%, or 0% with --inline-tokens. The engine is not at parity (load 17x, churn 4x) and that is stated plainly in the guide.",
    code: `node cli/dssl.mjs build tokens.dssl site.dssl -o site.css --reset --sourcemap
node cli/dssl.mjs build tokens.dssl site.dssl -o site.css --inline-tokens   // the fastest CSS`,
  },
  {
    version: "v0.12.0",
    date: "growth phase \u00b7 the rest of the list",
    title: "Fonts, gradients, mirrored tiles, an inspector and hot reload.",
    why: "the wood critic's list had four things we said we had not done, and one limit. Now it is the whole list, except a real browser DevTools panel, which needs an extension.",
    kind: "add",
    body:
      "texture: symmetrical mirrors every other tile, so the edges always meet and the repeat is twice as far apart (on wood it reads as a book-matched board). It is drawn by flipping one copy, so the file barely grows. A fonts { } block replaces raw CSS: Google families with weights, ranges and italics become a link at run time and an @import in dssl build, and your own files become @font-face. gradient grew repeating forms, colour spaces (in oklch), midpoints, hard bands, mesh (soft blobs over a base) and layers joined with +. DSSL.inspect() shows which rule produced each style, in the page, with file and line. DSSL.watch() and the new dssl dev command restyle the open page when you save a .dssl file, with no reload, and show errors as a toast. The Heartwood page now uses the font block, mirrored planks, a gradient mesh for the hearth glow, and the layered gradient sentence.",
    code: `fonts { Fraunces: 500 700 800 }
.floor { texture: oak-planks symmetrical }
.hearth { gradient: mesh #1a1512, #ff7a1a at 50% 92% size 60%, #b9380f at 20% 100% size 40% }
// in the console while you work: DSSL.inspect(), DSSL.watch()`,
  },
  {
    version: "v0.11.0",
    date: "growth phase \u00b7 the wood drop",
    title: "Real wood, textures that survive the build, and a whole page to prove it.",
    why: "another AI built a wood website in DSSL and listed what hurt. Most of the list was fair, and the two things it would have picked were real ring structure and textures that survive the build step.",
    kind: "add",
    body:
      "texture: oak, walnut, cherry, maple, pine, mahogany, ebony, birch, oak-planks and walnut-planks. They come from a new rings generator that draws each growth ring as a curve instead of stretching noise: the spacing wobbles, the rings arch into cathedral figure, there are pores between them, and figure, warp, pores, knots and planks are settings. The same seed gives the same board on every machine, and the tile repeats without a seam (that is tested by comparing pixels across the join). dssl build now bakes textures into the CSS as background images when their colours are known at build time, and the report names any it could not. Also: counter-reset, counter-increment and content: counter() work. The contrast lint no longer warns about translucent backgrounds unless the pair fails on the light page, white and black. A page can hide itself until styled with a dssl-ready class. Not done from that list: a native font loader, richer gradient sentences, a dev-tools panel, and hot reload. Heartwood, at /showcase/wood/, is a whole page built from all of this.",
    code: `.floor { background-color: color.walnut; texture: oak-planks planks 140 }
.table { texture: walnut figure 0.9 warp 0.7 }
.steps { counter-reset: step }
.steps li::before { counter-increment: step; content: counter(step, decimal-leading-zero) }`,
  },
  {
    version: "v0.10.0",
    date: "growth phase \u00b7 the polish drop",
    title: "Glass, tilt, a playground that does more, and a quiet bug in colour alpha.",
    why: "rebuilding the site's own pages kept hitting things the language did not have. Instead of working around them in CSS, they went into DSSL.",
    kind: "add",
    body:
      "glass: blurs what is behind an element and adds a faint wash of the text colour, so it works in light and dark. It is plain CSS, so dssl build keeps it. tilt: turns an element toward the pointer in 3D, with lift, perspective, speed, invert and glare (which keeps --dssl-gx and --dssl-gy pointing at the pointer so you can draw a shine). It only changes custom properties while the mouse moves, ignores touch, stays flat under reduced motion and stops on freeze. The bug: alpha on a named colour, white/12, used to compile to white/12px, which the browser drops without a word. It now becomes a real colour, like tokens and hex always did. The playground grew a canvas.html tab (shared links carry it, and the canvas only accepts a short allow-list of tags, so a link cannot run script), five new examples (aura, textures, sliders, glass and tilt), lint warnings, an as-CSS tab that shows what dssl build would write and what stays in the engine, and Tab and Enter that behave in the editor. The home page now shows the effects running instead of describing them.",
    code: `.pane {
  glass: 18 saturate 1.6
  tilt: 10 lift 1.04 glare
  border: 1 solid white/35          // used to become white/35px
  background-image: radial-gradient(circle at var(--dssl-gx, 50%) var(--dssl-gy, 50%), white/28, transparent 55%)
}`,
  },
  {
    version: "v0.9.0",
    date: "growth phase · the surface drop",
    title: "Texture, aura and range sliders, and a designer in the editor.",
    why: "a request for fire. The honest answer was that a language should give you the knobs and not someone else's idea of fire, so aura has no presets at all, texture has thirty, and the interactive tools went into the editor instead of onto this site.",
    kind: "spec",
    body:
      "texture: lays a generated image on top of an element's own background without replacing it, and takes it off cleanly. There are thirty presets (grain, paper, marble, wood, carbon, halftone and so on), but each is only a stored combination of ten generators and a handful of settings, so anything a preset does you can write yourself. Aura is light and particles around an element. It has no presets: aura-glow, aura-particle, glow-particle, aura-glow-particle and aura: take colour, radius, count, size, life, speed, direction, gravity, turbulence, shape and more, and you name your own fire or energy aura with a behavior block. One canvas covers the page, only visible elements animate, the page shares a budget of 1800 particles, and visitors who ask for reduced motion get a still glow. slider: styles a range input through the WebKit and Firefox pseudo-elements at once, with ticks, a glowing thumb and a histogram track whose bars colour themselves as the value passes them. dssl import converts existing CSS and reports what could not carry over, and the compiler now warns about low contrast, a removed focus outline and tiny tap targets. The designer in the VS Code extension has a slider or picker for every setting, live previews drawn by the real renderer, graphs, and the DSSL it writes, compile-checked as you edit. Writing real-browser tests for all of it found nine bugs, which were fixed before release: aura-glow: none also wiped the particles, a reduced-motion glow redrew sixty times a second, every glow was re-blurred every frame (eleven milliseconds for forty of them, now under one), freeze stopped aura but not the texture shimmer, a typo in an aura was swallowed as a colour, a slider clause with a leftover word was silently ignored, dssl build said nothing about the aura it dropped, the package and the extension copied a hardcoded list of engine files and would have crashed on the new modules, and the importer threw on a stray at sign. The new lint also found four real contrast failures in this site's own stylesheets.",
    code: `// aura has no presets: you write fire
behavior fire {
  aura-glow: #ff7a00 36 pulse 900 flicker 0.35
  aura-particle: #ffe27a -> #ff8a1f -> rgba(255,40,0,0) count 70 size 8 18 life 650 1100
                 speed 40 120 dir up spread 40 from top gravity -40 turbulence 70
                 shape flame glowing behind
}

.torch { use fire }
.card  { background: #c9a66b; texture: wood }
input  { slider: track 6 #445566 radius full, fill #ff7a00, thumb 22 #fff, ring 3 #ff7a00 }`,
  },
  {
    version: "v0.8.2",
    date: "growth phase · the rebuild",
    title: "Rebuilding the website on its own engine found a cascade bug.",
    why: "the site got a new design, and its new stylesheets kept losing to old ones for no reason anyone could explain. The deal on this page is that the site exercises the language, and this time that paid off in an uncomfortable way.",
    kind: "spec",
    body:
      "While rebuilding the site, a token edited by a later stylesheet would not take effect. A probe showed something worse: later wins only held inside one stylesheet. Between stylesheets, the engine compared each rule's position within its own file, so a later sheet's rule could lose to an earlier sheet's rule simply because the earlier sheet had more rules above it. A test with a 31 rule sheet followed by a one rule sheet showed the earlier colour winning. Every rule now gets one position across all the stylesheets on the page, in load order, so later wins means what the docs always said it meant. Layers still outrank load order. A consequence is that a tokens block in a later sheet now overrides a token an earlier sheet set inside @media or @signal, which is what makes a live token editor possible. Two more things came out of the same work. fluid now works on the longhands (padding-top, padding-bottom, margin-block, letter-spacing, border-radius and the rest), because the new hero wanted a fluid padding-top and the only way to say it was all four sides at once. And the site itself was redesigned: every section is a real URL with its own title, the home page is a live editor wired to the engine that styles it, and the long pages lost their uppercase labels and boxed cards. The new tests run the cascade comparison on rules from real compiled sheets, and the first check in each group fails against the old ordering, which is how you know the tests would have caught it.",
    code: `// a stylesheet loaded later now wins, wherever it sits on the page
.card { background: color.card }     // site.dssl
.card { background: color.paper }    // loaded later: this one wins now

// and fluid reaches the longhands
.hero { padding-top: fluid 36 80 }`,
  },
  {
    version: "v0.8.1",
    date: "growth phase · the follow-up",
    title: "Two more bugs from the re-test, both fixed, and the tests now check the math.",
    why: "after 0.8.0 shipped, the same reviewer ran it again. Most things held up. Two did not: the fluid sizing sugar computed the wrong line, and the guide's own raw example produced broken CSS. Both slipped past the tests for the same reason as before: the tests asked whether the code compiled, not whether the result was right.",
    kind: "spec",
    body:
      "fluid 16 24 is supposed to be 16px on a 360px window and 24px on a 1200px one, sliding smoothly in between. The clamp() it produced had the right slope but forgot where the line starts, so it was already 19.6px on a 375px phone and hit its maximum around 840px. It now starts and ends where it says. While writing the tests, three more things turned up and are fixed by the same change: shrinking sizes like fluid 24 16 made a backwards clamp(), rem sizes got a slope 16 times too small, and percentages (which cannot follow the window width) now give a clear error instead of nonsense. If you used fluid in 0.8.0, your text will be a bit smaller on phones and tablets now. That is the fix. The raw { } block had its own problems: a multi-line block started with the word undefined, anything on the same line as raw { was dropped, and the example in the guide had no semicolons, which is not valid CSS. The first two are fixed, the guide example is corrected, and a missing semicolon inside raw { } is now a warning that names the line, since raw is real CSS and DSSL cannot guess what you meant. dssl build also takes --strict now, so CI can fail on warnings the same way dssl check can. The new tests do not compare strings. They work out what the emitted clamp() gives at real window widths (360, 375, 600, 800, 1200 and beyond) and check it against the sizes you asked for, and they were run against the old 0.8.0 engine first, where two dozen of them fail. One more thing turned up while testing the download: the dssl command inside dssl-engine.zip crashed on start with module not found, because it looked for the engine in public/dssl and the package keeps it in dssl. It now finds the engine in either place, and a test runs it from the package layout.",
    code: `// what fluid 16 24 gives you, by window width
//   360px  ->  16px      (the lower size, exactly)
//   375px  ->  16.1px    (0.8.0 said 19.6px)
//   800px  ->  20.2px    (0.8.0 said 23.6px)
//  1200px  ->  24px      (the upper size, exactly)
h1 { font-size: fluid 16 24 }

// raw is real CSS, so it needs its semicolons
raw {
  @font-face {
    font-family: Inter;
    src: url(/fonts/inter.woff2);
  }
}`,
  },
  {
    version: "v0.8.0",
    date: "growth phase · the exit drop",
    title: "A second review found five bugs. The answer fixes them and adds the exit lane.",
    why: "another external review landed with repro snippets: a layout word bug that compiled clean and laid out wrong, an at-rule that crashed the compiler, an @supports leak, url() false errors, and a wishlist that said build-a-CSS-exit first. Every claim was reproduced against the real compiler before anything moved, the same discipline as last time",
    kind: "spec",
    body:
      "The layout bug was the worst kind: silent and documented. row: gap 8 between center, the guide's own example, compiled with zero errors and lost the between, because every place word wrote BOTH axes and the later center overwrote justify-content. Words now own their axis: between/around/evenly are main-axis words, stretch/baseline are cross-axis words, center/start/end fill whichever axes are still free, and a word with nowhere to go is a loud warning instead of a silent overwrite. @font-face used to crash the whole compiler (node.children is not iterable, an uncaught throw, the entire stylesheet dead); unknown at-rules now skip their whole balanced block with one clean error, which also kills the @supports leak where the inner rule applied unconditionally after an error. url() is atomic now, so url(a.png) no-repeat stopped raising two false errors. !important errors loudly and emits NOTHING (it used to error AND still emit red !important, which the browser then silently dropped). The animation shorthand stopped suggesting did you mean \"span\" for motion names and warns the DSSL way instead (motion name { } + animate:), and the CSS transition form now teaches the conversion in the error: transition: color .2s ease → write transition: 200 ease color. Then the wishlist's top four, because they fix tested problems: raw { } / @css { } drops verbatim CSS (@font-face, @keyframes, @supports, @import) into the page stylesheet; DSSL.toCSS() and dssl build compile the static subset to a real .css file, tokens to custom properties, states to :hover, layers to @layer, motions to @keyframes, pin to !important, seen to its no-JS final state, with a report that counts what stays in the runtime; dssl check puts the real compiler in CI with exit codes and --json; and the docs examples are now rendered in headless Chromium with computed-style assertions (real mouse hover, real IntersectionObserver, dark mode, viewport widths) because \"it compiles\" is what let the layout bug ship. Bonus sugar: font-size: fluid 16 24 compiles to the clamp() everyone writes wrong by hand.",
    code: `# the exit lane: same source, real CSS, no runtime required
$ dssl check styles.dssl            # CI: exit 1 on errors, --json for editors
$ dssl build styles.dssl -o styles.css
  built styles.css from styles.dssl
    6 rule(s), 1 pseudo-element rule(s), 1 @keyframes, 1 raw block(s)
    layers: tokens < components < utilities
    1 seen rule(s) applied unconditionally (the no-JS state)

/* tokens → custom properties · states → :hover · layers → @layer
   motions → @keyframes · raw { } → verbatim · pin → !important */
.toolbar {
  display: flex;
  justify-content: space-between;   /* the guide example, now true */
  align-items: center;
  font-size: clamp(16px, calc(16px + 0.952vw), 24px);
}`,
  },
  {
    version: "v0.7.2",
    date: "growth phase · the review drop",
    title: "An external review reproduced twelve bugs. This release is the answer.",
    why: "a thorough third-party agent review landed with repro cases instead of vibes: nested-state cascade loss, dead nested @media, broken docs examples, unitless delays, silent hex alpha, page-wide hover recomputes. The only honest response was to reproduce every claim, fix what was real, and make the docs examples test-verified",
    kind: "spec",
    body:
      "The headline bug: a nested hover block sorted BEFORE its parent\u2019s own declarations, so background: red on the parent always beat hover { background: red } nested inside it, the exact pattern the docs and the starter teach. Same walk, worse: nested @media, @signal and @layer blocks flushed with the parent context, so their condition was dropped entirely and they sorted before base. A nested dark mode was silently dead. Both fixed at the resolver walk: nested blocks now flush after everything the parent said so far, and every block flushes with the context it was actually walked with. The parser got its own fix: declarations and a nested block sharing one line (background: red; hover { ... }) used to swallow the declaration into the block\u2019s selector, so it vanished. Raw hex alpha is real now: #ff0000/50 compiles to color-mix instead of the invalid #ff0000/50px. transition-delay and friends take bare numbers as ms (they used to ship unitless-invalid or px). grid: 3 gap 12, the documented form, actually works, and rows N joined it. seen { opacity: 0 -> 1 } now fails LOUD with the two real patterns in the hint. A nested hovr typo warns did-you-mean instead of silently becoming a descendant selector. fill, stroke, text-wrap and content-visibility joined the vocabulary. ::part() rides the shadow pipeline; ::slotted() gets a loud explanation of why it cannot work from the light DOM. The engine caught up too: the gate prefilter actually runs before native matches() now (the review caught it in the wrong order), hover recomputes are scoped to the hovered subtree and its ancestors instead of the whole page (the review measured 33,060 recomputes for hovering 8 cards in a 1k list, the candidate collection that caused it is gone), and checkbox states finally hear change and toggle events, so unchecking with Space unstyles immediately. And the feature everyone asked about shipped as documentation: DSSL has been embeddable in HTML all along via <style type=\"text/dssl\">, and now <script type=\"text/dssl\"> works too. One distribution note the release has to carry: the editor extension bundles this same engine, but the packaged 0.7.1 vsix was built before these fixes landed, so anyone who installed it was still getting the old compiler's squiggles. The 0.7.2 vsix replaces it in the repo files and is the first package that actually contains this changelog.",
    code: `// the pattern the docs teach, now actually true:
.card {
  background: color.card
  shadow: sm
  hover { background: color.card-hover; shadow: lg }

  @media dark { background: color.card-dark }

  seen { animate: rise-in 400 snap }
}`,
  },
  {
    version: "v0.7.1",
    date: "growth phase · the credibility drop",
    title: "The language moves into the editor, the bench goes public, and a reviewer bug dies",
    why: "several AI agents tested DSSL and reached the same verdict, good for prototypes, citing v0.x, JS-only, inline-style cost and a one-person ecosystem. This release answers all four without pivoting the architecture",
    kind: "add",
    body:
      "The verdict said prototype, so this release aims straight at the verdict. The official editor extension arrived, and it is not a loose re-implementation: it bundles the real parser and resolver, so the squiggles in your editor are the same errors the browser console prints, including the did-you-mean and the new warnings. Completions ride the live token registry folded across the workspace (type color. and get your palette with resolved values), hovers explain the semantic vocabulary, and one grammar serves both VS Code and VSCodium because they share the same extension API, the .vsix installs in either, two clicks. The extension immediately paid for itself: its test suite caught a parser bug where every // comment doubled a line in the stripped source, so all line numbers after the first comment drifted +1 and every diagnostic, editor squiggle AND browser console, pointed one line late. Fixed, regression-tested, and honestly a little embarrassing. The repo gained the machine-reviewer layer: llms.txt at the site root and in the repo (dense, factual, structured for the agents that keep grading this project), AGENTS.md for contributors with a motor in their chest, and PARITY.md, the honest feature matrix against CSS. And the argument that used to happen from priors now happens from numbers: the Bench page runs 100 / 1,000 / 10,000 synthetic nodes three ways on this very page, a plain CSS stylesheet, the live engine, and the frozen engine, and reports first paint and restyle-all as medians of three. No build step appeared anywhere. The engine stays the engine.",
    code: `// in your editor now, same compiler the browser runs
.bad { background: colr.accent }
//   ^ unknown token "colr" (did you mean "color.accent"?), as a squiggle

// completions come from YOUR registry, folded across the workspace
tokens { space { 9: 96 } }
.hero { padding: space.9 }   // typing space. offers 9 = 96

// the bench, on this page, median of 3, numbers come from YOUR machine
10,000 nodes · CSS <style> · DSSL live · DSSL frozen
//        first paint + restyle-all, per lane, per size`,
  },
  {
    version: "v0.7.0",
    date: "growth phase · the engine gets a handbrake",
    title: "Freeze, explain, and a compiler that warns before you debug",
    why: "the second outside review: a real day lost to display: none vs column:, class spam because :nth-child seemed missing, DevTools archaeology on inline styles, and one blunt line, the js engine lowk slow asf, build a way to be faster",
    kind: "add",
    body:
      "The speed answer is freeze, not a compile step. DSSL.freeze() detaches every observer and listener, MutationObserver, ResizeObserver, IntersectionObserver, media listeners, state events, the overlap heartbeat, and leaves the resolved inline styles exactly where they are: the page keeps its look at zero engine cost, which is what makes ten-thousand-node pages viable, and unfreeze() re-arms the whole surface and recomputes once. Explicit calls still drain on a frozen engine (apply, signal, refresh, replay), because a developer action is not ambient churn. The matcher got cheaper too: every rule now passes through a conservative gate, classes, id and tag extracted from the selector's rightmost compound, so a recompute skips the obvious non-matches instead of asking the browser rule by rule, and the gate only ever says no, bailing to unfiltered on anything it does not fully understand. The class-spam complaint dissolved on inspection: :nth-child, :not, :is, :where and :has always rode native matching, they compile, they match, they nest, so the docs now say so out loud with a :has example instead of letting anyone else lose an evening to an assumption. The shorthand trap became a compiler warning: column: quietly expanding into display: flex over an earlier display: none is the exact bug a reviewer lost a day to, and now the resolver tags every implicit display write and warns with both line numbers and which order wins, ok stays true, the console gets loud. Token keys can be numbers now (tokens { space { 9: 96 } }, referenced as space.9), because the built-in scale stopping at 8 is not a reason to reject a spacing scale; outside a tokens block the error finally explains where numbers ARE legal. And the architectural cost of inline styles got a tool: DSSL.explain(element) returns every matched rule with its source file and line, every state/media/signal condition attached, the winning declaration per property with the rule that won it, and the pseudo-element shadow rules touching the element, the cascade, handed back as data. The docs also say the quiet part loudly: any script that measures layout must wait for dssl-ready, not DOMContentLoaded, or it reads a half-styled world.",
    code: `// the speed escape hatch
DSSL.load(['/styles/app.dssl']).then(() => {
  DSSL.freeze()   // { frozen: true, elements: 10432, rules: 311 }
})                // page keeps its look, engine costs nothing

// the DevTools panel the inline-style model owes you
DSSL.explain(document.querySelector('.doc-card'))
// → matched: [{ sel, layer, file, line, states, media }]
// → wins:    [{ prop, value, by: { sel, file, line } }]

// the compiler now catches the ordering footgun
.nav-links {
  display: none
  column: gap 2   // ⚠ expands to display: flex, the menu stays open
}

// numbers are token keys now
tokens { space { 9: 96 } }
.hero { padding: space.9 }`,
  },
  {
    version: "v0.6.0",
    date: "growth phase · the box gets a body",
    title: "Bend, stretch, fold, and gradients that actually read like sentences",
    why: "one user message: add bend and stretch, which does exactly what you think it does, then better gradient tools, and the little sibling that stops overlays eating text selection",
    kind: "add",
    body:
      "The deform family gives a box give. bend bows an element in 3D (positive tips the top away, negative leans toward you), bend-y bows it sideways, bend-up rocks it back on its planted bottom edge like a drawbridge, and fold swings it up over its top edge like a page closing, the concept that arrived with an unprintable working name and shipped renamed. stretch is cartoon squash and stretch that keeps volume: stretched 1.2 wide, the element honestly shrinks to 1/1.2 tall. Every member composes into the one transform channel alongside whatever you already wrote there, so a single transition tweens it, states fire it (press a button, it bends), and motion keyframes carry it, bend and stretch inside from/to blocks compose into real transform frames, with edge-pinned pivots riding transformOrigin where no box exists yet. bend-around is the odd sibling: instead of deforming one element it curves a container's children along a circular arc, positive degrees wrapping the row around an invisible ball, negative opening it into a smile, the engine measures the container's real width, plants a pivot per child, and children keep their own hover bends because their transforms run inside the arc rotation. Gradients stopped being function soup: gradient is a sentence, kind, optional direction or shape, then stops joined by arrows or commas, where a stop can be a hex, a color name, a token, an alpha mix like color.ink/40, and may carry a trailing % position; a stop that is not a color fails at compile time with a did-you-mean, not as a silently missing background. gradient-text clips the same grammar into glyphs, and gradient-flow loops background-position through WAAPI so a gradient drifts forever (and holds still under reduced-motion). The sibling feature rode along: a decorative overlay parked on top of text eats clicks and selection, so the docs' overlap chapter now pairs overlap: allow with pointer-events: none, the veil keeps rendering while the pointer falls through. Everything fails loud: stretch: 0 would flatten the element to nothing, bend-around caps at ±170°, bend speaks degrees not pixels.",
    code: `// the button that bends when you click it
.btn {
  transition: 200 snap transform
  hover  { bend: 5 }
  active { bend: 16; stretch: 0.94 }
}

// the rest of the family
.flag   { bend-y: -18 }              // sideways bow
.mini   { hover { bend-up: 14 } }    // drawbridge, bottom planted
.sheet  { hover { fold: 14 } }       // page fold, top planted
.pills  { bend-around: -22 }         // children on a smile arc

// gradients as sentences, and one that flows
.banner {
  gradient: linear 135, color.accent -> color.ok
  gradient-flow: 6s alternate
}
.head { gradient-text: linear to right, color.accent, color.ink }

// the sibling: overlays stop eating text selection
.veil { pointer-events: none; overlap: allow }`,
  },
  {
    version: "v0.5.0",
    date: "growth phase · the trap closes",
    title: "Pseudo-elements work everywhere, and animate learns to loop",
    why: "an external review scored DSSL 7.5/10 and named the bump condition: fix the trap, earn the 8",
    kind: "add",
    body:
      "The review found the one wart this language could not afford: a top-level .card::before { } compiled ok: true and then matched nothing. Inline styles can never reach a pseudo-element, and the compiler said fine when it meant dead rule, twenty minutes lost, in a language whose whole pitch is loud errors. The fix lives in the flattener: any full selector carrying :: is split into element + pseudo halves and routed down the same shadow-CSS pipeline the nested form always used, so .card::before, .card { ::before } and .card { &::before } are one spelling of one rule, with states, @media, @container and @signal composing as everywhere else. The loud errors stayed loud: an unknown pseudo-element name, :seen combined with a pseudo, or a selector list mixing pseudo and plain parts each fail at compile time with a did-you-mean hint, a rule can no longer be dead on arrival. The review's other gripes rode along: animate accepts infinite (loop forever) and alternate (ping-pong direction) through the Web Animations API; font names are now treated as proper nouns, so font-family: JetBrains Mono, monospace and font tokens pass bare without quotes; and hyphens: manual stopped being rejected. The docs gained the pseudo-elements section the trap proved was missing, with a live demo styled entirely by full-selector pseudo rules, if the accent square renders, the fix is on. And one feature boarded after the review, from actual use: overlap, a policy the engine enforces with real geometry. CSS will happily stack a 45%-opacity decoration on top of content and say nothing; DSSL now measures the boxes after layout and shoves the transparent side out along the shortest escape axis, through the translate channel so transforms and animations never fight it. body { overlap: auto } is the site-wide nothing-below-100%-opacity-overlaps switch; deny always yields; allow is the opt-out scrims and translucent navs use. The docs' overlap section runs it live, a ghost badge the policy genuinely shoves, with a toggle that exempts it and watches it glide back.",
    code: `// three spellings, one rule:
.card::before { content: "" }
.card { ::before { content: "" } }
.card { &::before { content: "" } }

// the sharp-edge sweep:
.dot { animate: pe-pulse 1200 infinite alternate }
.card { font-family: JetBrains Mono, monospace }
.prose { hyphens: manual }

// the late boarder, geometry the engine enforces:
body { overlap: auto }        // nothing transparent overlaps anything
.veil { overlap: allow }      // scrims and navs opt out`,
  },
  {
    version: "v0.4.2",
    date: "growth phase · distribution",
    title: "Themed scrollbars: vendor pseudo-elements join the grammar",
    why: "native scrollbars were the last thing on this page wearing browser defaults",
    kind: "add",
    body:
      "Styling a native scrollbar takes ::-webkit-scrollbar-thumb and friends, vendor pseudo-elements the parser refused by name; the curated list ended at ::selection. There is no DOM handle on a scrollbar, so they were the one styling job this language literally could not say. The rule grew the honest way: any ::-webkit-*, ::-moz-* or ::-ms-* name now passes through to the shadow-CSS exception verbatim, trailing states included, which is what makes the hover state on the thumb expressible. The scrollbars themselves are an ink pill floating on the paper track (transparent border + padding-box clip), waking to full attention on hover, with a rounded corner and an accent-tinted ::selection to match. Firefox keeps its native bars on purpose: standard scrollbar-color would be easy to add, but one non-auto value disables the webkit customization in Chromium, and the custom look wins.",
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
    title: "The steady hand: idempotent styling, twitch eliminated",
    why: "the UI kept twitching under hover and resize storms",
    kind: "add",
    body:
      "A recompute is a pure function of (DOM, rules, state), so this release makes the engine keep that promise literally. computeElement used to wipe every property it owned and rewrite them all on every recompute, even when nothing had changed: hundreds of no-op style mutations per second under pointer boundary storms, plus a nastier feedback loop, a rewrite could move a container being watched for @container queries, the ResizeObserver re-fired, the engine recomputed and rewrote again, forever. That churn was the twitch. Now the engine builds the winning declaration set first, diffs it against what it already owns, and writes only the difference: an identical recompute touches the DOM zero times. Ambient triggers (resize, media flips, signals, reduced-motion) are also coalesced into one compute per microtask burst, stack children's grid-area and stagger delays are only rewritten when their slot actually changes. Zero behavior change, every style lands exactly where it did before; it just stops being written when it already is.",
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
    title: "Reveal, choreograph, re-scope, the power tools release",
    why: "the site wanted scroll-in reveals, and one card to go dangerous",
    kind: "add",
    body:
      "Four features, all grown the honest way, something the site itself wanted to do, so the language learned to say it. (1) seen, a state that fires once when an element scrolls into view, engine-native because no CSS selector can know that; with no IntersectionObserver everything counts as seen, so content can never be trapped invisible. (2) stagger, a parent declaration that offsets each child's animation delay by its DOM position, turning motion blocks into cascading reveals. (3) scoped tokens, re-declare color.accent inside one rule and the whole subtree re-resolves, no second stylesheet. (4) per-property transitions, transition: 150 snap background-color, 300 transform, plus visually-hidden, the accessibility classic as a single word. The docs page got a live seen + stagger demo and a scoped-token box whose dots hover green inside the box and oxblood everywhere else.",
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
      "The full language spec goes up for review: thesis (CSS talks to the engine, DSSL talks to the design), tokens, one-cascade-sentence, semantic properties, behaviors, motion, signals, loud errors, and a deliberate list of what v0.1 would NOT do.",
  },
  {
    version: "v0.1 → v0.2",
    date: "phase 1 · ratification",
    title: "Seven votes, seven decisions",
    kind: "vote",
    body:
      "Braces over indentation. Own engine over compile-to-CSS (the bold pick). Bare numbers are px. Cascade: layers + order, no specificity, no !important. Moderate vocabulary. CSS-shaped conditions (@media, nested state blocks, plus @signal as the JS bridge). Docs site shape. The spec was amended to match.",
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
    why: "tokens.dssl, the palette",
    body:
      "The first stylesheet broke the compiler: oklch(62% 0.19 35) had its chroma and hue gaining phantom px. Bare numbers inside color functions (oklch, rgb, color-mix, cubic-bezier, steps…) must stay bare; calc-family keeps px.",
    code: `// before: oklch(62% 0.19px 35px)  ← nonsense
accent: oklch(62% 0.19 35)   // now: untouched`,
  },
  {
    version: "v0.2.2",
    date: "build phase",
    title: "Color-space & gradient vocabulary",
    why: "site.dssl: chrome",
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
      "radius: md md 0 0, a corner-aware radius that mixes token presets with raw values, per atom. The single-atom shortcut had to become a real parser.",
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
    why: "site.dssl: ::selection",
    body:
      "::selection at the top level now means “every element” (::selection with a * base) instead of an error.",
  },
  {
    version: "v0.2.8",
    date: "build phase",
    title: "Shared token registry",
    why: "every view referencing the palette",
    body:
      "Each bundle resolved in isolation, so color.code-bg, defined in tokens.dssl, was invisible to site.dssl. Bundles now resolve against a registry that folds in every previous bundle's tokens, in load order.",
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
      "Every stylesheet bundle re-emitted the full token map unconditionally, so site.dssl's light tokens out-cascaded tokens.dssl's @signal dark palette, dark mode silently stayed light. Bundles now emit only the tokens they actually declare, and the shared registry is installed once as a base bundle that sorts below every author rule.",
  },
  {
    version: "v0.3.1",
    date: "bug report → fix",
    title: "Hover effects stopped going away",
    why: "user report: “hover effect not going away”",
    kind: "add",
    body:
      "The engine collected state-recompute candidates by querying each rule's full selector, including the state pseudo-class. The instant pointerout fired, the element that had just LEFT hover no longer matched its own “.card:hover” selector, so it was never recomputed and the hover styles stuck forever. (Active and focus had the same bug; earlier tests only looked clean because full recomputes kept wiping the evidence.) The engine now queries the state-stripped base selector and re-evaluates the real match, so both entering and leaving a state are handled.",
    code: `// engine.js, stateEvent(), fixed
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
      "Complexity attack on three fronts. (1) One-word conditions: @media dark, @media light, @media reduced-motion, and bare-width sugar, @media 768 means “this wide or wider”, @media <= 768 narrower, @media 480..960 a range; the full CSS form still works. (2) A new one-page Cheat sheet view: the whole day-to-day language without the prose. (3) The docs now open with a three-step quickstart and say out loud what you can ignore on day one, layers, tokens, behaviors, signals, instead of implying you must learn all of it.",
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
      "The bare-number→px rule treated repeat()'s leading count as a length: repeat(4, 1fr) resolved to repeat(4px, 1fr), the browser rejected the whole declaration, and every grid silently fell back to a single full-width column, the home feature grid, the pain grid, all of them. repeat() now keeps its count integer, grid-row/column/area are unitless properties, and, most importantly, the engine no longer swallows browser rejections: a value the browser refuses is announced in the console. A language that promises loud errors cannot fail quietly.",
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
      "The boot chain was: wait for React hydration, inject the engine script, import four modules over the network, then fetch six stylesheets strictly one-after-another, on localhost that was ~600 ms before the last rule applied; on a real connection, seconds of unstyled page. Now the stylesheets ride inside the server-rendered HTML as <style type=\"text/dssl\"> tags and the engine module loads from the document head, so parsing finishes and the page is fully styled before first paint, no hydration wait, no fetch waterfall. DSSL.load() itself also switched to parallel fetch with in-order apply for everyone else.",
    code: `<!-- before: engine injected post-hydration, then 6 × await fetch -->
<!-- after: -->
<style type="text/dssl" data-dssl-name="tokens.dssl">…</style>
<script type="module" src="/dssl/boot.js"></script>  <!-- in <head> -->`,
  },
  {
    version: "v0.3.3",
    date: "user feedback → release",
    title: "The Classic Edition, and a company name",
    why: "user request: “name the company DSSL. inc, make the website look more classic”",
    kind: "add",
    body:
      "The company is called DSSL. inc. The founder describes the choice as boring; we describe it as honest, the company is named after the thing it ships, and now the footer says so. The re-skin went classic: serif display type (a Charter/Iowan/Palatino stack, no webfonts, still zero dependencies), parchment paper with ink text and an oxblood accent, squared corners, hairline rules instead of glow shadows, book-page code blocks, a candlelit dark mode, and calmer hovers, cards darken their border instead of flying off the page. The § now stands where the comment slash used to. Best part: the entire re-skin is ONE file. radius tokens went 14→4, the palette swapped, serif entered the font tokens, and all six views followed, because that is the whole argument DSSL makes about tokens.",
    code: `// tokens.dssl, the only file the re-skin touched
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
      "Every glyph chip on this site asked for centering, place: center, and place-items/place-content only arrange children inside flex or grid containers. On a <span> or a <button> they silently did nothing, so the feature icons, the theme toggle and the docs token dots all hugged the top-left of their circles. The fix is engine-level, because the engine is the only part that knows what an element actually is: alignment declarations now IMPLY a formatting context. When a winning declaration asks to align but the element has no layout context, the engine promotes it, inline elements become inline-grid (flow preserved), blocks become grid, while an explicit display: still wins the cascade. And the vocabulary gained the word people actually reach for first: center: both / x / y.",
    code: `.icon-chip {
  size: 40
  circle: 40
  center: both      // works on a span, a button, anything
}

// engine rule: alignment implies a formatting context
// inline → inline-grid · block → grid · explicit display: still wins`,
  },
];

/** The entries were written as one long string each. Group their sentences into
 *  paragraphs of a readable length so the page is not a wall of text. */
function paragraphs(text: string): string[] {
  const parts = text.split("\n\n");
  if (parts.length > 1) return parts;
  const sentences = text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/);
  const out: string[] = [];
  let cur = "";
  for (const sentence of sentences) {
    if (cur && (cur + " " + sentence).length > 460) {
      out.push(cur);
      cur = sentence;
    } else {
      cur = cur ? cur + " " + sentence : sentence;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export default function ChangelogView() {
  return (
    <div className="wrap">
      <div className="page-head">
        <h1 className="page-title">Changelog</h1>
        <p className="page-sub">
          The deal was: build the language, then build its website, and every time the
          website needs something the language lacks, add it, honestly. This page is
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
            {paragraphs(e.body).map((para, i) => <p key={i}>{para}</p>)}
            {e.code && <CodeBlock plain code={e.code} />}
          </div>
        ))}
      </div>
    </div>
  );
}
