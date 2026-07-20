'use client'

import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { SavingsSource } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { PaymentMethodSelect } from '@/components/budget/PaymentMethodSelect'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import FormHelperText from '@mui/material/FormHelperText'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

interface Props {
  budgetProfileId: string
  activePeriodStart?: Date
  source: SavingsSource
  onClose: () => void
  onDone: () => void
}

const VALID_COUNTS = new Set([0, 1, 2, 4])

function inferFrequencyLabel(count: number): string {
  if (count === 1) return 'Monthly'
  if (count === 2) return 'Bi-weekly'
  if (count === 4) return 'Weekly'
  return ''
}

export function EditSavingsModal({ budgetProfileId, activePeriodStart, source, onClose, onDone }: Props) {
  const t = useTranslations('budget.savings.editDialog')
  const { showError } = useSnackbar()
  const fullScreen = useIsMobile()
  const queryClient = useQueryClient()

  const [name, setName] = useState(source.name)
  const [amount, setAmount] = useState(() => {
    const total = Number(source.amount?.units ?? 0n) + (source.amount?.nanos ?? 0) / 1e9
    return total.toString()
  })
  const [paymentMethodId, setPaymentMethodId] = useState(source.paymentMethodId ?? '')
  const [paymentDays, setPaymentDays] = useState<number[]>([...source.paymentDays].sort((a, b) => a - b))

  useEffect(() => {
    setName(source.name)
    const total = Number(source.amount?.units ?? 0n) + (source.amount?.nanos ?? 0) / 1e9
    setAmount(total.toString())
    setPaymentMethodId(source.paymentMethodId ?? '')
    setPaymentDays([...source.paymentDays].sort((a, b) => a - b))
  }, [source])

  const client = useClient(BudgetService)

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: {
      name: string
      amount: { units: bigint; nanos: number }
      paymentMethodId: string
      paymentDays: number[]
    }) => client.updateSavingsSource({ id: source.id, budgetProfileId, ...vars }),
  })

  function toggleDay(day: number) {
    setPaymentDays(prev => {
      if (prev.includes(day)) return prev.filter(d => d !== day).sort((a, b) => a - b)
      if (prev.length >= 4) return prev
      return [...prev, day].sort((a, b) => a - b)
    })
  }

  async function handleSave() {
    if (!name.trim() || !amount || !VALID_COUNTS.has(paymentDays.length)) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    try {
      await mutateAsync({ name, amount: { units: BigInt(units), nanos }, paymentMethodId, paymentDays })
      logger.info('budget.savings.update', { budgetProfileId, id: source.id.toString(), name })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  const isValid = name.trim() !== '' && amount !== '' && VALID_COUNTS.has(paymentDays.length)
  const freqLabel = inferFrequencyLabel(paymentDays.length)

  const daysInMonth = useMemo(() => {
    const ref = activePeriodStart ?? new Date()
    return new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate()
  }, [activePeriodStart])

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t('name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder={t('namePlaceholder')}
          />
          <TextField
            label={t('amount')}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
          />
          <PaymentMethodSelect
            budgetProfileId={budgetProfileId}
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            label={t('paymentMethod')}
            includeNone
            noneLabel={t('noPaymentMethod')}
          />
          <Box>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('paymentDays')}
              {freqLabel && (
                <Box component="span" sx={{ ml: 1, color: 'primary.main', fontWeight: 500 }}>
                  — {freqLabel}
                </Box>
              )}
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => (
                <Chip
                  key={day}
                  label={day}
                  size="small"
                  color={paymentDays.includes(day) ? 'primary' : 'default'}
                  onClick={() => toggleDay(day)}
                  sx={{ width: 36, cursor: 'pointer' }}
                />
              ))}
            </Box>
            <FormHelperText>{t('dayHint')}</FormHelperText>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{t('cancel')}</Button>
        <LoadingButton variant="contained" onClick={handleSave} disabled={!isValid} loading={isPending}>
          {t('save')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
