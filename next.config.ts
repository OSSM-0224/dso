import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Faster builds/dev refresh: pre-resolve these libs' barrel exports so
    // only the used symbols (e.g. a handful of lucide icons) enter the graph.
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
