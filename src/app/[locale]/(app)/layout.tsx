import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TOKEN_COOKIE, isTokenExpired } from '@/lib/auth/token'
import { AuthProvider } from '@/context/AuthContext'
import { SnackbarProvider } from '@/components/ui/ErrorSnackbar'

export default async function AppLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const token = (await cookies()).get(TOKEN_COOKIE)?.value
  if (!token || isTokenExpired(token)) redirect(`/${locale}/login`)

  return (
    <SnackbarProvider>
      <AuthProvider token={token}>
        {children}
      </AuthProvider>
    </SnackbarProvider>
  )
}
