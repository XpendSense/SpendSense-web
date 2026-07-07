'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query'
import { createTransport } from '@/lib/api/client'
import { isTokenExpired } from '@/lib/auth/token'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'

interface AuthContextValue {
  token: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

function getLoginUrl(): string {
  const locale = window.location.pathname.split('/')[1]
  return ['en', 'es'].includes(locale) ? `/${locale}/login` : '/login'
}

async function redirectToLogin() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
  window.location.href = getLoginUrl()
}

export function AuthProvider({ token, children }: { token: string; children: React.ReactNode }) {
  const { showError } = useSnackbar()
  const transport = useMemo(() => createTransport(token), [token])

  // Keep a stable ref to showError so the QueryCache callback never goes stale
  const showErrorRef = useRef(showError)
  useEffect(() => { showErrorRef.current = showError }, [showError])

  // Guard against expired tokens on mount and when the app returns from background.
  // This is the primary defence on mobile where session cookies outlive the JWT.
  useEffect(() => {
    if (isTokenExpired(token)) {
      redirectToLogin()
      return
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible' && isTokenExpired(token)) {
        redirectToLogin()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [token])

  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => showErrorRef.current(err),
    }),
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000 },
    },
  }))

  return (
    <AuthContext.Provider value={{ token }}>
      <TransportProvider transport={transport}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </TransportProvider>
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
