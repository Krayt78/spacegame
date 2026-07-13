'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { Binary, type PolkadotSigner } from 'polkadot-api';
import { encodeFunctionData, type Abi } from 'viem';

import { APP_MODE } from '@/lib/mode';
import { useTriangle } from '@/hooks/useTriangle';
import { ensureMapped, getContractManager } from '@/lib/triangle/contractManager';
import { getTypedApi } from '@/lib/triangle/chainClient';
import { getSessionWalletManager } from '@/lib/session/sessionWallet';
import {
  NEXUS_GAME_ADDRESS,
  GAME_CONFIG_ADDRESS,
  nexusGameAbi,
  gameConfigAbi,
} from '@/lib/contracts';

// Conservative defaults for the inner Revive.call when we skip dry-run in
// session mode. Sized for `@nexus/game` writes (claim, upgrade, build,
// dispatch). Matches Sovereignty's session-mode defaults. If NotEnoughGas
// surfaces in practice, bump these — the proxied dispatch only spends what it
// needs, but the weight limit must be at least that much.
const SESSION_REVIVE_REF_TIME = 500_000_000_000n;
const SESSION_REVIVE_PROOF_SIZE = 2_000_000n;
const SESSION_REVIVE_STORAGE_DEPOSIT = 10_000_000_000n;

const sessionManager = getSessionWalletManager();

/**
 * Process-wide memoization of accounts we've already run `Revive.map_account`
 * for. `ensureContractAccountMapped` is idempotent so this is just a fast
 * path — without it every write would do an extra storage read.
 */
const mappedAddresses = new Set<string>();

export type ContractLibrary = '@nexus/game' | '@nexus/config';

type TxOk = { ok: true; txHash?: string; block?: { number: number } };
type TxErr = { ok: false; dispatchError?: unknown };
type TxResult = TxOk | TxErr;

type TxWatchEvent = {
  type: string;
  txHash?: string;
  found?: boolean;
  ok?: boolean;
  block?: { number?: number; hash?: string };
  dispatchError?: unknown;
};
type PreparedTx = {
  signSubmitAndWatch: (
    signer: PolkadotSigner,
    options?: {
      nonce?: number;
      mortality?: { mortal: true; period: number };
    },
  ) => {
    subscribe: (observer: {
      next: (ev: TxWatchEvent) => void;
      error: (e: unknown) => void;
    }) => { unsubscribe: () => void };
  };
};
type ContractMethod = {
  tx: (...args: unknown[]) => Promise<TxResult>;
  // Same dry-run + gas estimation as tx(), but returns the PAPI tx unsubmitted.
  prepare: (...args: unknown[]) => Promise<PreparedTx>;
};

/**
 * Submit a prepared Revive.call with the account nonce read at the BEST block.
 *
 * Why not the SDK's own tx()/submitAndWatch: polkadot-api anchors tx creation
 * — including the AccountNonceApi lookup — at the FINALIZED block when given
 * no hint, and product-sdk-tx forwards only `mortality` (verified through
 * 0.2.17, no nonce/at passthrough). On chains where finality lags the head by
 * ~30s, two writes inside one finality window therefore reuse a nonce and the
 * pool rejects the second as `Invalid::Stale`.
 */
async function submitWithBestNonce(
  prepared: PreparedTx,
  signer: PolkadotSigner,
  ss58: string,
): Promise<TxResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const api = (await getTypedApi()) as any;
  const nonce: number = await api.apis.AccountNonceApi.account_nonce(ss58, {
    at: 'best',
  });

  return new Promise<TxResult>((resolve, reject) => {
    let settled = false;
    const settle = (done: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Defer: subscribe() may emit synchronously, before `sub` is assigned.
      queueMicrotask(() => sub.unsubscribe());
      done();
    };
    const timer = setTimeout(
      () => settle(() => reject(new Error('Tx not in a best block after 300s'))),
      300_000,
    );

    const sub = prepared
      .signSubmitAndWatch(signer, {
        nonce,
        mortality: { mortal: true, period: 64 },
      })
      .subscribe({
        next: (ev) => {
          if (ev.type !== 'txBestBlocksState' || !ev.found) return;
          if (ev.ok === false) {
            settle(() => resolve({ ok: false, dispatchError: ev.dispatchError }));
          } else if (ev.ok === true) {
            settle(() => resolve({ ok: true, txHash: ev.txHash }));
          }
        },
        error: (e) =>
          settle(() =>
            reject(
              e instanceof Error
                ? e
                : new Error(`Tx subscription error: ${JSON.stringify(e)}`),
            ),
          ),
      });
  });
}

