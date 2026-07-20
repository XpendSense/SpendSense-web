'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Transaction } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Typography from '@mui/material/Typography'

interface Props {
  transaction: Transaction
  budgetPeriodId: string
  isSavings?: boolean
  onClose: () => void
  onDone: () => void
}

function tsToDateString(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) return ''
  const d = new Date(Number(ts.seconds) * 1000)
  return d.toISOString().slice(0, 10)
}

function dateStringToTs(s: string): { seconds: bigint; nanos: number } {
  return { seconds: BigInt(Math.floor(new Date(s + 'T00:00:00Z').getTime() / 1000)), nanos: 0 }
}

function numericAmount(m: { units: bigint; nanos: number } | undefined): string {
  if (!m) return '0'
  const val = Number(m.units) + m.nanos / 1e9
  return val.toFixed(2)
}

export function MarkAsPaidDialog({ transaction: tx, budgetPeriodId, isSavings = false, onClose, onDone }: Props) {
  const t = useTranslations('budget.transactions.markAsPaid')
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState(numericAmount(tx.plannedAmount))
  const [date, setDate] = useState(tsToDateString(tx.date))

  const { mutateAsync, isPending } = useMutation({
    mutationFn: () => {
      const units = BigInt(Math.floor(parseFloat(amount)))
      const nanos = Math.round((parseFloat(amount) - Number(units)) * 1e9)
      return client.markTransactionAsPaid({
        id: tx.id,
        budgetPeriodId,
        paidAmount: { units, nanos, currency: tx.plannedAmount?.currency ?? 'USD' },
        paidAt: dateStringToTs(date),
      })
    },
  })

  async function handleConfirm() {
    try {
      await mutateAsync()
      logger.info('transaction.markAsPaid', { id: tx.id, amount, date })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  const isValid = isSavings || (!!amount && parseFloat(amount) > 0 && !!date)

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <Typography variant="body2" color="text.secondary">
          {t('description', { name: tx.name })}
        </Typography>
        {!isSavings && (
          <>
            <TextField
              label={t('amount')}
              type="number"
              inputProps={{ min: 0, step: 0.01, inputMode: 'decimal' }}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              fullWidth
              size="small"
            />
            <TextField
              label={t('date')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <LoadingButton variant="contained" onClick={handleConfirm} disabled={!isValid} loading={isPending}>
          {t('confirm')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
