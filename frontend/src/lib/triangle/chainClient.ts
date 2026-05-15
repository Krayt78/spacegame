import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getHostProvider, isInsideContainerSync } from "@parity/product-sdk-host";

import { hub } from "@polkadot-api/descriptors";

/**
 * Genesis hash of Paseo Asset Hub as published by
 * `wss://asset-hub-paseo.dotters.network` — the chain Nexus's contracts are
 * deployed on. The SDK preset for `"paseo"` points at a different chain
 * (`paseo-asset-hub-next-rpc.polkadot.io`, genesis `0x173cea…`) and is NOT
 * the right target for us.
 */
const PASEO_HUB_GENESIS =
  "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2" as const;

const FALLBACK_WS_URL =
  process.env.NEXT_PUBLIC_HUB_WS_URL ?? "wss://asset-hub-paseo.dotters.network";

let cached: Promise<PolkadotClient> | null = null;

/**
 * Returns a polkadot-api v2 PolkadotClient bound to Paseo Asset Hub.
 *
 * - **Inside a host**: tries `getHostProvider(genesis)` first so chain RPC
 *   rides on the host's pooled connection (single WebSocket shared across all
 *   products). Falls back to direct WebSocket if the host doesn't expose the
 *   chain yet.
 * - **Outside a host** (dev mode with `NEXT_PUBLIC_SIGNER_PROVIDER=dev`):
 *   uses a direct WebSocket against `NEXT_PUBLIC_HUB_WS_URL` (defaulting to
 *   the dotters endpoint our contracts are deployed against).
 *
 * Result is cached for the lifetime of the page — sharing one client across
 * the app avoids duplicate metadata fetches and keeps the connection pool
 * small.
 */
export function getAssetHubClient(): Promise<PolkadotClient> {
  if (cached) return cached;
  cached = (async () => {
    if (isInsideContainerSync()) {
      try {
        const provider = await getHostProvider(PASEO_HUB_GENESIS);
        if (provider) {
          return createClient(provider);
        }
      } catch (e) {
        console.warn(
          "[chainClient] getHostProvider failed; falling back to direct WS:",
          e,
        );
      }
    }
    return createClient(getWsProvider(FALLBACK_WS_URL));
  })();
  return cached;
}

/**
 * The `hub` descriptor — re-exported here so `contractManager.ts` and any
 * future consumers import a single source of truth, and so we can swap the
 * descriptor in one place if we ever regenerate against a different chain.
 */
export { hub as paseoHubDescriptor };
