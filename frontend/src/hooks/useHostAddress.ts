'use client';

import { useMemo } from 'react';
import { useSpektrAccounts } from '@/hooks/useSpektrAccounts';
import { accountIdToH160 } from '@/lib/host/addressMapping';
import { isInHost } from '@/lib/host/hostEnv';

/**
 * wagmi `useAccount`-shaped shim that returns the **revive-mapped H160** of
 * the user's Polkadot Host account (dot.li / Spektr injection). Drop-in
 * replacement for `useAccount()` from wagmi when migrating individual call
 * sites. Returns `address: undefined` while injection is in flight or when
 * not running inside a host shell.
 */
export function useHostAddress(): {
  address: `0x${string}` | undefined;
  ss58Address: string | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isInHost: boolean;
} {
  const { status, accounts } = useSpektrAccounts();
  const inHost = isInHost();

  const ss58 = accounts[0]?.address;
  const address = useMemo<`0x${string}` | undefined>(() => {
    if (!ss58) return undefined;
    return accountIdToH160(ss58);
  }, [ss58]);

  const isConnecting = status === 'detecting' || status === 'injecting';
  const isConnected = status === 'connected' && !!address;

  return {
    address,
    ss58Address: ss58,
    isConnected,
    isConnecting,
    isReconnecting: false,
    isInHost: inHost,
  };
}
