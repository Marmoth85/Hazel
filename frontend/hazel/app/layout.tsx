import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { headers } from 'next/headers'
import { Toaster } from 'sonner'
import ContextProvider from '@/context'
import { ThemeProvider } from '@/contexts/ThemeContext'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Hazel — Finance à impact social',
  description: "Déposez de l'USDC, générez du yield sur Aave, financez des associations socio-éducatives.",
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const headersObj = await headers()
  const cookies = headersObj.get('cookie')

  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Prevent FOUC: apply stored theme before first paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('hz-theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}`,
          }}
        />
      </head>
      <body className={`${inter.className} bg-slate-50 dark:bg-[#0c1510] text-slate-900 dark:text-slate-100 antialiased`}>
        <ThemeProvider>
          <ContextProvider cookies={cookies}>{children}</ContextProvider>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  )
}
