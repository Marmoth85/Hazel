import { useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { ADDRESSES, VAULT_REGISTRY_ABI, HZ_STABLE_ABI } from '@/lib/contracts'

export function useVaultList() {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: ADDRESSES.vaultRegistry, abi: VAULT_REGISTRY_ABI, functionName: 'getVaults' },
    ],
  })

  const vaults = (data?.[0]?.result ?? []) as Address[]

  return { vaults, isLoading, refetch }
}

export function useVaultMeta(vault: Address | undefined) {
  const { data, isLoading } = useReadContracts({
    contracts: vault ? [
      { address: vault, abi: HZ_STABLE_ABI, functionName: 'name' },
      { address: vault, abi: HZ_STABLE_ABI, functionName: 'symbol' },
      { address: vault, abi: HZ_STABLE_ABI, functionName: 'totalAssets' },
      { address: vault, abi: HZ_STABLE_ABI, functionName: 'convertToAssets', args: [1_000_000_000n] as const },
    ] : [],
    query: { enabled: !!vault },
  })

  return {
    name: (data?.[0]?.result ?? undefined) as string | undefined,
    symbol: (data?.[1]?.result ?? undefined) as string | undefined,
    totalAssets: (data?.[2]?.result ?? undefined) as bigint | undefined,
    pps: (data?.[3]?.result ?? undefined) as bigint | undefined,
    isLoading,
  }
}
