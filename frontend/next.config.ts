import type { NextConfig } from "next";

// Set STATIC_EXPORT=1 to produce a fully static `out/` directory for IPFS /
// DotNS deployment via `scripts/deploy-frontend.sh`. Plain `npm run build`
// keeps the default server-style output for Vercel.
const STATIC_EXPORT = process.env.STATIC_EXPORT === "1";

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
  ...(STATIC_EXPORT
    ? {
        output: "export" as const,
        // Next/image requires the runtime image optimizer; it's gone in static mode.
        images: { unoptimized: true },
      }
    : {
        // Local-dev RPC proxy: the app talks to same-origin `/rpc`, which the
        // dev server forwards to the hardhat node. Same-origin means no CORS
        // preflights and no Brave/extension shields blocking cross-origin
        // localhost requests. Static export can't do rewrites, but local play
        // is always `next dev`. Target port must match `hardhat node --port`.
        async rewrites() {
          return [
            {
              source: "/rpc",
              destination: process.env.LOCAL_RPC_TARGET ?? "http://127.0.0.1:8545",
            },
          ];
        },
      }),
};

export default nextConfig;
