import { useEffect, useState } from 'react'
import { usePublicClient } from 'wagmi'
import { type Address, parseAbiItem } from 'viem'
import { ADDRESSES, FROM_BLOCK } from '@/lib/contracts'

export function useVaultAPY(vaultAddress: Address = ADDRESSES.hzStable) {
  const client = usePublicClient()
  const [apy, setApy] = useState<number | null>(null)

  useEffect(() => {
    if (!client || !vaultAddress) return
    ;(async () => {
      try {
        const logs = await client.getLogs({
          address: vaultAddress,
          event: parseAbiItem('event Harvested(uint256 totalYield, uint256 sharesMinted, uint256 newPricePerShare)'),
          fromBlock: FROM_BLOCK,
        })

        const realHarvests = logs.filter(l => (l.args.sharesMinted as bigint) > 0n)
        if (realHarvests.length < 2) { setApy(null); return }

        const blocks = await Promise.all(
          realHarvests.map(l => client.getBlock({ blockNumber: l.blockNumber! }))
        )

        const apyPerPeriod: number[] = []

        for (let i = 1; i < realHarvests.length; i++) {
          const ppsPrev = Number(realHarvests[i - 1].args.newPricePerShare as bigint)
          const ppsCurr = Number(realHarvests[i].args.newPricePerShare as bigint)
          const tPrev = Number(blocks[i - 1].timestamp)
          const tCurr = Number(blocks[i].timestamp)

          const periodYears = (tCurr - tPrev) / (365 * 86400)
          if (periodYears <= 0 || ppsPrev <= 0) continue

          // variation du PPS entre deux harvests consécutifs
          const periodReturn = (ppsCurr - ppsPrev) / ppsPrev
          if (periodReturn <= 0) continue

          // APY composé : (1 + r)^(1/t) - 1
          const periodApy = Math.pow(1 + periodReturn, 1 / periodYears) - 1
          apyPerPeriod.push(periodApy)
        }

        if (apyPerPeriod.length === 0) { setApy(null); return }

        // moyenne des APY sur toutes les périodes disponibles
        const avg = apyPerPeriod.reduce((a, b) => a + b, 0) / apyPerPeriod.length
        setApy(Math.round(avg * 10_000) / 100)
      } catch { setApy(null) }
    })()
  }, [client, vaultAddress])

  return apy
}
