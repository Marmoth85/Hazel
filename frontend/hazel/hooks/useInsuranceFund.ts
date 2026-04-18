import { useReadContract, useReadContracts } from 'wagmi'
import { ADDRESSES, INSURANCE_FUND_ABI, HZ_STABLE_ABI } from '@/lib/contracts'

export function useInsuranceFund() {
  const { data: balData, isLoading } = useReadContracts({
    contracts: [
      { address: ADDRESSES.insuranceFund, abi: INSURANCE_FUND_ABI, functionName: 'sharesBalance' },
    ],
  })

  const sharesBalance = (balData?.[0]?.result ?? undefined) as bigint | undefined

  const { data: usdcValue } = useReadContract({
    address: ADDRESSES.hzStable,
    abi: HZ_STABLE_ABI,
    functionName: 'convertToAssets',
    args: sharesBalance && sharesBalance > 0n ? [sharesBalance] : undefined,
    query: { enabled: !!sharesBalance && sharesBalance > 0n },
  })

  return {
    sharesBalance,
    usdcValue: usdcValue as bigint | undefined,
    isLoading,
  }
}
