'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAccount, useReadContract } from 'wagmi'
import {
  LeafIcon, DashboardIcon, ArrowDownTrayIcon, ArrowUpTrayIcon,
  LockClosedIcon, LayersIcon, ChartPieIcon, ShieldCheckIcon, Cog6ToothIcon,
} from '@/components/icons'
import { ADDRESSES, HZ_STABLE_ABI } from '@/lib/contracts'

const NAV = [
  { href: '/dashboard', label: 'Dashboard',  icon: DashboardIcon   },
  { href: '/vaults',                   label: 'Déposer',  icon: ArrowDownTrayIcon },
  { href: '/vaults?action=withdraw',   label: 'Retirer',  icon: ArrowUpTrayIcon },
  { href: '/staking',   label: 'Staking',     icon: LockClosedIcon  },
  { href: '/wrap',      label: 'HZL',         icon: LayersIcon      },
  { href: '/impact',    label: 'Impact',      icon: ChartPieIcon    },
  { href: '/insurance', label: 'Assurance',   icon: ShieldCheckIcon },
]

export function Sidebar() {
  const path = usePathname()
  const searchParams = useSearchParams()
  const vaultAction = searchParams.get('action')
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    address: ADDRESSES.hzStable,
    abi: HZ_STABLE_ABI,
    functionName: 'owner',
    query: { enabled: !!address },
  })
  const isAdmin = address && owner && address.toLowerCase() === (owner as string).toLowerCase()

  const link = (href: string, label: string, Icon: React.FC<{ className?: string }>, muted = false) => {
    const active =
      (href === '/vaults' && (path === '/deposit' || (path === '/vaults' && vaultAction !== 'withdraw'))) ||
      (href === '/vaults?action=withdraw' && (path === '/withdraw' || (path === '/vaults' && vaultAction === 'withdraw'))) ||
      (href !== '/vaults' && href !== '/vaults?action=withdraw' && path === href)
    return (
      <Link
        key={href}
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
          active
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium'
            : muted
            ? 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2a1d]'
            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#1a2a1d] hover:text-slate-900 dark:hover:text-slate-100'
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    )
  }

  return (
    <aside className="w-56 shrink-0 flex flex-col border-r border-slate-200 dark:border-[#1e3025] bg-white dark:bg-[#0f1a12] sticky top-0 h-screen">
      <div className="h-16 flex items-center px-5 border-b border-slate-200 dark:border-[#1e3025]">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center shrink-0">
            <LeafIcon className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900 dark:text-slate-100 text-base group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Hazel
          </span>
        </Link>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => link(href, label, Icon))}
      </nav>

      {isAdmin && (
        <div className="p-3 border-t border-slate-100 dark:border-[#1e3025]">
          {link('/admin', 'Admin', Cog6ToothIcon, true)}
        </div>
      )}
    </aside>
  )
}
