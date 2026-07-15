'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Binary } from 'polkadot-api';
import { encodeFunctionData, erc20Abi, type Abi } from 'viem';
import { requestResourceAllocation } from '@parity/product-sdk-host';
import { ss58ToH160 } from '@parity/product-sdk-address';

import { useTriangle } from '@/hooks/useTriangle';
import { getTypedApi } from '@/lib/triangle/chainClient';
import { PRODUCT_ACCOUNT_INDEX } from '@/lib/triangle/productIdentifier';
import { SESSION_REGISTRY_ADDRESS, sessionRegistryAbi } from '@/lib/contracts';
import {
  getOrCreateSessionKey,
  getStoredSessionKey,
  clearSessionKey,
  getSessionCreatedAt,
  setSessionCreatedAt,
  toSession,
  SESSION_EXPIRY_MS,
  type NexusSession,
} from '@/lib/session/sessionKeys';
import {
  PGAS_ASSET_ID,
  PGAS_ERC20,
  PGAS_FEE_LOCATION,
  getPgasBalance,
  getSessionFundingAmount,
  hexToBytes,
  bytesToHex,
} from '@/lib/session/pgas';

// Registry sessions with PGAS-paid (free) fees.
//
// Setup: ONE host prompt for an all-Revive batch_all — which is why it's
// fee-free (ChargePGAS covers Revive calls and all-Revive batches only):
//   1. Revive.call(PGAS_ERC20, transfer(session, SESSION_PGAS))
//   2. Revive.call(REGISTRY,   registerSession(session))
//
// Per write (useNexusContractWrite): zero prompts, zero fees. The session key
// signs a plain Revive.call; NexusGame resolves it to the owner through the
// registry.
//
// This replaces the old pallet_proxy flavor, which could never be fee-free:
// Proxy.proxy sits outside the ChargePGAS filter and add_proxy reserves a
// native deposit.

export type SessionStatus =
  | 'idle'
  | 'setup_pending'
  | 'ready'
  | 'failed'
  | 'expired';

export interface UseNexusSessionResult {
  status: SessionStatus;
  session: NexusSession | null;
  isSettingUp: boolean;
  isEnding: boolean;
  error: string | null;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
}

// Generous static weights for the setup batch. Fees are free under ChargePGAS,
// so over-weighting costs nothing here; under-weighting makes Revive calls
// revert intermittently.
const SETUP_WEIGHT = { ref_time: 500_000_000_000n, proof_size: 2_000_000n };
const SETUP_DEPOSIT_LIMIT = 10_000_000_000n;

/**
 * Read registry.sessionOf(owner) via a dry-run — no submission, no fee.
 * Exported: the health hook polls this to detect a broken registration.
 *
 * Takes the owner's SS58 and derives the H160 the contract sees as msg.sender.
 * `ss58ToH160` is the right derivation — verified against the chain's own
 * Revive.OriginalAccount entries by scripts/verify-pgas.mjs.
 *
 * Returns the session key's H160, or null when there is no active session
 * (the registry's zero-address sentinel reads back as 0x000…0).
 */
export async function readSessionOf(ownerSs58: string): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  const ownerH160 = ss58ToH160(ownerSs58);
  const data = encodeFunctionData({
    abi: sessionRegistryAbi as Abi,
    functionName: 'sessionOf',
    args: [ownerH160],
  });
  // ReviveApi.call signature (live-verified): dest is a hex STRING and
  // input_data a RAW Uint8Array. Passing Binary for either throws
  // "Incompatible runtime entry RuntimeCall(ReviveApi_call)".
  const res = await api.apis.ReviveApi.call(
    ownerSs58,
    SESSION_REGISTRY_ADDRESS,
    0n,
    undefined,
    undefined,
    hexToBytes(data),
    { at: 'best' },
  );
  const hex = bytesToHex(res?.result?.value?.data);
  if (!hex || hex.length < 42) return null;
  // ABI-encoded address: 32 bytes, right-aligned.
  const session = `0x${hex.slice(-40)}`;
  return /^0x0{40}$/.test(session) ? null : session;
}

