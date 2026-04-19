'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePublicClient, useAccount } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { parseAbiItem } from 'viem'
import { Footer } from '@/components/layout/Footer'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { NetworkBadge } from '@/components/layout/NetworkBadge'
import { LeafIcon } from '@/components/icons'
import { useVaultStats } from '@/hooks/useVaultStats'
import { useRevenueDistributor } from '@/hooks/useRevenueDistributor'
import { useVaultAPY } from '@/hooks/useVaultAPY'
import { formatUSDC, formatPercent } from '@/lib/format'
import { ADDRESSES, REVENUE_DISTRIBUTOR_ABI, FROM_BLOCK } from '@/lib/contracts'

function useTotalDistributed() {
  const client = usePublicClient()
  const { pricePerShare } = useVaultStats()
  const [value, setValue] = useState<bigint | null>(null)

  useEffect(() => {
    if (!client || !ADDRESSES.revenueDistributor) return
    ;(async () => {
      try {
        const logs = await client.getLogs({
          address: ADDRESSES.revenueDistributor,
          event: parseAbiItem('event RevenueDistributed(address indexed vault, uint256 totalShares, uint256 toTreasury, uint256 toAssociations, uint256 toInsurance)'),
          fromBlock: FROM_BLOCK,
        })
        const totalShares = logs.reduce((acc, l) => acc + (l.args.toAssociations as bigint), 0n)
        setValue(totalShares)
      } catch { setValue(null) }
    })()
  }, [client])

  if (value === null || !pricePerShare) return null
  return (value * pricePerShare) / 1_000_000_000n
}

