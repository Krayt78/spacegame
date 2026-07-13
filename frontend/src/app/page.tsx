'use client';

import { useSyncExternalStore } from 'react';
import { isHostMode } from '@/lib/mode';
import { HostConnectPanel } from '@/components/connect/HostConnectPanel';
import { EvmConnectPanel } from '@/components/connect/EvmConnectPanel';

// SSR-safe "are we on the client yet?" — false during server render and the
// first client (hydration) render, true thereafter. No subscription needed.
const emptySubscribe = () => () => {};

export default function Home() {
  // `isHostMode` resolves on the client (it inspects the container at module
  // load). The server has no `window`, so it always evaluates to evm there —
  // rendering the mode-specific panel before mount would mismatch hydration.
  // Gate the connect slot behind `mounted` so server + first client render
  // agree on a neutral placeholder, then swap in the real panel.
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  return (
    <main className="min-h-screen bg-bg-primary flex items-center justify-center">
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="text-7xl font-display font-bold text-accent-primary mb-4 animate-pulse">
          NEXUS PROTOCOL
        </h1>
        <p className="text-2xl text-text-secondary mb-8">
          Decentralized Space Dominance on Polkadot
        </p>
        <p className="text-lg text-text-muted mb-12 max-w-2xl mx-auto">
          Build your empire, command fleets, and conquer the galaxy.
          All on-chain. All unstoppable.
        </p>

        {!mounted ? (
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Initializing…
          </div>
        ) : isHostMode ? (
          <HostConnectPanel />
        ) : (
          <EvmConnectPanel />
        )}

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-left">
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Own Your Empire</h3>
            <p className="text-text-muted">
              True ownership of planets, fleets, and resources on Polkadot blockchain
            </p>
          </div>
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Unstoppable</h3>
            <p className="text-text-muted">
              Fully on-chain gameplay. No servers to shut down, no company to trust
            </p>
          </div>
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Player Economy</h3>
            <p className="text-text-muted">
              Trade resources and assets peer-to-peer without intermediaries
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
