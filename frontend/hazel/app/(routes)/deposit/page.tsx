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
import { useVaultStats } from '@/hooks/useVaultStats'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { HZ_STABLE_ABI, ERC20_ABI, ADDRESSES } from '@/lib/contracts'
import { formatUSDC, formatShares, formatPPS, toUSDCUnits } from '@/lib/format'
import { txErr } from '@/lib/errors'

export default function DepositPage() {
  const router = useRouter()
  const params = useSearchParams()
  const vaultParam = params.get('vault') as Address | null

  useEffect(() => {
    if (!vaultParam) router.replace('/vaults')
  }, [vaultParam, router])

  const vault = vaultParam ?? ADDRESSES.hzStable

  const { address } = useAccount()
  const { usdcBalance, usdcAllowance, maxWithdraw, maxRedeem } = useUserPosition(vault)
  const { pricePerShare, totalAssets } = useVaultStats(vault)
  const invalidateAll = useInvalidateAll()
  const [amount, setAmount] = useState('')
  const [approvedAmount, setApprovedAmount] = useState<bigint>(0n)
  const [totalAssetsDelta, setTotalAssetsDelta] = useState<bigint>(0n)
  const displayTotalAssets = totalAssets !== undefined ? totalAssets + totalAssetsDelta : totalAssets

  const amountBn = toUSDCUnits(amount)
  const needsApproval = amountBn > (usdcAllowance ?? 0n) && amountBn > approvedAmount

  const { data: previewData } = useReadContract({
    address: vault,
    abi: HZ_STABLE_ABI,
    functionName: 'previewDeposit',
    args: [amountBn],
    query: { enabled: amountBn > 0n },
  })
  const previewShares = previewData as bigint | undefined

  const [approvePending, setApprovePending] = useState(false)
  const { mutateAsync: approveAsync } = useWriteContract()
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const [submittedApproveAmount, setSubmittedApproveAmount] = useState<bigint>(0n)
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  useEffect(() => {
    if (approveSuccess) { setApprovedAmount(submittedApproveAmount); invalidateAll(); toast.success('Approbation confirmée') }
  }, [approveSuccess, invalidateAll, submittedApproveAmount])
  const handleApprove = async () => {
    const approveAmt = amountBn
    setSubmittedApproveAmount(approveAmt)
    setApprovePending(true)
    try { setApproveHash(await approveAsync({ address: ADDRESSES.usdc, abi: ERC20_ABI, functionName: 'approve', args: [vault, approveAmt] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setApprovePending(false) }
  }

  const [usdcDelta, setUsdcDelta] = useState<bigint>(0n)
  const displayUsdcBalance = usdcBalance !== undefined ? usdcBalance - usdcDelta : usdcBalance

  const [submittedDeposit, setSubmittedDeposit] = useState<bigint>(0n)
  const [depositPending, setDepositPending] = useState(false)
  const { mutateAsync: depositAsync } = useWriteContract()
  const [depositHash, setDepositHash] = useState<`0x${string}` | undefined>()
  const { isLoading: depositConfirming, isSuccess: depositSuccess } = useWaitForTransactionReceipt({ hash: depositHash })
  useEffect(() => {
    if (depositSuccess) { setUsdcDelta(d => d + submittedDeposit); setTotalAssetsDelta(d => d + submittedDeposit); setApprovedAmount(0n); setAmount(''); invalidateAll(); toast.success('Dépôt effectué — shares stakées automatiquement') }
  }, [depositSuccess, invalidateAll, submittedDeposit])
  const handleDeposit = async () => {
    if (!address) return
    setSubmittedDeposit(amountBn)
    setDepositPending(true)
    try { setDepositHash(await depositAsync({ address: vault, abi: HZ_STABLE_ABI, functionName: 'deposit', args: [amountBn, address] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setDepositPending(false) }
  }

  const insufficient = displayUsdcBalance !== undefined && amountBn > displayUsdcBalance

  if (!vaultParam) return null

  return (
    <div>
      <Header title="Déposer" subtitle="USDC → LP shares" />

      <div className="p-6 max-w-4xl space-y-4">

        <Link
          href="/vaults"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          Retour à la sélection
        </Link>

        {depositSuccess && (
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-emerald-700 dark:text-emerald-400 text-sm">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            Dépôt effectué avec succès. Vos shares sont stakées automatiquement.
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">

          {/* Formulaire */}
          <div className="space-y-5">
            <Card>
              <CardHeader><CardTitle>Montant à déposer</CardTitle></CardHeader>

              <div className="space-y-4">
                <Input
                  label="Montant USDC"
                  type="number"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  suffix="USDC"
                  onMax={() => usdcBalance && setAmount((Number(usdcBalance) / 1e6).toString())}
                  hint={`Disponible : ${formatUSDC(displayUsdcBalance)} USDC`}
                  error={insufficient ? 'Solde USDC insuffisant' : undefined}
                />

                {previewShares !== undefined && amountBn > 0n && (
                  <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1a2a1d] rounded-lg px-4 py-3">
                    <InformationCircleIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                    Vous recevrez ≈ <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 mx-1">{formatShares(previewShares)}</span> shares
                    (auto-stakées dans GovStaking)
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  {needsApproval && (
                    <Button
                      variant="secondary"
                      onClick={handleApprove}
                      loading={approvePending || approveConfirming}
                      disabled={!address || amountBn === 0n || insufficient}
                    >
                      {approveConfirming ? 'Confirmation…' : 'Approuver USDC'}
                    </Button>
                  )}
                  <Button
                    onClick={handleDeposit}
                    loading={depositPending || depositConfirming}
                    disabled={!address || amountBn === 0n || needsApproval || insufficient}
                    className="flex-1"
                  >
                    {depositConfirming ? 'Confirmation…' : 'Déposer'}
                  </Button>
                </div>

                {!address && (
                  <p className="text-xs text-center text-slate-500 dark:text-slate-500">
                    Connectez votre wallet pour déposer
                  </p>
                )}
              </div>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <Card>
              <CardTitle className="mb-5">Ma position</CardTitle>
              <div className="space-y-4">
                <StatItem label="Valeur en dépôt"  value={`${formatUSDC(maxWithdraw)} USDC`} accent />
                <StatItem label="En shares"        value={`${formatShares(maxRedeem)} shares`} />
              </div>
              <div className="my-5 border-t border-slate-100 dark:border-[#1e3025]" />
              <div className="space-y-4">
                <StatItem label="TVL"              value={`${formatUSDC(displayTotalAssets)} USDC`} />
                <StatItem label="Price per share"  value={formatPPS(pricePerShare)} sub="USDC" />
              </div>
              <p className="text-xs font-mono text-slate-400 dark:text-slate-600 mt-5 break-all">{vault}</p>
            </Card>

            <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-500 px-1">
              <InformationCircleIcon className="w-4 h-4 shrink-0 mt-0.5" />
              Vos shares sont automatiquement stakées dans GovStaking après le dépôt.
              Elles ne transiteront pas par votre wallet.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
