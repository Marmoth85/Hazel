import { useReadContracts, useBlock } from 'wagmi'
import { type Address } from 'viem'
import { ADDRESSES, HZ_STABLE_ABI } from '@/lib/contracts'

const ONE_SHARE = 1_000_000_000n

export function useVaultStats(vaultAddress?: Address) {
  const addr = vaultAddress ?? ADDRESSES.hzStable
  const vault = { address: addr, abi: HZ_STABLE_ABI } as const

  const { data: block } = useBlock({ watch: true })
  const nowTs = block?.timestamp !== undefined ? Number(block.timestamp) : Math.floor(Date.now() / 1000)

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { ...vault, functionName: 'totalAssets' },
      { ...vault, functionName: 'totalSupply' },
      { ...vault, functionName: 'lastHarvest' },
      { ...vault, functionName: 'harvestInterval' },
      { ...vault, functionName: 'highWaterMark' },
      { ...vault, functionName: 'feeRate' },
      { ...vault, functionName: 'owner' },
      { ...vault, functionName: 'convertToAssets', args: [ONE_SHARE] },
    ],
  })

  const lastHarvest = (data?.[2]?.result ?? undefined) as bigint | undefined
  const harvestInterval = (data?.[3]?.result ?? undefined) as bigint | undefined

  const nextHarvestAt = lastHarvest !== undefined && harvestInterval !== undefined
    ? Number(lastHarvest) + Number(harvestInterval)
    : undefined

  const secondsUntilHarvest = nextHarvestAt !== undefined
    ? Math.max(0, nextHarvestAt - nowTs)
    : undefined

  return {
    totalAssets: (data?.[0]?.result ?? undefined) as bigint | undefined,
    totalSupply: (data?.[1]?.result ?? undefined) as bigint | undefined,
    lastHarvest,
    harvestInterval,
    highWaterMark: (data?.[4]?.result ?? undefined) as bigint | undefined,
    feeRate: (data?.[5]?.result ?? undefined) as number | undefined,
    owner: (data?.[6]?.result ?? undefined) as string | undefined,
    pricePerShare: (data?.[7]?.result ?? undefined) as bigint | undefined,
    secondsUntilHarvest,
    harvestReady: secondsUntilHarvest === 0,
    isLoading,
    refetch,
  }
}
