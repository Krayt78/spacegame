'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useHostAddress } from '@/hooks/useHostAddress';
import { useSpektrAccounts } from '@/hooks/useSpektrAccounts';

const DOTLI_HOST_URL = 'https://dot.li';

export default function Home() {
  const router = useRouter();
  const { isConnected, isConnecting, isInHost, address, ss58Address } = useHostAddress();
  const { status } = useSpektrAccounts();

  // Redirect to game when the host has paired an account.
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

        {!isInHost ? (
          <div className="space-y-3">
            <a
              href={DOTLI_HOST_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-accent-primary text-bg-primary px-8 py-3 font-bold hover:bg-accent-secondary hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200 clip-angular"
            >
              Open in Polkadot Host (dot.li)
            </a>
            <p className="text-text-muted text-sm max-w-xl mx-auto">
              Nexus Protocol signs every action with your Polkadot account through
              the host&apos;s built-in wallet. Open this site at{' '}
              <span className="font-mono text-text-secondary">dot.li</span> and pair
              your Polkadot account to play.
            </p>
          </div>
        ) : isConnecting || status === 'detecting' || status === 'injecting' ? (
          <div className="flex items-center justify-center gap-2 text-text-secondary">
            <svg
              className="animate-spin h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Connecting to your Polkadot Host account…
          </div>
        ) : status === 'failed' ? (
          <p className="text-accent-danger text-sm">
            Failed to reach the Polkadot Host. Reload the page or pair an account in
            the host&apos;s wallet UI before continuing.
          </p>
        ) : !isConnected ? (
          <p className="text-text-muted text-sm max-w-xl mx-auto">
            Waiting for you to pair a Polkadot account in the host&apos;s wallet UI…
          </p>
        ) : (
          <p className="text-text-secondary font-mono text-sm break-all">
            Paired: {ss58Address ?? address}
          </p>
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
