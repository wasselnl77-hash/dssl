import type { MetadataRoute } from "next";

const BASE = "https://dssl-sable.vercel.app";
const PATHS = ["", "/docs", "/playground", "/cheat", "/spec", "/changelog", "/bench"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((p) => ({ url: BASE + p }));
}
