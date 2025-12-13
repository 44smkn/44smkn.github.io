import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: false, // Suppress hydration warnings in dev (SSG doesn't use SSR in production)
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['keyv', 'remark-link-card', 'open-graph-scraper'],
};

export default nextConfig;
