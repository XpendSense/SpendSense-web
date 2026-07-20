'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { PaymentType } from '@/gen/wellspent/v1/common_pb'
import type { BudgetPerson } from '@/gen/wellspent/v1/budget_pb'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { PAYMENT_TYPE_KEYS } from './constants'
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
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'

interface Props {
  open: boolean
  people: BudgetPerson[]
  isCreating: boolean
  fullScreen: boolean
  onCancel: () => void
  onConfirm: (name: string, type: PaymentType, personId: bigint, color: string) => void
}

export function AddPaymentMethodDialog({ open, people, isCreating, fullScreen, onCancel, onConfirm }: Props) {
  const t = useTranslations('budget.paymentMethods')
  const [name, setName] = useState('')
  const [type, setType] = useState<PaymentType>(PaymentType.DEBIT)
  const [personId, setPersonId] = useState<bigint>(0n)
  const [color, setColor] = useState('')

  function reset() {
    setName('')
    setPersonId(0n)
    setColor('')
  }

  function handleCancel() {
    reset()
    onCancel()
  }

  function handleConfirm() {
    onConfirm(name, type, personId, color)
    reset()
  }

  return (
    <Dialog open={open} onClose={handleCancel} maxWidth="xs" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{t('addDialog.title')}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label={t('addDialog.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder={t('addDialog.namePlaceholder')}
          />
          <TextField
            select
            label={t('addDialog.type')}
            value={type}
            onChange={(e) => setType(Number(e.target.value) as PaymentType)}
            fullWidth
          >
            {PAYMENT_TYPE_KEYS.map((pt) => (
              <MenuItem key={pt.value} value={pt.value}>{t(`types.${pt.key}`)}</MenuItem>
            ))}
          </TextField>
          <FormControl fullWidth size="small" required>
            <InputLabel>{t('addDialog.owner')}</InputLabel>
            <Select
              label={t('addDialog.owner')}
              value={personId.toString()}
              onChange={(e) => setPersonId(BigInt(e.target.value))}
              displayEmpty
            >
              <MenuItem value="0" disabled><em>{t('addDialog.selectPerson')}</em></MenuItem>
              {people.map((p) => (
                <MenuItem key={p.id.toString()} value={p.id.toString()}>
                  {p.userName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              {t('addDialog.colorOptional')}
            </Typography>
            <ColorPicker value={color} onChange={setColor} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancel} color="inherit">{t('addDialog.cancel')}</Button>
        <LoadingButton variant="contained" onClick={handleConfirm} disabled={!name.trim() || personId === 0n} loading={isCreating}>
          {t('addDialog.add')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
