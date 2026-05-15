#!/usr/bin/env node
// Generate frontend/.cdm/contracts.d.ts — augments the `Contracts` interface
// from @parity/product-sdk-contracts so `manager.getContract("@nexus/game")`
// returns a fully-typed handle with method names, arg types, and return types
// inferred straight from the Solidity ABI.
//
// Run via `npm run gen:types` (or transitively via prebuild:static).
//
// Output is gitignored — regenerated whenever ABIs change.

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  generateContractTypes,
  resolveContractTypeInputs,
} from "@parity/product-sdk-contracts/codegen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");

const inputs = [
  {
    library: "@nexus/game",
    abiPath: join(frontendDir, "src/contracts/abi/NexusGame.json"),
  },
  {
    library: "@nexus/config",
    abiPath: join(frontendDir, "src/contracts/abi/GameConfig.json"),
  },
];

const resolved = await resolveContractTypeInputs(inputs);
const source = generateContractTypes(resolved);

const outDir = join(frontendDir, ".cdm");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "contracts.d.ts");
writeFileSync(outPath, source);

console.log(`[generate-contract-types] wrote ${relative(frontendDir, outPath)}`);
