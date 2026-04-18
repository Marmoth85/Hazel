'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type Address } from 'viem'
import { useAccount } from 'wagmi'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { StatItem } from '@/components/ui/StatItem'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ChevronRightIcon } from '@/components/icons'
import { useVaultList, useVaultMeta } from '@/hooks/useVaultRegistry'
import { useUserPosition } from '@/hooks/useUserPosition'
import { useVaultAPY } from '@/hooks/useVaultAPY'
import { useRevenueDistributor } from '@/hooks/useRevenueDistributor'
import { formatUSDC, formatPPS, formatShares, formatAddress } from '@/lib/format'
import { ADDRESSES } from '@/lib/contracts'
import { HZ_STABLE_ABI } from '@/lib/contracts'
import { useReadContract } from 'wagmi'

const VAULT_INFO: Record<string, { desc: string; tag: string }> = {
  [ADDRESSES.hzStable?.toLowerCase()]: {
    desc: 'Vault USDC — rendement sur stablecoins',
    tag: 'Stable',
  },
}

const PREVIEW_VAULTS = [
  {
    name: 'Hazel ETH',
    symbol: 'hzETH',
    desc: 'Vault ETH — stratégie liquid staking',
    tag: 'Liquid staking',
    tvl: '1 284 500',
    apy: '4.8%',
    pps: '1.0312',
  },
  {
    name: 'Hazel BTC',
    symbol: 'hzBTC',
    desc: 'Vault BTC — stratégie yield native',
    tag: 'BTC yield',
    tvl: '432 000',
    apy: '3.2%',
    pps: '1.0081',
  },
]

function VaultCard({ vault, action }: { vault: Address; action: 'deposit' | 'withdraw' }) {
  const { address } = useAccount()
  const { name, symbol, totalAssets, pps, isLoading } = useVaultMeta(vault)
  const info = VAULT_INFO[vault.toLowerCase()] ?? { desc: 'Vault ERC-4626', tag: '' }
  const apy = useVaultAPY(vault)
  const { assocWeight, insWeight, treasuryWeight } = useRevenueDistributor()

  const { data: maxWithdraw } = useReadContract({
    address: vault,
    abi: HZ_STABLE_ABI,
    functionName: 'maxWithdraw',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { data: feeRate } = useReadContract({
    address: vault,
    abi: HZ_STABLE_ABI,
    functionName: 'feeRate',
  })

const impactPct = (assocWeight !== undefined && feeRate !== undefined)
    ? (assocWeight / 10_000) * (Number(feeRate) / 10_000) * 100
    : null

  if (action === 'withdraw' && address && maxWithdraw !== undefined && (maxWithdraw as bigint) === 0n) {
    return null
  }

  return (
    <Link href={`/${action}?vault=${vault}`} className="block">
      <Card className="hover:border-emerald-300 dark:hover:border-emerald-800/60 transition-all cursor-pointer group">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              {isLoading ? '--' : (name ?? formatAddress(vault))}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{info.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            {info.tag && <Badge variant="teal">{info.tag}</Badge>}
            <ChevronRightIcon className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
          </div>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-3"><Spinner size="sm" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatItem label="TVL"        value={`${formatUSDC(totalAssets)} USDC`} />
            <StatItem
              label="Ma position"
              value={address && maxWithdraw !== undefined ? `${formatUSDC(maxWithdraw as bigint)} USDC` : '--'}
              accent={address !== undefined && (maxWithdraw as bigint | undefined) !== undefined && (maxWithdraw as bigint) > 0n}
            />
            <StatItem label="APY (7j)"   value={apy !== null ? `${apy.toFixed(2)} %` : '--'} accent={apy !== null} />
            <StatItem
              label="Part impact"
              value={impactPct !== null ? `${impactPct.toFixed(2)} %` : '--'}
              sub={apy !== null && impactPct !== null ? `≈ ${(apy * impactPct / 100).toFixed(2)} % APY asso.` : 'du yield → asso.'}
            />
          </div>
        )}
        <p className="text-xs font-mono text-slate-400 dark:text-slate-600 mt-3">{vault}</p>
      </Card>
    </Link>
  )
}

function PreviewVaultCard({ vault }: { vault: typeof PREVIEW_VAULTS[number] }) {
  return (
    <div className="relative opacity-60 cursor-not-allowed select-none">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{vault.name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{vault.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="gray">{vault.tag}</Badge>
            <Badge variant="yellow">Bientôt</Badge>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatItem label="TVL"         value={`${vault.tvl} $`} />
          <StatItem label="Ma position" value="--" />
          <StatItem label="APY (7j)"    value={vault.apy} accent />
          <StatItem label="Part impact" value="--" sub="du yield → asso." />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-3 italic">Déploiement à venir</p>
      </Card>
    </div>
  )
}

export default function VaultsPage() {
  const params = useSearchParams()
  const action = (params.get('action') ?? 'deposit') as 'deposit' | 'withdraw'
  const { vaults, isLoading } = useVaultList()

  const subtitle = action === 'deposit'
    ? 'Choisissez un vault pour déposer'
    : 'Choisissez un vault pour retirer'

  return (
    <div>
      <Header title="Vaults" subtitle={subtitle} />

      <div className="p-6 max-w-4xl space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : vaults.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-sm text-slate-500 dark:text-slate-500">Aucun vault enregistré pour l&apos;instant</p>
          </Card>
        ) : (
          <>
            {vaults.map(v => <VaultCard key={v} vault={v} action={action} />)}
            {action === 'deposit' && PREVIEW_VAULTS.map(v => <PreviewVaultCard key={v.symbol} vault={v} />)}
          </>
        )}
      </div>
    </div>
  )
}