/**
 * Legacy options shape: existing per-action hooks in `useNexusGame.ts` pass
 * `{ contractAddress, abi, invalidate }` to match the old `useReviveContractWrite`
 * API. We ignore contractAddress + abi (the typed CDM manifest is the source
 * of truth) and only honor `invalidate`. Phase 3 follow-up rewrites each call
 * site to the cleaner `useNexusContractWrite([...invalidate])` form and drops
 * this overload.
 */
type LegacyOptions = {
  contractAddress?: unknown;
  abi?: unknown;
  invalidate?: readonly string[];
};

const idleState = {
  hash: undefined as `0x${string}` | undefined,
  isPending: false,
  isConfirming: false,
  isSuccess: false,
  error: undefined as Error | undefined,
};

/**
 * HOST-mode write path. Shared React-state wrapper around
 * `ContractManager.<library>.<method>.tx()`.
 *
 * Every write hook in `useNexusGame.ts` is a thin wrapper around the
 * mode-routed `useNexusContractWrite` (bottom of file); in host mode it
 * resolves to this. Responsibilities:
 *   - Pull the active PolkadotSigner from the global SignerManager.
 *   - Run `ensureMapped` once per process per address (idempotent on chain).
 *   - Submit via the typed contract handle from `ContractManager` — which
 *     internally runs the `ReviveApi.call` dry-run + `signSubmitAndWatch`.
 *   - Surface a wagmi-shaped `{ hash, isPending, isConfirming, isSuccess,
 *     error, reset }` so existing UI buttons don't need to move.
 *   - Invalidate the named read-query keys after best-block inclusion.
 *
 * Call signatures supported:
 *   - `call('@nexus/game', 'upgradeBuilding', [planetId, type])`  (preferred)
 *   - `call('upgradeBuilding', [planetId, type])`  (legacy; defaults to @nexus/game)
 */
