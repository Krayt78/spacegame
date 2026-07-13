'use client';

import { useEffect } from 'react';
import { useRouter } from '@/lib/hostNav';
import { useTriangle } from '@/hooks/useTriangle';

const DOTLI_HOST_URL = 'https://dot.li';

/**
 * Host-mode connect surface. Signs every in-game action through the Polkadot
 * Host's built-in wallet (`useTriangle` → `@parity/product-sdk-signer`).
 * Rendered only when `APP_MODE === 'host'` — it must never mount in evm mode,
 * because `useTriangle()` eagerly drives a host `connect()` that has nothing
 * to pair with outside a container.
 */
export function HostConnectPanel() {
  const router = useRouter();
  const { isInHost, ready, status, signingIn, signIn, error, address, h160 } = useTriangle();

  // Redirect to game once the host has connected and an account is selected.
  useEffect(() => {
    if (ready) {
      router.push('/game');
    }
  }, [ready, router]);

  const connecting = signingIn || status === 'connecting';
  const needsSignIn = isInHost && !ready && !connecting;

  if (!isInHost) {
    return (
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
    );
  }

  if (connecting) {
    return (
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
    );
  }

  if (ready) {
    return (
      <p className="text-text-secondary font-mono text-sm break-all">
        Signed in: {address ?? h160}
      </p>
    );
  }

  if (needsSignIn) {
    return (
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
          Nexus Protocol uses your Polkadot Host account to sign every in-game
          action. Click sign in to open the host&apos;s native login UI.
        </p>
        {error ? (
          <p className="text-accent-danger text-sm">
            Sign-in failed: {error.message ?? 'unknown error'}
          </p>
        ) : null}
      </div>
    );
  }

  return null;
}
