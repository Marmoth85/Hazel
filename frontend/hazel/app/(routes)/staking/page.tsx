'use client'

import { useState, useEffect } from 'react'
import { type Address } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { StatItem } from '@/components/ui/StatItem'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { InformationCircleIcon, CheckCircleIcon } from '@/components/icons'
import { useGovStaking } from '@/hooks/useGovStaking'
import { useUserPosition } from '@/hooks/useUserPosition'
import { useVaultMeta } from '@/hooks/useVaultRegistry'
import { useVaultStats } from '@/hooks/useVaultStats'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { useBlockTimestamp } from '@/hooks/useBlockTimestamp'
import { ADDRESSES, GOV_STAKING_ABI, HZ_STABLE_ABI, ERC20_ABI } from '@/lib/contracts'
import { formatShares, formatUSDC, toShareUnits } from '@/lib/format'
import { txErr } from '@/lib/errors'
import { getTierInfo, TIER_BANDS } from '@/lib/tier'

const PREVIEW_VAULTS = [
  { symbol: 'hzETH', name: 'Hazel ETH', desc: 'Vault ETH — liquid staking', tag: 'Bientôt' },
  { symbol: 'hzBTC', name: 'Hazel BTC', desc: 'Vault BTC — yield natif',    tag: 'Bientôt' },
]

