import { createClient, type PolkadotClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { hub } from "@polkadot-api/descriptors";

/**
 * Genesis hash of Paseo Asset Hub as published by
 * `wss://asset-hub-paseo.dotters.network` — the chain Nexus's contracts are
 * deployed on. The SDK preset for `"paseo"` points at a different chain
 * (`paseo-asset-hub-next-rpc.polkadot.io`, genesis `0x173cea…`) and is NOT
 * the right target for us.
 *
 * Kept exported in case a future host build advertises support for this
 * chain — then we can reintroduce a `getHostProvider(PASEO_HUB_GENESIS)`
 * branch below.
 */
export const PASEO_HUB_GENESIS =
  "0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2" as const;

const FALLBACK_WS_URL =
  process.env.NEXT_PUBLIC_HUB_WS_URL ?? "wss://asset-hub-paseo.dotters.network";

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
