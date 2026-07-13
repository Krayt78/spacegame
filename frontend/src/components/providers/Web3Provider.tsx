'use client';

import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';

import { APP_MODE } from '@/lib/mode';
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

// Custom ConnectKit theme to match Nexus Protocol aesthetic (EVM mode only)
const connectKitTheme = {
  '--ck-font-family': 'var(--font-orbitron), var(--font-jetbrains), monospace',
  '--ck-border-radius': '2px',

  // Background colors
  '--ck-body-background': 'var(--bg-secondary)',
  '--ck-body-background-secondary': 'var(--bg-tertiary)',
  '--ck-body-background-tertiary': 'var(--bg-card)',

  // Text colors
  '--ck-body-color': 'var(--text-primary)',
  '--ck-body-color-muted': 'var(--text-secondary)',
  '--ck-body-color-muted-hover': 'var(--text-primary)',

  // Accent colors
  '--ck-primary-button-background': 'var(--accent-primary)',
  '--ck-primary-button-color': 'var(--bg-primary)',
  '--ck-primary-button-hover-background': 'var(--accent-secondary)',
  '--ck-primary-button-border-radius': '2px',

  '--ck-secondary-button-background': 'var(--bg-tertiary)',
  '--ck-secondary-button-color': 'var(--text-primary)',
  '--ck-secondary-button-border-radius': '2px',

  // Focus/hover states
  '--ck-focus-color': 'var(--accent-primary)',
  '--ck-body-action-color': 'var(--accent-primary)',

  // Modal styling
  '--ck-modal-box-shadow': '0 10px 40px rgba(0, 0, 0, 0.5), 0 0 1px rgba(0, 255, 136, 0.2)',

  // Connector button styling
  '--ck-connectbutton-background': 'var(--bg-tertiary)',
  '--ck-connectbutton-color': 'var(--text-primary)',
  '--ck-connectbutton-hover-background': 'var(--bg-card)',
  '--ck-connectbutton-border-radius': '2px',
};

interface Web3ProviderProps {
  children: ReactNode;
}

/**
 * Provider tree for the contract read/write hooks. Always supplies React Query
 * (both transports use it). The wagmi/ConnectKit layer is mounted ONLY in evm
 * mode:
 *
 *  - host mode → bare `QueryClientProvider`. Reads go through PAPI
 *    `ReviveApi.call` dry-runs over the substrate WS; connect/sign UI is the
 *    Polkadot Host (`useTriangle` / `useHostAddress`). wagmi has no eth-rpc to
 *    talk to on paseo-next-v2, so it is deliberately absent.
 *  - evm mode  → `WagmiProvider` + `ConnectKitProvider`. Reads/writes go over
 *    eth-rpc, signed by an injected wallet (MetaMask / Talisman).
 *
 * `APP_MODE` is fixed for the process lifetime, so the tree shape is stable —
 * no provider remounts mid-session.
 */
export function Web3Provider({ children }: Web3ProviderProps) {
  if (APP_MODE === 'evm') {
    return (
      <WagmiProvider config={config}>
        <QueryClientProvider client={queryClient}>
          <ConnectKitProvider
            mode="dark"
            customTheme={connectKitTheme}
            options={{
              embedGoogleFonts: false,
              language: 'en-US',
              hideNoWalletCTA: false,
              hideQuestionMarkCTA: false,
              hideRecentBadge: false,
              avoidLayoutShift: true,
            }}
          >
            {children}
          </ConnectKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    );
  }

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
