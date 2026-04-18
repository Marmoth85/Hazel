'use client'

import { type InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  suffix?: React.ReactNode
  onMax?: () => void
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, suffix, onMax, className = '', ...props }, ref) => (
    <div className="flex flex-col gap-1.5">
      {(label || onMax) && (
        <div className="flex items-center justify-between">
          {label ? (
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">
              {label}
            </label>
          ) : <span />}
          {onMax && (
            <button
              type="button"
              onClick={onMax}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
            >
              MAX
            </button>
          )}
        </div>
      )}
      <div className="relative">
        <input
          ref={ref}
          className={`w-full px-4 py-3 bg-slate-100 dark:bg-[#1a2a1d] border ${error ? 'border-red-500 focus:ring-red-500' : 'border-slate-200 dark:border-[#2a3d2e]'} rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all font-mono ${suffix ? 'pr-16' : ''} ${className}`}
          {...props}
        />
        {suffix && (
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400 font-medium pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
      {hint && !error && <p className="text-xs text-slate-500 dark:text-slate-600">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
)
Input.displayName = 'Input'
