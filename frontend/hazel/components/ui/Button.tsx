'use client'

import { type ButtonHTMLAttributes, forwardRef } from 'react'
import { Spinner } from './Spinner'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary:   'bg-emerald-600 hover:bg-emerald-700 dark:hover:bg-emerald-500 text-white',
  secondary: 'bg-slate-200 hover:bg-slate-300 dark:bg-[#1a2a1d] dark:hover:bg-[#223026] text-slate-800 dark:text-slate-100',
  ghost:     'hover:bg-slate-100 dark:hover:bg-[#1a2a1d] text-slate-600 dark:text-slate-400 dark:hover:text-slate-200',
  danger:    'bg-red-600 hover:bg-red-700 text-white',
  outline:   'border border-slate-300 dark:border-[#2a3d2e] hover:bg-slate-50 dark:hover:bg-[#1a2a1d] text-slate-700 dark:text-slate-300',
}

const sizes = {
  sm: 'text-xs px-3 py-1.5 rounded-md',
  md: 'text-sm px-4 py-2.5 rounded-lg',
  lg: 'text-sm px-6 py-3 rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading, disabled, children, className = '', ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#131f17] ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
)
Button.displayName = 'Button'
