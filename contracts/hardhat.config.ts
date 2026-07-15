import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      allowUnlimitedContractSize: true, // Allow large contracts for testing
      mining: {
        auto: true,
        interval: 1000, // Mine a block every 1 second
      },
    },
    localhost: {
      // Override when 8545 is taken (e.g. a revive eth-rpc adapter):
      //   LOCALHOST_RPC_URL=http://127.0.0.1:8546 npm run deploy:local
      // (start the node with `npx hardhat node --port 8546` to match)
      url: process.env.LOCALHOST_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337,
    },
    polkadotHubTestnet: {
      url: process.env.POLKADOT_HUB_RPC_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 420420417, // Polkadot Hub TestNet EVM chain ID
    },
  },
  etherscan: {
    apiKey: {
      polkadotHubTestnet: "no-api-key-needed",
    },
    customChains: [
      {
        network: "polkadotHubTestnet",
        chainId: 420420417,
        urls: {
          apiURL: "https://blockscout-testnet.polkadot.io/api",
          browserURL: "https://blockscout-testnet.polkadot.io/",
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
