"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

/** every section is a real URL now (it used to be #/docs on one page), so each
 *  gets its own title, can be linked, and is in the HTML a crawler downloads */
export const VIEW_PATH: Record<ViewName, string> = {
  home: "/",
  docs: "/docs",
  cheat: "/cheat",
  spec: "/spec",
  playground: "/playground",
  changelog: "/changelog",
  bench: "/bench",
};

const NAV: { name: ViewName; label: string }[] = [
  { name: "docs", label: "Docs" },
  { name: "playground", label: "Playground" },
  { name: "cheat", label: "Cheat sheet" },
  { name: "spec", label: "Spec" },
  { name: "changelog", label: "Changelog" },
  { name: "bench", label: "Bench" },
];

export default function SiteRoot({ view, info }: { view: ViewName; info: EngineInfo }) {
  const router = useRouter();

  // Old links looked like /#/docs. They still work: land here, hop to the real URL.
  useEffect(() => {
    const m = window.location.hash.match(/^#\/(\w*)/);
    if (!m) return;
    const name = (m[1] || "home") as ViewName;
    if (name in VIEW_PATH && name !== view) router.replace(VIEW_PATH[name]);
  }, [router, view]);

  // close the mobile sheet and start each page at the top
  useEffect(() => {
    window.DSSL?.signal("nav", null);
    if (!window.location.hash) window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [view]);

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
        <a href="#main" className="skip-link">Skip to content</a>
        <header className="nav">
          <div className="wrap nav-inner">
            <Link href="/" className="nav-logo" aria-label="DSSL, home">
              <span className="logo-mark" aria-hidden="true">{"§"}</span>
              DSSL
            </Link>

            <nav className="nav-links" aria-label="Main">
              {NAV.map((v) => (
                <Link
                  key={v.name}
                  href={VIEW_PATH[v.name]}
                  className={`nav-link nl-${v.name}`}
                  aria-current={view === v.name ? "page" : undefined}
                >
                  {v.label}
                </Link>
              ))}
            </nav>

            <div className="nav-side">
              <Link href="/changelog" className="ver-badge" aria-label={`Version ${info.version}, see the changelog`}>
                v{info.version}
              </Link>
              <button type="button" className="theme-btn" onClick={cycleTheme} aria-label="Switch color theme" title="Theme: auto, light or dark">
                <span className="icon-sun"><SunIcon /></span>
                <span className="icon-moon"><MoonIcon /></span>
              </button>
              <button type="button" className="nav-toggle" onClick={toggleNav} aria-label="Open the menu">
                <MenuIcon />
              </button>
            </div>
          </div>
        </header>

        <main className="main" id="main">
          {view === "home" && <HomeView />}
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
              <p className="footer-note">
                <strong>DSSL</strong> is a style language, built from v0.1 to v{info.version} while building
                this site. Whatever the site needed, the language grew, and every bug people sent got fixed.
                This page runs on the engine it describes. No CSS file is attached.
              </p>
              <p className="footer-fine">
                © 2026 <strong>DSSL. inc</strong>, named after the product, because naming things is hard.
                MIT licensed, with the code on{" "}
                <a href="https://huggingface.co/EHS-Studio/dssl">Hugging Face</a>.
              </p>
            </div>
            <nav className="footer-links" aria-label="Footer">
              {NAV.map((v) => (
                <Link key={v.name} href={VIEW_PATH[v.name]} className="nav-link">
                  {v.label}
                </Link>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </EngineInfoProvider>
  );
}
