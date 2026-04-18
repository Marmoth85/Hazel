import { useAccount, useReadContracts } from 'wagmi'
import { type Address } from 'viem'
import { ADDRESSES, HZ_STABLE_ABI, ERC20_ABI } from '@/lib/contracts'

export function useUserPosition(vaultAddress?: Address, refetchInterval?: number | false) {
  const { address } = useAccount()
  const vault = vaultAddress ?? ADDRESSES.hzStable

  const { data, isLoading, refetch } = useReadContracts({
    contracts: address
      ? [
          { address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: 'balanceOf', args: [address] },
          { address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: 'allowance', args: [address, vault] },
          { address: vault, abi: HZ_STABLE_ABI, functionName: 'balanceOf', args: [address] },
          { address: vault, abi: HZ_STABLE_ABI, functionName: 'maxWithdraw', args: [address] },
          { address: vault, abi: HZ_STABLE_ABI, functionName: 'maxRedeem', args: [address] },
        ]
      : [],
    query: { enabled: !!address, refetchInterval: refetchInterval ?? false },
  })

  return {
    usdcBalance: (data?.[0]?.result ?? undefined) as bigint | undefined,
    usdcAllowance: (data?.[1]?.result ?? undefined) as bigint | undefined,
    hzBalance: (data?.[2]?.result ?? undefined) as bigint | undefined,
    maxWithdraw: (data?.[3]?.result ?? undefined) as bigint | undefined,
    maxRedeem: (data?.[4]?.result ?? undefined) as bigint | undefined,
    isLoading,
    refetch,
  }
}