function VaultStakingSection({ vault }: { vault: Address }) {
  const { address } = useAccount()
  const { name, symbol } = useVaultMeta(vault)
  const [pollInterval, setPollInterval] = useState<number | false>(false)
  const { stakedAmount, weightedTimestamp, votingPower } = useGovStaking(vault, pollInterval)
  const { hzBalance, maxWithdraw } = useUserPosition(vault, pollInterval)
  const { pricePerShare } = useVaultStats(vault)
  const invalidateAll = useInvalidateAll()
  const nowTs = useBlockTimestamp()

  const [mode, setMode] = useState<'stake' | 'unstake'>('stake')
  const [stakeAmount, setStakeAmount]     = useState('')
  const [unstakeAmount, setUnstakeAmount] = useState('')

  const tierInfo = getTierInfo(weightedTimestamp, nowTs)
  const vpUsdc = (votingPower !== undefined && pricePerShare !== undefined)
    ? (votingPower * pricePerShare) / 1_000_000_000n
    : undefined
  const stakeBn   = toShareUnits(stakeAmount)
  const unstakeBn = toShareUnits(unstakeAmount)

  const displayStaked    = stakedAmount
  const displayHzBalance = hzBalance

  useEffect(() => {
    if (pollInterval === false) return
    const t = setTimeout(() => setPollInterval(false), 10_000)
    return () => clearTimeout(t)
  }, [pollInterval])

  const { data: hzAllowance } = useReadContract({
    address: vault,
    abi: HZ_STABLE_ABI,
    functionName: 'allowance',
    args: address ? [address, ADDRESSES.govStaking] : undefined,
    query: { enabled: !!address },
  })
  const [approvedStakeAmount, setApprovedStakeAmount] = useState<bigint>(0n)
  const [submittedApproveStake, setSubmittedApproveStake] = useState<bigint>(0n)
  const needsApproval = stakeBn > ((hzAllowance as bigint) ?? 0n) && stakeBn > approvedStakeAmount

  const [approvePending, setApprovePending] = useState(false)
  const { mutateAsync: approveAsync } = useWriteContract()
  const [approveHash, setApproveHash] = useState<`0x${string}` | undefined>()
  const { isLoading: approveConfirming, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveHash })
  useEffect(() => { if (approveSuccess) { setApprovedStakeAmount(submittedApproveStake); invalidateAll() } }, [approveSuccess, invalidateAll, submittedApproveStake])
  const doApprove = async () => {
    setSubmittedApproveStake(stakeBn)
    setApprovePending(true)
    try { setApproveHash(await approveAsync({ address: vault, abi: ERC20_ABI, functionName: 'approve', args: [ADDRESSES.govStaking, stakeBn] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setApprovePending(false) }
  }

  const [stakePending, setStakePending] = useState(false)
  const { mutateAsync: stakeAsync } = useWriteContract()
  const [stakeHash, setStakeHash] = useState<`0x${string}` | undefined>()
  const { isLoading: stakeConfirming, isSuccess: stakeSuccess } = useWaitForTransactionReceipt({ hash: stakeHash })
  useEffect(() => { if (stakeSuccess) { setApprovedStakeAmount(0n); setStakeAmount(''); setPollInterval(2000); invalidateAll() } }, [stakeSuccess, invalidateAll])
  const doStake = async () => {
    setStakePending(true)
    try { setStakeHash(await stakeAsync({ address: ADDRESSES.govStaking, abi: GOV_STAKING_ABI, functionName: 'stake', args: [vault, stakeBn] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setStakePending(false) }
  }

  const [unstakePending, setUnstakePending] = useState(false)
  const { mutateAsync: unstakeAsync } = useWriteContract()
  const [unstakeHash, setUnstakeHash] = useState<`0x${string}` | undefined>()
  const { isLoading: unstakeConfirming, isSuccess: unstakeSuccess } = useWaitForTransactionReceipt({ hash: unstakeHash })
  useEffect(() => { if (unstakeSuccess) { setUnstakeAmount(''); setPollInterval(2000); invalidateAll() } }, [unstakeSuccess, invalidateAll])
  const doUnstake = async () => {
    setUnstakePending(true)
    try { setUnstakeHash(await unstakeAsync({ address: ADDRESSES.govStaking, abi: GOV_STAKING_ABI, functionName: 'unstake', args: [vault, unstakeBn] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setUnstakePending(false) }
  }

  const insufficientStake   = (displayHzBalance ?? 0n) > 0n && stakeBn > 0n && stakeBn > (displayHzBalance ?? 0n)
  const insufficientUnstake = (displayStaked ?? 0n) > 0n && unstakeBn > 0n && unstakeBn > (displayStaked ?? 0n)

  return (
    <Card>
      <CardHeader>
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">{name ?? symbol ?? '...'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{symbol ?? ''}</p>
        </div>
        <Badge variant="green">{tierInfo.tier.label} — ×{tierInfo.tier.multiplier}</Badge>
      </CardHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <StatItem label="Stakées"      value={`${formatShares(displayStaked)} ${symbol ?? ''}`} accent />
        <StatItem
          label="Voting Power"
          value={vpUsdc !== undefined ? formatUSDC(vpUsdc) : '--'}
          sub={maxWithdraw !== undefined ? `${formatUSDC(maxWithdraw)} USDC × ${tierInfo.tier.multiplier}` : `×${tierInfo.tier.multiplier}`}
          accent
        />
      </div>

      {/* Tier progress */}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mb-1.5">
          <span>{tierInfo.tier.label}</span>
          <span>
            {tierInfo.daysToNext !== null
              ? `${tierInfo.daysToNext} j → Tier ${tierInfo.tier.index + 1}`
              : 'Tier maximum'}
          </span>
        </div>
        <Progress value={tierInfo.progress} />
        <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">{tierInfo.elapsedDays} jours stakés</p>
      </div>

      {/* Stake / Unstake toggle */}
      <div className="flex rounded-lg border border-slate-200 dark:border-[#1e3025] overflow-hidden bg-white dark:bg-[#131f17] text-sm mb-4">
        {(['stake', 'unstake'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setStakeAmount(''); setUnstakeAmount('') }}
            className={`flex-1 py-2.5 font-medium transition-all ${
              mode === m
                ? 'bg-emerald-600 text-white'
                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2a1d]'
            }`}
          >
            {m === 'stake' ? 'Staker' : 'Unstaker'}
          </button>
        ))}
      </div>

      {mode === 'stake' ? (
        <div className="space-y-3">
          {stakeSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="w-4 h-4" /> Stake effectué.
            </div>
          )}
          <Input
            label={`Montant à staker (${symbol ?? 'LP'})`}
            type="number" placeholder="0.0000"
            value={stakeAmount}
            onChange={e => setStakeAmount(e.target.value)}
            suffix={symbol ?? 'LP'}
            onMax={() => displayHzBalance && setStakeAmount((Number(displayHzBalance) / 1e9).toString())}
            hint={`En wallet : ${formatShares(displayHzBalance)} ${symbol ?? ''}`}
            error={insufficientStake ? 'Solde insuffisant' : undefined}
          />
          <div className="flex gap-3">
            {needsApproval && (
              <Button
                variant="secondary"
                onClick={doApprove}
                loading={approvePending || approveConfirming}
                disabled={!address || stakeBn === 0n || insufficientStake}
                className="flex-1"
              >
                {approveConfirming ? 'Confirmation…' : `Approuver ${symbol ?? 'LP'}`}
              </Button>
            )}
            <Button
              onClick={doStake}
              loading={stakePending || stakeConfirming}
              disabled={!address || stakeBn === 0n || needsApproval || insufficientStake || !displayHzBalance || displayHzBalance === 0n}
              className="flex-1"
            >
              {stakeConfirming ? 'Confirmation…' : 'Staker'}
            </Button>
          </div>
          {(!displayHzBalance || displayHzBalance === 0n) && (
            <p className="text-xs text-slate-500 dark:text-slate-500">Aucune LP share en wallet à staker.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-500 bg-slate-50 dark:bg-[#1a2a1d] rounded-lg px-3 py-2">
            <InformationCircleIcon className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            L&apos;unstake retourne les LP shares dans votre wallet. Un re-stake recalcule le timestamp pondéré et peut réduire votre tier.
          </div>
          {unstakeSuccess && (
            <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircleIcon className="w-4 h-4" /> Unstake effectué. Vos LP shares sont dans votre wallet.
            </div>
          )}
          <Input
            label={`Montant à unstaker (${symbol ?? 'LP'})`}
            type="number" placeholder="0.0000"
            value={unstakeAmount}
            onChange={e => setUnstakeAmount(e.target.value)}
            suffix={symbol ?? 'LP'}
            onMax={() => displayStaked && setUnstakeAmount((Number(displayStaked) / 1e9).toString())}
            hint={`Stakés : ${formatShares(displayStaked)} ${symbol ?? ''}`}
            error={insufficientUnstake ? 'Dépasse votre position stakée' : undefined}
          />
          <Button
            variant="secondary"
            onClick={doUnstake}
            loading={unstakePending || unstakeConfirming}
            disabled={!address || unstakeBn === 0n || insufficientUnstake}
            className="w-full"
          >
            {unstakeConfirming ? 'Confirmation…' : 'Unstaker'}
          </Button>
        </div>
      )}
    </Card>
  )
}

function PreviewStakingCard({ name, symbol, desc }: typeof PREVIEW_VAULTS[number]) {
  const tierInfo = getTierInfo(undefined)

  return (
    <div className="relative opacity-60 cursor-not-allowed select-none">
      <Card>
        <CardHeader>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{name}</p>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{symbol}</p>
          </div>
          <Badge variant="yellow">Bientôt</Badge>
        </CardHeader>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <StatItem label="Stakés"       value={`0.000 ${symbol}`} />
          <StatItem label="Voting Power" value="0.000" sub={`×${tierInfo.tier.multiplier}`} />
        </div>

        <div className="mb-5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-500 mb-1.5">
            <span>{tierInfo.tier.label}</span>
            <span>{desc}</span>
          </div>
          <Progress value={0} />
          <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">0 jours stakés</p>
        </div>

        <div className="flex rounded-lg border border-slate-200 dark:border-[#1e3025] overflow-hidden bg-white dark:bg-[#131f17] text-sm mb-4">
          {(['stake', 'unstake'] as const).map(m => (
            <button key={m} disabled className="flex-1 py-2.5 font-medium text-slate-400 dark:text-slate-600">
              {m === 'stake' ? 'Staker' : 'Unstaker'}
            </button>
          ))}
        </div>

        <Button disabled className="w-full">Vault non déployé</Button>
      </Card>
    </div>
  )
}

export default function StakingPage() {
  const liveVaults: Address[] = ADDRESSES.hzStable ? [ADDRESSES.hzStable] : []

  return (
    <div>
      <Header title="Staking" subtitle="Ancienneté & voting power par vault" />

      <div className="p-6 max-w-4xl space-y-5">
        {/* Tier reference table */}
        <Card>
          <CardHeader>
            <CardTitle>Tiers d&apos;ancienneté</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-5 gap-2">
            {TIER_BANDS.map(band => (
              <div
                key={band.index}
                className="text-center p-3 rounded-lg border border-slate-200 dark:border-[#1e3025]"
              >
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{band.label}</p>
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">×{band.multiplier}</p>
                <p className="text-xs text-slate-400 dark:text-slate-600 mt-0.5">
                  {band.maxDays === null ? `${band.minDays}j+` : `${band.minDays}–${band.maxDays}j`}
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Live vaults */}
        {liveVaults.map(vault => (
          <VaultStakingSection key={vault} vault={vault} />
        ))}

        {/* Preview vaults */}
        {PREVIEW_VAULTS.map(v => (
          <PreviewStakingCard key={v.symbol} {...v} />
        ))}

      </div>
    </div>
  )
}
