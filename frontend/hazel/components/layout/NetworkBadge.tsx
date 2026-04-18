'use client'

import { useChainId } from 'wagmi'
import { chainName } from '@/lib/format'

export function NetworkBadge() {
  const chainId = useChainId()
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/60 rounded-full text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-8">
      <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
      {chainName(chainId)}
    </div>
  )
}
