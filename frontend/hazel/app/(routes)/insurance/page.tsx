'use client'

import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { StatItem } from '@/components/ui/StatItem'
import { Spinner } from '@/components/ui/Spinner'
import { Badge } from '@/components/ui/Badge'
import { ShieldCheckIcon, InformationCircleIcon } from '@/components/icons'
import { useInsuranceFund } from '@/hooks/useInsuranceFund'
import { formatUSDC, formatShares } from '@/lib/format'
import { ADDRESSES } from '@/lib/contracts'

export default function InsurancePage() {
  const { sharesBalance, usdcValue, isLoading } = useInsuranceFund()

  return (
    <div>
      <Header title="Fonds d'assurance" subtitle="Réserve de sécurité du protocole" />

      <div className="p-6 max-w-4xl space-y-5">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-sky-50 dark:bg-sky-900/20 rounded-xl flex items-center justify-center shrink-0">
                <ShieldCheckIcon className="w-5 h-5 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900 dark:text-slate-100">Insurance Fund</h2>
                <p className="text-xs text-slate-500 dark:text-slate-500">Accumule 10% des fees à chaque harvest</p>
              </div>
            </div>
            {!isLoading && (
              <div className="text-right">
                <p className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wide">Valeur totale</p>
                <p className="text-lg font-bold font-mono text-sky-600 dark:text-sky-400">{formatUSDC(usdcValue)} USDC</p>
              </div>
            )}
          </CardHeader>

          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#1e3025]">
              {/* hzUSDC — live */}
              <div className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">hzUSDC</span>
                    <Badge variant="green">Live</Badge>
                  </div>
                  <span className="text-sm font-mono font-semibold text-sky-600 dark:text-sky-400">
                    {formatUSDC(usdcValue)} USDC
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <StatItem label="Réserve (hzUSDC)" value={`${formatShares(sharesBalance)} hzUSDC`} />
                  <StatItem label="Valeur USDC"       value={`${formatUSDC(usdcValue)} USDC`} accent />
                </div>
              </div>

              {/* hzETH — preview */}
              <div className="py-3 opacity-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">hzETH</span>
                    <Badge variant="yellow">Bientôt</Badge>
                  </div>
                  <span className="text-sm font-mono text-slate-400">0.000 USDC</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <StatItem label="Réserve (hzETH)" value="0.000 hzETH" />
                  <StatItem label="Valeur USDC"      value="0.000 USDC" />
                </div>
              </div>

              {/* hzBTC — preview */}
              <div className="py-3 opacity-50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">hzBTC</span>
                    <Badge variant="yellow">Bientôt</Badge>
                  </div>
                  <span className="text-sm font-mono text-slate-400">0.000 USDC</span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <StatItem label="Réserve (hzBTC)" value="0.000 hzBTC" />
                  <StatItem label="Valeur USDC"      value="0.000 USDC" />
                </div>
              </div>
            </div>
          )}

          <p className="text-xs font-mono text-slate-400 dark:text-slate-600 mt-4 pt-4 border-t border-slate-100 dark:border-[#1e3025] break-all">
            {ADDRESSES.insuranceFund}
          </p>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comment ça marche</CardTitle></CardHeader>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>Le fonds d&apos;assurance accumule <strong className="text-slate-900 dark:text-slate-200">10% des fees</strong> générées à chaque harvest sous forme de hzUSDC shares.</p>
            <p>En cas de depeg ou d&apos;exploit d&apos;un protocole externe, l&apos;owner peut déclencher un <code className="font-mono text-xs bg-slate-100 dark:bg-[#1a2a1d] px-1.5 py-0.5 rounded">payout(to, amount)</code> pour compenser les utilisateurs affectés.</p>
            <p>Les bénéficiaires reçoivent des hzUSDC shares qu&apos;ils peuvent ensuite retirer via le vault.</p>
          </div>
        </Card>

        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-500 px-1">
          <InformationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
          Page en lecture seule. Les actions sont réservées à l&apos;owner via <a href="/admin" className="text-emerald-600 dark:text-emerald-400 hover:underline">/admin</a>.
        </div>
      </div>
    </div>
  )
}
