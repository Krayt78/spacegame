import { getDefaultConfig } from 'connectkit';
import { createConfig, http } from 'wagmi';
import { injected, mock } from 'wagmi/connectors';
import { defineChain } from 'viem';

// EVM-mode (standalone-wallet) transport config. Only consumed when
// APP_MODE === 'evm' — `Web3Provider` mounts `WagmiProvider` with this config
// solely in that mode. In host mode wagmi is never instantiated (reads/writes
// go through PAPI + the Host signer instead), so this file is dead code there.
//
// ⚠️ EVM mode needs a real eth-rpc endpoint. paseo-next-v2 (the host-mode
// target, genesis 0xbf0488…) exposes NO public eth-rpc, so it CANNOT be the
// EVM-mode chain — point EVM mode at a chain that does have one: local Hardhat
// (below) or a Polkadot Hub eth-rpc testnet via env.

// Define localhost Hardhat chain
export const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: {
    decimals: 18,
    name: 'Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Local Explorer',
      url: 'http://localhost:8545',
    },
  },
  testnet: true,
});

// Polkadot Hub TestNet — an EVM-compatible Polkadot chain that DOES expose a
// public eth-rpc (unlike paseo-next-v2). This is the realistic remote target
// for EVM mode. Override the endpoint with NEXT_PUBLIC_POLKADOT_HUB_RPC_URL.
export const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: 'Polkadot Hub TestNet',
  nativeCurrency: {
    decimals: 18,
    name: 'PAS',
    symbol: 'PAS',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_POLKADOT_HUB_RPC_URL || 'https://eth-rpc-testnet.polkadot.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Blockscout',
      url: 'https://blockscout-testnet.polkadot.io',
    },
  },
  testnet: true,
});

// Environment-driven chain selection: set NEXT_PUBLIC_CHAIN=testnet for the
// Polkadot Hub eth-rpc testnet; default is local Hardhat.
export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === 'testnet' ? polkadotHubTestnet : localhost;

// "Play as Alice" dev connector for the local hardhat chain. Hardhat's
// well-known account #0 — the node holds the key and auto-signs
// eth_sendTransaction for it, so the wagmi mock connector (which passes
// requests straight through to the RPC) gives a zero-setup signing wallet.
// The seed script (contracts/scripts/seed-local.ts) builds this account into
// a fully-progressed player.
export const HARDHAT_ALICE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
export const isLocalChain = activeChain.id === 31337;

export const config = createConfig(
  getDefaultConfig({
    // Required
    chains: [activeChain],
    transports: {
      [activeChain.id]: http(),
    },

    // Localhost only: replace ConnectKit's default wallet list with the Alice
    // dev connector + plain injected. Passing `connectors` overrides the
    // defaults (WalletConnect etc.), which is what we want on 31337 — remote
    // chains keep the stock list.
    ...(isLocalChain
      ? {
          connectors: [
            // defaultConnected is required for the session to survive a page
            // reload: the connector keeps its connected flag in memory only,
            // and isAuthorized() (wagmi's reconnect gate) returns false unless
            // the flag starts true. Net effect: localhost auto-signs in as
            // Alice on load — desirable for a local test harness.
            mock({
              accounts: [HARDHAT_ALICE],
              features: { defaultConnected: true, reconnect: true },
            }),
            injected(),
          ],
        }
      : {}),

    // WalletConnect
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',

    // App Info
    appName: 'Nexus Protocol',
    appDescription: 'Decentralized Space Strategy on Polkadot',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://nexusprotocol.io',
    appIcon: '/favicon.ico',
  })
);
