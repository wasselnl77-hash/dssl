import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export default function Home() {
  return <SiteRoot info={readEngineInfo()} />;
}
