import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Spec",
  description:
    "The ratified DSSL v0.2 decisions and what has been added since.",
};

export default function Page() {
  return <SiteRoot view="spec" info={readEngineInfo()} />;
}
