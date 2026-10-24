"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import CodeBlock from "../CodeBlock";
import { useEngineInfo } from "../engine-info";

/* The hero is the language itself. This editor feeds the real engine that is
   styling the page you are looking at: change the accent token and the whole
   site retints, mistype a property and you get the real error back. */

const START = `// Edit anything. The page is listening.
tokens {
  color { accent: #d1006f }
}

.try-button {
  background: color.accent
  color: color.accent-ink
  padding: 10 18
  radius: 8
  hover { translate: 0 -2 }
}
`;

const FIGHTS = [
  {
    title: "The cascade is arithmetic",
    css: "An id beats a class beats a tag, then !important beats everyone.",
    dssl: "Later wins, inside layers. That is the whole cascade, and there is no !important to reach for.",
  },
  {
    title: "Typos fail silently",
    css: "Misspell background or a variable and the browser quietly does nothing.",
    dssl: "You get the file, the line and a did-you-mean. The editor above shows exactly that.",
  },
  {
    title: "Motion needs a paragraph",
    css: "@keyframes plus an animation shorthand with five values in a fixed order.",
    dssl: "Declare a motion once, then write animate: rise-in 400 snap.",
  },
  {
    title: "Theming from JavaScript is a hack",
    css: "You poke data attributes or inline styles by hand and hope the cascade agrees.",
    dssl: "DSSL.signal('theme', 'dark') restyles the page, and you can ask the engine why.",
  },
];

const PARTS = [
  ["Its own cascade", "Later wins. Layers when you care. No specificity score, and no !important, ever."],
  ["Tokens as vocabulary", "color.ink, space.4, radius.md. References compile to custom properties you can inspect."],
  ["Readable states", "hover, focus-visible and active are blocks. Rules nested under a state just work."],
  ["One-word conditions", "@media dark, @media 768, @media 480..960. The same shape for @container and @signal."],
  ["Motion in four words", "animate: rise-in 400 snap both. Add seen and stagger to reveal a grid on scroll. Reduced motion is respected by default."],
  ["Behaviors", "Name a pattern once, like a focus ring or a chip, and use it anywhere with one line."],
  ["Loud errors", "Unknown property, unknown token, bad value. Each one names the file and line and suggests a fix."],
  ["Texture, aura and sliders", "Forty textures, ten of them real wood species, light and particles with no presets (you build the fire), and one-line range sliders. The VS Code extension has a designer with sliders and live previews."],
  ["A JavaScript bridge", "DSSL.signal restyles live, DSSL.replay reruns motion, DSSL.compile powers tools like the VS Code extension."],
];

const LIMITS = [
  ["It needs JavaScript.", "With no JavaScript there are no styles, because there is no CSS to fall back to."],
  ["Styles arrive after the engine loads.", "A big page can flash unstyled. This site avoids it by putting its stylesheets inside the HTML."],
  ["Strict CSP blocks it.", "A policy that forbids inline styles stops the engine from working."],
  ["Inline styles are heavy.", "In our test, 3000 small cards came to about 4.5 times the HTML of the same page with a CSS class."],
];

