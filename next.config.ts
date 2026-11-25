import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep builds inside this checkout when it is a nested, isolated worktree.
  outputFileTracingRoot: process.cwd(),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
    ],
  },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
};

export default nextConfig;
