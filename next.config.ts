import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The local review server uses the lower edge for playback controls.
  devIndicators: false,
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
