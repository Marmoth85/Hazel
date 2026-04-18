'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { type Address } from 'viem'
import Link from 'next/link'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { StatItem } from '@/components/ui/StatItem'
import { InformationCircleIcon, CheckCircleIcon, ArrowLeftIcon } from '@/components/icons'
import { useUserPosition } from '@/hooks/useUserPosition'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { HZ_STABLE_ABI, ADDRESSES } from '@/lib/contracts'
import { formatUSDC, formatShares, toUSDCUnits, toShareUnits } from '@/lib/format'
import { txErr } from '@/lib/errors'

type Mode = 'withdraw' | 'redeem'

export default function WithdrawPage() {
  const router = useRouter()
  const params = useSearchParams()
  const vaultParam = params.get('vault') as Address | null

  useEffect(() => {
    if (!vaultParam) router.replace('/vaults?action=withdraw')
  }, [vaultParam, router])

  const vault = vaultParam ?? ADDRESSES.hzStable

  const { address } = useAccount()
  const { maxWithdraw, maxRedeem } = useUserPosition(vault)
  const invalidateAll = useInvalidateAll()
  const [mode, setMode] = useState<Mode>('redeem')
  const [amount, setAmount] = useState('')

  const amountBn = mode === 'withdraw' ? toUSDCUnits(amount) : toShareUnits(amount)

  const { data: previewData } = useReadContract({
    address: vault,
    abi: HZ_STABLE_ABI,
    functionName: mode === 'withdraw' ? 'previewWithdraw' : 'previewRedeem',
    args: [amountBn],
    query: { enabled: amountBn > 0n },
  })

  const [maxWithdrawDelta, setMaxWithdrawDelta] = useState<bigint>(0n)
  const [maxRedeemDelta, setMaxRedeemDelta]     = useState<bigint>(0n)
  const displayMaxWithdraw = maxWithdraw !== undefined ? maxWithdraw - maxWithdrawDelta : maxWithdraw
  const displayMaxRedeem   = maxRedeem   !== undefined ? maxRedeem   - maxRedeemDelta   : maxRedeem

  const [submittedMode, setSubmittedMode]       = useState<Mode>('withdraw')
  const [submittedAmount, setSubmittedAmount]   = useState<bigint>(0n)
  const [submittedPreview, setSubmittedPreview] = useState<bigint>(0n)

  const [pending, setPending] = useState(false)
  const { mutateAsync } = useWriteContract()
  const [hash, setHash] = useState<`0x${string}` | undefined>()
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  useEffect(() => {
    if (isSuccess) {
      if (submittedMode === 'withdraw') { setMaxWithdrawDelta(d => d + submittedAmount); setMaxRedeemDelta(d => d + submittedPreview) }
      else                              { setMaxRedeemDelta(d => d + submittedAmount);   setMaxWithdrawDelta(d => d + submittedPreview) }
      setAmount(''); invalidateAll(); toast.success('Retrait effectué')
    }
  }, [isSuccess, invalidateAll, submittedMode, submittedAmount, submittedPreview])

  const handleSubmit = async () => {
    if (!address) return
    setSubmittedMode(mode)
    setSubmittedAmount(amountBn)
    setSubmittedPreview((previewData as bigint) ?? 0n)
    setPending(true)
    try {
      if (mode === 'withdraw') setHash(await mutateAsync({ address: vault, abi: HZ_STABLE_ABI, functionName: 'withdraw', args: [amountBn, address, address] }))
      else                     setHash(await mutateAsync({ address: vault, abi: HZ_STABLE_ABI, functionName: 'redeem',   args: [amountBn, address, address] }))
    } catch (e) { toast.error(txErr(e)) }
    finally { setPending(false) }
  }

  const max = mode === 'withdraw' ? displayMaxWithdraw : displayMaxRedeem
  const insufficient = max !== undefined && amountBn > 0n && amountBn > max

  if (!vaultParam) return null

  return (
    <div>
      <Header title="Retirer" subtitle="LP shares → USDC" />

      <div className="p-6 max-w-4xl space-y-4">

        <Link
          href="/vaults?action=withdraw"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Retour à la sélection
        </Link>

        {isSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            Retrait effectué avec succès.
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">

          {/* Formulaire */}
          <div className="space-y-5">

            <div className="flex rounded-lg border border-slate-200 dark:border-[#1e3025] overflow-hidden bg-white dark:bg-[#131f17] text-sm">
              {(['withdraw', 'redeem'] as Mode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setAmount('') }}
                  className={`flex-1 py-2.5 font-medium transition-all ${
                    mode === m
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2a1d]'
                  }`}
                >
                  {m === 'withdraw' ? 'Retirer en USDC' : 'Par LP shares'}
                </button>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>
                  {mode === 'withdraw' ? 'Montant USDC à recevoir' : 'LP shares à rembourser'}
                </CardTitle>
              </CardHeader>

              <div className="space-y-4">
                <Input
                  label={mode === 'withdraw' ? 'Montant USDC' : 'Montant en shares'}
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  suffix={mode === 'withdraw' ? 'USDC' : 'shares'}
                  onMax={() => max && setAmount((Number(max) / (mode === 'withdraw' ? 1e6 : 1e9)).toString())}
                  hint={`Maximum : ${mode === 'withdraw' ? formatUSDC(displayMaxWithdraw) + ' USDC' : formatShares(displayMaxRedeem) + ' shares'}`}
                  error={insufficient ? 'Dépasse votre position disponible' : undefined}
                />

                {previewData !== undefined && amountBn > 0n && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1a2a1d] rounded-lg px-4 py-3">
                    <InformationCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    {mode === 'withdraw'
                      ? <>Shares brûlées ≈ <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 mx-1">{formatShares(previewData as bigint)}</span> shares</>
                      : <>Vous recevrez ≈ <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 mx-1">{formatUSDC(previewData as bigint)}</span> USDC</>
                    }
                  </div>
                )}

                <Button
                  onClick={handleSubmit}
                  loading={pending || confirming}
                  disabled={!address || amountBn === 0n || insufficient}
                  className="w-full"
                >
                  {confirming ? 'Confirmation…' : mode === 'withdraw' ? 'Retirer en USDC' : 'Rembourser les shares'}
                </Button>

                {!address && (
                  <p className="text-xs text-center text-slate-500 dark:text-slate-500">
                    Connectez votre wallet pour retirer
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <Card>
              <CardTitle className="mb-4">Votre position</CardTitle>
              <div className="space-y-4">
                <StatItem label="Max retirable"  value={`${formatUSDC(displayMaxWithdraw)} USDC`} accent />
                <StatItem label="Max (en shares)" value={`${formatShares(displayMaxRedeem)} shares`} />
              </div>
              <p className="text-xs font-mono text-slate-400 dark:text-slate-600 mt-4 break-all">{vault}</p>
            </Card>

            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-500 px-1">
              <InformationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
              L&apos;unstake est effectué automatiquement par le vault lors du retrait.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
