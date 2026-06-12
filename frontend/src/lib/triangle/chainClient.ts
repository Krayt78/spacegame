import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { hub } from "@polkadot-api/descriptors";

/**
 * Genesis hash of paseo-next-v2 Asset Hub (`paseo-asset-hub-next-rpc.polkadot.io`,
 * parachain 1500) — the chain Nexus's contracts live on since the 2026-06-12
 * migration off the standard Paseo AH (dotters, `0xd6eec2…`). This is the chain
 * the dot.li host signs against. CAUTION: both chains report EVM chainId
 * 420420417, and previewnet's AH is *also* parachain 1500 with yet another
 * genesis (`0x29f7b15e…`) — the genesis hash is the only reliable discriminator.
 *
 * Kept exported in case a future host build advertises support for this
 * chain — then we can reintroduce a `getHostProvider(PASEO_HUB_GENESIS)`
 * branch below.
 */
export const PASEO_HUB_GENESIS =
  "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f" as const;

const FALLBACK_WS_URL =
  process.env.NEXT_PUBLIC_HUB_WS_URL ?? "wss://paseo-asset-hub-next-rpc.polkadot.io";

let cached: Promise<PolkadotClient> | null = null;

/**
 * Returns a polkadot-api v2 PolkadotClient bound to Paseo Asset Hub.
 *
 * Always opens a direct WebSocket to `NEXT_PUBLIC_HUB_WS_URL`, even inside a
 * Polkadot Host container. Why not host-routed RPC?
 *   - Our contracts are deployed on `wss://asset-hub-paseo.dotters.network`
 *     (genesis `0xd6eec…`). dot.li only proxies the official Paseo Asset Hub
 *     (`0x173cea…`).
 *   - `getHostProvider(unsupported)` does NOT return null — it returns a
 *     shell provider whose `send()` silently logs
 *     "Provider for chain <hash> was not started because Host doesn't support it"
 *     and discards the message. We were unconditionally committing to that
 *     dead provider inside the host, so every chainHead/dry-run/tx ate the
 *     error and hung. Direct WS sidesteps the negotiation entirely.
 *
 * When the host eventually advertises our chain, reintroduce the
 * `if (isInsideContainerSync()) getHostProvider(...)` branch from
 * git history — that path is correct in principle, just blocked by the
 * dotters/official genesis split.
 *
 * Result is cached for the lifetime of the page so we share one client and
 * one metadata fetch across every read/write hook.
 */
export function getAssetHubClient(): Promise<PolkadotClient> {
  if (cached) return cached;
  cached = (async () => createClient(getWsProvider(FALLBACK_WS_URL)))();
  return cached;
}

/**
 * The `hub` descriptor — re-exported here so `contractManager.ts` and any
 * future consumers import a single source of truth, and so we can swap the
 * descriptor in one place if we ever regenerate against a different chain.
 */
export { hub as paseoHubDescriptor };

/**
 * Convenience: `client.getTypedApi(paseoHubDescriptor)` is the entrypoint to
 * `typedApi.tx.*` / `typedApi.query.*` for any pallet on this chain (Balances,
 * Proxy, Utility, Revive, etc.). Session-wallet code needs direct access to
 * these to build `Proxy.proxy({ real: main, call: Revive.call(...) })`
 * extrinsics — the contract-manager abstraction only exposes the inner
 * Revive.call, not the outer Proxy wrapper.
 */
export async function getTypedApi() {
  const client = await getAssetHubClient();
  return client.getTypedApi(hub);
}
