import { SignerManager } from "@parity/product-sdk-signer";

/**
 * Singleton SignerManager wired to the Polkadot Host provider. Owns the
 * connection lifecycle, the list of injected accounts, and the currently
 * selected account; consumers subscribe via `useTriangle()`.
 *
 * - `ss58Prefix: 0` — Paseo Asset Hub uses the Polkadot generic prefix.
 * - `dappName: "nexus-protocol"` — used as the persistence key for the
 *   selected-account preference (so the user's choice survives reloads).
 *
 * `HostProvider` defaults `requestChainSubmitPermission: true` — the first
 * successful `connect()` per device asks the host for `ChainSubmit` once,
 * then never again. Phase 3's write hooks rely on this being granted.
 */
export const signerManager = new SignerManager({
  ss58Prefix: 0,
  dappName: "nexus-protocol",
});
