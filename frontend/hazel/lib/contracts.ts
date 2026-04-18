import { type Address } from 'viem'

import ERC20_ABI from './abis/ERC20.json'
import HZ_STABLE_ABI from './abis/HzStable.json'
import GOV_STAKING_ABI from './abis/GovStaking.json'
import HAZEL_ABI from './abis/Hazel.json'
import REVENUE_DISTRIBUTOR_ABI from './abis/RevenueDistributor.json'
import INSURANCE_FUND_ABI from './abis/InsuranceFund.json'
import VAULT_REGISTRY_ABI from './abis/VaultRegistry.json'

export const FROM_BLOCK = BigInt(process.env.NEXT_PUBLIC_FROM_BLOCK ?? '0')

export const ADDRESSES = {
  hzStable: process.env.NEXT_PUBLIC_ADDR_HZ_STABLE as Address,
  revenueDistributor: process.env.NEXT_PUBLIC_ADDR_REVENUE_DISTRIBUTOR as Address,
  govStaking: process.env.NEXT_PUBLIC_ADDR_GOV_STAKING as Address,
  hazel: process.env.NEXT_PUBLIC_ADDR_HAZEL as Address,
  insuranceFund: process.env.NEXT_PUBLIC_ADDR_INSURANCE_FUND as Address,
  vaultRegistry: process.env.NEXT_PUBLIC_ADDR_VAULT_REGISTRY as Address,
  usdc: process.env.NEXT_PUBLIC_ADDR_USDC as Address,
}

export { ERC20_ABI, HZ_STABLE_ABI, GOV_STAKING_ABI, HAZEL_ABI, REVENUE_DISTRIBUTOR_ABI, INSURANCE_FUND_ABI, VAULT_REGISTRY_ABI }
