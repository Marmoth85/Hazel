import { Sidebar } from '@/components/layout/Sidebar'
import { NetworkGuard } from '@/components/layout/NetworkGuard'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-[#0c1510]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <NetworkGuard>
          {children}
        </NetworkGuard>
      </div>
    </div>
  )
}
