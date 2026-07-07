import { createConnectTransport } from '@connectrpc/connect-web'
import { ConnectError, Code } from '@connectrpc/connect'
import type { Transport } from '@connectrpc/connect'

export function createTransport(token: string): Transport {
  return createConnectTransport({
    baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
    interceptors: [
      (next) => (req) => {
        req.header.set('Authorization', `Bearer ${token}`)
        return next(req)
      },
      (next) => async (req) => {
        try {
          return await next(req)
        } catch (err) {
          if (err instanceof ConnectError && err.code === Code.Unauthenticated) {
            await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {})
            const locale = window.location.pathname.split('/')[1]
            window.location.href = ['en', 'es'].includes(locale) ? `/${locale}/login` : '/login'
          }
          throw err
        }
      },
    ],
  })
}

// Unauthenticated transport for login / register
export const publicTransport: Transport = createConnectTransport({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080',
})
