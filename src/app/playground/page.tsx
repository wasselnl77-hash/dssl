import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Write DSSL and see it applied by the real engine, with the real error messages.",
};

export default function Page() {
  return <SiteRoot view="playground" info={readEngineInfo()} />;
}
