'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Abi, Address } from 'viem';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSpektrAccounts } from '@/hooks/useSpektrAccounts';
import { reviveCall } from '@/hooks/useReviveCall';

/**
 * Pulled out of useClaimStarterPlanet so every other write hook stops
 * duplicating ~50 lines of state plumbing. Wraps `reviveCall` with the
 * wagmi-shaped { hash, isPending, isConfirming, isSuccess, error, reset }
 * the existing UI already expects, plus an extra `progress` string driven
 * by `signSubmitAndWatch` stages.
 *
 * `invalidate` is the list of contract `functionName`s whose query cache
 * should be cleared after a successful write — same convention as the
 * old `invalidateContractQueries` helper.
 */
export type ReviveWriteState = {
  hash: `0x${string}` | undefined;
  isPending: boolean;
  isConfirming: boolean;
  isSuccess: boolean;
  error: Error | undefined;
  progress: string | undefined;
  reset: () => void;
};

export type UseReviveContractWriteOptions = {
  contractAddress: Address;
  abi: Abi;
  /** Query function names to invalidate on success. */
  invalidate?: string[];
};

function invalidateContractQueries(qc: QueryClient, names: string[]) {
  for (const functionName of names) {
    qc.invalidateQueries({ queryKey: ['readContract', { functionName }] });
  }
}

const ts = () => new Date().toISOString();

export function useReviveContractWrite(
  opts: UseReviveContractWriteOptions,
  logTag: string = 'useReviveContractWrite',
): ReviveWriteState & {
  call: (functionName: string, args: readonly unknown[]) => Promise<void>;
} {
  const queryClient = useQueryClient();
  const { accounts } = useSpektrAccounts();
  const host = accounts[0];

  const [hash, setHash] = useState<`0x${string}` | undefined>(undefined);
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [progress, setProgress] = useState<string | undefined>(undefined);

  const reset = useCallback(() => {
    setHash(undefined);
    setIsPending(false);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(undefined);
    setProgress(undefined);
  }, []);

  const call = useCallback(
    async (functionName: string, args: readonly unknown[]) => {
      console.log(`[${ts()}] [${logTag}] call`, functionName, args);
      if (!host) {
        setError(new Error('No Polkadot Host account paired'));
        return;
      }
      setError(undefined);
      setIsSuccess(false);
      setHash(undefined);
      setIsPending(true);
      try {
        const { result } = await reviveCall({
          signer: host.polkadotSigner,
          originSs58: host.address,
          contractAddress: opts.contractAddress,
          abi: opts.abi,
          functionName,
          args,
          onProgress: (stage) => {
            setProgress(stage);
            if (stage.includes('broadcasted') || stage.includes('best block')) {
              setIsPending(false);
              setIsConfirming(true);
            }
          },
        });
        setIsConfirming(false);
        if (!result.ok) {
          throw new Error(`Revive.call failed: ${JSON.stringify(result.dispatchError)}`);
        }
        setHash(result.txHash as `0x${string}`);
        setIsSuccess(true);
        if (opts.invalidate?.length) {
          invalidateContractQueries(queryClient, opts.invalidate);
        }
      } catch (e) {
        console.error(`[${ts()}] [${logTag}]`, e);
        setError(e instanceof Error ? e : new Error(String(e)));
        setIsPending(false);
        setIsConfirming(false);
      }
    },
    [host, opts.contractAddress, opts.abi, opts.invalidate, queryClient, logTag],
  );

  useEffect(() => {
    if (!progress && !error && !isSuccess) return;
    console.log(`[${ts()}] [${logTag}]`, {
      progress,
      hash,
      isPending,
      isConfirming,
      isSuccess,
      error: error?.message,
    });
  }, [progress, hash, isPending, isConfirming, isSuccess, error, logTag]);

  return { call, hash, isPending, isConfirming, isSuccess, error, progress, reset };
}
