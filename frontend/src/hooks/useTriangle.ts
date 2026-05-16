'use client';

import { useCallback, useEffect, useState } from 'react';
import { isInsideContainerSync } from '@parity/product-sdk-host';
import type { PolkadotSigner } from 'polkadot-api';
import type {
  ProviderType,
  SignerAccount,
  SignerState,
} from '@parity/product-sdk-signer';

import { signerManager } from '@/lib/triangle/signerManager';

/**
 * Switch between the real Polkadot Host (`'host'`) and the local DevProvider
 * (`'dev'`, Alice/Bob/etc. derived from the well-known Substrate mnemonic).
 *
 * Set `NEXT_PUBLIC_SIGNER_PROVIDER=dev` in `frontend/.env.localhost` to skip
 * the real host entirely — useful for UI iteration without uploading to
 * dot.li. The value is baked at build time (it's a `NEXT_PUBLIC_*` var), so
 * SSR and client render the same isInHost value and React doesn't trip on
 * hydration.
 *
 * Caveats with `'dev'`:
 *   - `requestLogin` is skipped — `connect('dev')` always succeeds.
 *   - The selected account is Alice; her H160 is what the read hooks see,
 *     so any planet/state you've claimed under your real account on dot.li
 *     won't be visible.
 *   - Writes signed as Alice still need her account mapped via
 *     `Revive.map_account` and PAS to pay fees.
 */
const PROVIDER_TYPE: ProviderType =
  process.env.NEXT_PUBLIC_SIGNER_PROVIDER === 'dev' ? 'dev' : 'host';

if (typeof window !== 'undefined' && PROVIDER_TYPE === 'dev') {
  console.info(
    '[useTriangle] DEV MODE — using DevProvider (Alice). Set NEXT_PUBLIC_SIGNER_PROVIDER=host (or unset) for the real host flow.',
  );
}

/**
 * Identifier the host uses to derive our app-scoped product account. Pairs
 * with `PRODUCT_ACCOUNT_INDEX` to produce a deterministic keypair that the
 * host signs with on every chain — including chains the host hasn't been
 * explicitly told about, which is why we need this instead of legacy
 * accounts (dot.li's host rejected `host_sign_payload_with_legacy_account`
 * for our dotters Paseo Asset Hub genesis with
 * `SigningErr::Unknown: Account can't be derived from product account id`).
 *
 * IMPORTANT: dot.li validates this identifier against the dotNS subdomain
 * the dApp is loaded from. If they don't match, the host rejects with a
 * generic "Permission denied" and you'll see `handleSignPayload — invalid
 * account[0]=<id>` in the dot.li console. Override per-deployment via
 * `NEXT_PUBLIC_DOT_NS_IDENTIFIER` to match the actual subdomain (e.g.,
 * `nexusprotocol00.dot` for `https://nexusprotocol00.dot.li`).
 *
 * The H160 derived from this product account is DIFFERENT from the legacy
 * account's H160 — any pre-existing testnet planets stored under the
 * legacy H160 are orphaned. Acceptable pre-launch per the migration plan.
 */
const PRODUCT_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_DOT_NS_IDENTIFIER || 'nexusprotocol00.dot';
const PRODUCT_ACCOUNT_INDEX = 0;

const idleState: SignerState = {
  status: 'disconnected',
  accounts: [],
  selectedAccount: null,
  activeProvider: null,
  error: null,
};

/**
 * Module-level guard: `signerManager.connect()` is destructive — it
 * `disconnectInternal()`s, flips status to `'connecting'`, then reconnects from
 * scratch. Because ~10+ components mount `useTriangle` on /game (every read
 * hook in useNexusGame.ts pulls it via useHostAddress), letting each mount
 * call connect causes a disconnect/connecting cascade that thrashes `ready`
 * and `address` and never settles — the visible login loop.
 *
 * We connect ONCE per page load and reuse the in-flight promise.
 * `signIn()` (the explicit user gesture) is the only thing allowed to retry.
 *
 * After connect succeeds in host mode, we also fetch the product account
 * (the actual signing identity — see `PRODUCT_ACCOUNT_ID`). The product
 * account is published to subscribers separately so React components only
 * report `ready` once BOTH legacy connect AND product-account derivation
 * have completed.
 */
let initialConnect: Promise<unknown> | null = null;
let productAccount: SignerAccount | null = null;
const productAccountListeners = new Set<(a: SignerAccount | null) => void>();

function setProductAccount(value: SignerAccount | null): void {
  productAccount = value;
  for (const listener of productAccountListeners) listener(value);
}

function subscribeProductAccount(cb: (a: SignerAccount | null) => void): () => void {
  productAccountListeners.add(cb);
  return () => {
    productAccountListeners.delete(cb);
  };
}

async function fetchProductAccount(): Promise<SignerAccount | null> {
  const result = await signerManager.getProductAccount(
    PRODUCT_ACCOUNT_ID,
    PRODUCT_ACCOUNT_INDEX,
  );
  if (!result.ok) {
    console.warn('[useTriangle] product account fetch failed:', result.error);
    return null;
  }
  // The product account is a freshly-derived key with zero PAS. The first
  // write per device will fail with InvalidTransaction::Payment until the
  // SS58 is funded via the Paseo faucet (https://faucet.polkadot.io/).
  // Print SS58 + H160 so the user can copy the SS58 into the faucet.
  console.info(
    '[useTriangle] product account ready:\n' +
      `  SS58 (fund this via faucet): ${result.value.address}\n` +
      `  H160 (contract identity):    ${result.value.h160Address}`,
  );
  return result.value;
}

