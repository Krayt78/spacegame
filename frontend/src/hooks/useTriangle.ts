'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAccountsProvider, isInsideContainerSync } from '@parity/product-sdk-host';
import type { ProviderType, SignerState } from '@parity/product-sdk-signer';

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
 * Single React entry point onto the @parity/product-sdk triangle stack.
 *
 * Responsibilities:
 *   - Subscribe to `SignerManager` state.
 *   - Auto-`connect("host")` once on mount so users with an active host
 *     session land directly in the game (no extra click).
 *   - Expose `signIn()` — triggers the host's native login UI via
 *     `accountsProvider.requestLogin(reason)` and then retries connect.
 *   - Map the SDK's account shape to the H160 the existing read hooks
 *     query the contracts with.
 *
 * SSR/static-export safety: every value that depends on `window` (host
 * detection, signer state) returns SSR-safe defaults until the first
 * `useEffect` flips `mounted = true`. Without this the first client render
 * diverges from the static HTML and React aborts hydration of the entire
 * tree (the #418 trap from Phase 1).
 */

const idleState: SignerState = {
  status: 'disconnected',
  accounts: [],
  selectedAccount: null,
  activeProvider: null,
  error: null,
};

const LOGIN_REASON = 'Sign in to play Nexus Protocol';

export type UseTriangleResult = {
  /** SS58 address of the selected account, or `undefined` before connect. */
  address: string | undefined;
  /** Revive-mapped H160 of the selected account — the player ID the contracts see. */
  h160: `0x${string}` | undefined;
  /** Underlying SignerManager status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'. */
  status: SignerState['status'];
  /** True once connected AND an account is selected (the gate for in-game UI). */
  ready: boolean;
  /** Whether we're running inside a Polkadot Host container. */
  isInHost: boolean;
  /** True while a `signIn()` call is in flight (host login UI may be open). */
  signingIn: boolean;
  /** Last SignerManager error, if any. */
  error: SignerState['error'];
  /** Trigger the host's native login UI, then connect. Returns once connect resolves. */
  signIn: () => Promise<void>;
};

export function useTriangle(): UseTriangleResult {
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<SignerState>(idleState);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = signerManager.subscribe(setState);
    // Try silently on mount; in host mode, failure means the user isn't
    // signed in yet and the UI surfaces the explicit Sign In button.
    // In dev mode this resolves immediately with Alice's account.
    signerManager.connect(PROVIDER_TYPE).catch((e) => {
      console.warn('[useTriangle] initial connect rejected:', e);
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async () => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      if (PROVIDER_TYPE === 'host') {
        // Trigger the host's native login UI. If already signed in, this
        // returns 'alreadyConnected' immediately with no UI flash.
        const provider = await getAccountsProvider();
        if (provider) {
          try {
            await provider.requestLogin(LOGIN_REASON);
          } catch (e) {
            // The login can be rejected by the user; that's not a fatal
            // error — fall through and let `connect` decide.
            console.warn('[useTriangle] requestLogin rejected:', e);
          }
        }
      }
      const result = await signerManager.connect(PROVIDER_TYPE);
      if (!result.ok) {
        console.warn('[useTriangle] connect failed:', result.error);
      }
    } finally {
      setSigningIn(false);
    }
  }, [signingIn]);

  // In dev mode the SignerManager is wired to local Alice/Bob accounts — there
  // is no host container to detect, so force isInHost so the UI skips the
  // "Open in Polkadot Host" gate. Baked at build time, so SSR and client agree.
  const reportInHost = PROVIDER_TYPE === 'dev' ? true : false;

  if (!mounted) {
    return {
      address: undefined,
      h160: undefined,
      status: 'disconnected',
      ready: false,
      isInHost: reportInHost,
      signingIn: false,
      error: null,
      signIn,
    };
  }

  return {
    address: state.selectedAccount?.address,
    h160: state.selectedAccount?.h160Address as `0x${string}` | undefined,
    status: state.status,
    ready: state.status === 'connected' && state.selectedAccount !== null,
    isInHost: PROVIDER_TYPE === 'dev' ? true : isInsideContainerSync(),
    signingIn,
    error: state.error,
    signIn,
  };
}
