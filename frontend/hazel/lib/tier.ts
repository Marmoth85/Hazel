export interface TierBand {
  index: number
  label: string
  minDays: number
  maxDays: number | null
  multiplier: number
}

export const TIER_BANDS: TierBand[] = [
  { index: 0, label: 'Tier 0', minDays: 0,   maxDays: 30,  multiplier: 1.0  },
  { index: 1, label: 'Tier 1', minDays: 30,  maxDays: 90,  multiplier: 1.25 },
  { index: 2, label: 'Tier 2', minDays: 90,  maxDays: 180, multiplier: 1.5  },
  { index: 3, label: 'Tier 3', minDays: 180, maxDays: 365, multiplier: 2.0  },
  { index: 4, label: 'Tier 4', minDays: 365, maxDays: null, multiplier: 2.5 },
]

export interface TierInfo {
  tier: TierBand
  elapsedDays: number
  daysToNext: number | null
  progress: number
}

export function getTierInfo(weightedTimestamp: bigint | undefined, nowTs?: number): TierInfo {
  if (!weightedTimestamp || weightedTimestamp === 0n) {
    return { tier: TIER_BANDS[0], elapsedDays: 0, daysToNext: 30, progress: 0 }
  }

  const now = nowTs ?? Math.floor(Date.now() / 1000)
  const elapsedDays = Math.max(
    0,
    Math.floor((now - Number(weightedTimestamp)) / 86400)
  )

  let current = TIER_BANDS[0]
  for (const band of TIER_BANDS) {
    if (elapsedDays >= band.minDays) current = band
  }

  const next = TIER_BANDS[current.index + 1] ?? null
  const daysToNext = next ? Math.max(0, next.minDays - elapsedDays) : null

  let progress = 100
  if (current.maxDays !== null) {
    const duration = current.maxDays - current.minDays
    const elapsed = elapsedDays - current.minDays
    progress = Math.min(100, Math.floor((elapsed / duration) * 100))
  }

  return { tier: current, elapsedDays, daysToNext, progress }
}
