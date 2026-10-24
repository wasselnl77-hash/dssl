import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // the wood showcase is a plain static page that lives in public/
  async rewrites() {
    return [{ source: "/showcase/wood", destination: "/showcase/wood/index.html" }];
  },
};

export default nextConfig;
