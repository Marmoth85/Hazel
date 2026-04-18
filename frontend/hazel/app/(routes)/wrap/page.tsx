'use client'

import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { StatItem } from '@/components/ui/StatItem'
import { Badge } from '@/components/ui/Badge'
import { ExclamationTriangleIcon, InformationCircleIcon, CheckCircleIcon, LayersIcon } from '@/components/icons'
import { useGovStaking } from '@/hooks/useGovStaking'
import { useHZL, useHZLVaultPools, usePreviewWrap } from '@/hooks/useHZL'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { ADDRESSES, HAZEL_ABI } from '@/lib/contracts'
import { formatShares, toShareUnits } from '@/lib/format'
import { txErr } from '@/lib/errors'
import { getTierInfo } from '@/lib/tier'

type Tab = 'wrap' | 'redeem' | 'unwrap'

const LIVE_VAULTS = ADDRESSES.hzStable ? [ADDRESSES.hzStable] : [] as const
const LIVE_SYMBOLS: Record<string, string> = { [ADDRESSES.hzStable?.toLowerCase()]: 'hzUSDC' }

const PREVIEW_POOL_VAULTS = [
  { symbol: 'hzETH', poolShares: 0n },
  { symbol: 'hzBTC', poolShares: 0n },
]

function RedeemBreakdown({ hzlAmount, hzlSupply, livePools }: {
  hzlAmount: bigint
  hzlSupply: bigint | undefined
  livePools: { vault: `0x${string}`; poolShares: bigint }[]
}) {
  if (hzlAmount === 0n || !hzlSupply || hzlSupply === 0n) return null

  const rows = [
    ...livePools.map(({ vault, poolShares }) => ({
      symbol: LIVE_SYMBOLS[vault.toLowerCase()] ?? vault.slice(0, 6),
      shares: (poolShares * hzlAmount) / hzlSupply,
      preview: false,
    })),
    ...PREVIEW_POOL_VAULTS.map(v => ({ symbol: v.symbol, shares: 0n, preview: true })),
  ]

  return (
    <div className="rounded-lg border border-slate-200 dark:border-[#2a3d2e] bg-slate-50 dark:bg-[#1a2a1d] px-4 py-3 text-sm space-y-1.5">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">LP shares reçues</p>
      {rows.map(({ symbol, shares, preview }) => (
        <div key={symbol} className="flex items-center justify-between">
          <span className="text-slate-600 dark:text-slate-400">{symbol}</span>
          <span className={`font-mono font-semibold ${preview ? 'text-slate-400 dark:text-slate-600' : 'text-slate-900 dark:text-slate-100'}`}>
            {preview ? '0.000' : formatShares(shares)}
            {preview && <span className="text-xs ml-1 font-normal">(à venir)</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function WrapPage() {
  const { address } = useAccount()
  const [pollInterval, setPollInterval] = useState<number | false>(false)
  const { stakedAmount, weightedTimestamp } = useGovStaking()
  const { hzlBalance, hzlSupply, poolShares } = useHZL(pollInterval)
  const { pools: livePools } = useHZLVaultPools(LIVE_VAULTS as unknown as `0x${string}`[], pollInterval)
  const invalidateAll = useInvalidateAll()
  const [tab, setTab] = useState<Tab>('wrap')
  const [amount, setAmount] = useState('')
  const [confirmed, setConfirmed] = useState(false)

  const tierInfo = getTierInfo(weightedTimestamp)
  const amountBn = toShareUnits(amount)
  const previewWrap = usePreviewWrap(tab === 'wrap' ? amountBn : 0n)

  const [submittedTab, setSubmittedTab] = useState<Tab>('wrap')

  const [pending, setPending] = useState(false)
  const { mutateAsync } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (!isSuccess) return
    setAmount(''); setConfirmed(false)
    setPollInterval(2000)
    invalidateAll()
    toast.success(
      submittedTab === 'wrap'   ? 'Wrap effectué — HZL dans votre wallet' :
      submittedTab === 'redeem' ? 'Redeem effectué — LP shares dans votre wallet' :
                                 'Unwrap effectué — LP shares re-stakées'
    )
  }, [isSuccess]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pollInterval === false) return
    const t = setTimeout(() => setPollInterval(false), 10_000)
    return () => clearTimeout(t)
  }, [pollInterval])

  const handleSubmit = async () => {
    if (!address) return
    setSubmittedTab(tab)
    setPending(true)
    try {
      if (tab === 'wrap')   setHash(await mutateAsync({ address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'wrap',   args: [ADDRESSES.hzStable, amountBn] }))
      if (tab === 'redeem') setHash(await mutateAsync({ address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'redeem', args: [amountBn] }))
      if (tab === 'unwrap') setHash(await mutateAsync({ address: ADDRESSES.hazel, abi: HAZEL_ABI, functionName: 'unwrap', args: [amountBn] }))
    } catch (e) { toast.error(txErr(e)) }
    finally { setPending(false) }
  }

  const maxAmount    = tab === 'wrap' ? stakedAmount : hzlBalance
  const insufficient = maxAmount !== undefined && amountBn > 0n && amountBn > maxAmount
  const canSubmit    = address && amountBn > 0n && !insufficient && (tab !== 'wrap' || confirmed)

  const totalPoolShares = livePools.reduce((acc, { poolShares: ps }) => acc + ps, 0n)

  return (
    <div>
      <Header title="HZL" subtitle="Wrap · Redeem · Unwrap" />

      <div className="p-6 max-w-4xl space-y-5">
        {isSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            {submittedTab === 'wrap'   && 'Wrap effectué. Vos HZL sont dans votre wallet.'}
            {submittedTab === 'redeem' && 'Redeem effectué. Vos LP shares sont dans votre wallet.'}
            {submittedTab === 'unwrap' && 'Unwrap effectué. Vos LP shares sont re-stakées dans GovStaking.'}
          </div>
        )}

        {/* HZL pool stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card><StatItem label="Supply HZL"   value={formatShares(hzlSupply)} /></Card>
          <Card><StatItem label="Pool total"   value={formatShares(totalPoolShares)} /></Card>
          <Card><StatItem label="Mes HZL"      value={formatShares(hzlBalance)} accent /></Card>
        </div>

        {/* Pool breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Composition du pool</CardTitle>
          </CardHeader>
          <div className="space-y-2">
            {livePools.map(({ vault, poolShares: ps }) => (
              <div key={vault} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">{LIVE_SYMBOLS[vault.toLowerCase()] ?? vault.slice(0, 8)}</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatShares(ps)}</span>
              </div>
            ))}
            {PREVIEW_POOL_VAULTS.map(v => (
              <div key={v.symbol} className="flex items-center justify-between text-sm opacity-50">
                <span className="text-slate-500">{v.symbol}</span>
                <span className="font-mono text-slate-400">0.000 <span className="text-xs font-normal">(à venir)</span></span>
              </div>
            ))}
          </div>
        </Card>

        {/* Tab selector */}
        <div className="flex rounded-lg border border-slate-200 dark:border-[#1e3025] overflow-hidden bg-white dark:bg-[#131f17] text-sm">
          {(['wrap', 'redeem', 'unwrap'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setAmount(''); setConfirmed(false); setHash(undefined) }}
              className={`flex-1 py-2.5 font-medium capitalize transition-all ${
                tab === t ? 'bg-emerald-600 text-white' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2a1d]'
              }`}
            >
              {t === 'wrap' ? 'Wrap' : t === 'redeem' ? 'Redeem' : 'Unwrap'}
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {tab === 'wrap'   && 'LP shares → HZL'}
              {tab === 'redeem' && 'HZL → LP shares (wallet)'}
              {tab === 'unwrap' && 'HZL → LP shares (restake direct)'}
            </CardTitle>
            {tab === 'wrap' && <Badge variant="yellow">Tier {tierInfo.tier.label}</Badge>}
          </CardHeader>

          <div className="space-y-4">
            {tab === 'wrap' && (
              <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl text-sm text-amber-700 dark:text-amber-400">
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium mb-1">Action irréversible</p>
                  <p>Vous perdrez définitivement votre ancienneté (<strong>{tierInfo.tier.label} — ×{tierInfo.tier.multiplier}</strong>).</p>
                </div>
              </div>
            )}

            {tab === 'redeem' && (
              <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a2a1d] border border-slate-200 dark:border-[#2a3d2e] rounded-xl text-sm text-slate-600 dark:text-slate-400">
                <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                Vous récupérez des <strong>LP shares dans votre wallet</strong>. Pour retirer en USDC, allez ensuite sur <strong>/withdraw</strong>.
              </div>
            )}

            {tab === 'unwrap' && (
              <div className="flex items-start gap-3 px-4 py-3 bg-slate-50 dark:bg-[#1a2a1d] border border-slate-200 dark:border-[#2a3d2e] rounded-xl text-sm text-slate-600 dark:text-slate-400">
                <InformationCircleIcon className="w-5 h-5 shrink-0 mt-0.5" />
                Les LP shares sont re-stakées <strong>directement dans GovStaking</strong>. Votre ancienneté repart à zéro (Tier 0).
              </div>
            )}

            <Input
              label={tab === 'wrap' ? 'hzUSDC stakés à wrapper' : 'HZL à brûler'}
              type="number" placeholder="0.0000"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              suffix={tab === 'wrap' ? 'hzUSDC' : 'HZL'}
              onMax={() => maxAmount && setAmount((Number(maxAmount) / 1e9).toString())}
              hint={`Disponible : ${formatShares(maxAmount)} ${tab === 'wrap' ? 'hzUSDC stakés' : 'HZL'}`}
              error={insufficient ? 'Montant insuffisant' : undefined}
            />

            {tab === 'wrap' && previewWrap !== undefined && amountBn > 0n && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1a2a1d] rounded-lg px-4 py-3">
                <LayersIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                Vous recevrez ≈ <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 mx-1">{formatShares(previewWrap)}</span> HZL
              </div>
            )}

            {(tab === 'redeem' || tab === 'unwrap') && amountBn > 0n && (
              <RedeemBreakdown
                hzlAmount={amountBn}
                hzlSupply={hzlSupply}
                livePools={livePools}
              />
            )}

            {tab === 'wrap' && amountBn > 0n && (
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={e => setConfirmed(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Je comprends que je perds mon ancienneté de staking de manière irréversible
                </span>
              </label>
            )}

            <Button
              onClick={handleSubmit}
              loading={pending || confirming}
              disabled={!canSubmit}
              variant={tab === 'wrap' ? 'danger' : 'primary'}
              className="w-full"
            >
              {confirming ? 'Confirmation…' :
                tab === 'wrap'   ? 'Wrapper en HZL' :
                tab === 'redeem' ? 'Redeem → LP shares' :
                'Unwrap → Restaker'}
            </Button>

            {!address && (
              <p className="text-xs text-center text-slate-500 dark:text-slate-500">
                Connectez votre wallet pour continuer
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
