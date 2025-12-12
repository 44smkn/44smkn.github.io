import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  reactStrictMode: false, // Suppress hydration warnings in dev (SSG doesn't use SSR in production)
  /* config options here */
};

export default nextConfig;
