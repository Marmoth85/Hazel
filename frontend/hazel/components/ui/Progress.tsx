interface ProgressProps {
  value: number
  className?: string
  size?: 'xs' | 'sm' | 'md'
  color?: 'emerald' | 'teal' | 'amber'
}

const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' }
const colors = {
  emerald: 'bg-emerald-500',
  teal: 'bg-teal-500',
  amber: 'bg-amber-500',
}

export function Progress({ value, className = '', size = 'sm', color = 'emerald' }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className={`w-full bg-slate-200 dark:bg-[#1a2a1d] rounded-full overflow-hidden ${heights[size]} ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[color]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
