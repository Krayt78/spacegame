import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // host-papp pulls in `verifiablejs`, which ships a WASM module loaded via
  // ESM. Turbopack handles ESM-imported WASM natively in Next 16, so an
  // empty `turbopack` config block is enough to silence the warning. The
  // webpack hook is kept as a fallback for the edge case where someone runs
  // `next build --webpack`.
  turbopack: {},
  webpack(config) {
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    return config;
  },
};

export default nextConfig;
