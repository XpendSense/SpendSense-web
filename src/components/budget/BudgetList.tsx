'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useLocale } from 'next-intl'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { BudgetProfile } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { formatError, isSessionError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import LogoutIcon from '@mui/icons-material/Logout'
import Tooltip from '@mui/material/Tooltip'
import { BudgetSetupFlow } from './BudgetSetupFlow'
import { useRouter } from '@/i18n/navigation'

function DeleteConfirmDialog({
  budget,
  onClose,
  onConfirm,
  isDeleting,
}: {
  budget: BudgetProfile
  onClose: () => void
  onConfirm: () => void
  isDeleting: boolean
}) {
  const t = useTranslations('budget.list.deleteDialog')
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          {t('body', { name: budget.name })}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={isDeleting}>{t('cancel')}</Button>
        <LoadingButton onClick={onConfirm} color="error" variant="contained" loading={isDeleting}>
          {t('delete')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}

export function BudgetList() {
  const t = useTranslations('budget.list')
  const tAuth = useTranslations('auth')
  const locale = useLocale()
  const router = useRouter()
  const { showError, showSuccess } = useSnackbar()

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login', { locale })
  }

  const [setupOpen, setSetupOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<BudgetProfile | null>(null)
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['budgets', 'list'],
    queryFn: () => client.listBudgetProfiles({}),
  })

  useEffect(() => {
    if (isError && isSessionError(error)) {
      fetch('/api/auth/logout', { method: 'POST' }).then(() => router.push('/login', { locale }))
    }
  }, [isError, error]) // eslint-disable-line react-hooks/exhaustive-deps

  const { mutateAsync: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => client.deleteBudgetProfile({ id }),
  })

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await doDelete(deleteTarget.id)
      logger.info('budget.delete', { budgetId: deleteTarget.id, name: deleteTarget.name })
      showSuccess(`"${deleteTarget.name}" deleted.`)
      setDeleteTarget(null)
      queryClient.invalidateQueries({ queryKey: ['budgets', 'list'] })
    } catch (err) {
      showError(err)
    }
  }

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  if (isError) {
    const message = formatError(error)
    logger.error('budget.list.failed', { error: message })
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="error" mb={2}>{message}</Typography>
        <Button variant="outlined" onClick={() => refetch()}>{t('retry')}</Button>
      </Box>
    )
  }

  const profiles = data?.profiles ?? []

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>{t('title')}</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSetupOpen(true)}>
            {t('newBudget')}
          </Button>
          <Tooltip title={tAuth('logout')}>
            <IconButton onClick={handleLogout} aria-label={tAuth('logout')}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {profiles.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="body1" mb={2}>{t('empty')}</Typography>
          <Button variant="outlined" onClick={() => setSetupOpen(true)}>{t('createBudget')}</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
          {profiles.map((profile) => (
            <Card key={profile.id} variant="outlined">
              <CardActionArea onClick={() => {
                logger.info('budget.open', { budgetId: profile.id })
                router.push(`/budgets/${profile.id}`)
              }}>
                <CardContent>
                  <Typography variant="h6">{profile.name}</Typography>
                  <Typography variant="body2" color="text.secondary">{t('monthly')}</Typography>
                </CardContent>
              </CardActionArea>
              <CardActions sx={{ justifyContent: 'flex-end', pt: 0 }}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDeleteTarget(profile)
                  }}
                  aria-label={`Delete ${profile.name}`}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      <BudgetSetupFlow
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onComplete={() => {
          setSetupOpen(false)
          refetch()
        }}
      />

      {deleteTarget && (
        <DeleteConfirmDialog
          budget={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          isDeleting={isDeleting}
        />
      )}
    </Box>
  )
}
