'use client';

import { useTriangle } from '@/hooks/useTriangle';

/**
 * Wagmi `useAccount`-shaped shim over `useTriangle()`. Returns the
 * **revive-mapped H160** of the user's Polkadot Host account as `address`.
 *
 * This file used to do its own work (Spektr injection + manual H160
 * derivation). Phase 2 moved that into the SignerManager pipeline; this
 * shim only exists so the eight or so call sites that import `useHostAddress`
 * don't need to change. New code should consume `useTriangle()` directly.
 */
export function useHostAddress(): {
  address: `0x${string}` | undefined;
  ss58Address: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isInHost: boolean;
  isReady: boolean;
} {
  const t = useTriangle();

  return {
    address: t.h160,
    ss58Address: t.address,
    isConnected: t.ready,
    isConnecting: t.status === 'connecting' || t.signingIn,
    // `reconnecting` isn't part of `@parity/product-sdk-signer`'s ConnectionStatus
    // (only 'disconnected' | 'connecting' | 'connected'). Kept on the return
    // shape for consumer compat and always reports false.
    isReconnecting: false,
    isInHost: t.isInHost,
    isReady: t.ready,
  };
}
