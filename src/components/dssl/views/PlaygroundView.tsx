"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { decodeShare, encodeShare, MAX_SHARE_URL, packPayload, shareFromHash, unpackPayload } from "@/lib/share";
import { renderSafeHtml } from "@/lib/sanitize";
import { DEFAULT_HTML, PRESETS } from "@/lib/playground-presets";

type Tab = "dssl" | "html" | "css";
type Built = { css: string; report?: { engineDecls?: number; engineKinds?: string[] }; errors?: unknown[] };

/** Put the tokens layer last in the CSS view. The layer order is already declared on the first line,
 *  so nothing changes for the browser, and the rules the reader wrote come first. */
function tokensLast(css: string): string {
  const start = css.indexOf("@layer tokens {");
  if (start < 0) return css;
  const end = css.indexOf("\n}\n", start);
  if (end < 0) return css;
  const block = css.slice(start, end + 3);
  return (css.slice(0, start) + css.slice(end + 3)).replace(/\n{3,}/g, "\n\n").trimEnd() + "\n\n" + block;
}

/** Tab inserts two spaces and Enter keeps the indent (one deeper after "{"). Escape lets Tab leave the box again. */
function editorKeys(e: KeyboardEvent<HTMLTextAreaElement>, free: { current: boolean }, after: () => void) {
  const ta = e.currentTarget;
  if (e.key === "Escape") { free.current = true; return; }
  if (e.key === "Tab" && !free.current && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    ta.setRangeText("  ", ta.selectionStart, ta.selectionEnd, "end");
    after();
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && ta.selectionStart === ta.selectionEnd) {
    const at = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf("\n", at - 1) + 1;
    const line = ta.value.slice(lineStart, at);
    const indent = /^[ \t]*/.exec(line)![0] + (/[{(]\s*$/.test(line) ? "  " : "");
    e.preventDefault();
    ta.setRangeText("\n" + indent, at, at, "end");
    after();
  }
}


export default function PlaygroundView() {
  const cssRef = useRef<HTMLTextAreaElement>(null);
  const htmlRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const freeTab = useRef(false);
  const [errors, setErrors] = useState<DsslError[]>([]);
  const [warnings, setWarnings] = useState<DsslError[]>([]);
  const [stats, setStats] = useState<DsslApplyResult["stats"] | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [preset, setPreset] = useState("cards");
  const [tab, setTab] = useState<Tab>("dssl");
  const [built, setBuilt] = useState<Built | null>(null);
  const [hot, setHot] = useState(false);
  const [note, setNote] = useState("");

  const run = useCallback((src: string) => {
    if (!window.DSSL) return;
    const res = window.DSSL.apply(src, { scope: "#pg-canvas", name: "pg", replace: true });
    setErrors(res.errors);
    setWarnings(res.warnings ?? []);
    setStats(res.stats);
    try { setBuilt(window.DSSL.toCSS ? (window.DSSL.toCSS(src, { banner: false }) as Built) : null); } catch { setBuilt(null); }
  }, []);

  const paintHtml = useCallback((html: string) => {
    if (!canvasRef.current) return;
    const r = renderSafeHtml(canvasRef.current, html);
    if (r.truncated) setNote("The canvas HTML is long, so only the first part is shown.");
    else if (r.dropped) setNote(`The canvas keeps layout, text and form tags only. ${r.dropped} other tag${r.dropped === 1 ? "" : "s"} or attribute${r.dropped === 1 ? " was" : "s were"} left out.`);
  }, []);

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
    let cancelled = false;
    (async () => {
      // a link like /playground#s=... carries the whole stylesheet, and the canvas HTML when it was edited
      const packed = shareFromHash(window.location.hash);
      const shared = packed ? await decodeShare(packed) : null;
      if (cancelled || !cssRef.current || !htmlRef.current) return;
      // /playground?example=aura opens one of the examples; a shared link wins over it
      const wanted = new URLSearchParams(window.location.search).get("example");
      const ex = shared === null && wanted && PRESETS[wanted] ? wanted : null;
      if (ex) setPreset(ex);
      const first = shared !== null ? unpackPayload(shared) : ex ? { css: PRESETS[ex].src, html: PRESETS[ex].html } : { css: PRESETS.cards.src, html: undefined };
      cssRef.current.value = first.css;
      htmlRef.current.value = first.html ?? DEFAULT_HTML;
      paintHtml(htmlRef.current.value);
      run(first.css);
      if (shared !== null) setNote("Loaded from a shared link.");
      else if (packed) setNote("That link could not be read, so the default is loaded.");
    })();
    return () => { cancelled = true; };
  }, [engineReady, run, paintHtml]);

  const currentPayload = () => {
    const css = cssRef.current?.value ?? "";
    const html = htmlRef.current?.value ?? DEFAULT_HTML;
    return packPayload({ css, html: html === DEFAULT_HTML ? undefined : html });
  };

  const copyLink = async () => {
    const packed = await encodeShare(currentPayload());
    const url = `${window.location.origin}${window.location.pathname}#s=${packed}`;
    if (url.length > MAX_SHARE_URL) { setNote("That is too long for a link. Copy the text instead."); return; }
    window.history.replaceState(null, "", `#s=${packed}`);
    try { await navigator.clipboard.writeText(url); setNote("Link copied."); }
    catch { setNote("The link is in the address bar. Copy it from there."); }
  };

  const copyCss = async () => {
    if (!built || errors.length) return;
    try { await navigator.clipboard.writeText(tokensLast(built.css)); setNote("CSS copied."); }
    catch { setNote("Select the text and copy it."); }
  };

  const onEditCss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { if (cssRef.current) run(cssRef.current.value); }, 450);
  };
  const onEditHtml = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!htmlRef.current) return;
      setNote("");
      paintHtml(htmlRef.current.value);
    }, 450);
  };

  const loadPreset = (key: string) => {
    setPreset(key);
    setNote("");
    setHot(false);
    const p = PRESETS[key];
    if (cssRef.current) cssRef.current.value = p.src;
    if (htmlRef.current) htmlRef.current.value = p.html ?? DEFAULT_HTML;
    paintHtml(p.html ?? DEFAULT_HTML);
    run(p.src);
  };

  const toggleHot = () => {
    const next = !hot;
    setHot(next);
    window.DSSL?.signal("pgdemo", next ? "hot" : null);
  };

  const ok = errors.length === 0;
  const engineOnly = built?.report?.engineKinds ?? [];
  const shown = ok && built ? tokensLast(built.css) : null;

  return (
    <div className="wrap">
      <div className="page-head">
        <h1 className="page-title">Playground</h1>
        <p className="page-sub">
          Real engine, real errors, zero setup. Your stylesheet is applied{" "}
          <b>scoped</b> to the canvas, and you can change the canvas HTML too.
        </p>
      </div>

      <div className="pg-layout">
        {/* ------------------------------------ editor */}
        <div className="pg-pane">
          <div className="pg-head">
            <div className="pg-tabs" role="tablist" aria-label="Editor files">
              {([["dssl", "styles.dssl"], ["html", "canvas.html"], ["css", "as CSS"]] as [Tab, string][]).map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`pg-tab${tab === k ? " pg-tab-on" : ""}`} onClick={() => setTab(k)}>{label}</button>
              ))}
            </div>
            <div className="pg-head-tools">
              <select className="pg-select" value={preset} aria-label="Load example" onChange={(e) => loadPreset(e.target.value)}>
                {Object.entries(PRESETS).map(([k, p]) => (<option key={k} value={k}>{p.label}</option>))}
              </select>
              <button type="button" className="doc-btn btn-sm" onClick={copyLink}>Copy link</button>
            </div>
          </div>
          {note && <div className="pg-note" role="status">{note}</div>}
          <textarea
            ref={cssRef}
            className="pg-editor"
            hidden={tab !== "dssl"}
            defaultValue={PRESETS.cards.src}
            onInput={onEditCss}
            onKeyDown={(e) => editorKeys(e, freeTab, onEditCss)}
            onBlur={() => { freeTab.current = false; }}
            spellCheck={false}
            aria-label="DSSL source editor. Press Escape, then Tab, to leave the box."
          />
          <textarea
            ref={htmlRef}
            className="pg-editor"
            hidden={tab !== "html"}
            defaultValue={DEFAULT_HTML}
            onInput={onEditHtml}
            onKeyDown={(e) => editorKeys(e, freeTab, onEditHtml)}
            onBlur={() => { freeTab.current = false; }}
            spellCheck={false}
            aria-label="Canvas HTML editor. Press Escape, then Tab, to leave the box."
          />
          {tab === "css" && (
            <div className="pg-out-wrap">
              <div className="pg-out-bar">
                <span>
                  {shown !== null
                    ? engineOnly.length
                      ? `stays in the engine: ${engineOnly.join(", ")}`
                      : "everything here is plain CSS"
                    : "fix the errors to see the CSS"}
                </span>
                <button type="button" className="doc-btn btn-sm" onClick={copyCss} disabled={shown === null}>Copy CSS</button>
              </div>
              <pre className="pg-out" tabIndex={0} aria-label="The stylesheet as plain CSS">{shown ?? ""}</pre>
            </div>
          )}
          <div className={`pg-status ${ok ? "pg-status-ok" : "pg-status-err"}`} role="status">
            {ok
              ? `ok, ${stats?.rules ?? 0} rules, ${stats?.tokens ?? 0} tokens, ${stats?.motions ?? 0} motions${warnings.length ? `, ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : ""}`
              : `${errors.length} error${errors.length === 1 ? "" : "s"}: fix and keep going`}
          </div>
          {!ok && (
            <div className="pg-errors" aria-live="polite">
              {errors.map((e, i) => (
                <div key={i} className="pg-error">
                  <span>line {e.line ?? "?"}: {e.message}</span>
                  {e.hint && <span className="pg-error-hint">did you mean <em>&ldquo;{e.hint}&rdquo;</em>?</span>}
                </div>
              ))}
            </div>
          )}
          {warnings.length > 0 && (
            <div className="pg-warns" aria-live="polite">
              {warnings.map((w, i) => (
                <div key={i} className="pg-warn">
                  <span>{w.line ? `line ${w.line}: ` : ""}{w.message}</span>
                  {w.hint && <span className="pg-warn-hint">{w.hint}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ------------------------------------ canvas */}
        <div className="pg-pane">
          <div className="pg-head">
            <span>#pg-canvas: scoped</span>
            <div className="pg-head-tools">
              {preset === "signals" && (
                <button type="button" className="doc-btn btn-sm" onClick={toggleHot}>
                  {hot ? "signal: hot" : "signal: cold"}
                </button>
              )}
              {(preset === "motion" || preset === "cards") && (
                <button type="button" className="doc-btn btn-sm" onClick={() => window.DSSL?.replay(".pc-card")}>replay</button>
              )}
            </div>
          </div>
          <div className="pg-canvas-wrap">
            <div className="pg-canvas" id="pg-canvas" ref={canvasRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
