import type { Metadata, Viewport } from "next";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-dssl-reset suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: prePaint }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
