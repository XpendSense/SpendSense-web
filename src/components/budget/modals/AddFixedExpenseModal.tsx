'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Timestamp } from '@bufbuild/protobuf'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { PaymentMethodSelect } from '@/components/budget/PaymentMethodSelect'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Divider from '@mui/material/Divider'

interface Props {
  budgetProfileId: string
  budgetPeriodId: string
  open: boolean
  onClose: () => void
  onDone: () => void
}

function todayDay(): number {
  return new Date().getDate()
}

function dateToString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function parseUTCDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

// Adds N months to a UTC date, clamping to month end if needed.
function addUTCMonths(d: Date, n: number): Date {
  const result = new Date(d)
  result.setUTCMonth(result.getUTCMonth() + n)
  return result
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
}

export function AddFixedExpenseModal({ budgetProfileId, budgetPeriodId, open, onClose, onDone }: Props) {
  const t = useTranslations('budget.fixedExpense')
  const { showError } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(todayDay)
  const [endDateStr, setEndDateStr] = useState('')
  const [paymentsInput, setPaymentsInput] = useState('')

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', budgetProfileId],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: {
      name: string
      plannedAmount: { units: bigint; nanos: number }
      categoryId: number
      paymentMethodId: string
      dayOfMonth: number
      endDate?: Timestamp
      totalPayments: number
    }) => client.createFixedExpense({ budgetProfileId, ...vars }),
  })

  function handlePaymentsChange(val: string) {
    setPaymentsInput(val)
    const n = parseInt(val, 10)
    if (!isNaN(n) && n > 0) {
      const anchor = new Date()
      // anchor is the first payment; end = anchor + (n-1) months
      setEndDateStr(dateToString(addUTCMonths(anchor, n - 1)))
    } else if (val === '') {
      setEndDateStr('')
    }
  }

  function handleEndDateChange(val: string) {
    setEndDateStr(val)
    if (val) {
      const anchor = new Date()
      const end = parseUTCDate(val)
      const months = monthsBetween(anchor, end) + 1
      setPaymentsInput(String(Math.max(1, months)))
    } else {
      setPaymentsInput('')
    }
  }

  const canSave = !!name.trim() && !!amount && dayOfMonth >= 1 && dayOfMonth <= 31

  async function handleSave() {
    if (!canSave) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    const totalPayments = parseInt(paymentsInput, 10) || 0
    let endDate: Timestamp | undefined
    if (endDateStr) {
      const d = parseUTCDate(endDateStr)
      endDate = Timestamp.fromDate(d)
    }
    try {
      await mutateAsync({ name, plannedAmount: { units: BigInt(units), nanos }, categoryId, paymentMethodId, dayOfMonth, endDate, totalPayments })
      logger.info('fixedExpense.create', { budgetProfileId, name })
      queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId, 1] })
      setName('')
      setAmount('')
      setCategoryId(0)
      setPaymentMethodId('')
      setDayOfMonth(todayDay())
      setEndDateStr('')
      setPaymentsInput('')
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{t('addTitle')}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('fields.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth autoFocus />
          <TextField
            label={t('fields.amount')}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
          />
          <TextField
            label={t('fields.dayOfMonth')}
            type="number"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
            fullWidth
            inputProps={{ min: 1, max: 31, inputMode: 'decimal' }}
            helperText={t('fields.dayOfMonthHint')}
          />
          <TextField select label={t('fields.category')} value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} fullWidth>
            <MenuItem value={0}>{t('fields.noCategory')}</MenuItem>
            {(categoriesData?.categories ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
          <PaymentMethodSelect
            budgetProfileId={budgetProfileId}
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            label={t('fields.paymentMethod')}
            size="medium"
          />
          <Divider />
          <Typography variant="body2" color="text.secondary">{t('paymentPlan.label')}</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label={t('paymentPlan.numberOfPayments')}
              type="number"
              value={paymentsInput}
              onChange={(e) => handlePaymentsChange(e.target.value)}
              fullWidth
              inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
              helperText={t('paymentPlan.numberOfPaymentsHint')}
            />
            <TextField
              label={t('paymentPlan.endDate')}
              type="date"
              value={endDateStr}
              onChange={(e) => handleEndDateChange(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText={t('paymentPlan.endDateHint')}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">{t('cancel')}</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || isPending}>
          {isPending ? t('saving') : t('add')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
