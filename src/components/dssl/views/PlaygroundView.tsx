"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DsslError, DsslApplyResult } from "../SiteRoot";

const PRESETS: Record<string, { label: string; src: string }> = {
  cards: {
    label: "Cards",
    src: `// style the canvas — bare numbers are px,
// bare identifiers are tokens
tokens {
  color {
    hotspot: oklch(0.62 0.17 55)
  }
}

.pc-board {
  grid: auto-fill 190
  gap: space.4
  width: 100%
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  shadow: sm
  column: gap 8
  transition: 180

  hover {
    translate: 0 -4
    shadow: lg
    border-color: color.hotspot/45

    .pc-badge {
      background: color.hotspot
      color: color.accent-ink
    }
  }
}

.pc-badge {
  align-self: start
  font-family: font.mono
  font-size: 11
  background: color.accent/12
  color: color.accent
  padding: 3 9
  radius: full
  transition: 180
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13; line-height: 1.55 }

.pc-btn {
  padding: 8 14
  radius: sm
  background: color.ink
  color: color.paper
  font-size: 13
  font-weight: 600

  hover { translate: 0 -2 }
  active { translate: 0 0 }
}`,
  },
  tokens: {
    label: "Tokens",
    src: `// tokens compile to custom properties on the
// canvas element — try flipping these
tokens {
  color {
    pop: oklch(0.65 0.19 300)
    calm: oklch(0.68 0.13 190)
  }
  radius { md: 18 }
}

.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border-top: 4 solid color.pop
  radius: md
  padding: space.4
  column: gap 8
  shadow: sm
}

.pc-card:nth-child(2) {
  border-top-color: color.calm
}

.pc-card:nth-child(3) {
  border-top-color: color.pop/55
}

.pc-badge {
  background: color.pop/12
  color: color.pop
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }`,
  },
  motion: {
    label: "Motion",
    src: `// declare once, animate anywhere.
// reduced-motion users: this all politely
// does nothing unless marked essential
motion float {
  from {
    opacity: 0
    translate: 0 18
    scale: 0.94
  }
}

motion shimmer {
  at 0   { translate: 0 0 }
  at 50  { translate: 0 -10 }
  at 100 { translate: 0 0 }
}

.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  column: gap 8
  animate: float 600 snap both

  hover { shadow: lg; translate: 0 -4 }
}

.pc-card:nth-child(2) { animate: float 600 snap 150 both }
.pc-card:nth-child(3) { animate: float 600 snap 300 both }

.pc-badge {
  background: color.accent/12
  color: color.accent
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }

// press "replay" above to re-run the motion`,
  },
  signals: {
    label: "Signals",
    src: `// press the button in the canvas —
// DSSL.signal('pgdemo', 'hot') re-styles live
.pc-board {
  grid: 3
  gap: space.4
}

.pc-card {
  background: color.card
  border: 1 solid color.line
  radius: md
  padding: space.4
  column: gap 8
  transition: 250
}

@signal pgdemo == hot {
  .pc-card {
    background: color.accent
    border-color: color.accent
    color: color.accent-ink
    translate: 0 -3
    shadow: lg

    .pc-text { color: color.accent-ink/80 }
    .pc-badge {
      background: color.accent-ink/20
      color: color.accent-ink
    }
  }
}

.pc-badge {
  background: color.accent/12
  color: color.accent
  padding: 3 9
  radius: full
  font-family: font.mono
  font-size: 11
  align-self: start
}

.pc-title { font-weight: 700; font-size: 15 }
.pc-text  { color: color.muted; font-size: 13 }`,
  },
  errors: {
    label: "Errors",
    src: `// this preset fails on purpose —
// read the panel below the editor
.pc-card {
  backgroud: color.card       // typo
  radius: md
  padding: space.4
  colr: color.ink             // typo
  shadow: color.acnt          // unknown token
}

.pc-title {
  font-weight: 700
  bananify: 12                // unknown property
}`,
  },
};

const SAMPLE_CARDS = [
  { badge: "one", title: "Styled live", text: "Everything on the left is applied to this canvas by the DSSL engine — scoped, so the rest of the site is untouched." },
  { badge: "two", title: "Tokens & states", text: "Use color.*, space.*, radius.* — or define your own. Hover states work right here." },
  { badge: "three", title: "Loud errors", text: "Misspell a token and the panel below explains what it thinks you meant." },
];

