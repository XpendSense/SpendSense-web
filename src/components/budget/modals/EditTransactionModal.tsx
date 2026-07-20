'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Transaction } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { PaymentMethodSelect } from '@/components/budget/PaymentMethodSelect'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

type Flow = 'spent' | 'received'

interface Props {
  budgetProfileId: string
  transaction: Transaction
  onClose: () => void
  onDone: () => void
}

function moneyToString(units: bigint, nanos: number): string {
  const total = Math.abs(Number(units) + nanos / 1e9)
  return total.toFixed(2)
}

function amountToFlow(units: bigint, nanos: number): Flow {
  return Number(units) + nanos / 1e9 < 0 ? 'received' : 'spent'
}

function timestampToDateString(ts: { seconds: bigint } | undefined): string {
  const d = ts && ts.seconds !== 0n ? new Date(Number(ts.seconds) * 1000) : new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function timestampToDayOfMonth(ts: { seconds: bigint } | undefined): number {
  if (!ts || ts.seconds === 0n) return new Date().getUTCDate()
  return new Date(Number(ts.seconds) * 1000).getUTCDate()
}

function dateStringToTimestamp(str: string): { seconds: bigint; nanos: number } {
  const [year, month, day] = str.split('-').map(Number)
  return { seconds: BigInt(Math.floor(Date.UTC(year, month - 1, day) / 1000)), nanos: 0 }
}

function dayOfMonthToTimestamp(day: number): { seconds: bigint; nanos: number } {
  const now = new Date()
  return { seconds: BigInt(Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day) / 1000)), nanos: 0 }
}

export function EditTransactionModal({ budgetProfileId, transaction, onClose, onDone }: Props) {
  const t = useTranslations('budget.transactions')
  const { showError } = useSnackbar()
  const fullScreen = useIsMobile()
  const client = useClient(BudgetService)

  const [name, setName] = useState(transaction.name)
  const [amount, setAmount] = useState(() =>
    moneyToString(transaction.amount?.units ?? 0n, transaction.amount?.nanos ?? 0)
  )
  const [flow, setFlow] = useState<Flow>(() =>
    amountToFlow(transaction.amount?.units ?? 0n, transaction.amount?.nanos ?? 0)
  )
  const [typeId, setTypeId] = useState(transaction.transactionTypeId)
  const [date, setDate] = useState(() => timestampToDateString(transaction.date))
  const [dayOfMonth, setDayOfMonth] = useState(() => timestampToDayOfMonth(transaction.date))
  const [categoryId, setCategoryId] = useState(transaction.categoryId)
  const [paymentMethodId, setPaymentMethodId] = useState(transaction.paymentMethodId)
  const [recurring, setRecurring] = useState(transaction.recurring)

  const isFixed = typeId === 1

  useEffect(() => {
    setName(transaction.name)
    const units = transaction.amount?.units ?? 0n
    const nanos = transaction.amount?.nanos ?? 0
    setAmount(moneyToString(units, nanos))
    setFlow(amountToFlow(units, nanos))
    setTypeId(transaction.transactionTypeId)
    setDate(timestampToDateString(transaction.date))
    setDayOfMonth(timestampToDayOfMonth(transaction.date))
    setCategoryId(transaction.categoryId)
    setPaymentMethodId(transaction.paymentMethodId)
    setRecurring(transaction.recurring)
  }, [transaction])

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', budgetProfileId],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: {
      name: string
      amount: { units: bigint; nanos: number }
      date: { seconds: bigint; nanos: number }
      categoryId: number
      paymentMethodId: string
      transactionTypeId: number
      transactionFrequencyId: number
      recurring: boolean
    }) => client.updateTransaction({ id: transaction.id, plannedAmount: vars.amount, ...vars }),
  })

  const isDateValid = isFixed ? dayOfMonth >= 1 && dayOfMonth <= 31 : !!date
  const canSave = !!name.trim() && !!amount && !!paymentMethodId && isDateValid

  async function handleSave() {
    if (!canSave) return
    const rawAmt = parseFloat(amount)
    // Fixed expenses are always outgoing — no flow sign
    const signedAmt = !isFixed && flow === 'received' ? -rawAmt : rawAmt
    const units = BigInt(Math.trunc(signedAmt))
    const nanos = Math.round((signedAmt - Number(units)) * 1e9)
    const txDate = isFixed ? dayOfMonthToTimestamp(dayOfMonth) : dateStringToTimestamp(date)
    try {
      await mutateAsync({
        name,
        amount: { units, nanos },
        date: txDate,
        categoryId,
        paymentMethodId,
        transactionTypeId: typeId,
        transactionFrequencyId: recurring ? 4 : 1,
        recurring,
      })
      logger.info('transaction.update', { budgetProfileId, id: transaction.id, name, flow })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="sm">
      <DialogTitle>Edit Transaction</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Description"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
          />
          <Stack direction="row" spacing={1} alignItems="flex-start">
            {!isFixed && (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={flow}
                onChange={(_, v) => v && setFlow(v as Flow)}
                sx={{ alignSelf: 'center' }}
              >
                <ToggleButton value="spent">{t('flow.spent')}</ToggleButton>
                <ToggleButton value="received">{t('flow.received')}</ToggleButton>
              </ToggleButtonGroup>
            )}
            <TextField
              select
              label="Type"
              value={typeId}
              onChange={(e) => { const v = Number(e.target.value); setTypeId(v); if (v === 1) setFlow('spent') }}
              sx={{ flex: 1 }}
            >
              <MenuItem value={1}>Fixed</MenuItem>
              <MenuItem value={2}>Variable</MenuItem>
            </TextField>
          </Stack>
          {isFixed ? (
            <TextField
              label="Day of month"
              type="number"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
              fullWidth
              inputProps={{ min: 1, max: 31, inputMode: 'decimal' }}
              helperText="Which day of the month this expense falls on"
            />
          ) : (
            <TextField
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />
          )}
          <TextField
            select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            fullWidth
          >
            <MenuItem value={0}>— None —</MenuItem>
            {(categoriesData?.categories ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {c.color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />}
                  {c.name}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <PaymentMethodSelect
            budgetProfileId={budgetProfileId}
            value={paymentMethodId}
            onChange={setPaymentMethodId}
            label="Payment method"
            required
            size="medium"
          />
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
          />
          {!isFixed && (
            <FormControlLabel
              control={<Checkbox checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />}
              label="Recurring"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          onClick={handleSave}
          disabled={!canSave}
          loading={isPending}
        >
          Save
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
