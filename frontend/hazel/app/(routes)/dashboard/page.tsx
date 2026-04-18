'use client'

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import Link from 'next/link'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatItem } from '@/components/ui/StatItem'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { Button } from '@/components/ui/Button'
import { useVaultStats } from '@/hooks/useVaultStats'
import { useBlockTimestamp } from '@/hooks/useBlockTimestamp'
import { useGovStaking } from '@/hooks/useGovStaking'
import { useUserPosition } from '@/hooks/useUserPosition'
import { useHZL } from '@/hooks/useHZL'
import { useVaultAPY } from '@/hooks/useVaultAPY'
import { useRevenueDistributor } from '@/hooks/useRevenueDistributor'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { formatUSDC, formatShares, formatPPS, formatPercent, formatCountdown } from '@/lib/format'
import { txErr } from '@/lib/errors'
import { getTierInfo } from '@/lib/tier'
import { ADDRESSES, HZ_STABLE_ABI } from '@/lib/contracts'
import { ChevronRightIcon, ArrowDownTrayIcon, LockClosedIcon, LayersIcon } from '@/components/icons'

export default function DashboardPage() {
  const { address, isConnected } = useAccount()
  const { totalAssets, pricePerShare, feeRate, secondsUntilHarvest, harvestReady } = useVaultStats()
  const { stakedAmount, weightedTimestamp, votingPower } = useGovStaking()
  const { usdcBalance, hzBalance, maxWithdraw } = useUserPosition()
  const { hzlBalance, hzlSupply, poolShares } = useHZL()
  const { assocWeight } = useRevenueDistributor()
  const apy = useVaultAPY(ADDRESSES.hzStable)
  const nowTs = useBlockTimestamp()
  const invalidateAll = useInvalidateAll()

  // ── Harvest (permissionless) ─────────────────────────────────────────────────
  const [harvestPending, setHarvestPending] = useState(false)
  const { mutateAsync: harvestAsync } = useWriteContract()
  const [harvestHash, setHarvestHash] = useState<`0x${string}` | undefined>()
  const { isLoading: harvestConfirming, isSuccess: harvestSuccess } = useWaitForTransactionReceipt({ hash: harvestHash })
  useEffect(() => {
    if (harvestSuccess) { invalidateAll(); toast.success('Harvest effectué') }
  }, [harvestSuccess, invalidateAll])
  const doHarvest = async () => {
    setHarvestPending(true)
    try { setHarvestHash(await harvestAsync({ address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'harvest', args: [] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setHarvestPending(false) }
  }

  // ── HZL value ────────────────────────────────────────────────────────────────
  const hzlUserLpShares = (hzlSupply && hzlSupply > 0n && hzlBalance && poolShares)
    ? (poolShares * hzlBalance) / hzlSupply
    : 0n

  const { data: hzlValueUsdc } = useReadContract({
    address: ADDRESSES.hzStable,
    abi: HZ_STABLE_ABI,
    functionName: 'convertToAssets',
    args: [hzlUserLpShares],
    query: { enabled: hzlUserLpShares > 0n },
  })

  // ── Harvest countdown ────────────────────────────────────────────────────────
  const [countdown, setCountdown] = useState(secondsUntilHarvest ?? 0)
  useEffect(() => {
    if (secondsUntilHarvest === undefined) return
    setCountdown(secondsUntilHarvest)
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [secondsUntilHarvest])

  // ── Derived values ───────────────────────────────────────────────────────────
  const effectiveTimestamp = (stakedAmount ?? 0n) === 0n ? undefined : weightedTimestamp
  const tierInfo = getTierInfo(effectiveTimestamp, nowTs)
  const positionUSDC = maxWithdraw

  // VP exprimé en USDC : VP_shares × PPS = position_USDC × multiplicateur_tier
  const vpUsdc = (votingPower !== undefined && pricePerShare !== undefined)
    ? (votingPower * pricePerShare) / 1_000_000_000n
    : undefined

  const hasPosition = isConnected && (
    (stakedAmount ?? 0n) > 0n ||
    (hzBalance ?? 0n) > 0n ||
    (hzlBalance ?? 0n) > 0n
  )

  const impactSharePct = (assocWeight !== undefined && feeRate !== undefined)
    ? (assocWeight / 10_000) * (Number(feeRate) / 10_000) * 100
    : null

  const showVaultCard = !isConnected || hasPosition

  return (
    <div>
      <Header
        title="Dashboard"
        subtitle={address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Wallet non connecté'}
      />

      <div className="p-6 space-y-6 max-w-6xl">

        {/* Vault card */}
        {showVaultCard ? (
          <Card>
            <CardHeader>
              <CardTitle>Vault hzUSDC</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant={harvestReady ? 'green' : 'gray'}>
                  <span className={`w-1.5 h-1.5 rounded-full ${harvestReady ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {harvestReady ? 'Harvest disponible' : `Harvest dans ${formatCountdown(countdown)}`}
                </Badge>
                {isConnected && (
                  <Button
                    size="sm"
                    variant={harvestReady ? 'primary' : 'secondary'}
                    disabled={!harvestReady}
                    loading={harvestPending || harvestConfirming}
                    onClick={doHarvest}
                  >
                    Harvest
                  </Button>
                )}
              </div>
            </CardHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <StatItem label="Total Value Locked" value={`${formatUSDC(totalAssets)} USDC`} />
              <StatItem label="Price per Share"    value={formatPPS(pricePerShare)} sub="USDC / hzUSDC" accent />
              <StatItem
                label="APY (7j)"
                value={apy !== null ? `${apy.toFixed(2)} %` : '--'}
                accent={apy !== null}
              />
              <StatItem
                label="Part impact"
                value={impactSharePct !== null ? `${impactSharePct.toFixed(2)} %` : '--'}
                sub={
                  apy !== null && impactSharePct !== null
                    ? `≈ ${(apy * impactSharePct / 100).toFixed(2)} % APY associations`
                    : 'du yield → associations'
                }
              />
            </div>
          </Card>
        ) : (
          <Card className="text-center py-10">
            <p className="text-slate-600 dark:text-slate-300 font-medium mb-2">
              Vous n&apos;avez pas encore de position active
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">
              Déposez des USDC pour commencer à générer du rendement à impact social.
            </p>
            <Link href="/vaults">
              <Button variant="primary" size="sm">
                <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                Déposer maintenant
              </Button>
            </Link>
          </Card>
        )}

        {/* Positions utilisateur */}
        {isConnected ? (
          hasPosition ? (
            <div className="grid md:grid-cols-2 gap-6">

              {/* Mes positions */}
              <Card>
                <CardHeader>
                  <CardTitle>Mes positions</CardTitle>
                </CardHeader>
                <div className="space-y-4">

                  {/* Par vault */}
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500 mb-2">Vaults</p>
                    <div className="rounded-lg border border-slate-100 dark:border-[#1e3025] overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#0f1a12]">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">hzUSDC</span>
                        <Badge variant="green">Live</Badge>
                      </div>
                      <div className="px-4 py-3 grid grid-cols-2 gap-3">
                        <StatItem label="Stakées" value={`${formatShares(stakedAmount)} hzUSDC`} accent />
                        <StatItem label="Valeur"  value={`${formatUSDC(positionUSDC)} USDC`} />
                      </div>
                    </div>
                  </div>

                  {/* Wallet global */}
                  <div>
                    <p className="text-xs uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500 mb-2">Wallet</p>
                    <div className="grid grid-cols-2 gap-3">
                      <StatItem label="Solde USDC"     value={`${formatUSDC(usdcBalance)} USDC`} />
                      {(hzBalance !== undefined && hzBalance > 0n) && (
                        <StatItem label="hzUSDC"       value={formatShares(hzBalance)} />
                      )}
                      {(hzlBalance !== undefined && hzlBalance > 0n) && (
                        <>
                          <StatItem label="HZL"        value={formatShares(hzlBalance)} />
                          <StatItem label="Valeur HZL" value={`≈ ${formatUSDC(hzlValueUsdc as bigint | undefined)} USDC`} accent />
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-[#1e3025]">
                  <Link href={`/deposit?vault=${ADDRESSES.hzStable}`}>
                    <Button size="sm" variant="primary">
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      Déposer
                    </Button>
                  </Link>
                  <Link href={`/withdraw?vault=${ADDRESSES.hzStable}`}>
                    <Button size="sm" variant="secondary">Retirer</Button>
                  </Link>
                </div>
              </Card>

              {/* Staking & Voting Power */}
              <Card>
                <CardHeader>
                  <CardTitle>Staking & Voting Power</CardTitle>
                </CardHeader>
                <div className="space-y-4">

                  {/* Score global — somme tous vaults */}
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-1">Score global</p>
                    <p className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {vpUsdc !== undefined ? formatUSDC(vpUsdc) : '--'}
                    </p>
                  </div>

                  {/* Par vault */}
                  <div className="rounded-lg border border-slate-100 dark:border-[#1e3025] overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-[#0f1a12]">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">hzUSDC</span>
                      <Badge variant="green">{tierInfo.tier.label} — ×{tierInfo.tier.multiplier}</Badge>
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      <div>
                        <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-0.5">Voting Power</p>
                        <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                          {vpUsdc !== undefined ? formatUSDC(vpUsdc) : '--'}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
                          {positionUSDC !== undefined
                            ? `${formatUSDC(positionUSDC)} USDC × ${tierInfo.tier.multiplier}`
                            : '--'}
                        </p>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mb-1.5">
                          <span>{tierInfo.tier.label}</span>
                          <span>{tierInfo.daysToNext !== null ? `${tierInfo.daysToNext}j → Tier ${tierInfo.tier.index + 1}` : 'Tier max'}</span>
                        </div>
                        <Progress value={tierInfo.progress} />
                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">{tierInfo.elapsedDays} jours stakés</p>
                      </div>
                    </div>
                  </div>

                  <Link href="/staking" className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
                    <LockClosedIcon className="w-3 h-3" />
                    Gérer mon staking
                    <ChevronRightIcon className="w-3 h-3" />
                  </Link>
                </div>
              </Card>
            </div>
          ) : null
        ) : (
          <Card className="text-center py-10">
            <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">
              Connectez votre wallet pour voir votre position
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-600">
              Les données du vault sont visibles sans connexion
            </p>
          </Card>
        )}

        {/* Quick actions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { href: '/deposit',  icon: ArrowDownTrayIcon, label: 'Déposer des USDC',    desc: 'Entrer dans le vault' },
            { href: '/staking',  icon: LockClosedIcon,    label: 'Gérer son staking',   desc: 'Tier & voting power' },
            { href: '/wrap',     icon: LayersIcon,        label: 'Liquidity avec HZL',  desc: 'Wrap / Unwrap / Redeem' },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}>
              <Card className="hover:border-emerald-300 dark:hover:border-emerald-800/60 transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{label}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">{desc}</p>
                  </div>
                  <ChevronRightIcon className="w-4 h-4 text-slate-400 dark:text-slate-600 ml-auto shrink-0 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