export default function HomeView() {
  const info = useEngineInfo();
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errors, setErrors] = useState<DsslError[]>([]);
  const [ready, setReady] = useState(false);
  const [applied, setApplied] = useState(false);

  const run = useCallback((src: string) => {
    if (!window.DSSL) return;
    const res = window.DSSL.apply(src, { name: "try.dssl", replace: true });
    setErrors(res.errors);
    setApplied(true);
  }, []);

  // wait for the engine, then apply the starting sheet once
  useEffect(() => {
    if (window.DSSL) {
      const t = setTimeout(() => setReady(true), 0);
      return () => clearTimeout(t);
    }
    const onReady = () => setReady(true);
    window.addEventListener("dssl-ready", onReady);
    return () => window.removeEventListener("dssl-ready", onReady);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => run(editorRef.current?.value ?? START), 0);
    return () => clearTimeout(t);
  }, [ready, run]);

  const onEdit = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (editorRef.current) run(editorRef.current.value);
    }, 250);
  };

  const setSource = (src: string) => {
    if (!editorRef.current) return;
    editorRef.current.value = src;
    run(src);
  };

  const breakIt = () => {
    const cur = editorRef.current?.value ?? START;
    // swap the first real property for a typo; if it is already broken, mend it
    setSource(cur.includes("backgroud:") ? cur.replace("backgroud:", "background:") : cur.replace("background:", "backgroud:"));
  };

  // Tab inserts two spaces instead of leaving the editor
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Tab" || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: s, selectionEnd: en } = el;
    el.setRangeText("  ", s, en, "end");
    onEdit();
  };

  return (
    <>
      {/* ------------------------------------------------ hero */}
      <section className="hero">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1 className="hero-title">A style language that tells you what you got wrong.</h1>
            <p className="hero-sub">
              In CSS, a mistyped property is quietly ignored. In DSSL it is an error with the
              line number and a suggested fix. You also get design tokens as the vocabulary,
              a cascade you can explain in one sentence, and motion in four words.
            </p>
            <p className="hero-sub hero-sub-2">
              It needs JavaScript, and <a href="#limits">the section below</a> is honest about
              what that costs.
            </p>
            <div className="hero-ctas">
              <Link href="/playground" className="btn btn-primary">Open the playground</Link>
              <Link href="/docs" className="btn btn-ghost">Read the docs</Link>
              <a href="#install" className="hero-link">Install</a>
            </div>
            <p className="hero-facts">
              {info.gzKb} kB gzipped, no dependencies, works with any HTML and any JavaScript.
            </p>
          </div>

          {/* the one memorable thing: a live editor wired to the engine styling this page */}
          <div className="try" aria-label="Live DSSL editor">
            <div className="try-bar">
              <span className="try-file">try.dssl</span>
              <div className="try-tools">
                <button type="button" className="try-tool" onClick={breakIt}>Break it</button>
                <button type="button" className="try-tool" onClick={() => setSource(START)}>Reset</button>
              </div>
            </div>
            <textarea
              ref={editorRef}
              className="try-editor"
              defaultValue={START}
              onChange={onEdit}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label="DSSL source, applied to this page as you type"
              aria-describedby="try-status"
            />
            <div className={`try-status ${errors.length ? "try-bad" : "try-good"}`} id="try-status" role="status" aria-live="polite">
              {!applied && <span>Waiting for the engine.</span>}
              {applied && errors.length === 0 && (
                <span>Applied with no errors. Change the accent and watch the whole page.</span>
              )}
              {errors.slice(0, 3).map((e, i) => (
                <span key={i} className="try-err">
                  <b>{e.line ? `Line ${e.line}` : "Error"}.</b> {e.message}
                  {e.hint ? <> Did you mean <code>{e.hint}</code>?</> : null}
                </span>
              ))}
            </div>
            <div className="try-result">
              <button type="button" className="try-button">A button, styled by the box above</button>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ live effects, each one the language running on this page */}
      <section className="block" aria-labelledby="show-title">
        <div className="wrap">
          <h2 className="section-title" id="show-title">One line each, running on this page</h2>
          <p className="section-sub show-sub">
            None of this is a video or an image. Every effect below is a few words of DSSL
            applied by the same engine that styles the rest of the site. Move your mouse over the glass.
          </p>
          <div className="show-grid">
            <div className="show-card">
              <div className="show-demo show-demo-fire"><div className="show-orb show-fire">fire</div></div>
              <code className="show-code">.torch {"{"} use fire {"}"}</code>
              <p className="show-text">Fire is a recipe you write once with <code>aura-glow</code> and <code>aura-particle</code>, then reuse by name. Nothing is preset, so every number is yours.</p>
              <Link className="show-link" href="/playground?example=aura">Edit this fire</Link>
            </div>
            <div className="show-card">
              <div className="show-demo show-demo-glass">
                <span className="show-blob show-blob-a" />
                <span className="show-blob show-blob-b" />
                <div className="show-pane"><b>Frosted</b><span>follows the pointer</span></div>
              </div>
              <code className="show-code">glass: 18; tilt: 10 glare</code>
              <p className="show-text"><code>glass</code> blurs what is behind it and survives a CSS build. <code>tilt</code> turns toward the pointer and stays in the engine.</p>
              <Link className="show-link" href="/playground?example=glass">Edit this glass</Link>
            </div>
            <div className="show-card">
              <div className="show-demo show-demo-tex">
                <span className="show-tex show-tex-wood">wood</span>
                <span className="show-tex show-tex-marble">marble</span>
                <span className="show-tex show-tex-carbon">carbon</span>
                <span className="show-tex show-tex-hex">hex</span>
              </div>
              <code className="show-code">.sofa {"{"} texture: wood scale 6 {"}"}</code>
              <p className="show-text">Forty textures, ten of them wood species, or build your own from a generator and a few settings. They lay on top of whatever background the element already has.</p>
              <Link className="show-link" href="/playground?example=textures">Edit these textures</Link>
            </div>
            <div className="show-card">
              <div className="show-demo show-demo-slider">
                <input className="show-range" type="range" defaultValue={42} aria-label="A histogram slider, styled by one DSSL line" />
              </div>
              <code className="show-code">slider: graph 20 45 70 90 ...</code>
              <p className="show-text">Range inputs are styled through four vendor pseudo-elements. <code>slider:</code> writes them all from one description, and can turn the track into a histogram.</p>
              <Link className="show-link" href="/playground?example=sliders">Edit this slider</Link>
            </div>
          </div>
          <p className="show-more">
            Want to see a whole page? <a href="/showcase/wood/">Heartwood is a field guide to wood</a>, built with these:
            generated growth rings, glass, tilt, CSS counters, a fire, and styles compiled to real CSS with{" "}
            <code>dssl build</code>.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------ four things CSS leaves to you */}
      <section className="block">
        <div className="wrap split">
          <div className="split-head">
            <h2 className="section-title">Four things CSS leaves to you</h2>
          </div>
          <div className="split-body">
            {FIGHTS.map((f) => (
              <div className="fight" key={f.title}>
                <h3>{f.title}</h3>
                <p><span className="lang lang-css">CSS</span>{f.css}</p>
                <p><span className="lang lang-dssl">DSSL</span>{f.dssl}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ same card */}
      <section className="block">
        <div className="wrap split">
          <div className="split-head">
            <h2 className="section-title">The same card, written twice</h2>
            <p className="section-sub">
              The DSSL version is about half the characters (141 against 304, ignoring
              whitespace). It is not fewer lines. It is shorter because the vocabulary does the
              work: tokens for colour and spacing, one word for a shadow, one number for a
              transition.
            </p>
          </div>
          <div className="split-body versus">
            <div>
              <p className="versus-label">styles.css</p>
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
            <div>
              <p className="versus-label">card.dssl</p>
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

      {/* ------------------------------------------------ the engine */}
      <section className="block">
        <div className="wrap split">
          <div className="split-head">
            <h2 className="section-title">This page has no CSS file</h2>
            <p className="section-sub">
              The engine matches selectors against the live DOM, runs its own cascade and
              drives motion through the Web Animations API. Pseudo-elements are the one
              exception: they compile to a generated stylesheet, because inline styles
              cannot reach them.
            </p>
          </div>
          <dl className="parts split-body">
            {PARTS.map(([term, text]) => (
              <div className="part" key={term}>
                <dt>{term}</dt>
                <dd>{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------ limits */}
      <section className="block" id="limits">
        <div className="wrap split">
          <div className="split-head">
            <h2 className="section-title">Where DSSL is the wrong tool</h2>
            <p className="section-sub">
              DSSL is experimental and moving fast. It suits creative sites, prototypes, docs,
              playgrounds and internal tools. Here is what to weigh before you pick it.
            </p>
          </div>
          <div className="split-body">
            <ul className="limits">
              {LIMITS.map(([head, text]) => (
                <li key={head}><b>{head}</b> {text}</li>
              ))}
            </ul>
            <p className="limits-exit">
              If a page has to work without JavaScript, build the part of DSSL that can be
              plain CSS. <code>dssl build</code> turns tokens, states, media queries and layers
              into a real <code>.css</code> file. <code>@signal</code> rules and{" "}
              <code>animate:</code> stay in the engine, and the report counts them so you know
              exactly what was left behind.
            </p>
            <CodeBlock plain file="terminal" code={`node cli/dssl.mjs build styles.dssl -o styles.css
node cli/dssl.mjs check styles.dssl --strict   # for CI`} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ install */}
      <section className="block" id="install">
        <div className="wrap split">
          <div className="split-head">
            <h2 className="section-title">Install</h2>
            <p className="section-sub">
              The engine is a folder of plain JavaScript files. No package manager, no build
              step, nothing installed globally. Any of these gives you a{" "}
              <code>dssl-engine</code> folder with the engine, a starter token set, an
              example stylesheet and a usage guide.
            </p>
          </div>
          <div className="split-body install">
            <div className="install-row">
              <h3>macOS, Linux and BSD</h3>
              <CodeBlock plain file="terminal" code="curl -fsSL https://dssl-sable.vercel.app/install.sh | sh" />
              <p>
                Plain <code>sh</code> is enough. It uses curl or wget, whichever you have, and
                unpacks with tar, falling back to unzip or python3.
              </p>
            </div>
            <div className="install-row">
              <h3>Windows</h3>
              <CodeBlock plain file="powershell" code="irm https://dssl-sable.vercel.app/install.ps1 | iex" />
              <p>PowerShell 5.1 or newer, no admin rights needed.</p>
            </div>
            <div className="install-row">
              <h3>No terminal</h3>
              <div className="install-downloads">
                <a className="btn btn-ghost btn-sm" href="/dssl-engine.zip" download>dssl-engine.zip</a>
                <a className="btn btn-ghost btn-sm" href="/dssl-engine.tar.gz" download>dssl-engine.tar.gz</a>
              </div>
              <p>The exact package the one-liners fetch. Unzip it anywhere and read USAGE.md.</p>
            </div>
            <div className="install-row">
              <h3>Then wire it into a page</h3>
              <CodeBlock
                file="your page"
                code={`<script type="module" src="/dssl/boot.js"></script>
<link rel="stylesheet/dssl" href="/styles/tokens.dssl">
<link rel="stylesheet/dssl" href="/styles/hello.dssl">`}
              />
              <p>
                The engine fetches your <code>.dssl</code> files, walks the DOM and keeps
                restyling as elements come and go. Inline sheets work too, with{" "}
                <code>{'<style type="text/dssl">'}</code>. The <Link href="/docs">docs</Link>{" "}
                cover the rest.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
