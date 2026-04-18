'use client'

import { useAccount, useChainId } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { ExclamationTriangleIcon } from '@/components/icons'
import { chainName } from '@/lib/format'

const SUPPORTED_CHAIN_IDS = [42161, 84532, 31337]

export function NetworkGuard({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { open } = useAppKit()

  if (isConnected && !SUPPORTED_CHAIN_IDS.includes(chainId)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6">
        <div className="w-14 h-14 bg-amber-50 dark:bg-amber-900/20 rounded-2xl flex items-center justify-center">
          <ExclamationTriangleIcon className="w-7 h-7 text-amber-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-2">Réseau non supporté</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
            Vous êtes sur <strong>{chainName(chainId)}</strong>. Hazel supporte Arbitrum One, Base Sepolia et Hardhat.
          </p>
        </div>
        <button
          onClick={() => open({ view: 'Networks' })}
          className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Changer de réseau
        </button>
      </div>
    )
  }

  return <>{children}</>
}
