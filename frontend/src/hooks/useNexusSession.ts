'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTriangle } from '@/hooks/useTriangle';
import { getTypedApi } from '@/lib/triangle/chainClient';
import {
  getSessionWalletManager,
  type SessionWalletData,
  SESSION_FUNDING_AMOUNT,
} from '@/lib/session/sessionWallet';

// pallet_proxy-based session wallet — ported from Sovereignty.
//
// Setup: ONE host prompt batching
//   1. Balances.transfer_keep_alive(session, 3 PAS)
//   2. Proxy.add_proxy({ delegate: session, proxy_type: Any, delay: 0 })
//
// Per write (in useNexusContractWrite): zero prompts. Session key locally signs
//   Proxy.proxy({ real: main, call: Revive.call(...) })
// which the runtime dispatches with origin = main, so contracts see
// msg.sender = main and need no session-aware logic.

export type SessionStatus =
  | 'idle'
  | 'setup_pending'
  | 'ready'
  | 'failed'
  | 'expired';

export interface UseNexusSessionResult {
  status: SessionStatus;
  session: SessionWalletData | null;
  isSettingUp: boolean;
  isEnding: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
}

export function useNexusSession(): UseNexusSessionResult {
  const { ready, address, getSigner } = useTriangle();
  const manager = getSessionWalletManager();

  const [session, setSession] = useState<SessionWalletData | null>(null);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-entrancy guard. setState updates are async, so two near-simultaneous
  // startSession() calls (e.g. an effect + a click) could both clear isSettingUp.
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!address) {
      setSession(null);
      return;
    }
    setSession(manager.restore(address));
  }, [address, manager]);

  const timeLeft = session ? manager.timeRemaining(session) : 0;

  const status: SessionStatus = !session
    ? isSettingUp
      ? 'setup_pending'
      : 'idle'
    : !session.isReady
      ? 'setup_pending'
      : timeLeft <= 0
        ? 'expired'
        : 'ready';

  const startSession = useCallback(async () => {
    if (!ready || !address) {
      setError('Sign in before starting a session.');
      return;
    }
    if (inFlightRef.current) return;

    const hostSigner = getSigner();
    if (!hostSigner) {
      setError('Host signer unavailable.');
      return;
    }

    inFlightRef.current = true;
    setIsSettingUp(true);
    setError(null);

    try {
      const wallet = manager.generate(address);
      setSession(wallet);
      console.info(
        '[nexus.session] generated keypair\n  main:   ',
        address,
        '\n  session:',
        wallet.address,
      );

      // PAPI v2 typed API. The descriptors don't export an explicit interface
      // for each variant constructor, so the call arguments are objects matching
      // the on-chain shape: { type: 'Id', value: ss58 } for MultiAddress::Id,
      // { type: 'Any', value: undefined } for ProxyType::Any.
      const typedApi = await getTypedApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = typedApi as any;

      const fundCall = api.tx.Balances.transfer_keep_alive({
        dest: { type: 'Id', value: wallet.address },
        value: SESSION_FUNDING_AMOUNT,
      });
      const addProxyCall = api.tx.Proxy.add_proxy({
        delegate: { type: 'Id', value: wallet.address },
        proxy_type: { type: 'Any', value: undefined },
        delay: 0,
      });
      const batch = api.tx.Utility.batch_all({
        calls: [fundCall.decodedCall, addProxyCall.decodedCall],
      });

      // Retry once on BadProof — happens when the host's nonce/metadata cache
      // is briefly stale right after a page load.
      type SubmitResult = {
        block?: { number?: number };
        events?: Array<{ type: string; value?: { type?: string } }>;
      };
      let result: SubmitResult | null = null;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = (await batch.signAndSubmit(hostSigner)) as SubmitResult;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : JSON.stringify(e);
          if (!msg.includes('BadProof') || attempt === 2) throw e;
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
      if (!result) throw lastErr ?? new Error('Setup failed');

      const events = result.events ?? [];
      const failed = events.find(
        (e) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed',
      );
      if (failed) {
        throw new Error('Setup batch reverted on-chain.');
      }

      manager.markReady(address);
      setSession(manager.restore(address));
      console.info(
        `[nexus.session] ready — block #${result.block?.number ?? '?'}`,
      );
    } catch (e) {
      console.error('[nexus.session] startSession failed:', e);
      setError(e instanceof Error ? e.message : 'Session setup failed.');
      if (address) manager.clear(address);
      setSession(null);
    } finally {
      setIsSettingUp(false);
      inFlightRef.current = false;
    }
  }, [ready, address, getSigner, manager]);

  const endSession = useCallback(async () => {
    if (!address) return;
    setIsEnding(true);
    try {
      const hostSigner = getSigner();
      if (hostSigner && session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const api = (await getTypedApi()) as any;
        try {
          await api.tx.Proxy.remove_proxy({
            delegate: { type: 'Id', value: session.address },
            proxy_type: { type: 'Any', value: undefined },
            delay: 0,
          }).signAndSubmit(hostSigner);
        } catch (e) {
          console.warn(
            '[nexus.session] remove_proxy failed; clearing local state anyway:',
            e,
          );
        }
      }
    } finally {
      manager.clear(address);
      setSession(null);
      setIsEnding(false);
    }
  }, [address, getSigner, session, manager]);

  return {
    status,
    session,
    isSettingUp,
    isEnding,
    error,
    startSession,
    endSession,
  };
}
