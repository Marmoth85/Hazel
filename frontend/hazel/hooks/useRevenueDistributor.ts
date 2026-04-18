import { useEffect, useState } from 'react'
import { useReadContracts, usePublicClient } from 'wagmi'
import { parseAbiItem } from 'viem'
import { ADDRESSES, REVENUE_DISTRIBUTOR_ABI, HZ_STABLE_ABI, FROM_BLOCK } from '@/lib/contracts'

export function useRevenueDistributor(refetchInterval?: number | false) {
  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      { address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'treasuryWeight' },
      { address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'associationWeight' },
      { address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'insuranceWeight' },
      { address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'associationCount' },
      { address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'totalAssocWeight' },
      { address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'balanceOf', args: [ADDRESSES.revenueDistributor] },
    ],
    query: { refetchInterval: refetchInterval ?? false },
  })

  const treasuryWeight = data?.[0].result as number | undefined
  const assocWeight = data?.[1].result as number | undefined
  const insWeight = data?.[2].result as number | undefined

  return {
    treasuryWeight,
    assocWeight,
    insWeight,
    associationCount: data?.[3].result as bigint | undefined,
    totalAssocWeight: data?.[4].result as bigint | undefined,
    pendingShares: data?.[5].result as bigint | undefined,
    isLoading,
    refetch,
  }
}

export function useAssociations(count: bigint | undefined, refetchInterval?: number | false) {
  const n = Number(count ?? 0n)
  const { data } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      address: ADDRESSES.revenueDistributor,
      abi: REVENUE_DISTRIBUTOR_ABI,
      functionName: 'associations' as const,
      args: [BigInt(i)] as const,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    })) as any,
    query: { enabled: n > 0, refetchInterval: refetchInterval ?? false },
  })

  return (data ?? []).map((d, i) => {
    const r = d.result as readonly [string, bigint] | undefined
    return { index: i, addr: r?.[0] ?? '', weight: r?.[1] ?? 0n }
  })
}

export function useAssociationNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({})
  const client = usePublicClient()

  useEffect(() => {
    if (!client || !ADDRESSES.revenueDistributor) return
    client.getLogs({
      address: ADDRESSES.revenueDistributor,
      event: parseAbiItem('event AssociationAdded(address indexed addr, string name)'),
      fromBlock: FROM_BLOCK,
    }).then(logs => {
      const map: Record<string, string> = {}
      for (const log of logs) {
        if (log.args.addr && log.args.name) {
          map[log.args.addr.toLowerCase()] = log.args.name
        }
      }
      setNames(map)
    }).catch(() => {})
  }, [client])

  return names
}
