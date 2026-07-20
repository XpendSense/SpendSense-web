'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import type { PaymentMethod } from '@/gen/wellspent/v1/budget_pb'
import { ColorPicker } from '@/components/ui/ColorPicker'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import TextField from '@mui/material/TextField'

interface Props {
  method: PaymentMethod | null
  isSaving: boolean
  fullScreen: boolean
  onCancel: () => void
  onConfirm: (name: string, alias: string, color: string) => void
}

export function EditPaymentMethodDialog({ method, isSaving, fullScreen, onCancel, onConfirm }: Props) {
  const t = useTranslations('budget.paymentMethods')
  const [name, setName] = useState('')
  const [alias, setAlias] = useState('')
  const [color, setColor] = useState('')

  useEffect(() => {
    setName(method?.name ?? '')
    setAlias(method?.alias ?? '')
    setColor(method?.color ?? '')
  }, [method])

  return (
    <Dialog open={method !== null} onClose={onCancel} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{t('editDialog.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={t('editDialog.alias')}
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            fullWidth
            placeholder={name}
            helperText={t('editDialog.aliasHint')}
          />
          <TextField
            label={t('editDialog.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder={t('editDialog.namePlaceholder')}
            helperText={t('editDialog.nameHint')}
          />
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              {t('editDialog.colorOptional')}
            </Typography>
            <ColorPicker value={color} onChange={setColor} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">{t('editDialog.cancel')}</Button>
        <LoadingButton
          variant="contained"
          onClick={() => onConfirm(name, alias, color)}
          disabled={!name.trim()}
          loading={isSaving}
        >
          {t('editDialog.save')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
