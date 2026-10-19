import type { NextConfig } from "next";

// Base path for sub-path hosting (e.g. GitHub Pages project sites at
// https://<user>.github.io/<repo>/). Set NEXT_PUBLIC_BASE_PATH=/"<repo>" at
// build time; leave unset / empty for root deployments (serv00, user sites).
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim();

const nextConfig: NextConfig = {
  // Fully static export — the app is 100% client-side (WASM parsing in the
  // browser), so it can be hosted on any static file server (GitHub Pages,
  // serv00, Netlify, Cloudflare Pages, plain Apache/nginx).
  output: "export",
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
  images: {
    // Required for `output: "export"` — no server-side image optimization.
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
