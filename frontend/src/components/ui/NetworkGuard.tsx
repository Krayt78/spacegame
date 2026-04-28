'use client';

import { useChainId, useSwitchChain } from 'wagmi';
import { useHostAddress as useAccount } from '@/hooks/useHostAddress';
import { activeChain } from '@/lib/wagmiConfig';
import { Button } from './Button';

/**
 * Renders a full-screen warning when the connected wallet is on the wrong chain.
 * Shown instead of the game UI so players get immediate feedback with a switch button.
 */
export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending } = useSwitchChain();

  // Don't guard if not connected — ProtectedRoute handles that
  if (!isConnected || chainId === activeChain.id) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-bg-card border border-accent-warn/40 p-8">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-accent-warn text-2xl">!!</span>
          <h2 className="font-display text-lg font-bold text-accent-warn uppercase tracking-wider">
            Wrong Network
          </h2>
        </div>

        <p className="text-text-secondary text-sm leading-relaxed mb-4">
          Your wallet is connected to the wrong network. Nexus Protocol requires{' '}
          <span className="text-text-primary font-semibold">{activeChain.name}</span>{' '}
          (Chain ID: {activeChain.id}).
        </p>

        <div className="bg-bg-primary border border-bg-tertiary p-4 mb-6 font-mono text-xs">
          <div className="flex justify-between mb-1">
            <span className="text-text-muted">Current chain</span>
            <span className="text-accent-danger">ID {chainId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Required chain</span>
            <span className="text-accent-primary">{activeChain.name} (ID {activeChain.id})</span>
          </div>
        </div>

        <Button
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isPending}
          onClick={() => switchChain({ chainId: activeChain.id })}
        >
          Switch to {activeChain.name}
        </Button>

        <p className="text-text-muted text-xs mt-4 text-center">
          If the switch fails, manually change your network in your wallet settings.
        </p>
      </div>
    </div>
  );
}
