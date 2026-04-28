'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSpektrAccounts } from '@/hooks/useSpektrAccounts';
import { accountIdToH160 } from '@/lib/host/addressMapping';
import { isInHost } from '@/lib/host/hostEnv';

/**
 * wagmi `useAccount`-shaped shim that returns the **revive-mapped H160** of
 * the user's Polkadot Host account (dot.li / Spektr injection). Drop-in
 * replacement for `useAccount()` from wagmi when migrating individual call
 * sites. Returns `address: undefined` while injection is in flight or when
 * not running inside a host shell.
 *
 * SSR/static-export safety: the first client render must match the
 * statically-rendered HTML, where `isInHost()` returned false (no window).
 * We hold a `mounted` flag that's false during SSR and the first hydration
 * pass, then true after the first useEffect — so the two passes render the
 * same tree and React doesn't blow up with hydration error #418.
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
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { status, accounts } = useSpektrAccounts();

  const ss58 = accounts[0]?.address;
  const address = useMemo<`0x${string}` | undefined>(() => {
    if (!ss58) return undefined;
    return accountIdToH160(ss58);
  }, [ss58]);

  if (!mounted) {
    return {
      address: undefined,
      ss58Address: undefined,
      isConnected: false,
      isConnecting: true,
      isReconnecting: false,
      isInHost: false,
      isReady: false,
    };
  }

  const isConnecting = status === 'detecting' || status === 'injecting';
  const isConnected = status === 'connected' && !!address;

  return {
    address,
    ss58Address: ss58,
    isConnected,
    isConnecting,
    isReconnecting: false,
    isInHost: isInHost(),
    isReady: true,
  };
}
