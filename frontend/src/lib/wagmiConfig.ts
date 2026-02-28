import { getDefaultConfig } from 'connectkit';
import { createConfig, http } from 'wagmi';
import { defineChain } from 'viem';

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

// Define AssetHub Westend (EVM-compatible Polkadot parachain)
export const assetHubWestend = defineChain({
  id: 420420421,
  name: 'AssetHub Westend',
  nativeCurrency: {
    decimals: 18,
    name: 'Westend',
    symbol: 'WND',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ASSETHUB_RPC_URL || 'https://westend-asset-hub-eth-rpc.polkadot.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Subscan',
      url: 'https://assethub-westend.subscan.io',
    },
  },
  testnet: true,
});

// Environment-driven chain selection: set NEXT_PUBLIC_CHAIN=testnet for AssetHub Westend
export const activeChain = process.env.NEXT_PUBLIC_CHAIN === 'testnet' ? assetHubWestend : localhost;

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
