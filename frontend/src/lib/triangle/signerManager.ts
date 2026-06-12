import {
  DevProvider,
  HostProvider,
  SignerManager,
} from "@parity/product-sdk-signer";

import {
  computeProductIdentifier,
  PRODUCT_ACCOUNT_INDEX,
} from "@/lib/triangle/productIdentifier";

/**
 * Singleton SignerManager wired to the Polkadot Host provider. Owns the
 * connection lifecycle and the signing account; consumers subscribe via
 * `useTriangle()`.
 *
 * - `ss58Prefix: 0` — Paseo Asset Hub uses the Polkadot generic prefix.
 * - `dappName: "nexus-protocol"` — used as the persistence key for the
 *   selected-account preference (so the user's choice survives reloads).
 *
 * The custom `createProvider` factory exists for one reason: the default
 * host branch doesn't forward `productAccount`, and WITHOUT that option
 * `HostProvider.connect()` fetches LEGACY accounts — which the current
 * dot.li doesn't expose to dApps at all, so connect dies with
 * `NoAccountsError: No accounts available from host provider` before the
 * product account is ever derived (observed live, 2026-06-12). With it,
 * connect skips the legacy fetch and returns the product account directly,
 * already pinned to `createTransaction` signing (AsPgas-safe).
 *
 * `dotNsIdentifier` is computed inside the factory, which only runs at
 * `connect()` time on the client — `window.location` is safe there.
 *
 * `requestName: false` skips the connect-time `getUserId()` fetch (it
 * triggers a host identity-permission prompt and we never render the name).
 *
 * `HostProvider` defaults `requestChainSubmitPermission: true` — the first
 * successful `connect()` per device asks the host for `ChainSubmit` once,
 * then never again. Phase 3's write hooks rely on this being granted.
 */
/**
 * Auto-sign call budget requested at connect. On paseo-next-v2 the
 * `SmartContractAllowance` grant is what fills the chain's `AuthorizeCall`
 * and actually unblocks host signing — without it every write is rejected
 * (DotRivals finding, TESTNET_DEPLOY.md §5; `AutoSigning` itself currently
 * comes back `NotAvailable` on the host but is requested for when it ships).
 * One wallet prompt covers ~1000 game writes before re-asking.
 */
const AUTO_SIGN_CALL_BUDGET = 1000;

export const signerManager = new SignerManager({
  ss58Prefix: 0,
  dappName: "nexus-protocol",
  onConnect: async (_account, { requestResourceAllocation, signal }) => {
    if (process.env.NEXT_PUBLIC_SIGNER_PROVIDER === "dev") return;
    const requested = [
      { tag: "AutoSigning", value: undefined },
      { tag: "SmartContractAllowance", value: AUTO_SIGN_CALL_BUDGET },
    ] as const;
    try {
      const outcomes = await requestResourceAllocation([...requested]);
      if (signal.aborted) return;
      outcomes.forEach((o, i) => {
        const tag = requested[i]?.tag ?? `#${i}`;
        if (o.tag === "Allocated") console.info(`[signer] ${tag}: Allocated ✓`);
        else console.warn(`[signer] ${tag}: ${o.tag} (not granted)`);
      });
    } catch (cause) {
      console.warn("[signer] resource allocation failed:", cause);
    }
  },
  createProvider: (type) => {
    if (type === "host") {
      // ss58Prefix / maxRetries / retryDelay mirror the SDK's default
      // factory values (signer-manager.ts createProvider).
      return new HostProvider({
        ss58Prefix: 0,
        maxRetries: 3,
        retryDelay: 500,
        productAccount: {
          dotNsIdentifier: computeProductIdentifier(),
          derivationIndex: PRODUCT_ACCOUNT_INDEX,
          requestName: false,
        },
      });
    }
    return new DevProvider({ ss58Prefix: 0 });
  },
});
