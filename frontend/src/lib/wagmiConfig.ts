import { defineChain } from 'viem';

// Chain METADATA only (names, explorer links for the UI). wagmi itself was
// dropped in Phase G — reads go through PAPI dry-runs (useReadContractPapi),
// so there is no wagmi config or transport anymore. viem's defineChain is
// kept purely as a typed container for display values.

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

// paseo-next-v2 Asset Hub (genesis 0xbf0488…, parachain 1500). NOTE: the
// EVM chainId 420420417 is shared with the standard Paseo AH and previewnet —
// it does NOT identify the chain; the genesis hash does (see chainClient.ts).
// There is no public eth-rpc / explorer indexing this chain yet; the explorer
// link points at the substrate-side Subscan as the closest thing.
export const polkadotHubTestnet = defineChain({
  id: 420420417,
  name: 'Paseo Next Asset Hub',
  nativeCurrency: {
    decimals: 10,
    name: 'PAS',
    symbol: 'PAS',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_HUB_WS_URL || 'wss://paseo-asset-hub-next-rpc.polkadot.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Subscan',
      url: 'https://assethub-paseo.subscan.io',
    },
  },
  testnet: true,
});

// Environment-driven chain selection: set NEXT_PUBLIC_CHAIN=testnet for the next-v2 hub
export const activeChain = process.env.NEXT_PUBLIC_CHAIN === 'testnet' ? polkadotHubTestnet : localhost;
