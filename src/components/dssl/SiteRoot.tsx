"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import HomeView from "./views/HomeView";
import DocsView from "./views/DocsView";
import SpecView from "./views/SpecView";
import PlaygroundView from "./views/PlaygroundView";
import ChangelogView from "./views/ChangelogView";
import { SunIcon, MoonIcon, MenuIcon } from "./icons";

export type ViewName = "home" | "docs" | "spec" | "playground" | "changelog";

const VIEWS: { name: ViewName; label: string }[] = [
  { name: "home", label: "Home" },
  { name: "docs", label: "Docs" },
  { name: "spec", label: "Spec" },
  { name: "playground", label: "Playground" },
  { name: "changelog", label: "Changelog" },
];

function viewFromHash(): ViewName {
  const h = window.location.hash;
  const m = h.match(/^#\/(\w+)/);
  const name = m?.[1] as ViewName | undefined;
  return name && VIEWS.some(v => v.name === name) ? name : "home";
}

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

declare global {
  interface Window {
    DSSL?: {
      load: (urls: string[], opts?: { reset?: boolean }) => Promise<unknown>;
      apply: (src: string, opts?: { name?: string; scope?: string; replace?: boolean }) => DsslApplyResult;
      compile?: (src: string) => DsslApplyResult;
      signal: (n: string, v: string | null) => void;
      getSignal?: (n: string) => string | undefined;
      replay: (sel?: string) => void;
      refresh: () => void;
      version: string;
    };
  }
}

export interface DsslError {
  file?: string;
  line?: number;
  message: string;
  hint?: string;
}

export interface DsslApplyResult {
  ok: boolean;
  errors: DsslError[];
  stats: { rules: number; shadowRules: number; motions: number; tokens: number; mediaQueries: number };
}

export default function SiteRoot() {
  // the view IS the hash — derived, never stored twice
  const view = useSyncExternalStore(
    subscribeHash,
    viewFromHash,
    () => "home" as ViewName,
  );
  const [dsslReady, setDsslReady] = useState(false);

  // ---- boot the DSSL engine (once) ----
  useEffect(() => {
    if (window.DSSL) {
      const t = setTimeout(() => setDsslReady(true), 0);
      return () => clearTimeout(t);
    }
    const existing = document.getElementById("dssl-engine-script");
    const onReady = () => setDsslReady(true);
    window.addEventListener("dssl-ready", onReady);
    if (!existing) {
      const s = document.createElement("script");
      s.id = "dssl-engine-script";
      s.type = "module";
      s.src = "/dssl/boot.js";
      document.head.appendChild(s);
    }
    return () => window.removeEventListener("dssl-ready", onReady);
  }, []);

  // ---- apply the stylesheets (once the engine is up) ----
  useEffect(() => {
    if (!dsslReady || !window.DSSL) return;
    void window.DSSL.load([
      "/styles/tokens.dssl",
      "/styles/site.dssl",
      "/styles/home.dssl",
      "/styles/docs.dssl",
      "/styles/playground.dssl",
      "/styles/changelog.dssl",
    ]);
  }, [dsslReady]);

  // ---- hash router: view IS the hash (bare anchors like #tokens don't re-route) ----

  const go = useCallback((v: ViewName) => {
    window.location.hash = v === "home" ? "" : `#/${v}`;
    window.DSSL?.signal("nav", null); // close the mobile sheet
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const cycleTheme = useCallback(() => {
    if (!window.DSSL) return;
    const cur = document.documentElement.getAttribute("data-theme-mode");
    const next = cur === "light" ? "dark" : cur === "dark" ? null : "light";
    if (next) {
      document.documentElement.setAttribute("data-theme-mode", next);
      window.DSSL.signal("theme", next);
    } else {
      document.documentElement.removeAttribute("data-theme-mode");
      window.DSSL.signal("theme", null); // back to "auto" (system preference)
    }
  }, []);

  const toggleNav = useCallback(() => {
    const open = window.DSSL?.getSignal?.("nav") === "open";
    window.DSSL?.signal("nav", open ? null : "open");
  }, []);

  return (
    <div className="site">
      <header className="nav">
        <div className="wrap nav-inner">
          <a href="#/" className="nav-logo" onClick={(e) => { e.preventDefault(); go("home"); }}>
            <span className="logo-mark">{"//"}</span>
            DSSL
          </a>

          <nav className="nav-links" aria-label="Main">
            {VIEWS.map(v => (
              <a
                key={v.name}
                href={`#/${v.name}`}
                className={`nav-link nl-${v.name}`}
                onClick={(e) => { e.preventDefault(); go(v.name); }}
              >
                {v.label}
              </a>
            ))}
          </nav>

          <div className="nav-side">
            <span className="ver-badge">v0.2.0</span>
            <button type="button" className="theme-btn" onClick={cycleTheme} aria-label="Toggle color theme" title="Theme: auto / light / dark">
              <span className="icon-sun"><SunIcon /></span>
              <span className="icon-moon"><MoonIcon /></span>
            </button>
            <button type="button" className="nav-toggle" onClick={toggleNav} aria-label="Toggle menu">
              <MenuIcon />
            </button>
          </div>
        </div>
      </header>

      <main className="main" data-view={view}>
        {view === "home" && <HomeView go={go} />}
        {view === "docs" && <DocsView />}
        {view === "spec" && <SpecView />}
        {view === "playground" && <PlaygroundView />}
        {view === "changelog" && <ChangelogView />}
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="footer-note">
            <strong>DSSL</strong> — domain specific style language. Built v0.1 → v0.2 while
            building this site; every feature it needed, it grew. This page runs on its own
            engine, no stylesheet attached.
          </div>
          <nav className="footer-links" aria-label="Footer">
            {VIEWS.map(v => (
              <a key={v.name} href={`#/${v.name}`} className="nav-link" onClick={(e) => { e.preventDefault(); go(v.name); }}>
                {v.label}
              </a>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
