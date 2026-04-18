import { formatUnits } from 'viem'

export function formatUSDC(value: bigint | undefined): string {
  if (value === undefined) return '--'
  return Number(formatUnits(value, 6)).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatShares(value: bigint | undefined, decimals = 9): string {
  if (value === undefined) return '--'
  return Number(formatUnits(value, decimals)).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })
}

// PPS = convertToAssets(1e9) → result is in USDC (6 decimals)
export function formatPPS(value: bigint | undefined): string {
  if (value === undefined) return '--'
  return Number(formatUnits(value, 6)).toLocaleString('fr-FR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  })
}

export function formatPercent(bps: number | bigint | undefined): string {
  if (bps === undefined) return '--'
  return (Number(bps) / 100).toFixed(2) + ' %'
}

export function formatTimestamp(ts: number | bigint | undefined): string {
  if (ts === undefined || ts === 0n || ts === 0) return '--'
  return new Date(Number(ts) * 1000).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Disponible maintenant'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
  if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
  return `${s}s`
}

export function formatAddress(addr: string | undefined): string {
  if (!addr) return '--'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

export function toUSDCUnits(human: string): bigint {
  const n = parseFloat(human)
  if (isNaN(n) || n < 0) return 0n
  return BigInt(Math.floor(n * 1_000_000))
}

export function toShareUnits(human: string): bigint {
  const n = parseFloat(human)
  if (isNaN(n) || n < 0) return 0n
  return BigInt(Math.floor(n * 1_000_000_000))
}

const CHAIN_NAMES: Record<number, string> = {
  42161: 'Arbitrum One',
  84532: 'Base Sepolia',
  31337: 'Hardhat',
}

export function chainName(chainId: number | undefined): string {
  if (!chainId) return '--'
  return CHAIN_NAMES[chainId] ?? `Chain ${chainId}`
}
