'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePlaidLink } from 'react-plaid-link'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { PlaidService } from '@/gen/spendsense/v1/plaid_connect'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { PlaidConnection } from '@/gen/spendsense/v1/plaid_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import LinkOffIcon from '@mui/icons-material/LinkOff'

// Inner component — mounts only when we have a linkToken; auto-opens Plaid Link
function PlaidLinkLauncher({
  token,
  onSuccess,
  onExit,
}: {
  token: string
  onSuccess: (publicToken: string) => void
  onExit: () => void
}) {
  const { open, ready } = usePlaidLink({
    token,
    onSuccess: (public_token) => onSuccess(public_token),
    onExit: () => onExit(),
  })

  useEffect(() => {
    if (ready) open()
  }, [ready, open])

  return null
}

function statusColor(status: string): 'success' | 'warning' | 'error' | 'default' {
  if (status === 'active') return 'success'
  if (status === 'error') return 'error'
  return 'default'
}

function ConnectionRow({
  conn,
  budgetName,
  onDisconnect,
  disconnecting,
}: {
  conn: PlaidConnection
  budgetName: string
  onDisconnect: () => void
  disconnecting: boolean
}) {
  const t = useTranslations('settings.plaid')
  const name = conn.institutionName || t('unknownBank')
  const lastSynced = conn.lastSyncedAt
    ? new Date(Number(conn.lastSyncedAt.seconds) * 1000).toLocaleDateString()
    : t('neverSynced')

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        py: 1,
        px: 1.5,
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        gap: 1,
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AccountBalanceIcon fontSize="small" color="action" />
          <Typography variant="body2" fontWeight={600} noWrap>
            {name}
          </Typography>
          <Chip
            label={t(`status.${conn.status}`) || conn.status}
            color={statusColor(conn.status)}
            size="small"
            sx={{ height: 18, fontSize: 10 }}
          />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {budgetName} · {t('lastSynced', { date: lastSynced })}
        </Typography>
      </Stack>

      {conn.status !== 'disconnected' && (
        <Tooltip title={t('disconnect')}>
          <span>
            <IconButton
              size="small"
              color="error"
              onClick={onDisconnect}
              disabled={disconnecting}
            >
              {disconnecting ? <CircularProgress size={16} /> : <LinkOffIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      )}
    </Box>
  )
}

export function PlaidSection() {
  const t = useTranslations('settings.plaid')
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const { showError } = useSnackbar()
  const queryClient = useQueryClient()

  const plaidClient = useClient(PlaidService)
  const budgetClient = useClient(BudgetService)

  const [pickingBudget, setPickingBudget] = useState(false)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [connectingBudgetId, setConnectingBudgetId] = useState<string | null>(null)
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<PlaidConnection | null>(null)

  const { data: connectionsData, isLoading: loadingConnections } = useQuery({
    queryKey: ['plaidConnections'],
    queryFn: () => plaidClient.getPlaidConnections({}),
  })

  const { data: budgetsData } = useQuery({
    queryKey: ['budgets', 'list'],
    queryFn: () => budgetClient.listBudgetProfiles({}),
  })

  const connections = connectionsData?.connections ?? []
  const budgets = budgetsData?.profiles ?? []

  const budgetNameMap = Object.fromEntries(budgets.map((b) => [b.id, b.name]))

  const createTokenMutation = useMutation({
    mutationFn: (budgetProfileId: string) =>
      plaidClient.createLinkToken({ budgetProfileId }),
  })

  const exchangeMutation = useMutation({
    mutationFn: ({ publicToken, budgetProfileId }: { publicToken: string; budgetProfileId: string }) =>
      plaidClient.exchangePublicToken({ publicToken, budgetProfileId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaidConnections'] })
      logger.info('plaid.connect.success')
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: (connectionId: string) =>
      plaidClient.disconnectPlaid({ connectionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plaidConnections'] })
      logger.info('plaid.disconnect.success')
    },
  })

  async function handleBudgetSelected(budgetId: string) {
    setPickingBudget(false)
    try {
      const res = await createTokenMutation.mutateAsync(budgetId)
      setConnectingBudgetId(budgetId)
      setLinkToken(res.linkToken)
    } catch (err) {
      showError(err)
    }
  }

  const handlePlaidSuccess = useCallback(
    async (publicToken: string) => {
      setLinkToken(null)
      if (!connectingBudgetId) return
      try {
        await exchangeMutation.mutateAsync({
          publicToken,
          budgetProfileId: connectingBudgetId,
        })
      } catch (err) {
        showError(err)
      } finally {
        setConnectingBudgetId(null)
      }
    },
    [connectingBudgetId, exchangeMutation, showError],
  )

  const handlePlaidExit = useCallback(() => {
    setLinkToken(null)
    setConnectingBudgetId(null)
  }, [])

  async function handleDisconnectConfirm() {
    if (!confirmDisconnect) return
    const id = confirmDisconnect.id
    setConfirmDisconnect(null)
    setDisconnectingId(id)
    try {
      await disconnectMutation.mutateAsync(id)
    } catch (err) {
      showError(err)
    } finally {
      setDisconnectingId(null)
    }
  }

  const isFetchingToken = createTokenMutation.isPending || exchangeMutation.isPending

  return (
    <Box>
      {linkToken && (
        <PlaidLinkLauncher
          token={linkToken}
          onSuccess={handlePlaidSuccess}
          onExit={handlePlaidExit}
        />
      )}

      <Stack spacing={1.5}>
        {loadingConnections ? (
          <CircularProgress size={20} />
        ) : connections.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t('empty')}
          </Typography>
        ) : (
          connections.map((conn) => (
            <ConnectionRow
              key={conn.id}
              conn={conn}
              budgetName={budgetNameMap[conn.budgetProfileId] ?? t('unknownBudget')}
              onDisconnect={() => setConfirmDisconnect(conn)}
              disconnecting={disconnectingId === conn.id}
            />
          ))
        )}

        <Button
          variant="outlined"
          startIcon={isFetchingToken ? <CircularProgress size={16} /> : <AccountBalanceIcon />}
          disabled={isFetchingToken}
          onClick={() => setPickingBudget(true)}
          sx={{ alignSelf: 'flex-start' }}
          size="small"
        >
          {t('connect')}
        </Button>
      </Stack>

      {/* Budget picker dialog */}
      <Dialog
        open={pickingBudget}
        onClose={() => setPickingBudget(false)}
        fullScreen={fullScreen}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('pickBudget')}</DialogTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          {budgets.length === 0 ? (
            <Typography sx={{ p: 2 }} color="text.secondary" variant="body2">
              {t('noBudgets')}
            </Typography>
          ) : (
            <List disablePadding>
              {budgets.map((b) => (
                <ListItemButton key={b.id} onClick={() => handleBudgetSelected(b.id)}>
                  <ListItemText primary={b.name} />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPickingBudget(false)}>{t('cancel')}</Button>
        </DialogActions>
      </Dialog>

      {/* Disconnect confirmation dialog */}
      <Dialog
        open={!!confirmDisconnect}
        onClose={() => setConfirmDisconnect(null)}
        fullScreen={fullScreen}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{t('disconnectTitle')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            {t('disconnectBody', {
              name: confirmDisconnect?.institutionName || t('unknownBank'),
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDisconnect(null)}>{t('cancel')}</Button>
          <Button
            color="error"
            onClick={handleDisconnectConfirm}
            disabled={disconnectMutation.isPending}
          >
            {t('disconnect')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
