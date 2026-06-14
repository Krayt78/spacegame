'use client';

import { useEffect, useState } from 'react';

import { getTypedApi } from '@/lib/triangle/chainClient';

const POLL_INTERVAL_MS = 10_000;

/**
 * Polls the connected player's native free balance (in planck) from
 * `System.Account(ss58)` every 10s. This is the balance available to pay gas
 * for host-signed writes — distinct from the session wallet's balance, which
 * `useNexusSessionHealth` tracks separately.
 *
 * Returns `null` while loading, when no address is connected, or on query
 * failure (so callers can render a neutral placeholder).
 */
export function usePlayerBalance(ss58Address: string | undefined): bigint | null {
  const [balance, setBalance] = useState<bigint | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (!ss58Address) {
        if (!cancelled) setBalance(null);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (await getTypedApi()) as any;
        const info = await api.query.System.Account.getValue(ss58Address);
        const free = (info as { data: { free: bigint } }).data.free;
        if (!cancelled) setBalance(free);
      } catch (err) {
        console.warn('[nexus.playerBalance] balance query failed:', err);
        if (!cancelled) setBalance(null);
      }
    };

    poll();
    if (!ss58Address) return;

    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [ss58Address]);

  return balance;
}
