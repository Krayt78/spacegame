'use client';

import { useQuery } from '@tanstack/react-query';

import { getContractManager } from '@/lib/triangle/contractManager';

/**
 * Drop-in replacement for wagmi's `useReadContract`, backed by the
 * `@parity/product-sdk-contracts` ContractManager (`.query()` = pallet-revive
 * `ReviveApi.call` dry-run over the substrate WS).
 *
 * Why this exists (Phase G of TRIANGLE_MIGRATION_PLAN.md): paseo-next-v2 has
 * NO public eth-rpc adapter, so wagmi's transport has nothing to talk to —
 * every read must go through PAPI. The SDK decodes return values with viem's
 * `decodeFunctionResult`, i.e. the SAME decoder wagmi uses, so `data` shapes
 * (structs as named objects, multi-returns as arrays, bigints) are identical
 * and the ~30 read hooks in `useNexusGame.ts` work unchanged.
 *
 * Compatibility contract with the rest of the codebase:
 * - Accepts wagmi's `{ address, abi, functionName, args, query }` options
 *   shape. `abi` is ignored — cdm.json (typed manifest) is the ABI source of
 *   truth; `address` is only used to resolve which CDM library to hit.
 * - Query keys are `['readContract', { address, args, functionName }]` so
 *   `useNexusContractWrite`'s existing invalidation
 *   (`['readContract', { functionName }]` partial match) keeps working.
 * - BigInt args are JSON-stringified via a replacer in `queryKeyHashFn`
 *   (react-query's default hasher throws on BigInt; wagmi ships the same
 *   workaround).
 */

const GAME_ADDRESS = (process.env.NEXT_PUBLIC_NEXUS_GAME_ADDRESS ?? '').toLowerCase();
const CONFIG_ADDRESS = (process.env.NEXT_PUBLIC_GAME_CONFIG_ADDRESS ?? '').toLowerCase();

type ContractLibrary = '@nexus/game' | '@nexus/config';

function libraryFor(address: string | undefined): ContractLibrary | null {
  const a = (address ?? '').toLowerCase();
  if (a && a === GAME_ADDRESS) return '@nexus/game';
  if (a && a === CONFIG_ADDRESS) return '@nexus/config';
  return null;
}

const bigintReplacer = (_k: string, v: unknown) =>
  typeof v === 'bigint' ? `${v.toString()}n` : v;

type AbiFunctionEntry = {
  type: string;
  name?: string;
  outputs?: readonly { name?: string }[];
};

/**
 * Restore wagmi's return-value shape. viem (which both wagmi and the SDK use
 * underneath) decodes multi-output methods as a POSITIONAL ARRAY — but the
 * SDK's `decodeReturn` re-assembles that array into a named object
 * (`{ planet: …, buildings: … }`, falling back to `_0`/`_1` for unnamed
 * outputs) to match its codegen types. Our call sites predate that and
 * destructure positionally (`const [planet] = data`), so a named object
 * crashes them with "X is not iterable" (hit live on dot.li, 2026-06-12).
 * Single-output and Solidity-tuple (struct) returns are identical in both
 * conventions and pass through untouched.
 */
function toWagmiShape(abi: unknown, functionName: string, value: unknown): unknown {
  if (!Array.isArray(abi)) return value;
  const entry = (abi as AbiFunctionEntry[]).find(
    (e) => e.type === 'function' && e.name === functionName,
  );
  const outputs = entry?.outputs ?? [];
  if (outputs.length <= 1) return value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  return outputs.map((o, i) => obj[o.name || `_${i}`]);
}

export type UseReadContractParameters = {
  address?: `0x${string}` | string;
  /**
   * Used ONLY to restore wagmi's positional-array shape for multi-output
   * methods (see `toWagmiShape`). The CDM manifest owns the ABI used for
   * encoding/decoding the actual call.
   */
  abi?: unknown;
  functionName: string;
  args?: readonly unknown[];
  /**
   * Ignored. wagmi call sites passed `blockTag: 'pending'` to observe
   * unmined state on local Hardhat; pallet-revive dry-runs execute at best
   * block, which is the closest equivalent and the only option.
   */
  blockTag?: string;
  query?: {
    enabled?: boolean;
    refetchInterval?: number | false;
    refetchOnMount?: boolean | 'always';
    staleTime?: number;
    gcTime?: number;
    retry?: boolean | number;
  };
};

