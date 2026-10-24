import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Bench",
  description:
    "How fast the DSSL engine styles pages of different sizes, measured in your browser.",
};

export default function Page() {
  return <SiteRoot view="bench" info={readEngineInfo()} />;
}