export default function PlaygroundView() {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errors, setErrors] = useState<DsslError[]>([]);
  const [stats, setStats] = useState<DsslApplyResult["stats"] | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [preset, setPreset] = useState("cards");
  const [hot, setHot] = useState(false);

  const run = useCallback((src: string) => {
    if (!window.DSSL) return;
    const res = window.DSSL.apply(src, { scope: "#pg-canvas", name: "pg", replace: true });
    setErrors(res.errors);
    setStats(res.stats);
  }, []);

  // wait for the engine, then run the default preset (scoped!)
  useEffect(() => {
    if (window.DSSL) {
      const t = setTimeout(() => setEngineReady(true), 0);
      return () => clearTimeout(t);
    }
    const onReady = () => setEngineReady(true);
    window.addEventListener("dssl-ready", onReady);
    return () => window.removeEventListener("dssl-ready", onReady);
  }, []);

  useEffect(() => {
    if (!engineReady) return;
    const t = setTimeout(() => run(PRESETS.cards.src), 0);
    return () => clearTimeout(t);
  }, [engineReady, run]);

  const onEdit = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (editorRef.current) run(editorRef.current.value);
    }, 450);
  };

  const loadPreset = (key: string) => {
    setPreset(key);
    if (editorRef.current) {
      editorRef.current.value = PRESETS[key].src;
      run(PRESETS[key].src);
    }
  };

  const toggleHot = () => {
    const next = !hot;
    setHot(next);
    window.DSSL?.signal("pgdemo", next ? "hot" : null);
  };

  const ok = errors.length === 0;

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="kicker">try it</div>
        <h1 className="page-title">Playground</h1>
        <p className="page-sub">
          Real engine, real errors, zero setup. Your stylesheet is applied{" "}
          <b>scoped</b> to the canvas — nothing leaks to the rest of the page.
        </p>
      </div>

      <div className="pg-layout">
        {/* ------------------------------------ editor */}
        <div className="pg-pane">
          <div className="pg-head">
            <span>canvas.dssl</span>
            <div className="pg-head-tools">
              <select
                className="pg-select"
                value={preset}
                aria-label="Load preset"
                onChange={(e) => loadPreset(e.target.value)}
              >
                {Object.entries(PRESETS).map(([k, p]) => (
                  <option key={k} value={k}>{p.label}</option>
                ))}
              </select>
            </div>
          </div>
          <textarea
            ref={editorRef}
            className="pg-editor"
            defaultValue={PRESETS.cards.src}
            onInput={onEdit}
            spellCheck={false}
            aria-label="DSSL source editor"
          />
          <div className={`pg-status ${ok ? "pg-status-ok" : "pg-status-err"}`} role="status">
            {ok
              ? `ok — ${stats?.rules ?? 0} rules, ${stats?.tokens ?? 0} tokens, ${stats?.motions ?? 0} motions`
              : `${errors.length} error${errors.length === 1 ? "" : "s"} — fix and keep going`}
          </div>
          {!ok && (
            <div className="pg-errors" aria-live="polite">
              {errors.map((e, i) => (
                <div key={i} className="pg-error">
                  <span>line {e.line ?? "?"} — {e.message}</span>
                  {e.hint && <span className="pg-error-hint">did you mean <em>“{e.hint}”</em>?</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------ canvas */}
        <div className="pg-pane">
          <div className="pg-head">
            <span>#pg-canvas — scoped</span>
            <div className="pg-head-tools">
              {preset === "signals" && (
                <button type="button" className="doc-btn btn-sm" onClick={toggleHot}>
                  {hot ? "signal: hot" : "signal: cold"}
                </button>
              )}
              {(preset === "motion" || preset === "cards") && (
                <button type="button" className="doc-btn btn-sm" onClick={() => window.DSSL?.replay(".pc-card")}>
                  replay
                </button>
              )}
            </div>
          </div>
          <div className="pg-canvas-wrap">
            <div className="pg-canvas" id="pg-canvas">
              <p className="pg-canvas-title">canvas — your dssl styles this</p>
              <div className="pc-board">
                {SAMPLE_CARDS.map(c => (
                  <article className="pc-card" key={c.badge}>
                    <span className="pc-badge">{c.badge}</span>
                    <h4 className="pc-title">{c.title}</h4>
                    <p className="pc-text">{c.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
