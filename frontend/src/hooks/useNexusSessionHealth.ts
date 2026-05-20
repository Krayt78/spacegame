'use client';

import { useEffect, useState } from 'react';
import { AccountId } from 'polkadot-api';

import { useTriangle } from '@/hooks/useTriangle';
import { getTypedApi } from '@/lib/triangle/chainClient';
import {
  SESSION_MIN_BALANCE,
  type SessionWalletData,
} from '@/lib/session/sessionWallet';

const POLL_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1_000;
const APPROX_COST_PER_ACTION = 60_000_000n;

// SS58 prefix differs by chain. Our keypair defaults to prefix 42; the chain
// may return delegates with a different prefix. Compare by underlying 32-byte
// public key to avoid false negatives.
const accountIdCodec = AccountId();
function ss58PublicKeyHex(addr: string): string | null {
  try {
    return Array.from(accountIdCodec.enc(addr))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export type SessionHealthStatus =
  | 'none'
  | 'restoring'
  | 'ok'
  | 'low-time'
  | 'low-balance'
  | 'delegation-broken'
  | 'expired';

export interface SessionHealth {
  status: SessionHealthStatus;
  timeLeftMs: number;
  balance: bigint | null;
  delegationOk: boolean | null;
  actionsLeft: number | null;
  /** Total proxies on main. >1 means orphan deposits from previous sessions. */
  proxyCount: number | null;
}

/**
 * Periodic health monitor for a session wallet.
 *
 * Polls every 10s:
 *   - `System.Account(session)`         → free balance
 *   - `Proxy.Proxies(main)`             → delegate list (confirms session
 *                                          still listed with ProxyType::Any)
 *
 * Ticks every 1s for a live countdown of the session's local expiry.
 */
export function useNexusSessionHealth(
  session: SessionWalletData | null,
): SessionHealth {
  const { ready, address } = useTriangle();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [delegationOk, setDelegationOk] = useState<boolean | null>(null);
  const [proxyCount, setProxyCount] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session || !address) return;

    let cancelled = false;
    const sessionSS58 = session.address;

    const poll = async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (await getTypedApi()) as any;

        try {
          const info = await api.query.System.Account.getValue(sessionSS58);
          const free = (info as { data: { free: bigint } }).data.free;
          if (!cancelled) setBalance(free);
        } catch (err) {
          console.warn('[nexus.sessionHealth] balance query failed:', err);
          if (!cancelled) setBalance(null);
        }

        try {
          const proxiesRes = await api.query.Proxy.Proxies.getValue(address);
          const list = Array.isArray(proxiesRes)
            ? (proxiesRes[0] as Array<{
                delegate: string;
                proxy_type: { type: string };
                delay: number;
              }>)
            : [];
          const wantKey = ss58PublicKeyHex(sessionSS58);
          const ok = list.some(
            (p) =>
              ss58PublicKeyHex(p.delegate) === wantKey &&
              p.proxy_type?.type === 'Any',
          );
          if (!cancelled) {
            setDelegationOk(ok);
            setProxyCount(list.length);
          }
        } catch (err) {
          console.warn('[nexus.sessionHealth] proxy query failed:', err);
          if (!cancelled) {
            setDelegationOk(null);
            setProxyCount(null);
          }
        }
      } catch (err) {
        console.warn('[nexus.sessionHealth] typedApi unavailable:', err);
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, address]);

  if (!session) {
    return {
      status: ready ? 'none' : 'restoring',
      timeLeftMs: 0,
      balance: null,
      delegationOk: null,
      actionsLeft: null,
      proxyCount: null,
    };
  }

  const timeLeftMs = Math.max(0, session.expiresAt - now);
  const actionsLeft =
    balance !== null
      ? Math.max(0, Number(balance / APPROX_COST_PER_ACTION))
      : null;

  let status: SessionHealthStatus = 'ok';
  if (timeLeftMs <= 0) status = 'expired';
  else if (delegationOk === false) status = 'delegation-broken';
  else if (balance !== null && balance < SESSION_MIN_BALANCE)
    status = 'low-balance';
  else if (timeLeftMs < 15 * 60 * 1000) status = 'low-time';

  return { status, timeLeftMs, balance, delegationOk, actionsLeft, proxyCount };
}
