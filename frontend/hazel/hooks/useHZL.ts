import { useCallback } from 'react'
import { type Address } from 'viem'
import { useAccount, useReadContracts, useReadContract } from 'wagmi'
import { ADDRESSES, HAZEL_ABI, HZ_STABLE_ABI } from '@/lib/contracts'

export function useHZL(refetchInterval?: number | false) {
  const { address } = useAccount()

  const { data, isLoading, refetch: refetchContracts } = useReadContracts({
    contracts: [
      { address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'totalSupply' },
      { address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'pool', args: [ADDRESSES.hzStable] as const },
      { address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'poolVaultCount' },
    ],
    query: { refetchInterval: refetchInterval ?? false },
  })

  const { data: balanceData, refetch: refetchBalance } = useReadContract({
    address: ADDRESSES.hazel,
    abi: HAZEL_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: refetchInterval ?? false },
  })

  const refetch = useCallback(
    () => Promise.all([refetchContracts(), refetchBalance()]),
    [refetchContracts, refetchBalance],
  )

  return {
    hzlSupply:      (data?.[0]?.result ?? undefined) as bigint | undefined,
    poolShares:     (data?.[1]?.result ?? undefined) as bigint | undefined,
    poolVaultCount: (data?.[2]?.result ?? undefined) as bigint | undefined,
    hzlBalance:     balanceData as bigint | undefined,
    isLoading,
    refetch,
  }
}

export function useHZLVaultPools(vaultAddresses: Address[], refetchInterval?: number | false) {
  const { data, refetch } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: vaultAddresses.map(v => ({
      address: ADDRESSES.hazel,
      abi: HAZEL_ABI,
      functionName: 'pool' as const,
      args: [v] as const,
    })) as any,
    query: { enabled: vaultAddresses.length > 0, refetchInterval: refetchInterval ?? false },
  })

  const pools = vaultAddresses.map((vault, i) => ({
    vault,
    poolShares: (data?.[i]?.result ?? 0n) as bigint,
  }))

  return { pools, refetch }
}

export function usePreviewWrap(lpAmount: bigint) {
  const { hzlSupply, poolShares } = useHZL()

  const { data } = useReadContracts({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contracts: (poolShares !== undefined && lpAmount > 0n
      ? [
          { address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'convertToAssets' as const, args: [lpAmount] as const },
          { address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'convertToAssets' as const, args: [poolShares] as const },
        ]
      : []) as any,
    query: { enabled: lpAmount > 0n && poolShares !== undefined },
  })

  if (lpAmount === 0n) return 0n
  if (!hzlSupply || hzlSupply === 0n) return lpAmount

  const lpValue      = (data?.[0]?.result ?? undefined) as bigint | undefined
  const totalPoolVal = (data?.[1]?.result ?? undefined) as bigint | undefined

  if (!lpValue || !totalPoolVal || totalPoolVal === 0n) return undefined

  return (lpValue * hzlSupply) / totalPoolVal
}
