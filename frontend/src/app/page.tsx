'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectKitButton } from 'connectkit';
import { useAccount } from 'wagmi';

export default function Home() {
  const router = useRouter();
  const { isConnected, isConnecting } = useAccount();

  // Redirect to game when connected
  useEffect(() => {
    if (isConnected) {
      router.push('/game');
    }
  }, [isConnected, router]);

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

        <ConnectKitButton.Custom>
          {({ isConnected, show, truncatedAddress, ensName }) => (
            <button
              onClick={show}
              disabled={isConnecting}
              className="bg-accent-primary text-bg-primary px-8 py-3 font-bold hover:bg-accent-secondary hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed clip-angular"
            >
              {isConnecting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Connecting...
                </span>
              ) : isConnected ? (
                ensName ?? truncatedAddress ?? 'Connected'
              ) : (
                'Connect Wallet & Play'
              )}
            </button>
          )}
        </ConnectKitButton.Custom>

        <p className="text-text-muted mt-4 text-sm">
          Supports MetaMask, WalletConnect, Coinbase Wallet, and more
        </p>

        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto text-left">
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Own Your Empire</h3>
            <p className="text-text-muted">True ownership of planets, fleets, and resources on Polkadot blockchain</p>
          </div>
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Unstoppable</h3>
            <p className="text-text-muted">Fully on-chain gameplay. No servers to shut down, no company to trust</p>
          </div>
          <div className="bg-bg-secondary/50 p-6 border border-bg-tertiary">
            <h3 className="text-accent-secondary font-display mb-2">Player Economy</h3>
            <p className="text-text-muted">Trade resources and assets peer-to-peer without intermediaries</p>
          </div>
        </div>
      </div>
    </main>
  );
}
