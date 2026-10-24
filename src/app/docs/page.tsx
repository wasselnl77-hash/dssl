import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "The DSSL language tour: syntax, tokens, states, motion, errors and the JavaScript API, with live examples styled by the rules shown next to them.",
};

export default function Page() {
  return <SiteRoot view="docs" info={readEngineInfo()} />;
}