/** Compare H160s case-insensitively. */
const sameH160 = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function useNexusSession(): UseNexusSessionResult {
  const { ready, address, getSigner } = useTriangle();

  const [session, setSession] = useState<NexusSession | null>(null);
  const [expired, setExpired] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // setState is async, so two near-simultaneous startSession() calls (an
  // effect + a click) could both clear isSettingUp.
  const inFlightRef = useRef(false);

  // Restore: a stored key is only trustworthy if the chain agrees it's
  // registered. A persisted key can outlive its registration and vice versa.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!address) {
        setSession(null);
        return;
      }
      const stored = await getStoredSessionKey();
      if (!stored || cancelled) {
        if (!cancelled) setSession(null);
        return;
      }

      const createdAt = await getSessionCreatedAt();
      if (!createdAt || Date.now() - createdAt > SESSION_EXPIRY_MS) {
        if (cancelled) return;
        setExpired(!!createdAt);
        setSession(null);
        return;
      }

      try {
        const onChain = await readSessionOf(address);
        if (cancelled) return;
        if (sameH160(onChain, stored.h160Address)) {
          setSession(toSession(stored, createdAt));
          setExpired(false);
        } else {
          console.warn(
            '[nexus.session] stored key is not registered on-chain — clearing',
          );
          await clearSessionKey();
          setSession(null);
        }
      } catch (e) {
        console.warn('[nexus.session] restore validation failed:', e);
        if (!cancelled) setSession(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const status: SessionStatus = session
    ? 'ready'
    : isSettingUp
      ? 'setup_pending'
      : expired
        ? 'expired'
        : error
          ? 'failed'
          : 'idle';

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
      // 1. PGAS onto the product account. A non-zero balance means the
      //    allowance was already granted — skip the prompt.
      const balance = await getPgasBalance(address);
      if (balance === 0n) {
        const outcomes = await requestResourceAllocation([
          { tag: 'SmartContractAllowance', value: PRODUCT_ACCOUNT_INDEX },
        ]);
        console.info('[nexus.session] PGAS allocation:', outcomes);
        if (outcomes[0]?.tag !== 'Allocated') {
          throw new Error(
            `PGAS allocation ${outcomes[0]?.tag ?? 'failed'} — is this account personhood-verified?`,
          );
        }
        if ((await getPgasBalance(address)) === 0n) {
          throw new Error('PGAS allocation reported success but no balance landed.');
        }
      }

      // 2. Session key (silent).
      const key = await getOrCreateSessionKey();
      console.info(
        '[nexus.session] session key\n  main:   ',
        address,
        '\n  session:',
        key.ss58Address,
      );

      // 3. The one prompt.
      //
      // Fund the session's SS58 with Assets.transfer — NOT its h160 via the
      // PGAS ERC-20 precompile. The h160 is keccak256(pubkey)[12..], which
      // pallet-revive cannot invert, so a precompile transfer credits the
      // `h160 ++ 0xEE*12` fallback (an account with no private key); the key
      // then signs from its SS58, ChargePGAS reads 0 and the pool rejects with
      // Invalid::Payment. PGAS is a *sufficient* asset, so receipt at the SS58
      // creates that account -> OnNewAccount -> AutoMapper maps the real key.
      // One call funds it AND mints the mapping.
      //
      // Cost: a batch containing Assets.transfer fails the ChargePGAS filter,
      // so this one tx pays via the DOT<->PGAS pool (`asset:` below) — ~0.45%
      // of a claim. Still one prompt, still zero native. Gameplay stays free:
      // each action is a lone Revive.call.
      //
      // Verified live 2026-07-15; see the spec's "RESOLVED RISK" section.
      const funding = await getSessionFundingAmount();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (await getTypedApi()) as any;

      const registerData = encodeFunctionData({
        abi: sessionRegistryAbi as Abi,
        functionName: 'registerSession',
        args: [key.h160Address], // the registry keys on h160 — that IS msg.sender
      });

      // dest is SizedHex<20> (a hex string) in the current metadata, not bytes
      // — see the note in useNexusContractWrite. data IS Uint8Array, which
      // Binary.fromHex satisfies for the extrinsic.
      const reviveCall = (dest: string, data: string) =>
        api.tx.Revive.call({
          dest,
          value: 0n,
          weight_limit: SETUP_WEIGHT,
          storage_deposit_limit: SETUP_DEPOSIT_LIMIT,
          data: Binary.fromHex(data),
        });

      const batch = api.tx.Utility.batch_all({
        calls: [
          api.tx.Assets.transfer({
            id: PGAS_ASSET_ID,
            target: { type: 'Id', value: key.ss58Address },
            amount: funding,
          }).decodedCall,
          reviveCall(SESSION_REGISTRY_ADDRESS, registerData).decodedCall,
        ],
      });

      type SubmitResult = {
        block?: { number?: number };
        events?: Array<{ type: string; value?: { type?: string } }>;
      };
      // `asset` routes the fee through the DOT<->PGAS pool. Without it this
      // falls back to native, and a PGAS-only product account cannot pay.
      const result = (await batch.signAndSubmit(hostSigner, {
        asset: PGAS_FEE_LOCATION,
      })) as SubmitResult;

      const failedEvent = (result.events ?? []).find(
        (e) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed',
      );
      if (failedEvent) throw new Error('Setup batch reverted on-chain.');

      // Confirm the chain agrees before declaring the session usable.
      const onChain = await readSessionOf(address);
      if (!sameH160(onChain, key.h160Address)) {
        throw new Error('Setup batch landed but the session is not registered.');
      }

      // The PGAS must be at the session's SS58 — that's the account ChargePGAS
      // charges. If a future change reintroduces the precompile hop, the funds
      // land on the 0xEE fallback and this check fails loudly here instead of
      // as an opaque Invalid::Payment on the player's first move.
      const sessionPgas = await getPgasBalance(key.ss58Address);
      if (sessionPgas === 0n) {
        throw new Error(
          'Session registered but its PGAS balance is 0 — funding did not reach the session key. ' +
            'Fund the SS58 with Assets.transfer, never the h160 via the ERC-20 precompile.',
        );
      }

      const createdAt = Date.now();
      await setSessionCreatedAt(createdAt);
      setSession(toSession(key, createdAt));
      setExpired(false);
      console.info(
        `[nexus.session] ready — block #${result.block?.number ?? '?'}`,
      );
    } catch (e) {
      console.error('[nexus.session] startSession failed:', e);
      setError(e instanceof Error ? e.message : 'Session setup failed.');
      await clearSessionKey();
      setSession(null);
    } finally {
      setIsSettingUp(false);
      inFlightRef.current = false;
    }
  }, [ready, address, getSigner]);

  const endSession = useCallback(async () => {
    if (!address) return;
    setIsEnding(true);
    try {
      const hostSigner = getSigner();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = (await getTypedApi()) as any;

      const reviveCall = (dest: string, data: string) =>
        api.tx.Revive.call({
          dest,
          value: 0n,
          weight_limit: SETUP_WEIGHT,
          storage_deposit_limit: SETUP_DEPOSIT_LIMIT,
          data: Binary.fromHex(data),
        });

      // Drain the session's PGAS back (silent, fee-free, session-signed).
      // The account is sufficient-asset-only, so there's no ED to strand.
      //
      // The precompile is CORRECT here, unlike in setup: the product account is
      // already mapped (claim_pgas created it), so pallet-revive resolves its
      // h160 to the real account. And being a lone Revive.call, ChargePGAS
      // covers the fee from the session's own PGAS — so this stays free.
      if (session) {
        try {
          const remaining = await getPgasBalance(session.ss58Address);
          if (remaining > 0n) {
            const drain = encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [ss58ToH160(address), remaining],
            });
            await reviveCall(PGAS_ERC20, drain).signAndSubmit(session.signer);
          }
        } catch (e) {
          console.warn('[nexus.session] PGAS drain failed; revoking anyway:', e);
        }
      }

      // Sever the on-chain link (one prompt). This is the ONLY real control —
      // it instantly de-authorizes a leaked key.
      if (hostSigner) {
        try {
          const revoke = encodeFunctionData({
            abi: sessionRegistryAbi as Abi,
            functionName: 'revokeSession',
            args: [],
          });
          await reviveCall(SESSION_REGISTRY_ADDRESS, revoke).signAndSubmit(
            hostSigner,
          );
        } catch (e) {
          console.warn(
            '[nexus.session] revokeSession failed; clearing local state anyway:',
            e,
          );
        }
      }
    } finally {
      await clearSessionKey();
      setSession(null);
      setExpired(false);
      setIsEnding(false);
    }
  }, [address, getSigner, session]);

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
