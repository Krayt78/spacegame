#!/usr/bin/env node
// Generate frontend/.cdm/contracts.d.ts — augments the `Contracts` interface
// from @parity/product-sdk-contracts so `manager.getContract("@nexus/game")`
// returns a fully-typed handle with method names, arg types, and return types
// inferred straight from the Solidity ABI.
//
// Run via `npm run gen:types` (or transitively via prebuild:static).
//
// Output is gitignored — regenerated whenever ABIs change.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  generateContractTypes,
  resolveContractTypeInputs,
} from "@parity/product-sdk-contracts/codegen";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(__dirname, "..");

/**
 * Solidity emits unnamed inputs for auto-generated mapping getters
 * (e.g. `mapping(BuildingType => BuildingConfig) public buildingConfigs;`
 * produces `buildingConfigs(uint8) returns (...)` with no name on the input).
 * The SDK's type codegen emits `args: [: number]` for those — a syntax
 * error in TypeScript. Patch by assigning synthetic `arg0`/`arg1`/… names
 * to every unnamed input before handing the ABI off.
 */
function nameAnonInputs(abi) {
  return abi.map((entry) => {
    if (entry.type !== "function" || !Array.isArray(entry.inputs)) return entry;
    const inputs = entry.inputs.map((input, i) =>
      input?.name ? input : { ...input, name: `arg${i}` },
    );
    return { ...entry, inputs };
  });
}

function loadAbi(relativePath) {
  return nameAnonInputs(
    JSON.parse(readFileSync(join(frontendDir, relativePath), "utf8")),
  );
}

const inputs = [
  { library: "@nexus/game", abi: loadAbi("src/contracts/abi/NexusGame.json") },
  { library: "@nexus/config", abi: loadAbi("src/contracts/abi/GameConfig.json") },
];

const resolved = await resolveContractTypeInputs(inputs);
const source = generateContractTypes(resolved);

const outDir = join(frontendDir, ".cdm");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "contracts.d.ts");
writeFileSync(outPath, source);

console.log(`[generate-contract-types] wrote ${relative(frontendDir, outPath)}`);
