import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TOKEN_COOKIE } from '@/lib/auth/token'
import { AuthProvider } from '@/context/AuthContext'
import { SnackbarProvider } from '@/components/ui/ErrorSnackbar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value
  if (!token) redirect('/login')

  return (
    <AuthProvider token={token}>
      <SnackbarProvider>
        {children}
      </SnackbarProvider>
    </AuthProvider>
  )
}
