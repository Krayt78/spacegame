'use client';

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useTriangle } from '@/hooks/useTriangle';
import { signerManager } from '@/lib/triangle/signerManager';
import { ensureMapped, getContractManager } from '@/lib/triangle/contractManager';

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
type ContractMethod = {
  tx: (...args: unknown[]) => Promise<TxResult>;
};

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
 * Shared React-state wrapper around `ContractManager.<library>.<method>.tx()`.
 *
 * Every write hook in `useNexusGame.ts` is a thin wrapper around this helper.
 * Responsibilities:
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
export function useNexusContractWrite(
  optsOrInvalidate: readonly string[] | LegacyOptions = [],
  _legacyLogTag?: string,
) {
  const invalidate: readonly string[] = Array.isArray(optsOrInvalidate)
    ? optsOrInvalidate
    : ((optsOrInvalidate as LegacyOptions).invalidate ?? []);

  const queryClient = useQueryClient();
  const { ready, address } = useTriangle();
  const [s, setS] = useState(idleState);

  const reset = useCallback(() => setS(idleState), []);

  const callImpl = useCallback(
    async (library: ContractLibrary, method: string, args: readonly unknown[]) => {
      if (!ready || !address) {
        setS({ ...idleState, error: new Error('Not signed in') });
        return;
      }
      const signer = signerManager.getSigner();
      if (!signer) {
        setS({ ...idleState, error: new Error('No signer available') });
        return;
      }

      setS({ ...idleState, isPending: true });

      try {
        if (!mappedAddresses.has(address)) {
          await ensureMapped(address, signer);
          mappedAddresses.add(address);
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

        const result = await fn.tx(...args, { signer });

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
    [ready, address, queryClient, invalidate],
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
