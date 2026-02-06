import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Phaser.js needs this for canvas
    config.externals = [...(config.externals || []), { canvas: "canvas" }];
    return config;
  },
};

export default nextConfig;
