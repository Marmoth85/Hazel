import { type Address } from 'viem'
import { useAccount, useReadContracts } from 'wagmi'
import { ADDRESSES, GOV_STAKING_ABI } from '@/lib/contracts'

export function useGovStaking(vault: Address = ADDRESSES.hzStable, refetchInterval?: number | false) {
  const { address } = useAccount()

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          { address: ADDRESSES.govStaking, abi: GOV_STAKING_ABI, functionName: 'stakes', args: [address, vault] },
          { address: ADDRESSES.govStaking, abi: GOV_STAKING_ABI, functionName: 'getVotingPower', args: [address, vault] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: refetchInterval ?? false },
  })

  const stakeInfo = (data?.[0]?.result ?? undefined) as readonly [bigint, bigint] | undefined

  return {
    stakedAmount: stakeInfo?.[0],
    weightedTimestamp: stakeInfo?.[1],
    votingPower: (data?.[1]?.result ?? undefined) as bigint | undefined,
    isLoading,
    refetch,
  }
}
