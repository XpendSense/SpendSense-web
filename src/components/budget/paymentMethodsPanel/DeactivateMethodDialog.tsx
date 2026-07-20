'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { PaymentMethod } from '@/gen/wellspent/v1/budget_pb'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'

interface Props {
  method: PaymentMethod | null
  methods: PaymentMethod[]
  personMap: Map<string, string>
  isDeleting: boolean
  fullScreen: boolean
  onCancel: () => void
  onConfirm: (replacementId: string) => void
}

export function DeactivateMethodDialog({ method, methods, personMap, isDeleting, fullScreen, onCancel, onConfirm }: Props) {
  const t = useTranslations('budget.paymentMethods')
  const [replacementId, setReplacementId] = useState('')

  useEffect(() => {
    setReplacementId('')
  }, [method])

  return (
    <Dialog open={method !== null} onClose={onCancel} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{t('deactivateDialog.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            {t('deactivateDialog.body', { name: method ? (method.alias || method.name) : '' })}
          </Typography>
          <TextField
            select
            label={t('deactivateDialog.reassignTo')}
            value={replacementId}
            onChange={(e) => setReplacementId(e.target.value)}
            fullWidth
          >
            {methods
              .filter((m) => m.id !== method?.id)
              .map((m) => {
                const owner = m.budgetPersonId !== 0n ? personMap.get(m.budgetPersonId.toString()) : undefined
                return (
                  <MenuItem key={m.id} value={m.id}>
                    {m.alias || m.name}{owner ? ` · ${owner}` : ''}
                  </MenuItem>
                )
              })}
          </TextField>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">{t('deactivateDialog.cancel')}</Button>
        <LoadingButton
          variant="contained"
          color="error"
          onClick={() => onConfirm(replacementId)}
          disabled={!replacementId}
          loading={isDeleting}
        >
          {t('deactivateDialog.deactivate')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
