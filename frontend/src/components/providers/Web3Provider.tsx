'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds - data is considered fresh for this duration
      gcTime: 5 * 60 * 1000, // 5 minutes - keep unused data in cache
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
      refetchOnMount: false, // Don't refetch on component mount if data is fresh
      retry: 3, // Retry failed requests 3 times
    },
  },
});

interface Web3ProviderProps {
  children: ReactNode;
}

/**
 * React-query provider for the contract read/write hooks. wagmi was dropped
 * in Phase G of the triangle migration: paseo-next-v2 has no public eth-rpc
 * adapter, so all reads now go through PAPI `ReviveApi.call` dry-runs
 * (`useReadContractPapi.ts`) over the substrate WS — the same client the
 * writes use. Connect / sign UI is provided by the Polkadot Host through
 * `@parity/product-sdk-signer` (`useTriangle` / `useHostAddress`).
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
