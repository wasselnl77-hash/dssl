import SiteRoot from "@/components/dssl/SiteRoot";
import { readEngineInfo } from "@/lib/engine-info";

export default function Page() {
  return <SiteRoot view="home" info={readEngineInfo()} />;
}
