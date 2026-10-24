import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

/** Facts about the engine that the site states out loud. They are measured from
 *  public/dssl/ when the page is built, so the version badge and the size claim
 *  cannot drift away from the code the way the hardcoded ones did. */
export interface EngineInfo {
  version: string;
  /** whole engine, minified: no. Plain source, as served. */
  rawKb: number;
  /** the same files, gzipped, which is what a browser actually downloads */
  gzKb: number;
}

const FILES = ["boot", "index", "engine", "parser", "resolver", "static", "utils"];

export function readEngineInfo(): EngineInfo {
  const dir = path.join(process.cwd(), "public", "dssl");
  let version = "0.0.0";
  let raw = 0;
  let gz = 0;
  try {
    const parts = FILES.map((f) => readFileSync(path.join(dir, `${f}.js`)));
    const m = /VERSION\s*=\s*'([^']+)'/.exec(readFileSync(path.join(dir, "index.js"), "utf8"));
    if (m) version = m[1];
    raw = parts.reduce((n, b) => n + b.length, 0);
    gz = gzipSync(Buffer.concat(parts), { level: 9 }).length;
  } catch {
    // files missing at build time: say nothing wrong rather than something invented
  }
  return { version, rawKb: Math.round(raw / 1000), gzKb: Math.round(gz / 1000) };
}
