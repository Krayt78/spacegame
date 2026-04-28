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
        // IPFS gateways serve from a CID-rooted path, but we also want the
        // bundle to work at any subdomain (e.g. <name>.dot.li). Keep base
        // empty so links remain root-relative.
        trailingSlash: true,
      }
    : {}),
};

export default nextConfig;
