import {
  ContractManager,
  ensureContractAccountMapped,
} from "@parity/product-sdk-contracts";
import type { PolkadotSigner } from "polkadot-api";

// frontend/cdm.json — generated at build time by scripts/generate-cdm.mjs.
// Three levels up from src/lib/triangle/ → src/lib/ → src/ → frontend/.
import cdmJson from "../../../cdm.json";
import { signerManager } from "@/lib/triangle/signerManager";
import { getAssetHubClient, paseoHubDescriptor } from "@/lib/triangle/chainClient";

let cached: Promise<ContractManager> | null = null;

/**
 * Singleton ContractManager bound to Paseo Asset Hub via the chain client
 * from `chainClient.ts` and the contracts described in `cdm.json`.
 *
 * The CDM manifest is regenerated on every dev/build by
 * `scripts/generate-cdm.mjs`, which reads `NEXT_PUBLIC_NEXUS_GAME_ADDRESS`
 * and `NEXT_PUBLIC_GAME_CONFIG_ADDRESS` from the active env file. Two
 * library names are wired up:
 *   - `@nexus/game`   → NexusGame.sol (router / writes)
 *   - `@nexus/config` → GameConfig.sol (costs / build times)
 *
 * `options.signerManager` lets `.tx()` resolve the signer + origin from
 * whichever account is currently selected on the global SignerManager —
 * no per-call boilerplate.
 */
export function getContractManager(): Promise<ContractManager> {
  if (cached) return cached;
  cached = (async () => {
    const client = await getAssetHubClient();
    return ContractManager.fromClient(
      cdmJson as never,
      client,
      paseoHubDescriptor,
      {
        signerManager,
        // Origin for `.query()` dry-runs before any account is connected.
        // Reads here never depend on msg.sender (every view takes the player
        // address as an explicit arg), so well-known //Alice is a safe
        // stand-in. Once the user connects, signerManager's account wins.
        defaultOrigin: "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY",
      },
    );
  })();
  return cached;
}

/**
 * One-time `Revive.map_account` registration for an SS58 origin.
 *
 * pallet-revive requires every signing account to be registered with the
 * address mapper before its extrinsics are accepted. The underlying helper
 * short-circuits (reads `Revive.OriginalAccount` first) so the worst case
 * per boot is one extra storage read.
 *
 * Idempotent; safe to call repeatedly. Process-wide memoization happens in
 * `useNexusContractWrite`, so this is the slow path only on first-ever
 * write for a given account on this device.
 */
export async function ensureMapped(
  ss58: string,
  signer: PolkadotSigner,
): Promise<void> {
  const manager = await getContractManager();
  await ensureContractAccountMapped(manager.getRuntime(), ss58, signer);
}
