'use client';

import { useEffect, useState } from 'react';

import { useTriangle } from '@/hooks/useTriangle';
import { readSessionOf } from '@/hooks/useNexusSession';
import { getPgasBalance, getSessionFundingAmount } from '@/lib/session/pgas';
import type { NexusSession } from '@/lib/session/sessionKeys';

const POLL_INTERVAL_MS = 10_000;
const TICK_INTERVAL_MS = 1_000;

/**
 * Rough PGAS drawn per action. Fees are FREE under ChargePGAS, so this is
 * storage deposit only — which makes it both small and lumpy (an action that
 * writes no new storage costs nothing).
 *
 * Treat "actions left" as a soft indicator, not a budget. CALIBRATE from a real
 * end-to-end run: watch the session's PGAS balance across a few upgrades and
 * set this to the observed average.
 */
const APPROX_DEPOSIT_PER_ACTION = 10_000_000n;

export type SessionHealthStatus =
  | 'none'
  | 'restoring'
  | 'ok'
  | 'low-time'
  | 'low-balance'
  | 'registration-broken'
  | 'expired';

export interface SessionHealth {
  status: SessionHealthStatus;
  timeLeftMs: number;
  /** Session's PGAS balance (not native). Funds storage deposits only. */
  balance: bigint | null;
  /** Does the registry still resolve our key to this player? */
  registrationOk: boolean | null;
  actionsLeft: number | null;
}

/**
 * Periodic health monitor for a registry session.
 *
 * Polls every 10s:
 *   - Assets.Account(PGAS, session)  → session's PGAS balance
 *   - registry.sessionOf(main)       → confirms our key is still registered
 *                                      (replaces the old Proxy.Proxies check)
 *
 * Ticks every 1s for a live countdown of the session's local expiry. That
 * expiry is UX only — the chain doesn't enforce it, so a leaked key stays live
 * until revoked on-chain.
 */
export function useNexusSessionHealth(
  session: NexusSession | null,
): SessionHealth {
  const { ready, address } = useTriangle();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [funding, setFunding] = useState<bigint | null>(null);
  const [registrationOk, setRegistrationOk] = useState<boolean | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [session]);

  useEffect(() => {
    if (!session || !address) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const bal = await getPgasBalance(session.ss58Address);
        if (!cancelled) setBalance(bal);
      } catch (err) {
        console.warn('[nexus.sessionHealth] PGAS balance query failed:', err);
        if (!cancelled) setBalance(null);
      }

      try {
        const onChain = await readSessionOf(address);
        // Compare H160 bytes, case-insensitively.
        const ok = onChain?.toLowerCase() === session.h160Address.toLowerCase();
        if (!cancelled) setRegistrationOk(ok);
      } catch (err) {
        console.warn('[nexus.sessionHealth] registry query failed:', err);
        if (!cancelled) setRegistrationOk(null);
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session, address]);

  // Funding target is a chain constant — fetch once per session.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getSessionFundingAmount()
      .then((f) => {
        if (!cancelled) setFunding(f);
      })
      .catch(() => {
        if (!cancelled) setFunding(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!session) {
    return {
      status: ready ? 'none' : 'restoring',
      timeLeftMs: 0,
      balance: null,
      registrationOk: null,
      actionsLeft: null,
    };
  }

  const timeLeftMs = Math.max(0, session.expiresAt - now);
  const actionsLeft =
    balance !== null
      ? Math.max(0, Number(balance / APPROX_DEPOSIT_PER_ACTION))
      : null;

  let status: SessionHealthStatus = 'ok';
  if (timeLeftMs <= 0) status = 'expired';
  else if (registrationOk === false) status = 'registration-broken';
  else if (balance !== null && funding !== null && balance < funding / 5n)
    status = 'low-balance';
  else if (timeLeftMs < 15 * 60 * 1000) status = 'low-time';

  return { status, timeLeftMs, balance, registrationOk, actionsLeft };
}