export default function LandingPage() {
  const { isConnected } = useAccount()
  const { open } = useAppKit()
  const { totalAssets, feeRate } = useVaultStats()
  const { assocWeight, insWeight, treasuryWeight, associationCount } = useRevenueDistributor()
  const distributed = useTotalDistributed()
  const apy = useVaultAPY(ADDRESSES.hzStable)

  const impactSharePct = (assocWeight !== undefined && feeRate !== undefined)
    ? (assocWeight / 10_000) * (feeRate / 10_000) * 100
    : null
  const assocAPY = (apy !== null && impactSharePct !== null) ? apy * impactSharePct / 100 : null

  const stats = [
    {
      label: 'Total Value Locked',
      value: totalAssets !== undefined ? formatUSDC(totalAssets) : '--',
      unit: 'USDC',
      sub: undefined as string | undefined,
    },
    {
      label: 'Du yield → associations',
      value: impactSharePct !== null ? `${impactSharePct.toFixed(2)}%` : '--',
      unit: '',
      sub: assocAPY !== null ? `≈ ${assocAPY.toFixed(2)}% APY associations` : undefined,
    },
    {
      label: 'Distribué aux associations',
      value: distributed !== undefined && distributed !== null ? formatUSDC(distributed) : '--',
      unit: 'USDC',
      sub: undefined as string | undefined,
    },
    {
      label: 'Associations bénéficiaires',
      value: associationCount !== undefined ? String(Number(associationCount)) : '--',
      unit: '',
      sub: undefined as string | undefined,
    },
  ]

  const split = [
    {
      label: 'Associations',
      value: assocWeight,
      className: 'text-emerald-600 dark:text-emerald-400',
      sub: impactSharePct !== null ? `= ${impactSharePct.toFixed(2)}% du yield total` : undefined,
    },
    { label: 'Fonds assurance', value: insWeight,      className: 'text-sky-600 dark:text-sky-400',      sub: undefined as string | undefined },
    { label: 'Treasury',        value: treasuryWeight, className: 'text-slate-500 dark:text-slate-400',  sub: undefined as string | undefined },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-10 h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-[#1e3025] bg-white/80 dark:bg-[#0c1510]/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center">
            <LeafIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 dark:text-slate-100">Hazel</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          {isConnected ? (
            <Link
              href="/dashboard"
              className="text-sm font-medium px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              Ouvrir l&apos;app
            </Link>
          ) : (
            <button
              onClick={() => open()}
              className="text-sm font-medium px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors"
            >
              Se connecter
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-6 py-28 text-center">
          <NetworkBadge />

          <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 dark:text-slate-100 tracking-tight mb-6 leading-tight">
            Votre performance,{' '}
            <span className="text-emerald-600 dark:text-emerald-400">un impact réel</span>
          </h1>

          <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Allouez une partie de votre performance à l'impact - pas votre capital.
            Hazel  redistribue automatiquement une partie de la variation de valeur positive à des associations socio-éducatives — on-chain, transparent, sans intermédiaire.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/vaults"
              className="px-7 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors text-sm"
            >
              Participer maintenant
            </Link>
            <a
              href="#how"
              className="px-7 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium text-sm transition-colors"
            >
              Comment ça marche
            </a>
          </div>
        </section>

        {/* Key stats */}
        <section className="border-y border-slate-200 dark:border-[#1e3025] py-12 bg-white dark:bg-[#131f17]">
          <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {stats.map(({ label, value, unit, sub }) => (
              <div key={label}>
                <p className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                  {value}
                  {unit && <span className="text-base font-normal text-emerald-600 dark:text-emerald-400 ml-1">{unit}</span>}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{label}</p>
                {sub && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="max-w-4xl mx-auto px-6 py-24">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 text-center mb-3">
            Comment ça marche
          </h2>
          <p className="text-center text-slate-500 dark:text-slate-500 text-sm mb-14">
            Trois étapes, entièrement on-chain
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                n: '01',
                title: 'Déposez vos actifs',
                desc: 'Choisissez un vault ERC-4626 audité et déposez vos actifs. Vous recevez des LP shares qui représentent votre position, automatiquement stakées.',
              },
              {
                n: '02',
                title: 'Le yield s\'accumule',
                desc: 'À chaque harvest, le yield est collecté. La valorisation de vos shares augmente et votre voting power grandit avec l\'ancienneté de votre staking.',
              },
              {
                n: '03',
                title: 'L\'impact se crée',
                desc: 'Les fees sont distribuées automatiquement : associations socio-éducatives, fonds d\'assurance, treasury — vérifiable et gouverné on-chain.',
              },
            ].map(({ n, title, desc }) => (
              <div key={n} className="flex flex-col gap-4">
                <div className="w-10 h-10 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl flex items-center justify-center shrink-0">
                  <span className="text-emerald-700 dark:text-emerald-400 text-sm font-bold">{n}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">{title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Revenue split */}
        <section className="bg-white dark:bg-[#131f17] border-y border-slate-200 dark:border-[#1e3025] py-20 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 text-center mb-2">
              Répartition des revenus
            </h2>
            <p className="text-sm text-center text-slate-500 dark:text-slate-500 mb-12">
              {feeRate !== undefined
                ? `${(Number(feeRate) / 100).toFixed(2)}% de performance fee prélevée à chaque harvest, répartis comme suit`
                : 'Chaque harvest distribue les fees selon une répartition transparente'}
            </p>
            <div className="grid grid-cols-3 gap-4">
              {split.map(({ label, value, className, sub }) => (
                <div key={label} className="text-center p-5 rounded-xl bg-slate-50 dark:bg-[#0f1a12] border border-slate-100 dark:border-[#1e3025]">
                  <p className={`text-3xl font-bold mb-1.5 ${className}`}>
                    {value !== undefined ? formatPercent(value) : '--'}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">{label}</p>
                  {sub && <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="max-w-xl mx-auto px-6 py-24 text-center">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-4">
            Prêt à commencer ?
          </h2>
          <p className="text-slate-500 dark:text-slate-500 text-sm mb-8">
            Connectez votre wallet et déposez vos actifs en quelques secondes.
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors"
          >
            Ouvrir l&apos;application →
          </Link>
        </section>
      </main>

      <Footer />
    </div>
  )
}