export function useReadContract(params: UseReadContractParameters) {
  const { address, abi, functionName, args, query } = params;
  const library = libraryFor(typeof address === 'string' ? address : undefined);

  const result = useQuery({
    queryKey: ['readContract', { address, args, functionName }],
    queryKeyHashFn: (key) => JSON.stringify(key, bigintReplacer),
    enabled: (query?.enabled ?? true) && library !== null && args !== undefined,
    refetchInterval: query?.refetchInterval,
    refetchOnMount: query?.refetchOnMount,
    staleTime: query?.staleTime,
    gcTime: query?.gcTime,
    retry: query?.retry ?? 2,
    queryFn: async () => {
      const manager = await getContractManager();
      const contract = manager.getContract(library as never) as unknown as Record<
        string,
        { query: (...a: unknown[]) => Promise<{ success: boolean; value: unknown }> }
      >;
      const method = contract[functionName];
      if (!method) throw new Error(`[useReadContract] unknown method ${library}.${functionName}`);
      const res = await method.query(...((args ?? []) as unknown[]));
      if (!res.success) {
        throw new Error(
          `[useReadContract] ${library}.${functionName} dry-run failed: ${JSON.stringify(res.value, bigintReplacer)}`,
        );
      }
      const value = toWagmiShape(abi, functionName, res.value);
      // react-query treats `undefined` as "no data" and errors — normalize
      // void returns to null.
      return value === undefined ? null : value;
    },
  });

  // wagmi-compatible surface: the read hooks consume data / isLoading /
  // isPending / isFetching / error / refetch / status — all of which
  // react-query already provides with matching semantics.
  return result;
}

type BatchResult =
  | { status: 'success'; result: unknown }
  | { status: 'failure'; result?: undefined; error: Error };

/**
 * Batch variant mirroring wagmi's `useReadContracts` result shape
 * (`{ status: 'success' | 'failure', result }[]`). No multicall on
 * pallet-revive — the "batch" is a `Promise.all` of dry-runs sharing one
 * react-query entry, which is what the single consumer
 * (`FleetDispatchForm`) actually needs.
 */
export function useReadContracts(params: {
  contracts: readonly UseReadContractParameters[];
  query?: { enabled?: boolean; refetchInterval?: number | false; staleTime?: number };
}) {
  const { contracts, query } = params;
  return useQuery({
    queryKey: [
      'readContracts',
      contracts.map((c) => ({ address: c.address, args: c.args, functionName: c.functionName })),
    ],
    queryKeyHashFn: (key) => JSON.stringify(key, bigintReplacer),
    enabled: (query?.enabled ?? true) && contracts.length > 0,
    refetchInterval: query?.refetchInterval,
    staleTime: query?.staleTime,
    queryFn: async (): Promise<BatchResult[]> => {
      const manager = await getContractManager();
      return Promise.all(
        contracts.map(async (c): Promise<BatchResult> => {
          try {
            const lib = libraryFor(typeof c.address === 'string' ? c.address : undefined);
            if (!lib) throw new Error(`unknown contract address ${c.address}`);
            const contract = manager.getContract(lib as never) as unknown as Record<
              string,
              { query: (...a: unknown[]) => Promise<{ success: boolean; value: unknown }> }
            >;
            const method = contract[c.functionName];
            if (!method) throw new Error(`unknown method ${lib}.${c.functionName}`);
            const res = await method.query(...((c.args ?? []) as unknown[]));
            if (!res.success) {
              throw new Error(
                `${lib}.${c.functionName} dry-run failed: ${JSON.stringify(res.value, bigintReplacer)}`,
              );
            }
            const value = toWagmiShape(c.abi, c.functionName, res.value);
            return { status: 'success', result: value === undefined ? null : value };
          } catch (error) {
            return { status: 'failure', error: error as Error };
          }
        }),
      );
    },
  });
}
