'use client'

import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatItem } from '@/components/ui/StatItem'
import { Spinner } from '@/components/ui/Spinner'
import { useRevenueDistributor, useAssociations, useAssociationNames } from '@/hooks/useRevenueDistributor'
import { useVaultStats } from '@/hooks/useVaultStats'
import { formatUSDC, formatPercent } from '@/lib/format'
import { ADDRESSES } from '@/lib/contracts'

const PREVIEW_PENDING_VAULTS = [
  { symbol: 'hzETH' },
  { symbol: 'hzBTC' },
]

function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) return <div className="w-32 h-32 rounded-full bg-slate-200 dark:bg-[#1a2a1d]" />

  let offset = -90
  const cx = 50, cy = 50, r = 38, ir = 26
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const arc = (start: number, sweep: number) => {
    const s = toRad(start), e = toRad(start + sweep)
    const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s)
    const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e)
    const ix1 = cx + ir * Math.cos(s), iy1 = cy + ir * Math.sin(s)
    const ix2 = cx + ir * Math.cos(e), iy2 = cy + ir * Math.sin(e)
    const large = sweep > 180 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
  }

  return (
    <svg viewBox="0 0 100 100" className="w-32 h-32">
      {segments.map(seg => {
        const sweep = (seg.value / total) * 360
        const path = arc(offset, sweep - 0.5)
        offset += sweep
        return <path key={seg.label} d={path} fill={seg.color} />
      })}
    </svg>
  )
}

export default function ImpactPage() {
  const { treasuryWeight, assocWeight, insWeight, associationCount, pendingShares, isLoading } = useRevenueDistributor()
  const associations = useAssociations(associationCount)
  const associationNames = useAssociationNames()
  const { pricePerShare, feeRate } = useVaultStats()

  const pendingUSDC = pendingShares !== undefined && pricePerShare !== undefined
    ? (pendingShares * pricePerShare) / 1_000_000_000n
    : undefined

  const segments = [
    { label: 'Associations', value: assocWeight ?? 0,    color: '#10b981' },
    { label: 'Assurance',    value: insWeight ?? 0,     color: '#0ea5e9' },
    { label: 'Treasury',     value: treasuryWeight ?? 0, color: '#64748b' },
  ]

  const feeRatePct = feeRate !== undefined ? (Number(feeRate) / 100).toFixed(2) : '--'

  return (
    <div>
      <Header title="Impact" subtitle="Répartition des revenus & associations" />

      <div className="p-6 max-w-4xl space-y-6">

        {/* Distribution */}
        <Card>
          <CardHeader><CardTitle>Répartition de la performance fee</CardTitle></CardHeader>
          {isLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row items-center gap-10 mb-5">
                <DonutChart segments={segments} />
                <div className="flex-1 grid grid-cols-2 gap-4">
                  {[
                    { label: 'Associations socio-éducatives', value: assocWeight,    color: 'text-emerald-600 dark:text-emerald-400' },
                    { label: 'Fonds d\'assurance',            value: insWeight,     color: 'text-sky-600 dark:text-sky-400' },
                    { label: 'Treasury protocole',            value: treasuryWeight, color: 'text-slate-500 dark:text-slate-400' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex flex-col gap-0.5">
                      <p className={`text-xl font-bold font-mono ${color}`}>{formatPercent(value)}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-500">{label}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a2a1d] rounded-lg text-sm text-slate-600 dark:text-slate-400">
                <div>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{feeRatePct}%</span>
                  {' '}de performance fee est prélevée sur chaque harvest et répartie comme indiqué ci-dessus.
                  Les {100 - Number(feeRatePct)}% restants augmentent directement le prix par share (PPS) pour tous les holders.
                </div>
              </div>
            </>
          )}
        </Card>

        {/* Pending distribution */}
        <Card>
          <CardHeader><CardTitle>Shares en attente de distribution</CardTitle></CardHeader>
          <div className="space-y-2">
            {/* hzUSDC live */}
            <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-[#1e3025]">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">hzUSDC</span>
              <div className="text-right">
                <p className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">
                  {pendingShares !== undefined ? (Number(pendingShares) / 1e9).toFixed(3) : '--'} hzUSDC
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-600">≈ {formatUSDC(pendingUSDC)} USDC</p>
              </div>
            </div>
            {/* Preview vaults */}
            {PREVIEW_PENDING_VAULTS.map(v => (
              <div key={v.symbol} className="flex items-center justify-between py-2 opacity-50">
                <span className="text-sm text-slate-500">{v.symbol}</span>
                <span className="text-sm font-mono text-slate-400">0.000 <span className="text-xs">(à venir)</span></span>
              </div>
            ))}
          </div>
        </Card>

        {/* Associations */}
        <Card>
          <CardHeader>
            <CardTitle>Associations bénéficiaires</CardTitle>
            <span className="text-xs text-slate-500 dark:text-slate-500">{Number(associationCount ?? 0)} enregistrées</span>
          </CardHeader>
          {associations.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-500 text-center py-6">
              Aucune association enregistrée pour l&apos;instant
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1e3025]">
              {associations.map(a => {
                const name = associationNames[a.addr.toLowerCase()] ?? `Association ${a.index + 1}`
                return (
                  <div key={a.index} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{name}</p>
                      <p className="text-xs font-mono text-slate-400 dark:text-slate-600 break-all">{a.addr}</p>
                    </div>
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                      {(Number(a.weight) / 100).toFixed(2)} %
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <p className="text-xs text-slate-400 dark:text-slate-600 px-1">
          Les noms des associations sont gérés hors-chain. Les adresses et poids sont 100% on-chain et vérifiables.
        </p>
      </div>
    </div>
  )
}
