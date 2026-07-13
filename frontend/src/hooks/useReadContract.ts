'use client';

import { APP_MODE } from '@/lib/mode';
import { useReadContract as useReadContractPapi } from '@/hooks/useReadContractPapi';
import { useReadContract as useReadContractWagmi } from 'wagmi';

/**
 * Mode-routed contract read.
 *
 *  - host mode → `useReadContractPapi` (pallet-revive `ReviveApi.call` dry-run
 *    over the substrate WS).
 *  - evm mode  → wagmi's `useReadContract` (eth-rpc `eth_call`).
 *
 * Both already speak wagmi's `{ address, abi, functionName, args, query }`
 * options shape and decode return values with viem, so the ~30 read hooks in
 * `useNexusGame.ts` consume either one unchanged. We type the router as the
 * PAPI hook (which the call sites were written against) and cast the wagmi
 * hook into that slot — at runtime only one is ever called, picked once here
 * by the build-load-time `APP_MODE` constant.
 */
export const useReadContract: typeof useReadContractPapi =
  APP_MODE === 'host'
    ? useReadContractPapi
    : (useReadContractWagmi as unknown as typeof useReadContractPapi);
