'use client'

import { useState, useEffect, useRef } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import Link from 'next/link'
import { toast } from 'sonner'
import { Header } from '@/components/layout/Header'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { StatItem } from '@/components/ui/StatItem'
import { ExclamationTriangleIcon, Cog6ToothIcon } from '@/components/icons'
import { useVaultStats } from '@/hooks/useVaultStats'
import { useRevenueDistributor, useAssociations, useAssociationNames } from '@/hooks/useRevenueDistributor'
import { useInsuranceFund } from '@/hooks/useInsuranceFund'
import { useInvalidateAll } from '@/hooks/useInvalidateAll'
import { ADDRESSES, HZ_STABLE_ABI, REVENUE_DISTRIBUTOR_ABI, INSURANCE_FUND_ABI } from '@/lib/contracts'
import { formatCountdown, formatPercent, formatUSDC, formatShares, formatAddress } from '@/lib/format'
import { txErr } from '@/lib/errors'

export default function AdminPage() {
  const { address } = useAccount()
  const { owner, feeRate, harvestInterval, secondsUntilHarvest, harvestReady } = useVaultStats()

  const [countdown, setCountdown] = useState(secondsUntilHarvest ?? 0)
  useEffect(() => {
    if (secondsUntilHarvest === undefined) return
    setCountdown(secondsUntilHarvest)
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000)
    return () => clearInterval(t)
  }, [secondsUntilHarvest])
  const [assocPollInterval, setAssocPollInterval] = useState<number | false>(false)
  const { treasuryWeight, assocWeight, insWeight, associationCount } = useRevenueDistributor(assocPollInterval)
  const associations = useAssociations(associationCount, assocPollInterval)
  const associationNames = useAssociationNames()
  const { sharesBalance, usdcValue: insuranceUsdc } = useInsuranceFund()
  const invalidateAll = useInvalidateAll()

  useEffect(() => {
    if (assocPollInterval === false) return
    const t = setTimeout(() => setAssocPollInterval(false), 10_000)
    return () => clearTimeout(t)
  }, [assocPollInterval])

  const isOwner = address && owner && address.toLowerCase() === (owner as string).toLowerCase()

  // ── Harvest ─────────────────────────────────────────────────────────────────
  const [optimisticHarvestDone, setOptimisticHarvestDone] = useState(false)
  const [harvestPending, setHarvestPending] = useState(false)
  const { mutateAsync: harvestAsync } = useWriteContract()
  const [harvestHash, setHarvestHash] = useState<`0x${string}` | undefined>()
  const { isLoading: harvestConfirming, isSuccess: harvestSuccess } = useWaitForTransactionReceipt({ hash: harvestHash })
  const harvestHandled = useRef(false)
  useEffect(() => { harvestHandled.current = false }, [harvestHash])
  useEffect(() => { if (harvestSuccess && !harvestHandled.current) { harvestHandled.current = true; setOptimisticHarvestDone(true); toast.success('Harvest effectué'); invalidateAll() } }, [harvestSuccess, invalidateAll])
  const doHarvest = async () => {
    setHarvestPending(true)
    try { setHarvestHash(await harvestAsync({ address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'harvest', args: [] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setHarvestPending(false) }
  }

  // ── setFeeRate ───────────────────────────────────────────────────────────────
  const [newFeeRate, setNewFeeRate] = useState('')
  const [optimisticFeeRate, setOptimisticFeeRate] = useState<bigint | undefined>()
  const [submittedFeeRate, setSubmittedFeeRate] = useState<bigint>(0n)
  const [feePending, setFeePending] = useState(false)
  const { mutateAsync: feeAsync } = useWriteContract()
  const [feeHash, setFeeHash] = useState<`0x${string}` | undefined>()
  const { isLoading: feeConfirming, isSuccess: feeSuccess } = useWaitForTransactionReceipt({ hash: feeHash })
  useEffect(() => { if (feeSuccess) { setOptimisticFeeRate(submittedFeeRate); toast.success('Fee rate mis à jour'); invalidateAll() } }, [feeSuccess, invalidateAll, submittedFeeRate])
  const doSetFeeRate = async () => {
    const val = BigInt(newFeeRate || '0')
    setSubmittedFeeRate(val)
    setFeePending(true)
    try { setFeeHash(await feeAsync({ address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'setFeeRate', args: [val] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setFeePending(false) }
  }

  // ── setHarvestInterval ───────────────────────────────────────────────────────
  const [newInterval, setNewInterval] = useState('')
  const [optimisticInterval, setOptimisticInterval] = useState<bigint | undefined>()
  const [submittedInterval, setSubmittedInterval] = useState<bigint>(0n)
  const [intervalPending, setIntervalPending] = useState(false)
  const { mutateAsync: intervalAsync } = useWriteContract()
  const [intervalHash, setIntervalHash] = useState<`0x${string}` | undefined>()
  const { isLoading: intervalConfirming, isSuccess: intervalSuccess } = useWaitForTransactionReceipt({ hash: intervalHash })
  useEffect(() => { if (intervalSuccess) { setOptimisticInterval(submittedInterval); toast.success('Intervalle mis à jour'); invalidateAll() } }, [intervalSuccess, invalidateAll, submittedInterval])
  const doSetInterval = async () => {
    const val = BigInt(newInterval || '0')
    setSubmittedInterval(val)
    setIntervalPending(true)
    try { setIntervalHash(await intervalAsync({ address: ADDRESSES.hzStable, abi: HZ_STABLE_ABI, functionName: 'setHarvestInterval', args: [val] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setIntervalPending(false) }
  }

  // ── distribute ───────────────────────────────────────────────────────────────
  const [distribPending, setDistribPending] = useState(false)
  const { mutateAsync: distribAsync } = useWriteContract()
  const [distribHash, setDistribHash] = useState<`0x${string}` | undefined>()
  const { isLoading: distribConfirming, isSuccess: distribSuccess } = useWaitForTransactionReceipt({ hash: distribHash })
  useEffect(() => { if (distribSuccess) { toast.success('Distribution effectuée'); invalidateAll() } }, [distribSuccess, invalidateAll])
  const doDistribute = async () => {
    setDistribPending(true)
    try { setDistribHash(await distribAsync({ address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'distribute', args: [] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setDistribPending(false) }
  }

  // ── setShares ────────────────────────────────────────────────────────────────
  const [newTrBps, setNewTrBps] = useState('')
  const [newAsBps, setNewAsBps] = useState('')
  const [newInsBps, setNewInsBps] = useState('')
  const sharesSum = Number(newTrBps || 0) + Number(newAsBps || 0) + Number(newInsBps || 0)
  const sharesValid = newTrBps && newAsBps && newInsBps && sharesSum === 10_000
  const [sharesPending, setSharesPending] = useState(false)
  const { mutateAsync: sharesAsync } = useWriteContract()
  const [sharesHash, setSharesHash] = useState<`0x${string}` | undefined>()
  const { isLoading: sharesConfirming, isSuccess: sharesSuccess } = useWaitForTransactionReceipt({ hash: sharesHash })
  const [optimisticShares, setOptimisticShares] = useState<{ tr: bigint; as: bigint; ins: bigint } | undefined>()
  const [submittedShares, setSubmittedShares] = useState<{ tr: bigint; as: bigint; ins: bigint } | undefined>()
  useEffect(() => { if (sharesSuccess && submittedShares) { setOptimisticShares(submittedShares); toast.success('Répartition mise à jour'); invalidateAll() } }, [sharesSuccess, invalidateAll, submittedShares])
  const doSetShares = async () => {
    const vals = { tr: BigInt(newTrBps || '0'), as: BigInt(newAsBps || '0'), ins: BigInt(newInsBps || '0') }
    setSubmittedShares(vals)
    setSharesPending(true)
    try { setSharesHash(await sharesAsync({ address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'setShares', args: [vals.tr, vals.as, vals.ins] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setSharesPending(false) }
  }

  // ── Local associations state (source of truth for indices/names) ─────────────
  type LocalAssoc = { index: number; addr: string; weight: bigint }
  const [localAssocs, setLocalAssocs] = useState<LocalAssoc[] | null>(null)
  const [localNames, setLocalNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (localAssocs !== null) return
    if (associationCount === 0n) { setLocalAssocs([]); return }
    if (associations.length > 0) setLocalAssocs(associations.map(a => ({ index: a.index, addr: a.addr, weight: a.weight })))
  }, [associations, associationCount, localAssocs])

  useEffect(() => {
    setLocalNames(prev => ({ ...associationNames, ...prev }))
  }, [associationNames])

  const displayAssocs = localAssocs ?? []

  // ── addAssociation ───────────────────────────────────────────────────────────
  const [newAssocAddr, setNewAssocAddr] = useState('')
  const [newAssocName, setNewAssocName] = useState('')
  const [addAssocPending, setAddAssocPending] = useState(false)
  const { mutateAsync: addAssocAsync } = useWriteContract()
  const [addAssocHash, setAddAssocHash] = useState<`0x${string}` | undefined>()
  const { isLoading: addAssocConfirming, isSuccess: addAssocSuccess } = useWaitForTransactionReceipt({ hash: addAssocHash })
  const addAssocHandled = useRef(false)
  useEffect(() => { addAssocHandled.current = false }, [addAssocHash])
  useEffect(() => {
    if (!addAssocSuccess || addAssocHandled.current) return
    addAssocHandled.current = true
    const addr = newAssocAddr
    const name = newAssocName
    setLocalAssocs(prev => { const next = prev ?? []; return [...next, { index: next.length, addr, weight: 0n }] })
    setLocalNames(prev => ({ ...prev, [addr.toLowerCase()]: name }))
    toast.success('Association ajoutée')
    setNewAssocAddr('')
    setNewAssocName('')
    invalidateAll()
  }, [addAssocSuccess, invalidateAll, newAssocAddr, newAssocName])
  const doAddAssoc = async () => {
    setAddAssocHash(undefined)
    setAddAssocPending(true)
    try { setAddAssocHash(await addAssocAsync({ address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'addAssociation', args: [newAssocAddr as `0x${string}`, newAssocName] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setAddAssocPending(false) }
  }

  // ── removeAssociation ────────────────────────────────────────────────────────
  const [submittedRemoveIndex, setSubmittedRemoveIndex] = useState<number | null>(null)
  const [submittedRemoveAddr, setSubmittedRemoveAddr] = useState<string>('')
  const [removeAssocPending, setRemoveAssocPending] = useState(false)
  const { mutateAsync: removeAssocAsync } = useWriteContract()
  const [removeAssocHash, setRemoveAssocHash] = useState<`0x${string}` | undefined>()
  const { isLoading: removeAssocConfirming, isSuccess: removeAssocSuccess } = useWaitForTransactionReceipt({ hash: removeAssocHash })
  const removeAssocHandled = useRef(false)
  useEffect(() => { removeAssocHandled.current = false }, [removeAssocHash])
  useEffect(() => {
    if (!removeAssocSuccess || submittedRemoveIndex === null || removeAssocHandled.current) return
    removeAssocHandled.current = true
    const removedAddr = submittedRemoveAddr.toLowerCase()
    setLocalAssocs(prev => {
      if (!prev) return null
      const idx = prev.findIndex(a => a.addr.toLowerCase() === removedAddr)
      if (idx === -1) return prev
      const next = [...prev]
      next[idx] = next[next.length - 1]
      next.pop()
      return next.map((a, i) => ({ ...a, index: i }))
    })
    toast.success('Association retirée')
    invalidateAll()
  }, [removeAssocSuccess, invalidateAll, submittedRemoveIndex, submittedRemoveAddr])
  const doRemoveAssoc = async (index: number, addr: string) => {
    setRemoveAssocHash(undefined)
    setSubmittedRemoveIndex(index)
    setSubmittedRemoveAddr(addr)
    setRemoveAssocPending(true)
    try { setRemoveAssocHash(await removeAssocAsync({ address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'removeAssociation', args: [BigInt(index)] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setRemoveAssocPending(false) }
  }

  // ── setAssociations (weights) ─────────────────────────────────────────────────
  const [assocWeights, setAssocWeights] = useState<Record<string, string>>({}) // keyed by lowercase addr
  const [submittedAssocWeights, setSubmittedAssocWeights] = useState<Record<string, string>>({})
  const [setAssocPending, setSetAssocPending] = useState(false)
  const { mutateAsync: setAssocAsync } = useWriteContract()
  const [setAssocHash, setSetAssocHash] = useState<`0x${string}` | undefined>()
  const { isLoading: setAssocConfirming, isSuccess: setAssocSuccess } = useWaitForTransactionReceipt({ hash: setAssocHash })
  useEffect(() => {
    if (!setAssocSuccess) return
    setLocalAssocs(prev => prev ? prev.map(a => ({ ...a, weight: BigInt(submittedAssocWeights[a.addr.toLowerCase()] || 0) })) : null)
    toast.success('Poids des associations mis à jour')
    invalidateAll()
  }, [setAssocSuccess, invalidateAll, submittedAssocWeights])
  const doSetAssoc = async () => {
    const addrs = displayAssocs.map(a => a.addr as `0x${string}`)
    const weights = displayAssocs.map(a => Number(assocWeights[a.addr.toLowerCase()] || 0))
    setSubmittedAssocWeights(Object.fromEntries(displayAssocs.map(a => [a.addr.toLowerCase(), assocWeights[a.addr.toLowerCase()] || '0'])))
    setSetAssocPending(true)
    try { setSetAssocHash(await setAssocAsync({ address: ADDRESSES.revenueDistributor, abi: REVENUE_DISTRIBUTOR_ABI, functionName: 'setAssociations', args: [addrs, weights] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setSetAssocPending(false) }
  }

  // ── payout ───────────────────────────────────────────────────────────────────
  const [payoutTo, setPayoutTo] = useState('')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [submittedPayoutShares, setSubmittedPayoutShares] = useState<bigint>(0n)
  const [payoutDelta, setPayoutDelta] = useState<bigint>(0n)
  const [payoutPending, setPayoutPending] = useState(false)
  const { mutateAsync: payoutAsync } = useWriteContract()
  const [payoutHash, setPayoutHash] = useState<`0x${string}` | undefined>()
  const { isLoading: payoutConfirming, isSuccess: payoutSuccess } = useWaitForTransactionReceipt({ hash: payoutHash })
  useEffect(() => { if (payoutSuccess) { setPayoutDelta(d => d + submittedPayoutShares); toast.success('Payout exécuté'); setPayoutTo(''); setPayoutAmount(''); invalidateAll() } }, [payoutSuccess, invalidateAll, submittedPayoutShares])
  const doPayout = async () => {
    const shares = BigInt(payoutAmount || '0')
    setSubmittedPayoutShares(shares)
    setPayoutPending(true)
    try { setPayoutHash(await payoutAsync({ address: ADDRESSES.insuranceFund, abi: INSURANCE_FUND_ABI, functionName: 'payout', args: [payoutTo as `0x${string}`, shares] })) }
    catch (e) { toast.error(txErr(e)) }
    finally { setPayoutPending(false) }
  }

  if (!address) {
    return (
      <div>
        <Header title="Admin" />
        <div className="p-6">
          <Card className="text-center py-10">
            <p className="text-slate-500 dark:text-slate-400 text-sm">Connectez votre wallet pour accéder à l&apos;admin</p>
          </Card>
        </div>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div>
        <Header title="Admin" />
        <div className="p-6">
          <Card className="text-center py-12">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center">
                <ExclamationTriangleIcon className="w-6 h-6 text-red-500" />
              </div>
            </div>
            <p className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Accès restreint</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              Cette page est réservée à l&apos;owner du protocole.
            </p>
            <Link href="/dashboard">
              <Button variant="secondary" size="sm">Retour au dashboard</Button>
            </Link>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Header title="Admin" subtitle="Fonctions owner" />

      <div className="p-6 max-w-4xl space-y-6">
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-700 dark:text-amber-400">
          <Cog6ToothIcon className="w-4 h-4 shrink-0" />
          Vous êtes connecté en tant qu&apos;owner. Toutes les actions sont irréversibles.
        </div>

        {/* ── Vault params ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Paramètres du vault</CardTitle>
            <Badge variant="gray">HzStable</Badge>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatItem label="Fee rate actuel"  value={formatPercent(optimisticFeeRate ?? feeRate)} />
            <StatItem label="Harvest interval" value={`${Number(optimisticInterval ?? harvestInterval ?? 0) / 3600}h`} />
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Input
                label="Nouveau fee rate (BPS)"
                type="number"
                placeholder="ex: 1000 = 10%"
                value={newFeeRate}
                onChange={e => setNewFeeRate(e.target.value)}
                hint="Max 10 000 BPS"
              />
              <Button
                size="sm"
                variant="secondary"
                loading={feePending || feeConfirming}
                disabled={!newFeeRate}
                onClick={doSetFeeRate}
              >
                {feePending ? 'Signature...' : feeConfirming ? 'Confirmation...' : 'Mettre à jour'}
              </Button>
            </div>
            <div className="space-y-2">
              <Input
                label="Nouvel intervalle harvest (secondes)"
                type="number"
                placeholder="ex: 86400 = 24h"
                value={newInterval}
                onChange={e => setNewInterval(e.target.value)}
                hint="Bornes : 1h – 30j"
              />
              <Button
                size="sm"
                variant="secondary"
                loading={intervalPending || intervalConfirming}
                disabled={!newInterval}
                onClick={doSetInterval}
              >
                {intervalPending ? 'Signature...' : intervalConfirming ? 'Confirmation...' : 'Mettre à jour'}
              </Button>
            </div>
          </div>
        </Card>

        {/* ── Distribution ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Distribution des fees</CardTitle>
            <Badge variant="gray">RevenueDistributor</Badge>
          </CardHeader>

          <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
            Ces poids définissent comment les shares de fees (créées au harvest) sont réparties entre les destinataires.
            Ils sont indépendants du fee rate du vault.
          </p>

          {/* Poids actuels */}
          <div className="grid grid-cols-3 gap-3 mb-5 text-sm">
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-[#1a2a1d]">
              <p className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatPercent(optimisticShares?.as ?? assocWeight)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Associations</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-[#1a2a1d]">
              <p className="font-mono font-bold text-sky-600 dark:text-sky-400">{formatPercent(optimisticShares?.ins ?? insWeight)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Assurance</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-[#1a2a1d]">
              <p className="font-mono font-bold text-slate-600 dark:text-slate-400">{formatPercent(optimisticShares?.tr ?? treasuryWeight)}</p>
              <p className="text-xs text-slate-500 mt-0.5">Treasury</p>
            </div>
          </div>

          {/* Modifier les poids */}
          <div className="border-t border-slate-100 dark:border-[#1e3025] pt-4 mb-5">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">Modifier la répartition (en BPS, total doit être exactement 10 000)</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <Input label="Associations (BPS)" type="number" placeholder={String(assocWeight ?? '')} value={newAsBps}  onChange={e => setNewAsBps(e.target.value)} />
              <Input label="Assurance (BPS)"    type="number" placeholder={String(insWeight ?? '')}   value={newInsBps} onChange={e => setNewInsBps(e.target.value)} />
              <Input label="Treasury (BPS)"     type="number" placeholder={String(treasuryWeight ?? '')} value={newTrBps} onChange={e => setNewTrBps(e.target.value)} />
            </div>
            {newTrBps && newAsBps && newInsBps && (
              <p className={`text-xs mb-2 ${sharesSum !== 10_000 ? 'text-amber-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                Total : {sharesSum} BPS ({(sharesSum / 100).toFixed(2)}%)
                {sharesSum === 10_000 ? ' ✓' : sharesSum > 10_000 ? ' — dépasse 10 000 !' : ` — manque ${10_000 - sharesSum} BPS`}
              </p>
            )}
            <Button
              size="sm"
              variant="secondary"
              loading={sharesPending || sharesConfirming}
              disabled={!sharesValid}
              onClick={doSetShares}
            >
              {sharesPending ? 'Signature...' : sharesConfirming ? 'Confirmation...' : 'Mettre à jour la répartition'}
            </Button>
          </div>

          {/* Déclencher la distribution */}
          <div className="border-t border-slate-100 dark:border-[#1e3025] pt-4">
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">
              Distribue les shares de fees accumulées depuis le dernier harvest vers les destinataires.
            </p>
            <Button
              onClick={doDistribute}
              loading={distribPending || distribConfirming}
              variant="secondary"
            >
              {distribPending ? 'Signature...' : distribConfirming ? 'Confirmation...' : 'Déclencher distribute()'}
            </Button>
          </div>
        </Card>

        {/* ── Harvest ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Harvest</CardTitle>
            <Badge variant={harvestReady && !optimisticHarvestDone ? 'green' : 'gray'}>
              {harvestReady && !optimisticHarvestDone ? 'Disponible' : `Dans ${formatCountdown(optimisticHarvestDone ? Number(harvestInterval ?? 0) : countdown)}`}
            </Badge>
          </CardHeader>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Déclenche la collecte du yield et la création des shares de fees. Permissionless — visible ici par commodité.
            {!harvestReady && <span className="block mt-1 text-xs text-slate-500">Le prochain harvest sera disponible après l&apos;expiration du countdown ci-dessus.</span>}
          </p>
          <Button
            onClick={doHarvest}
            loading={harvestPending || harvestConfirming}
            disabled={!harvestReady}
            variant="secondary"
          >
            {harvestPending ? 'Signature...' : harvestConfirming ? 'Confirmation...' : 'Déclencher le harvest'}
          </Button>
        </Card>

        {/* ── Associations ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Associations</CardTitle>
            <Badge variant="gray">{displayAssocs.length} / 10</Badge>
          </CardHeader>

          {/* Liste */}
          {displayAssocs.length > 0 ? (
            <div className="space-y-2 mb-5">
              {displayAssocs.map(a => {
                const name = localNames[a.addr.toLowerCase()] ?? ''
                const w = Number(a.weight)
                return (
                  <div key={a.addr} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#1a2a1d] text-sm">
                    <div>
                      {name && <span className="font-medium text-slate-800 dark:text-slate-200 mr-2">{name}</span>}
                      <span className="font-mono text-xs text-slate-600 dark:text-slate-400">{formatAddress(a.addr as `0x${string}`)}</span>
                      <span className="ml-3 text-slate-500">{w} BPS ({(w / 100).toFixed(2)}%)</span>
                    </div>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={(removeAssocPending || removeAssocConfirming) && submittedRemoveIndex === a.index}
                      onClick={() => doRemoveAssoc(a.index, a.addr)}
                      title="Retirer (uniquement si le poids est 0)"
                    >
                      {submittedRemoveIndex === a.index && removeAssocPending ? 'Signature...' : submittedRemoveIndex === a.index && removeAssocConfirming ? 'Confirmation...' : 'Retirer'}
                    </Button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-500 mb-5">Aucune association enregistrée.</p>
          )}

          {/* Éditeur de poids */}
          {displayAssocs.length > 0 && (() => {
            const weightSum = displayAssocs.reduce((sum, a) => sum + Number(assocWeights[a.addr.toLowerCase()] || 0), 0)
            const allFilled = displayAssocs.every(a => assocWeights[a.addr.toLowerCase()] !== undefined && assocWeights[a.addr.toLowerCase()] !== '')
            const weightsValid = allFilled && (weightSum === 0 || weightSum === 10_000)
            return (
              <div className="border-t border-slate-100 dark:border-[#1e3025] pt-4 mb-5">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">
                  Définir les poids BPS (total doit être exactement 10 000)
                </p>
                <div className="space-y-2 mb-3">
                  {displayAssocs.map(a => {
                    const name = localNames[a.addr.toLowerCase()] ?? ''
                    return (
                      <div key={a.addr} className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {name && <span className="text-xs font-medium text-slate-700 dark:text-slate-300 block truncate">{name}</span>}
                          <span className="font-mono text-xs text-slate-500">{formatAddress(a.addr as `0x${string}`)}</span>
                        </div>
                        <div className="w-32 shrink-0">
                          <Input
                            type="number"
                            placeholder="BPS"
                            value={assocWeights[a.addr.toLowerCase()] ?? ''}
                            onChange={e => setAssocWeights(prev => ({ ...prev, [a.addr.toLowerCase()]: e.target.value }))}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className={`text-xs mb-3 ${allFilled && weightSum !== 0 && weightSum !== 10_000 ? 'text-red-500' : 'text-slate-500 dark:text-slate-500'}`}>
                  Total : {weightSum} / 10 000 BPS
                  {allFilled && weightSum !== 0 && weightSum !== 10_000 ? ' — doit être 0 ou exactement 10 000 !' : ''}
                  {allFilled && weightSum === 0 ? ' — tous à 0, les associations seront désactivées' : ''}
                </p>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={setAssocPending || setAssocConfirming}
                  disabled={!weightsValid}
                  onClick={doSetAssoc}
                >
                  {setAssocPending ? 'Signature...' : setAssocConfirming ? 'Confirmation...' : 'Enregistrer les poids'}
                </Button>
              </div>
            )
          })()}

          {/* Ajouter */}
          {displayAssocs.length < 10 && (
            <div className="border-t border-slate-100 dark:border-[#1e3025] pt-4 space-y-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Ajouter une association</p>
              <Input
                label="Nom"
                placeholder="ex: Association Solidarité"
                value={newAssocName}
                onChange={e => setNewAssocName(e.target.value)}
                hint="Le nom est stocké dans l'event log (off-chain)."
              />
              <Input
                label="Adresse"
                placeholder="0x..."
                value={newAssocAddr}
                onChange={e => setNewAssocAddr(e.target.value)}
              />
              <Button
                size="sm"
                variant="secondary"
                loading={addAssocPending || addAssocConfirming}
                disabled={!newAssocAddr || !newAssocName}
                onClick={doAddAssoc}
              >
                {addAssocPending ? 'Signature...' : addAssocConfirming ? 'Confirmation...' : 'Ajouter'}
              </Button>
            </div>
          )}
        </Card>

        {/* ── Insurance payout ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>Payout insurance</CardTitle>
            <Badge variant="gray">InsuranceFund</Badge>
          </CardHeader>

          <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
            Transfère des shares hzUSDC depuis le fonds d&apos;assurance vers une adresse donnée.
            À utiliser en cas de sinistre pour compenser des utilisateurs lésés.
          </p>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <StatItem label="Réserve (shares)"   value={formatShares(sharesBalance !== undefined ? sharesBalance - payoutDelta : undefined)} />
            <StatItem label="Valeur estimée"      value={`≈ ${formatUSDC(insuranceUsdc !== undefined ? insuranceUsdc - payoutDelta : undefined)} USDC`} accent />
          </div>

          <div className="space-y-3">
            <Input
              label="Adresse destinataire"
              placeholder="0x..."
              value={payoutTo}
              onChange={e => setPayoutTo(e.target.value)}
            />
            <Input
              label="Montant en shares hzUSDC"
              type="number"
              placeholder="0"
              value={payoutAmount}
              onChange={e => setPayoutAmount(e.target.value)}
              hint={`Solde du fonds : ${formatShares(sharesBalance)} shares ≈ ${formatUSDC(insuranceUsdc)} USDC`}
            />
            <Button
              variant="danger"
              loading={payoutPending || payoutConfirming}
              disabled={!payoutTo || !payoutAmount}
              onClick={doPayout}
            >
              {payoutPending ? 'Signature...' : payoutConfirming ? 'Confirmation...' : 'Exécuter le payout'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  )
}
