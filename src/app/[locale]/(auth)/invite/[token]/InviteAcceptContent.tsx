'use client'

import { useEffect, useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@connectrpc/connect'
import { InviteService } from '@/gen/spendsense/v1/invite_connect'
import { InviteStatus } from '@/gen/spendsense/v1/invite_pb'
import { BudgetRole } from '@/gen/spendsense/v1/common_pb'
import { publicTransport, createTransport } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import Link from '@mui/material/Link'
import NextLink from 'next/link'
import GroupsIcon from '@mui/icons-material/Groups'

interface Props {
  inviteToken: string
  locale: string
  isLoggedIn: boolean
  authToken?: string
}

function roleLabel(role: BudgetRole, t: ReturnType<typeof useTranslations>) {
  switch (role) {
    case BudgetRole.ADMIN: return t('budget.invites.roles.admin')
    case BudgetRole.COLLABORATOR: return t('budget.invites.roles.collaborator')
    case BudgetRole.VIEWER: return t('budget.invites.roles.viewer')
    default: return t('budget.invites.roles.unspecified')
  }
}

const publicClient = createClient(InviteService, publicTransport)

export function InviteAcceptContent({ inviteToken, locale, isLoggedIn, authToken }: Props) {
  const t = useTranslations()
  const tInvite = useTranslations('invite')

  const authedClient = useMemo(
    () => (authToken ? createClient(InviteService, createTransport(authToken)) : null),
    [authToken]
  )

  const [invite, setInvite] = useState<{
    budgetProfileId: string
    budgetName: string
    inviterName: string
    email: string
    role: BudgetRole
    status: InviteStatus
    expiresAt?: Date
  } | null>(null)
  const [loadError, setLoadError] = useState<'cancelled' | 'accepted' | 'expired' | 'notFound' | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [acceptSuccess, setAcceptSuccess] = useState(false)
  const [acceptError, setAcceptError] = useState('')

  useEffect(() => {
    publicClient.getBudgetInvite({ token: inviteToken })
      .then((res) => {
        const inv = res.invite
        if (!inv) { setLoadError('notFound'); return }

        if (inv.status === InviteStatus.CANCELLED) { setLoadError('cancelled'); return }
        if (inv.status === InviteStatus.ACCEPTED) { setLoadError('accepted'); return }
        if (inv.status === InviteStatus.EXPIRED) { setLoadError('expired'); return }

        setInvite({
          budgetProfileId: inv.budgetProfileId,
          budgetName: inv.budgetName,
          inviterName: inv.inviterName,
          email: inv.email,
          role: inv.role,
          status: inv.status,
          expiresAt: inv.expiresAt ? new Date(Number(inv.expiresAt.seconds) * 1000) : undefined,
        })
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.toLowerCase().includes('not found') || msg.toLowerCase().includes('invalid')) {
          setLoadError('notFound')
        } else if (msg.toLowerCase().includes('cancelled')) {
          setLoadError('cancelled')
        } else if (msg.toLowerCase().includes('expired')) {
          setLoadError('expired')
        } else {
          setLoadError('notFound')
        }
        logger.error('invite.load.failed', { error: msg, token: inviteToken })
      })
      .finally(() => setLoading(false))
  }, [inviteToken])

  async function handleAccept() {
    if (!authedClient || !invite) return
    setAccepting(true)
    setAcceptError('')
    try {
      const res = await authedClient.acceptBudgetInvite({ token: inviteToken })
      logger.info('invite.accept', { budgetProfileId: res.budgetProfileId })
      setAcceptSuccess(true)
      setTimeout(() => {
        window.location.href = `/${locale}/budgets/${res.budgetProfileId}`
      }, 1200)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to accept invite'
      setAcceptError(msg)
      logger.error('invite.accept.failed', { error: msg })
    } finally {
      setAccepting(false)
    }
  }

  const redirectParam = `/${locale}/invite/${inviteToken}`

  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'background.default',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 480 }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : loadError ? (
            <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
              <Typography variant="h6" fontWeight={700}>WellSpent</Typography>
              <Typography color="text.secondary" textAlign="center">
                {tInvite(`error.${loadError}`)}
              </Typography>
              <Link component={NextLink} href={`/${locale}/login`} variant="body2">
                Go to sign in
              </Link>
            </Stack>
          ) : invite ? (
            <Stack spacing={3}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <GroupsIcon color="primary" sx={{ fontSize: 36 }} />
                <Typography variant="h6" fontWeight={700}>WellSpent</Typography>
              </Box>

              <Box>
                <Typography variant="h5" fontWeight={700} gutterBottom>
                  {tInvite('title', { inviterName: invite.inviterName, budgetName: invite.budgetName })}
                </Typography>
                <Chip
                  label={tInvite('role', { role: roleLabel(invite.role, t) })}
                  size="small"
                  color="primary"
                  variant="outlined"
                />
                {invite.expiresAt && (
                  <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                    {tInvite('expires', { date: invite.expiresAt.toLocaleDateString() })}
                  </Typography>
                )}
              </Box>

              <Divider />

              {acceptSuccess ? (
                <Typography color="success.main" fontWeight={600} textAlign="center">
                  {tInvite('success')}
                </Typography>
              ) : isLoggedIn ? (
                <Stack spacing={1}>
                  {acceptError && (
                    <Typography variant="body2" color="error">{acceptError}</Typography>
                  )}
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    onClick={handleAccept}
                    disabled={accepting}
                  >
                    {accepting ? tInvite('accepting') : tInvite('accept')}
                  </Button>
                </Stack>
              ) : (
                <Stack spacing={2}>
                  <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    component={NextLink}
                    href={`/${locale}/login?redirect=${encodeURIComponent(redirectParam)}`}
                  >
                    {tInvite('signIn')}
                  </Button>
                  <Typography variant="body2" textAlign="center" color="text.secondary">
                    {tInvite('noAccount')}{' '}
                    <Link
                      component={NextLink}
                      href={`/${locale}/register?redirect=${encodeURIComponent(redirectParam)}`}
                    >
                      {tInvite('register')}
                    </Link>
                  </Typography>
                </Stack>
              )}
            </Stack>
          ) : null}
        </CardContent>
      </Card>
    </Box>
  )
}
