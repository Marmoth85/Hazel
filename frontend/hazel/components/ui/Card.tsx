interface CardProps {
  children: React.ReactNode
  className?: string
  noPadding?: boolean
}

export function Card({ children, className = '', noPadding = false }: CardProps) {
  return (
    <div className={`bg-white dark:bg-[#131f17] border border-slate-200 dark:border-[#1e3025] rounded-xl ${noPadding ? '' : 'p-5'} ${className}`}>
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-[#1e3025] ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={`text-sm font-semibold text-slate-900 dark:text-slate-100 ${className}`}>
      {children}
    </h2>
  )
}
