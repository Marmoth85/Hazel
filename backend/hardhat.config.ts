import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import hardhatVerify from "@nomicfoundation/hardhat-verify";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    }
  },
  chainDescriptors: {
    42161: {
      name: "Arbitrum One",
      chainType: "generic",
      hardforkHistory: {
        berlin: { blockNumber: 0 },
        london: { blockNumber: 0 },
        merge: { blockNumber: 0 },
        shanghai: { blockNumber: 0 },
        cancun: { blockNumber: 0 },
      },
    },
  },
  solidity: {
    profiles: {
      default: {
        version: "0.8.32",
      },
      production: {
        version: "0.8.32",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    forkMainnet: {
      type: "edr-simulated",
      chainType: "l1",
      forking: {
        enabled: true,
        blockNumber: 24_800_000,
        url: configVariable("MAINNET_RPC_URL"),
      },
    },
    forkArbitrum: {
      type: "edr-simulated",
      chainType: "generic",
      hardfork: "cancun",
      forking: {
        enabled: true,
        blockNumber: 450_400_000,
        url: configVariable("ARBITRUM_RPC_URL"),
      },
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("EVM_TEST_PRIVATE_KEY")],
    },
    baseSepolia: {
      type: "http",
      chainType: "op",
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("EVM_TEST_PRIVATE_KEY")],
    }
  },
});
