'use client'

import { useChainId } from 'wagmi'
import { chainName } from '@/lib/format'

export function Footer() {
  const chainId = useChainId()

  return (
    <footer className="border-t border-slate-200 dark:border-[#1e3025] py-12 px-6 bg-white dark:bg-[#0f1a12]">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 bg-emerald-600 rounded-md" />
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Hazel Protocol</span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500">Finance à impact social sur {chainName(chainId)}</p>
        </div>
        <nav className="flex items-center gap-5 text-xs text-slate-500 dark:text-slate-500">
          {[
            { label: 'Documentation', href: '#' },
            { label: 'Audit', href: '#' },
            { label: 'GitHub', href: 'https://github.com/Marmoth85/Hazel' },
            { label: 'Mentions légales', href: '#' },
          ].map(({ label, href }) => (
            <a key={label} href={href} className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">{label}</a>
          ))}
        </nav>
      </div>
    </footer>
  )
}