function useNexusContractWriteHost(
  optsOrInvalidate: readonly string[] | LegacyOptions = [],
  _legacyLogTag?: string,
) {
  const invalidate: readonly string[] = Array.isArray(optsOrInvalidate)
    ? optsOrInvalidate
    : ((optsOrInvalidate as LegacyOptions).invalidate ?? []);

  const queryClient = useQueryClient();
  const { ready, address, getSigner } = useTriangle();
  const [s, setS] = useState(idleState);

  const reset = useCallback(() => setS(idleState), []);

  const callImpl = useCallback(
    async (library: ContractLibrary, method: string, args: readonly unknown[]) => {
      if (!ready || !address) {
        setS({ ...idleState, error: new Error('Not signed in') });
        return;
      }
      // In host mode this is the product-account signer (signs across chains
      // including our dotters Paseo Asset Hub). In dev mode it's the
      // DevProvider's Alice signer. See useTriangle.ts for the switch.
      const signer = getSigner();
      if (!signer) {
        setS({ ...idleState, error: new Error('No signer available') });
        return;
      }

      setS({ ...idleState, isPending: true });

      try {
        // Was this call site's first write per process? If so, we just
        // submitted Revive.map_account and need to retry the dry-run below
        // because best-block inclusion of map_account doesn't always
        // propagate to the runtime API view (`ReviveApi.call`) immediately.
        let justMapped = false;
        if (!mappedAddresses.has(address)) {
          await ensureMapped(address, signer);
          mappedAddresses.add(address);
          justMapped = true;
        }

        // Session path: when a session wallet is active for this main account,
        // wrap the contract call in `Proxy.proxy({ real: main, call:
        // Revive.call(...) })` and sign locally with the session keypair.
        // pallet_proxy flips origin to `real` at the runtime level, so the
        // contract sees `msg.sender = main` exactly as in the host path.
        // ContractManager.tx() doesn't let us inject the Proxy wrapper around
        // its internal Revive.call, so for session mode we bypass it and
        // build the extrinsic directly via PAPI's typed API.
        //
        // Limited to '@nexus/game' — '@nexus/config' writes are admin-only
        // and don't benefit from prompt-free UX.
        const sessionData = sessionManager.restore(address);
        const useSessionPath =
          library === '@nexus/game' &&
          sessionData?.isReady === true &&
          sessionManager.timeRemaining(sessionData) > 0;

        if (useSessionPath && sessionData) {
          setS({ ...idleState, isPending: false, isConfirming: true });
          const sessionSigner = sessionManager.getSigner(sessionData);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const api = (await getTypedApi()) as any;

          const calldata = encodeFunctionData({
            abi: nexusGameAbi as Abi,
            functionName: method,
            args: args as never,
          });

          // dest is `SizedHex<20>` (a hex string) in the current metadata, not
          // bytes — passing Binary.fromHex(...) makes isCompat reject the
          // outer Proxy.proxy because its `call: TxCallData` validates the
          // inner extrinsic's args recursively. data is still `Uint8Array`,
          // which Binary.fromHex satisfies.
          const inner = api.tx.Revive.call({
            dest: NEXUS_GAME_ADDRESS,
            value: 0n,
            weight_limit: {
              ref_time: SESSION_REVIVE_REF_TIME,
              proof_size: SESSION_REVIVE_PROOF_SIZE,
            },
            storage_deposit_limit: SESSION_REVIVE_STORAGE_DEPOSIT,
            data: Binary.fromHex(calldata),
          });

          const proxied = api.tx.Proxy.proxy({
            real: { type: 'Id', value: address },
            force_proxy_type: undefined,
            call: inner.decodedCall,
          });

          type SessionSubmitResult = {
            block?: { number?: number; hash?: string };
            events?: Array<{ type: string; value?: { type?: string } }>;
          };
          const result = (await proxied.signAndSubmit(
            sessionSigner,
          )) as SessionSubmitResult;

          const events = result.events ?? [];
          const failed = events.find(
            (e) => e.type === 'System' && e.value?.type === 'ExtrinsicFailed',
          );
          if (failed) {
            throw new Error(
              `Tx failed (outer): ${JSON.stringify(failed.value)}`,
            );
          }
          // Proxy.ProxyExecuted carries the inner dispatch result. In the
          // current runtime its event shape is `{ result: { success: bool,
          // value?: DispatchError } }`. If the inner Revive.call reverted,
          // the outer extrinsic still succeeds (the proxy invocation itself
          // didn't fail) — only this field tells us about the inner result.
          const proxyExecuted = events.find(
            (e) => e.type === 'Proxy' && e.value?.type === 'ProxyExecuted',
          ) as
            | {
                value?: {
                  value?: {
                    result?: { success?: boolean; value?: unknown };
                  };
                };
              }
            | undefined;
          const innerResult = proxyExecuted?.value?.value?.result;
          if (innerResult && innerResult.success === false) {
            throw new Error(
              `Tx failed (inner): ${JSON.stringify(innerResult.value)}`,
            );
          }

          setS({
            hash: result.block?.hash as `0x${string}` | undefined,
            isPending: false,
            isConfirming: false,
            isSuccess: true,
            error: undefined,
          });
          for (const functionName of invalidate) {
            queryClient.invalidateQueries({
              queryKey: ['readContract', { functionName }],
            });
          }
          return;
        }

        const manager = await getContractManager();
        // Codegen-derived types make `getContract(library)` return a per-library
        // typed handle, but here we dispatch dynamically by method name — cast
        // through unknown so the helper compiles. Per-action hooks in
        // `useNexusGame.ts` keep their args typed at the call site.
        const contract = manager.getContract(library as never) as unknown as Record<
          string,
          ContractMethod
        >;
        const fn = contract[method];
        if (!fn) {
          throw new Error(`Method "${method}" not found on contract "${library}"`);
        }

        // Between signing-prompt and best-block, we're "confirming"; before
        // (during user signing) we're "pending".
        setS({ ...idleState, isPending: false, isConfirming: true });

        // Retry two classes of transient dry-run failures (backoff 2s, 4s, 6s):
        //  - AccountUnmapped right after map_account — the runtime API view can
        //    lag behind best-block inclusion for a few seconds.
        //  - "… not complete yet" from the timer-gated complete* methods
        //    (buildings/ships/defense/research). The UI countdown ticks on wall
        //    clock, but the dry-run evaluates block.timestamp at the current
        //    best block, which trails by up to a block — clicking the moment
        //    the button appears races that gap.
        const result = await (async () => {
          const MAX_REMAP_RETRIES = justMapped ? 3 : 0;
          const MAX_TIMING_RETRIES = 3;
          for (let attempt = 0; ; attempt++) {
            try {
              // prepare() runs the same dry-run/gas estimation as tx(), but
              // hands back the unsubmitted PAPI tx so we can inject a
              // best-block nonce (see submitWithBestNonce).
              const prepared = await fn.prepare(...args, { origin: address });
              return await submitWithBestNonce(prepared, signer, address);
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              const retryable =
                (attempt < MAX_REMAP_RETRIES && msg.includes('AccountUnmapped')) ||
                (attempt < MAX_TIMING_RETRIES &&
                  (/not complete yet/i.test(msg) || /"Stale"/.test(msg)));
              if (!retryable) throw e;
              await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
        })();

        if (!result.ok) {
          throw new Error(`Tx failed: ${JSON.stringify(result.dispatchError)}`);
        }

        setS({
          hash: result.txHash as `0x${string}` | undefined,
          isPending: false,
          isConfirming: false,
          isSuccess: true,
          error: undefined,
        });

        for (const functionName of invalidate) {
          queryClient.invalidateQueries({
            queryKey: ['readContract', { functionName }],
          });
        }
      } catch (e) {
        console.error(`[useNexusContractWrite] ${library}.${method} failed:`, e);
        setS({
          ...idleState,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    },
    [ready, address, getSigner, queryClient, invalidate],
  );

  /**
   * Overloaded call:
   *  - `call('@nexus/game', 'method', args)` — explicit library
   *  - `call('method', args)` — defaults to `@nexus/game` (legacy call sites)
   */
  function call(library: ContractLibrary, method: string, args: readonly unknown[]): Promise<void>;
  function call(method: string, args: readonly unknown[]): Promise<void>;
  function call(
    a: ContractLibrary | string,
    b: string | readonly unknown[],
    c?: readonly unknown[],
  ): Promise<void> {
    if (Array.isArray(b)) {
      // 2-arg form: a = method, b = args; default library to @nexus/game
      return callImpl('@nexus/game', a as string, b);
    }
    // 3-arg form: a = library, b = method, c = args
    return callImpl(a as ContractLibrary, b as string, c ?? []);
  }

  return { ...s, call, reset };
}

/**
 * EVM-mode write path. Same public surface as the host impl, but backed by
 * wagmi's `useWriteContract` + `useWaitForTransactionReceipt` over eth-rpc.
 * Signing is the injected wallet (MetaMask / Talisman). None of the host
 * machinery (account mapping, session-wallet Proxy.proxy, ReviveApi dry-runs)
 * applies — the EVM RPC handles gas/nonce and the contract sees
 * `msg.sender = the wallet's H160` natively.
 */
function useNexusContractWriteEvm(
  optsOrInvalidate: readonly string[] | LegacyOptions = [],
  _legacyLogTag?: string,
) {
  const invalidate: readonly string[] = Array.isArray(optsOrInvalidate)
    ? optsOrInvalidate
    : ((optsOrInvalidate as LegacyOptions).invalidate ?? []);

  const queryClient = useQueryClient();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Invalidate the named read-query keys once the tx is mined. Same key shape
  // (`['readContract', { functionName }]`) the host path and `useReadContractPapi`
  // use, so wagmi reads refresh identically.
  useEffect(() => {
    if (!isSuccess) return;
    for (const functionName of invalidate) {
      queryClient.invalidateQueries({
        queryKey: ['readContract', { functionName }],
      });
    }
    // `invalidate` is stable per call site; `isSuccess` is the real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess]);

  const callImpl = useCallback(
    (library: ContractLibrary, method: string, args: readonly unknown[]) => {
      const [address, abi] =
        library === '@nexus/config'
          ? ([GAME_CONFIG_ADDRESS, gameConfigAbi] as const)
          : ([NEXUS_GAME_ADDRESS, nexusGameAbi] as const);
      // wagmi's writeContract is fire-and-forget — status surfaces through the
      // hooks above. We return a resolved promise so this `call` matches the
      // host impl's `Promise<void>` signature; call sites in `useNexusGame.ts`
      // don't await post-inclusion (the metamask branch behaved the same way).
      writeContract({
        address: address as `0x${string}`,
        abi: abi as Abi,
        functionName: method,
        args: args as never,
      });
      return Promise.resolve();
    },
    [writeContract],
  );

  function call(library: ContractLibrary, method: string, args: readonly unknown[]): Promise<void>;
  function call(method: string, args: readonly unknown[]): Promise<void>;
  function call(
    a: ContractLibrary | string,
    b: string | readonly unknown[],
    c?: readonly unknown[],
  ): Promise<void> {
    if (Array.isArray(b)) {
      return callImpl('@nexus/game', a as string, b);
    }
    return callImpl(a as ContractLibrary, b as string, c ?? []);
  }

  return {
    hash: hash as `0x${string}` | undefined,
    isPending,
    isConfirming,
    isSuccess,
    error: (error ?? undefined) as Error | undefined,
    call,
    reset,
  };
}

/**
 * Mode-routed contract write. Both impls expose the identical wagmi-shaped
 * `{ hash, isPending, isConfirming, isSuccess, error, call, reset }` surface,
 * so every write hook in `useNexusGame.ts` is byte-for-byte the same across
 * modes — only the transport underneath differs. The public type is pinned to
 * the host impl's signature (the shape call sites were written against).
 */
export const useNexusContractWrite: typeof useNexusContractWriteHost =
  APP_MODE === 'host'
    ? useNexusContractWriteHost
    : (useNexusContractWriteEvm as typeof useNexusContractWriteHost);
