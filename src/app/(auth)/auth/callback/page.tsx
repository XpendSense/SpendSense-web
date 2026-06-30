'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@connectrpc/connect'
import { AuthService } from '@/gen/spendsense/v1/auth_connect'
import { publicTransport } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'
import Link from '@mui/material/Link'
import NextLink from 'next/link'

const authClient = createClient(AuthService, publicTransport)

function CallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')

    if (!code) {
      setError('No authorization code received from Google.')
      return
    }

    const savedState = sessionStorage.getItem('google_oauth_state')
    sessionStorage.removeItem('google_oauth_state')

    if (!savedState || state !== savedState) {
      setError('Invalid state parameter. Please try again.')
      return
    }

    const redirectUri = `${window.location.origin}/auth/callback`

    authClient.exchangeGoogleCode({ code, redirectUri })
      .then(async (res) => {
        await fetch('/api/auth/set-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: res.accessToken }),
        })
        logger.info('auth.google.callback', { isNewUser: res.isNewUser })
        router.push('/budgets')
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Google sign-in failed'
        logger.error('auth.google.callback.failed', { error: message })
        setError(message)
      })
  // searchParams identity is stable; router is stable — this runs once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <Typography color="error">{error}</Typography>
        <Link component={NextLink} href="/login" variant="body2">
          Back to sign in
        </Link>
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CircularProgress />
    </Box>
  )
}

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      }
    >
      <CallbackContent />
    </Suspense>
  )
}
