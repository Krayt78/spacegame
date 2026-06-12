#!/usr/bin/env node
// Generate frontend/cdm.json — the contract manifest consumed by
// @parity/product-sdk-contracts at runtime.
//
// Inputs:
//   - process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS  (required for a useful build)
//   - process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS (required for a useful build)
//   - process.env.NEXT_PUBLIC_HUB_WS_URL          (optional; falls back to Paseo Hub default)
//   - frontend/src/contracts/abi/NexusGame.json
//   - frontend/src/contracts/abi/GameConfig.json
//
// Output: frontend/cdm.json (gitignored — regenerated on every dev/build).
//
// The env vars are populated by env-cmd in `dev:local` / `dev:testnet`, or by
// `set -a; . .env.testnet; set +a` in scripts/deploy-frontend.sh.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");

const ZERO = "0x0000000000000000000000000000000000000000";
// The chain Nexus's contracts are deployed against (paseo-next-v2 Asset Hub
// since Phase 8). Only used for the log line — since the flat 0.7 CDM schema,
// the chain endpoint comes from the PAPI client passed to
// `ContractManager.fromClient`, not the manifest.
const DEFAULT_HUB_WS = "wss://paseo-asset-hub-next-rpc.polkadot.io";

const nexusGameAddress = process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS;
const gameConfigAddress = process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS;
const hubWs = process.env.NEXT_PUBLIC_HUB_WS_URL || DEFAULT_HUB_WS;

if (!nexusGameAddress || !gameConfigAddress) {
  // Don't fail the build — the existing `contracts.ts` already warns on missing
  // env vars at runtime, and devs may legitimately generate the manifest before
  // their .env file exists. We do log loudly though, with both names so it's
  // grep-friendly in CI output.
  console.warn(
    "[generate-cdm] WARNING: NEXT_PUBLIC_NEXUS_GAME_ADDRESS and/or " +
      "NEXT_PUBLIC_GAME_CONFIG_ADDRESS are missing — cdm.json will be written " +
      "with placeholder zero addresses. ContractManager calls will fail until " +
      "this is regenerated with real env vars.",
  );
}

function readAbi(relativePath) {
  const abiPath = join(frontendDir, relativePath);
  try {
    return JSON.parse(readFileSync(abiPath, "utf8"));
  } catch (err) {
    console.error(`[generate-cdm] failed to read ABI at ${abiPath}: ${err.message}`);
    process.exit(1);
  }
}

const nexusGameAbi = readAbi("src/contracts/abi/NexusGame.json");
const gameConfigAbi = readAbi("src/contracts/abi/GameConfig.json");

// Flat CDM manifest shape consumed by @parity/product-sdk-contracts >=0.7
// (the "flatten cdm.json" change, #161): top-level `dependencies` (name →
// version) and `contracts` (name → { version, address, abi }). No `targets`
// wrapper — the chain endpoint is supplied by the PAPI client passed to
// `ContractManager.fromClient`, not the manifest. With the old nested shape,
// `getContract()` fails at runtime with `Contract "@nexus/game" not found in
// cdm.json` (hit live on dot.li, 2026-06-12).
const cdm = {
  dependencies: {
    "@nexus/game": 0,
    "@nexus/config": 0,
  },
  contracts: {
    "@nexus/game": {
      version: 0,
      address: nexusGameAddress || ZERO,
      abi: nexusGameAbi,
    },
    "@nexus/config": {
      version: 0,
      address: gameConfigAddress || ZERO,
      abi: gameConfigAbi,
    },
  },
};

const outPath = join(frontendDir, "cdm.json");
writeFileSync(outPath, JSON.stringify(cdm, null, 2) + "\n");

const short = (addr) => (addr && addr !== ZERO ? `${addr.slice(0, 10)}…` : "ZERO");
console.log(
  `[generate-cdm] wrote ${relative(frontendDir, outPath)} ` +
    `(game=${short(nexusGameAddress)}, config=${short(gameConfigAddress)}, hub=${hubWs})`,
);
