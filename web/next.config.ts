import type { NextConfig } from "next";

// GitHub Pages serves the site from https://samchinmaya.github.io/komp,
// so production builds set PAGES_BASE_PATH=/komp. Local dev runs at /.
const basePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export", // plain HTML/CSS/JS in out/, no server needed
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  images: { unoptimized: true },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
