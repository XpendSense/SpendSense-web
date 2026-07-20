'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import type { BudgetInvite } from '@/gen/wellspent/v1/invite_pb'
import { InviteService } from '@/gen/wellspent/v1/invite_connect'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { InviteStatus } from '@/gen/wellspent/v1/invite_pb'
import { BudgetRole } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import CancelIcon from '@mui/icons-material/Cancel'
import RefreshIcon from '@mui/icons-material/Refresh'

interface Props {
  budgetProfileId: string
  canManageUsers?: boolean
}

const ROLE_OPTIONS = [
  { value: BudgetRole.COLLABORATOR, labelKey: 'budget.invites.roles.collaborator' },
  { value: BudgetRole.VIEWER, labelKey: 'budget.invites.roles.viewer' },
]

function statusColor(status: string): 'default' | 'warning' | 'success' | 'error' {
  switch (status) {
    case 'pending': return 'warning'
    case 'accepted': return 'success'
    case 'cancelled': return 'error'
    default: return 'default'
  }
}

export function InvitePanel({ budgetProfileId, canManageUsers = true }: Props) {
  const t = useTranslations()
  const tInvites = useTranslations('budget.invites')
  const { showError, showSuccess } = useSnackbar()
  const inviteClient = useClient(InviteService)
  const budgetClient = useClient(BudgetService)
  const queryClient = useQueryClient()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<BudgetRole>(BudgetRole.COLLABORATOR)
  const [budgetPersonId, setBudgetPersonId] = useState<bigint>(0n)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)

  const { data: invitesData, isLoading } = useQuery({
    queryKey: ['budget-invites', budgetProfileId],
    queryFn: () => inviteClient.listBudgetInvites({ budgetProfileId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => budgetClient.listBudgetPeople({ budgetProfileId }),
  })

  const { mutateAsync: doSend, isPending: isSending } = useMutation({
    mutationFn: () =>
      inviteClient.sendBudgetInvite({
        budgetProfileId,
        email: email.trim(),
        role,
        budgetPersonId: budgetPersonId > 0n ? budgetPersonId : 0n,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-invites', budgetProfileId] })
    },
  })

  const { mutateAsync: doCancel } = useMutation({
    mutationFn: (id: string) =>
      inviteClient.cancelBudgetInvite({ id, budgetProfileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-invites', budgetProfileId] })
    },
  })

  async function handleSend() {
    if (!email.trim()) return
    try {
      await doSend()
      logger.info('invite.send', { budgetProfileId, email: email.trim(), role })
      showSuccess(tInvites('send.success', { email: email.trim() }))
      setEmail('')
      setRole(BudgetRole.COLLABORATOR)
      setBudgetPersonId(0n)
    } catch (err) {
      showError(err)
    }
  }

  async function handleCancel(id: string) {
    setCancellingId(id)
    try {
      await doCancel(id)
      logger.info('invite.cancel', { budgetProfileId, inviteId: id })
      showSuccess('Invite cancelled')
    } catch (err) {
      showError(err)
    } finally {
      setCancellingId(null)
    }
  }

  async function handleResend(inv: BudgetInvite) {
    setResendingId(inv.id)
    try {
      // Cancel the old invite first to avoid duplicate pending invites for the same email.
      if (inv.status === InviteStatus.PENDING) {
        await inviteClient.cancelBudgetInvite({ id: inv.id, budgetProfileId })
      }
      await inviteClient.sendBudgetInvite({
        budgetProfileId,
        email: inv.email,
        role: inv.role,
        budgetPersonId: inv.budgetPersonId,
      })
      queryClient.invalidateQueries({ queryKey: ['budget-invites', budgetProfileId] })
      logger.info('invite.resend', { budgetProfileId, email: inv.email })
      showSuccess(tInvites('send.success', { email: inv.email }))
    } catch (err) {
      showError(err)
    } finally {
      setResendingId(null)
    }
  }

  // Keep only the latest invite per email — resends create new rows so older ones are suppressed.
  const invites = useMemo(() => {
    const all = invitesData?.invites ?? []
    const byEmail = new Map<string, typeof all[number]>()
    for (const inv of all) {
      const existing = byEmail.get(inv.email)
      const invTime = Number(inv.expiresAt?.seconds ?? 0)
      const existingTime = Number(existing?.expiresAt?.seconds ?? 0)
      if (!existing || invTime > existingTime) byEmail.set(inv.email, inv)
    }
    return [...byEmail.values()]
  }, [invitesData])
  const guestPeople = (peopleData?.people ?? []).filter((p) => !p.userId)

  function statusLabel(status: InviteStatus): string {
    switch (status) {
      case InviteStatus.PENDING: return tInvites('list.status.pending')
      case InviteStatus.ACCEPTED: return tInvites('list.status.accepted')
      case InviteStatus.CANCELLED: return tInvites('list.status.cancelled')
      case InviteStatus.EXPIRED: return tInvites('list.status.expired')
      default: return ''
    }
  }

  function roleLabel(r: BudgetRole): string {
    switch (r) {
      case BudgetRole.ADMIN: return tInvites('roles.admin')
      case BudgetRole.COLLABORATOR: return tInvites('roles.collaborator')
      case BudgetRole.VIEWER: return tInvites('roles.viewer')
      default: return tInvites('roles.unspecified')
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Send invite form — admin only */}
      {canManageUsers && (
        <>
          <Box>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              {tInvites('send.title')}
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label={tInvites('send.email')}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="small"
                fullWidth
              />
              <FormControl fullWidth size="small">
                <InputLabel>{tInvites('send.role')}</InputLabel>
                <Select
                  label={tInvites('send.role')}
                  value={role}
                  onChange={(e) => setRole(e.target.value as BudgetRole)}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <MenuItem key={opt.value} value={opt.value}>
                      {t(opt.labelKey)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {guestPeople.length > 0 && (
                <FormControl fullWidth size="small">
                  <InputLabel>{tInvites('send.linkPerson')}</InputLabel>
                  <Select
                    label={tInvites('send.linkPerson')}
                    value={budgetPersonId === 0n ? '' : budgetPersonId.toString()}
                    onChange={(e) => setBudgetPersonId(e.target.value ? BigInt(e.target.value as string) : 0n)}
                  >
                    <MenuItem value="">{tInvites('send.noPerson')}</MenuItem>
                    {guestPeople.map((p) => (
                      <MenuItem key={p.id.toString()} value={p.id.toString()}>
                        {p.userName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <LoadingButton
                variant="contained"
                onClick={handleSend}
                disabled={!email.trim()}
                loading={isSending}
                fullWidth
              >
                {tInvites('send.submit')}
              </LoadingButton>
            </Stack>
          </Box>

          <Divider />
        </>
      )}

      {/* Invite list */}
      <Box>
        <Typography variant="subtitle1" fontWeight={600} mb={1}>
          {tInvites('title')}
        </Typography>
        {isLoading ? (
          <CircularProgress size={20} />
        ) : invites.length === 0 ? (
          <Typography variant="body2" color="text.secondary">{tInvites('empty')}</Typography>
        ) : (
          <List dense disablePadding>
            {invites.map((inv) => (
              <ListItem
                key={inv.id}
                disableGutters
                secondaryAction={
                  canManageUsers && inv.status !== InviteStatus.ACCEPTED && (
                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title={tInvites('list.resend')}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => handleResend(inv)}
                            disabled={resendingId === inv.id || cancellingId === inv.id}
                            aria-label={tInvites('list.resend')}
                          >
                            {resendingId === inv.id ? (
                              <CircularProgress size={16} />
                            ) : (
                              <RefreshIcon fontSize="small" />
                            )}
                          </IconButton>
                        </span>
                      </Tooltip>
                      {inv.status === InviteStatus.PENDING && (
                        <Tooltip title={tInvites('list.cancel')}>
                          <span>
                            <IconButton
                              size="small"
                              onClick={() => handleCancel(inv.id)}
                              disabled={cancellingId === inv.id || resendingId === inv.id}
                              aria-label={tInvites('list.cancel')}
                            >
                              {cancellingId === inv.id ? (
                                <CircularProgress size={16} />
                              ) : (
                                <CancelIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      )}
                    </Stack>
                  )
                }
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <span style={{ fontWeight: 500 }}>{inv.email}</span>
                      <Chip
                        label={roleLabel(inv.role)}
                        size="small"
                        variant="outlined"
                      />
                      <Chip
                        label={statusLabel(inv.status)}
                        size="small"
                        color={statusColor(InviteStatus[inv.status]?.toLowerCase() ?? '')}
                      />
                    </Stack>
                  }
                  secondary={
                    inv.expiresAt
                      ? new Date(Number(inv.expiresAt.seconds) * 1000).toLocaleDateString()
                      : undefined
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  )
}
