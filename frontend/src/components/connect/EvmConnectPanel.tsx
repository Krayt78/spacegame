'use client';

import { useEffect } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, useConnect } from 'wagmi';
import { useRouter } from '@/lib/hostNav';
import { isLocalChain } from '@/lib/wagmiConfig';

/**
 * EVM-mode connect surface. Signs every in-game action with the user's own
 * injected wallet (MetaMask / Talisman / WalletConnect) over eth-rpc, via
 * ConnectKit. Rendered only when `APP_MODE === 'evm'` — it relies on the
 * `WagmiProvider` + `ConnectKitProvider` that `Web3Provider` mounts only in
 * that mode.
 */
export function EvmConnectPanel() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { connect, connectors, isPending: isDevConnecting } = useConnect();
  // Present only on the local hardhat chain (see wagmiConfig.ts) — hardhat
  // account #0, node-signed, seeded as a fully-progressed player.
  const aliceConnector = isLocalChain
    ? connectors.find((c) => c.id === 'mock')
    : undefined;

  // Redirect to game once a wallet is connected.
  useEffect(() => {
    if (isConnected) {
      router.push('/game');
    }
  }, [isConnected, router]);

  return (
    <div className="space-y-3">
      {aliceConnector && (
        <button
          type="button"
          onClick={() => connect({ connector: aliceConnector })}
          disabled={isDevConnecting || isConnected}
          className="bg-accent-warn/20 border border-accent-warn text-accent-warn px-8 py-3 font-bold hover:bg-accent-warn/30 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed clip-angular"
        >
          {isDevConnecting ? 'Connecting…' : 'Play as Alice (local dev)'}
        </button>
      )}
      <ConnectKitButton.Custom>
        {({ isConnected, isConnecting, show, truncatedAddress, ensName }) => (
          <button
            type="button"
            onClick={show}
            disabled={isConnecting}
            className="bg-accent-primary text-bg-primary px-8 py-3 font-bold hover:bg-accent-secondary hover:shadow-[0_0_30px_rgba(0,255,136,0.5)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed clip-angular"
          >
            {isConnecting ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin h-5 w-5"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Connecting…
              </span>
            ) : isConnected ? (
              ensName ?? truncatedAddress ?? 'Connected'
            ) : (
              'Connect Wallet & Play'
            )}
          </button>
        )}
      </ConnectKitButton.Custom>
      <p className="text-text-muted text-sm max-w-xl mx-auto">
        Connect MetaMask, Talisman, WalletConnect and more to sign every in-game
        action with your own wallet.
      </p>
    </div>
  );
}
