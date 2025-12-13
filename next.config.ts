import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: false, // Suppress hydration warnings in dev (SSG doesn't use SSR in production)
  serverExternalPackages: ['keyv'],
};

export default nextConfig;
