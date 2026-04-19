'use client'

import { cookieStorage, createStorage, http } from '@wagmi/core'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { arbitrum, baseSepolia, hardhat} from '@reown/appkit/networks'

// Get projectId from https://dashboard.reown.com
export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID

if (!projectId) {
  throw new Error('Project ID is not defined')
}

export const networks = [baseSepolia, arbitrum, hardhat]

//Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: true,
  projectId,
  networks,
  transports: {
    [baseSepolia.id]: http(),
    [arbitrum.id]:    http(),
    [hardhat.id]:     http('http://127.0.0.1:8545'),
  },
})

export const config = wagmiAdapter.wagmiConfig