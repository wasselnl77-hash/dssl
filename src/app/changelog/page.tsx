import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "What changed in each DSSL release and why, including the bugs reviewers found.",
};

export default function Page() {
  return <SiteRoot view="changelog" info={readEngineInfo()} />;
}
