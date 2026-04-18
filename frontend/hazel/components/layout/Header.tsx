'use client'

import { AppKitButton } from '@reown/appkit/react'
import { ThemeToggle } from './ThemeToggle'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-[#1e3025] bg-white/60 dark:bg-[#131f17]/60 backdrop-blur-sm sticky top-0 z-10">
      <div>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="text-xs text-slate-500 dark:text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <AppKitButton />
      </div>
    </header>
  )
}
