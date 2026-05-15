'use client';

import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { config } from '@/lib/wagmiConfig';

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
 * Wagmi is kept around exclusively for read hooks (`useReadContract`,
 * `useChainId`, `useBlock` etc.) — they reach an HTTP transport directly and
 * don't require any wallet connector. The connect / sign UI is provided by
 * the Polkadot Host through `@parity/product-sdk-signer` (`useTriangle` /
 * `useHostAddress`), not ConnectKit. Phase 4 of the triangle migration drops
 * connectkit entirely and reduces this provider further.
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
