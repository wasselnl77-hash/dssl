import type { Metadata } from "next";
import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export const metadata: Metadata = {
  title: "Cheat sheet",
  description:
    "One page of DSSL: every property shorthand, state, condition and API call, with a line of explanation each.",
};

export default function Page() {
  return <SiteRoot view="cheat" info={readEngineInfo()} />;
}
