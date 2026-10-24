"use client";

import { useCallback, useSyncExternalStore } from "react";
import HomeView from "./views/HomeView";
import DocsView from "./views/DocsView";
import CheatSheetView from "./views/CheatSheetView";
import SpecView from "./views/SpecView";
import PlaygroundView from "./views/PlaygroundView";
import ChangelogView from "./views/ChangelogView";
import BenchView from "./views/BenchView";
import { SunIcon, MoonIcon, MenuIcon } from "./icons";
import { EngineInfoProvider } from "./engine-info";
import type { EngineInfo } from "@/lib/engine-info";

export type ViewName = "home" | "docs" | "cheat" | "spec" | "playground" | "changelog" | "bench";

const VIEWS: { name: ViewName; label: string }[] = [
  { name: "home", label: "Home" },
  { name: "docs", label: "Docs" },
  { name: "cheat", label: "Cheat sheet" },
  { name: "spec", label: "Spec" },
  { name: "playground", label: "Playground" },
  { name: "changelog", label: "Changelog" },
  { name: "bench", label: "Bench" },
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

export default function SiteRoot({ info }: { info: EngineInfo }) {
  // the view IS the hash — derived, never stored twice
  const view = useSyncExternalStore(
    subscribeHash,
    viewFromHash,
    () => "home" as ViewName,
  );
  // v0.3.2: engine boot + stylesheet application moved into the document head
  // (inline <style type="text/dssl"> + a module script). Styles now land before
  // first paint instead of after hydration + six sequential fetches.

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
    <EngineInfoProvider value={info}>
    <div className="site" data-view={view}>
      <header className="nav">
        <div className="wrap nav-inner">
          <a href="#/" className="nav-logo" onClick={(e) => { e.preventDefault(); go("home"); }}>
            <span className="logo-mark">{"§"}</span>
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
            <a href="#/changelog" className="ver-badge" onClick={(e) => { e.preventDefault(); go("changelog"); }}>v{info.version}</a>
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

      {/* data-view lives on the ROOT so the nav-active rules can reach the
          header links — on <main> they never matched (main is a SIBLING of
          the header, and descendant selectors only look down the tree) */}
      <main className="main">
        {view === "home" && <HomeView go={go} />}
        {view === "docs" && <DocsView />}
        {view === "cheat" && <CheatSheetView />}
        {view === "spec" && <SpecView />}
        {view === "playground" && <PlaygroundView />}
        {view === "changelog" && <ChangelogView />}
        {view === "bench" && <BenchView />}
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <div className="footer-col">
            <div className="footer-note">
              <strong>DSSL</strong>, the domain specific style language. Built from v0.1 to v{info.version} while
              building this site: every feature it needed, it grew, and every bug you sent got
              fixed for real. This page runs on its own engine with no CSS files attached.
              The engine styles this DOM directly.
            </div>
            <div className="footer-fine">
              © 2026 <strong>DSSL. inc</strong>, named after the product, because naming things
              is hard.
            </div>
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
    </EngineInfoProvider>
  );
}
