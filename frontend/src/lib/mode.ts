import { isInsideContainerSync } from '@parity/product-sdk-host';

/**
 * The two transports this app can drive the SAME ink!/revive contracts over:
 *
 *  - `'host'`  — running inside a Polkadot Host container (dot.li iframe /
 *                webview). Reads go through PAPI `ReviveApi.call` dry-runs and
 *                writes are signed by the Host's product account
 *                (`@parity/product-sdk-signer`). No eth-rpc involved.
 *  - `'evm'`   — running as a standalone web app in a normal browser. Reads
 *                and writes go through wagmi over the chain's eth-rpc adapter,
 *                signed by an injected wallet (MetaMask / Talisman) via
 *                ConnectKit.
 *
 * Every mode-aware primitive (`useReadContract`, `useAccount`,
 * `useNexusContractWrite`, `Web3Provider`) branches on `APP_MODE`. Nothing
 * else in the app — game UI, the ~50 hooks in `useNexusGame.ts`, the contract
 * ABIs/addresses — knows which transport is live.
 */
export type AppMode = 'host' | 'evm';

/**
 * Detection precedence:
 *  1. `NEXT_PUBLIC_APP_MODE` build-time override (`'host'` | `'evm'`). Set this
 *     for any deployment that knows its target — it's baked into the bundle so
 *     SSR and client agree, which sidesteps the hydration edge case below.
 *  2. Runtime container detection via the Host SDK. Lets a SINGLE build serve
 *     both targets: the same bundle resolves to `'host'` when loaded inside
 *     dot.li and `'evm'` in a plain tab.
 *  3. SSR fallback `'evm'` (no `window` on the server). Game pages are
 *     client-gated (they mount behind a `mounted` flag), so the server only
 *     emits a neutral shell — the authoritative mode is the client's. If you
 *     ever server-render mode-dependent markup, set the env override to keep
 *     server and client in lockstep.
 */
function detect(): AppMode {
  const forced = process.env.NEXT_PUBLIC_APP_MODE;
  if (forced === 'host' || forced === 'evm') return forced;
  if (typeof window === 'undefined') return 'evm';
  try {
    return isInsideContainerSync() ? 'host' : 'evm';
  } catch {
    return 'evm';
  }
}

export const APP_MODE: AppMode = detect();

export const isHostMode = APP_MODE === 'host';
export const isEvmMode = APP_MODE === 'evm';
