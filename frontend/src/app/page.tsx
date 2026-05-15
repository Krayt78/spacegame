'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTriangle } from '@/hooks/useTriangle';

const DOTLI_HOST_URL = 'https://dot.li';

export default function Home() {
  const router = useRouter();
  const { isInHost, ready, status, signingIn, signIn, error, address, h160 } = useTriangle();

  // Redirect to game once the host has connected and an account is selected.
  useEffect(() => {
    if (ready) {
      router.push('/game');
    }
  }, [ready, router]);

  const connecting = signingIn || status === 'connecting' || status === 'reconnecting';
  const needsSignIn = isInHost && !ready && !connecting;

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
              <span className="font-mono text-text-secondary">dot.li</span> and sign
              in with your Polkadot account to play.
            </p>
          </div>
        ) : connecting ? (
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
            {signingIn ? 'Waiting for host login…' : 'Connecting to your Polkadot Host account…'}
          </div>
        ) : ready ? (
          <p className="text-text-secondary font-mono text-sm break-all">
            Signed in: {address ?? h160}
          </p>
        ) : needsSignIn ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                void signIn();
              }}
              className="inline-block bg-accent-primary text-bg-primary px-8 py-3 font-bold hover:bg-accent-secondary hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200 clip-angular"
            >
              Sign in to play Nexus Protocol
            </button>
            <p className="text-text-muted text-sm max-w-xl mx-auto">
              Nexus Protocol uses your Polkadot Host account to sign every
              in-game action. Click sign in to open the host&apos;s native login
              UI.
            </p>
            {error ? (
              <p className="text-accent-danger text-sm">
                Sign-in failed: {error.message ?? 'unknown error'}
              </p>
            ) : null}
          </div>
        ) : null}

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
