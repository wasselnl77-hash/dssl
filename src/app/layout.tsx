import type { Metadata, Viewport } from "next";
import { readFileSync } from "node:fs";
import path from "node:path";
import "./globals.css";

export const metadata: Metadata = {
  title: "DSSL — Domain Specific Style Language",
  description:
    "DSSL is a styling language for the web: design tokens, its own cascade, loud errors and zero specificity wars. Ships as a ~20 kB engine, no build step.",
  keywords: ["DSSL", "CSS alternative", "style language", "design tokens", "web"],
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// The ONLY non-DSSL styling in this app: a pre-paint shim so the very first
// frame doesn't flash white before the DSSL engine boots (dark-mode respect).
const prePaint = `
  html { background: #faf8f4; }
  @media (prefers-color-scheme: dark) { html { background: #14111c; } }
`;

// v0.3.2 — performance: the stylesheets ride INSIDE the HTML. The engine's
// auto-boot picks these <style type="text/dssl"> tags up the moment the module
// executes (right after parse, before first paint), so there is no fetch
// waterfall and no wait for React hydration. Server-side read also means a
// browser refresh picks up .dssl edits instantly in dev.
const DSSL_SHEETS = ["tokens", "site", "home", "docs", "playground", "changelog"] as const;

function dsslInlineStyles(): { name: string; src: string }[] {
  return DSSL_SHEETS.map((name) => {
    let src = "";
    try {
      src = readFileSync(path.join(process.cwd(), "public", "styles", `${name}.dssl`), "utf8");
    } catch {
      // missing sheet: boot simply won't apply it; errors stay loud elsewhere
    }
    // defensive: a "</style" sequence in source would break out of the tag
    src = src.replace(/<\/style/gi, "<\\/style");
    return { name, src };
  });
}

// Dev-only interop shim: the engine styles the SSR DOM BEFORE React hydrates
// (that is the whole point — no FOUC). React 19 then logs one console.error
// about extra style attributes and, helpfully, does not patch them. On our own
// site that reads as "1 Issue" in the dev overlay. This shim filters ONLY the
// hydration notices whose diff references DSSL's var(--dssl-*) attributes and
// re-tells them as an explained info line; any genuine mismatch still shows.
const hydrationShim = `
(function () {
  var HYD = 'A tree hydrated but some attributes of the server rendered HTML';
  var orig = console.error;
  console.error = function () {
    var s = '';
    for (var i = 0; i < arguments.length; i++) {
      var a = arguments[i];
      s += (typeof a === 'string' ? a : ' ');
    }
    if (s.indexOf(HYD) === 0 && s.indexOf('--dssl') !== -1) {
      console.info('%cDSSL%c styled this page before React hydrated. The "hydrated but some attributes didn\\u2019t match" notice is expected interop: the engine owns those style attributes, and React explicitly leaves them alone.',
        'background:#b3372e;color:#fff;padding:1px 6px;border-radius:3px;font-weight:700', '');
      return;
    }
    return orig.apply(console, arguments);
  };
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-dssl-reset suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: prePaint }} />
        {process.env.NODE_ENV !== "production" && (
          <script dangerouslySetInnerHTML={{ __html: hydrationShim }} />
        )}
        {dsslInlineStyles().map(({ name, src }) => (
          <style
            key={name}
            type="text/dssl"
            data-dssl-name={`${name}.dssl`}
            dangerouslySetInnerHTML={{ __html: src }}
          />
        ))}
        {/* engine starts downloading with the document — module defer rules
            mean it executes after parse with the full SSR DOM present */}
        <script type="module" src="/dssl/boot.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