function ensureInitialConnect(): Promise<unknown> {
  if (initialConnect) return initialConnect;
  initialConnect = (async () => {
    try {
      const result = await signerManager.connect(PROVIDER_TYPE);
      if (PROVIDER_TYPE === 'host' && result.ok) {
        const account = await fetchProductAccount();
        setProductAccount(account);
      }
      return result;
    } catch (e) {
      console.warn('[useTriangle] initial connect rejected:', e);
      initialConnect = null;
      setProductAccount(null);
      return null;
    }
  })();
  return initialConnect;
}

export type UseTriangleResult = {
  /** SS58 address of the signing account, or `undefined` before connect. */
  address: string | undefined;
  /** Revive-mapped H160 of the signing account — the player ID the contracts see. */
  h160: `0x${string}` | undefined;
  /** Underlying SignerManager status: 'disconnected' | 'connecting' | 'connected'. */
  status: SignerState['status'];
  /**
   * True once connected AND the signing account is available — in host mode
   * this also requires the product-account derivation to have completed.
   */
  ready: boolean;
  /** Whether we're running inside a Polkadot Host container. */
  isInHost: boolean;
  /** True while a `signIn()` call is in flight (host login UI may be open). */
  signingIn: boolean;
  /** Last SignerManager error, if any. */
  error: SignerState['error'];
  /** Trigger the host's native login UI, then connect. Returns once connect resolves. */
  signIn: () => Promise<void>;
  /**
   * Returns the PolkadotSigner for the signing account, or `null` if the
   * account isn't available yet. Host mode returns the product-account
   * signer; dev mode returns the DevProvider signer (Alice).
   */
  getSigner: () => PolkadotSigner | null;
};

export function useTriangle(): UseTriangleResult {
  const [mounted, setMounted] = useState(false);
  // Seed with the singleton's current state so newly mounted instances on
  // /game (post-redirect from /) don't fall back to idleState and re-render
  // as "disconnected" before subscribe fires its first update.
  const [state, setState] = useState<SignerState>(() =>
    typeof window === 'undefined' ? idleState : signerManager.getState(),
  );
  const [pAccount, setPAccount] = useState<SignerAccount | null>(() =>
    typeof window === 'undefined' ? null : productAccount,
  );
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Sync with the current snapshot in case it changed between render and
    // the effect firing (e.g., during a route transition).
    setState(signerManager.getState());
    setPAccount(productAccount);
    const unsubState = signerManager.subscribe(setState);
    const unsubPA = subscribeProductAccount(setPAccount);
    // Idempotent: only the first useTriangle on the page actually triggers
    // connect; later mounts await the same promise without disconnecting the
    // live session.
    void ensureInitialConnect();
    return () => {
      unsubState();
      unsubPA();
    };
  }, []);

  const signIn = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      // Reset both module-level caches so signIn always issues a fresh
      // attempt — both the host connect and the product-account derivation.
      initialConnect = null;
      setProductAccount(null);
      const result = await ensureInitialConnect();
      if (result && typeof result === 'object' && 'ok' in result && !result.ok) {
        console.warn('[useTriangle] connect failed:', (result as { error?: unknown }).error);
      }
    } finally {
      setSigningIn(false);
    }
  }, [signingIn]);

  // In dev mode the SignerManager is wired to local Alice/Bob accounts — there
  // is no host container to detect, so force isInHost so the UI skips the
  // "Open in Polkadot Host" gate. Baked at build time, so SSR and client agree.
  const reportInHost = PROVIDER_TYPE === 'dev' ? true : false;

  // Pick the "effective" signing account based on provider:
  //   - host: product account (app-scoped, signs across chains)
  //   - dev:  the selected legacy account (Alice via DevProvider)
  const effectiveAccount: SignerAccount | null =
    PROVIDER_TYPE === 'host' ? pAccount : state.selectedAccount;

  const getSigner = useCallback((): PolkadotSigner | null => {
    if (!effectiveAccount) return null;
    try {
      return effectiveAccount.getSigner();
    } catch (e) {
      console.warn('[useTriangle] getSigner failed:', e);
      return null;
    }
  }, [effectiveAccount]);

  if (!mounted) {
    // First render (SSR + client hydration) before our effect has run. We
    // report `'connecting'` instead of `'disconnected'` because
    // ProtectedRoute treats `disconnected` as "redirect to /" — and any
    // page that mounts mid-route (e.g. /game after the redirect-on-login)
    // would then immediately bounce back to /, which bounces back to /game
    // (its own `if (ready) push('/game')`), producing a wedged redirect
    // loop and `Throttling navigation` errors in the console. Reporting
    // `connecting` keeps gate checks neutral until the real state lands.
    return {
      address: undefined,
      h160: undefined,
      status: 'connecting',
      ready: false,
      isInHost: reportInHost,
      signingIn: false,
      error: null,
      signIn,
      getSigner,
    };
  }

  return {
    address: effectiveAccount?.address,
    h160: effectiveAccount?.h160Address as `0x${string}` | undefined,
    status: state.status,
    ready: state.status === 'connected' && effectiveAccount !== null,
    isInHost: PROVIDER_TYPE === 'dev' ? true : isInsideContainerSync(),
    signingIn,
    error: state.error,
    signIn,
    getSigner,
  };
}
