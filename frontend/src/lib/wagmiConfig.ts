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

// Define Polkadot Hub TestNet (EVM-compatible Polkadot chain)
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

// Environment-driven chain selection: set NEXT_PUBLIC_CHAIN=testnet for Polkadot Hub TestNet
export const activeChain = process.env.NEXT_PUBLIC_CHAIN === 'testnet' ? polkadotHubTestnet : localhost;

// No connectors configured — wagmi is used only for read hooks and chain
// metadata. The signer comes from the Polkadot Host (Spektr / dot.li) and is
// surfaced separately via `useHostAddress` / `useSpektrAccounts`.
export const config = createConfig({
  chains: [localhost, polkadotHubTestnet],
  connectors: [],
  transports: {
    [localhost.id]: http(),
    [polkadotHubTestnet.id]: http(),
  },
  ssr: true,
});
