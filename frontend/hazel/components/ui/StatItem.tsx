interface StatItemProps {
  label: string
  value: string
  sub?: string
  accent?: boolean
  mono?: boolean
}

export function StatItem({ label, value, sub, accent = false, mono = true }: StatItemProps) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs uppercase tracking-wider font-medium text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <p className={`text-xl font-semibold ${mono ? 'font-mono tabular-nums' : ''} ${accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-slate-100'}`}>
        {value}
      </p>
      {sub && (
        <p className="text-xs text-slate-400 dark:text-slate-600">{sub}</p>
      )}
    </div>
  )
}
