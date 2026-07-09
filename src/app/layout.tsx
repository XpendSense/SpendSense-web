import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { Analytics } from '@vercel/analytics/next'
import { ThemeRegistry } from '@/components/ui/ThemeRegistry'

export const metadata: Metadata = {
  title: 'WellSpent',
  description: 'Income-first budgeting',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale()
  return (
    <html lang={locale} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeRegistry>{children}</ThemeRegistry>
        <Analytics />
      </body>
    </html>
  )
}
