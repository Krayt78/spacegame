import { getDefaultConfig } from 'connectkit';
import { createConfig, http } from 'wagmi';
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

export const config = createConfig(
  getDefaultConfig({
    // Required
    chains: [activeChain],
    transports: {
      [activeChain.id]: http(),
    },

    // WalletConnect
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',

    // App Info
    appName: 'Nexus Protocol',
    appDescription: 'Decentralized Space Strategy on Polkadot',
    appUrl: typeof window !== 'undefined' ? window.location.origin : 'https://nexusprotocol.io',
    appIcon: '/favicon.ico',
  })
);
