'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { PaymentMethodSelect } from '@/components/budget/PaymentMethodSelect'
import { ScrollNumberPicker } from '@/components/ui/ScrollNumberPicker'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Divider from '@mui/material/Divider'
import { Timestamp } from '@bufbuild/protobuf'

interface Props {
  budgetPeriodId: string
  budgetProfileId: string
  open?: boolean
  embedded?: boolean
  defaultTypeId?: number
  onClose?: () => void
  onSkip?: () => void
  onDone: () => void
}

function todayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateStringToTimestamp(str: string): { seconds: bigint; nanos: number } {
  const [year, month, day] = str.split('-').map(Number)
  return { seconds: BigInt(Math.floor(Date.UTC(year, month - 1, day) / 1000)), nanos: 0 }
}

type FrequencyUnitUI = 'week' | 'month' | 'year'

const FREQUENCY_COUNT_RANGE: Record<FrequencyUnitUI, { min: number; max: number }> = {
  week: { min: 1, max: 52 },
  month: { min: 1, max: 24 },
  year: { min: 1, max: 10 },
}

// frequencyUnit wire values: 1 = MONTH (default, also covers YEAR client-side
// via interval_months = years * 12), 2 = WEEK.
function parseUTCDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

function addUTCMonths(d: Date, n: number): Date {
  const result = new Date(d)
  result.setUTCMonth(result.getUTCMonth() + n)
  return result
}

function addUTCWeeks(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 7 * 24 * 60 * 60 * 1000)
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
}

function weeksBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / (7 * 24 * 60 * 60 * 1000))
}

function dateToString(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function frequencyFieldsFor(unit: FrequencyUnitUI, count: number, dayOfWeek: number) {
  if (unit === 'week') {
    return { frequencyUnit: 2, intervalMonths: 1, intervalWeeks: count, dayOfWeek }
  }
  return { frequencyUnit: 1, intervalMonths: unit === 'year' ? count * 12 : count, intervalWeeks: 1, dayOfWeek: 1 }
}

type Flow = 'spent' | 'received'

export function AddTransactionModal({ budgetPeriodId, budgetProfileId, open, embedded, defaultTypeId = 1, onClose, onSkip, onDone }: Props) {
  const t = useTranslations('budget.transactions')
  const { showError } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [flow, setFlow] = useState<Flow>('spent')
  const [date, setDate] = useState(todayString)
  const [startDateStr, setStartDateStr] = useState(todayString)
  const [frequencyUnitUI, setFrequencyUnitUI] = useState<FrequencyUnitUI>('month')
  const [frequencyCount, setFrequencyCount] = useState(1)
  const [endDateStr, setEndDateStr] = useState('')
  const [paymentsInput, setPaymentsInput] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [typeId, setTypeId] = useState<number>(defaultTypeId)
  const [recurring, setRecurring] = useState(defaultTypeId === 1)
  const client = useClient(BudgetService)

  const isFixed = typeId === 1

  useEffect(() => {
    if (open) {
      setTypeId(defaultTypeId)
      setRecurring(defaultTypeId === 1)
      setFlow('spent')
    }
  }, [open, defaultTypeId])

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', budgetProfileId],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })

  const { mutateAsync: createTx, isPending: txPending } = useMutation({
    mutationFn: (vars: {
      name: string
      amount: { units: bigint; nanos: number }
      date: { seconds: bigint; nanos: number }
      categoryId: number
      paymentMethodId: string
      transactionTypeId: number
      transactionFrequencyId: number
      recurring: boolean
    }) => client.createTransaction({ budgetPeriodId, plannedAmount: vars.amount, ...vars }),
  })

  const { mutateAsync: createFixed, isPending: fixedPending } = useMutation({
    mutationFn: (vars: {
      name: string
      plannedAmount: { units: bigint; nanos: number }
      categoryId: number
      paymentMethodId: string
      dayOfMonth: number
      intervalMonths: number
      frequencyUnit: number
      intervalWeeks: number
      dayOfWeek: number
      anchorDate?: { seconds: bigint; nanos: number }
      endDate?: Timestamp
      totalPayments: number
    }) => client.createFixedExpense({ budgetProfileId, ...vars }),
  })

  const isPending = txPending || fixedPending

  function getAnchor(): Date {
    return parseUTCDate(startDateStr)
  }

  function recalcEndDate(payments: string, unit: FrequencyUnitUI, count: number) {
    const n = parseInt(payments, 10)
    if (!isNaN(n) && n > 0) {
      const anchor = getAnchor()
      if (unit === 'week') {
        setEndDateStr(dateToString(addUTCWeeks(anchor, (n - 1) * count)))
      } else {
        const intervalMonths = unit === 'year' ? count * 12 : count
        setEndDateStr(dateToString(addUTCMonths(anchor, (n - 1) * intervalMonths)))
      }
    }
  }

  function handleFrequencyUnitChange(next: FrequencyUnitUI) {
    setFrequencyUnitUI(next)
    setFrequencyCount(1)
    if (paymentsInput) recalcEndDate(paymentsInput, next, 1)
  }

  function handlePaymentsChange(val: string) {
    setPaymentsInput(val)
    if (val === '') { setEndDateStr(''); return }
    recalcEndDate(val, frequencyUnitUI, frequencyCount)
  }

  function handleEndDateChange(val: string) {
    setEndDateStr(val)
    if (!val) { setPaymentsInput(''); return }
    const anchor = getAnchor()
    const end = parseUTCDate(val)
    let payments: number
    if (frequencyUnitUI === 'week') {
      payments = Math.round(weeksBetween(anchor, end) / frequencyCount) + 1
    } else {
      const intervalMonths = frequencyUnitUI === 'year' ? frequencyCount * 12 : frequencyCount
      payments = Math.round(monthsBetween(anchor, end) / intervalMonths) + 1
    }
    setPaymentsInput(String(Math.max(1, payments)))
  }

  const isDateValid = isFixed ? !!startDateStr : !!date
  const canSave = !!name.trim() && !!amount && isDateValid && (isFixed || !!paymentMethodId)

  function resetForm() {
    setName('')
    setAmount('')
    setCategoryId(0)
    setPaymentMethodId('')
    setStartDateStr(todayString())
    setEndDateStr('')
    setPaymentsInput('')
    setFlow('spent')
    // Intentionally keep typeId and date so the next transaction defaults to the same type/date.
  }

  async function handleSave() {
    if (!canSave) return
    try {
      if (isFixed) {
        // Fixed expenses are always outgoing — no flow sign
        const rawAmt = parseFloat(amount)
        const units = BigInt(Math.trunc(rawAmt))
        const nanos = Math.round((rawAmt - Number(units)) * 1e9)
        const totalPayments = parseInt(paymentsInput, 10) || 0
        let endDate: Timestamp | undefined
        if (endDateStr) endDate = Timestamp.fromDate(parseUTCDate(endDateStr))
        const startDate = parseUTCDate(startDateStr)
        const derivedDayOfMonth = startDate.getUTCDate()
        const derivedDayOfWeek = startDate.getUTCDay() || 7
        await createFixed({
          name,
          plannedAmount: { units, nanos },
          categoryId,
          paymentMethodId,
          dayOfMonth: derivedDayOfMonth,
          ...frequencyFieldsFor(frequencyUnitUI, frequencyCount, derivedDayOfWeek),
          anchorDate: dateStringToTimestamp(startDateStr),
          endDate,
          totalPayments,
        })
        logger.info('fixedExpense.create', { budgetProfileId, name, amount })
        queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId, 1] })
        queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] })
      } else {
        // Variable: spent = stored positive, received = stored negative
        const rawAmt = parseFloat(amount)
        const signedAmt = flow === 'received' ? -rawAmt : rawAmt
        const units = BigInt(Math.trunc(signedAmt))
        const nanos = Math.round((signedAmt - Number(units)) * 1e9)
        await createTx({
          name,
          amount: { units, nanos },
          date: dateStringToTimestamp(date),
          categoryId,
          paymentMethodId,
          transactionTypeId: typeId,
          transactionFrequencyId: recurring ? 4 : 1,
          recurring,
        })
        logger.info('transaction.create', { budgetPeriodId, name, amount, flow })
      }
      resetForm()
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  const form = (
    <Stack spacing={2}>
      {embedded && (
        <Typography variant="body2" color="text.secondary">
          Add your first transaction. You can add more from the budget view.
        </Typography>
      )}
      <TextField label="Description" value={name} onChange={(e) => setName(e.target.value)} fullWidth />
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
          onChange={(e) => { const v = Number(e.target.value); setTypeId(v); setRecurring(v === 1); if (v === 1) setFlow('spent') }}
          sx={{ flex: 1 }}
        >
          <MenuItem value={1}>Fixed</MenuItem>
          <MenuItem value={2}>Variable</MenuItem>
        </TextField>
      </Stack>
      {isFixed ? (
        <>
          <TextField
            label="Start date"
            type="date"
            value={startDateStr}
            onChange={(e) => { setStartDateStr(e.target.value); if (paymentsInput) recalcEndDate(paymentsInput, frequencyUnitUI, frequencyCount) }}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
            helperText="First payment date — past dates backdate the plan, future dates start it later"
          />
          <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="flex-start">
            <TextField
              select
              label="Repeats every"
              value={frequencyUnitUI}
              onChange={(e) => handleFrequencyUnitChange(e.target.value as FrequencyUnitUI)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="week">Week(s)</MenuItem>
              <MenuItem value="month">Month(s)</MenuItem>
              <MenuItem value="year">Year(s)</MenuItem>
            </TextField>
            <Stack spacing={0.5} alignItems="center">
              <ScrollNumberPicker
                value={frequencyCount}
                onChange={(v) => { setFrequencyCount(v); if (paymentsInput) recalcEndDate(paymentsInput, frequencyUnitUI, v) }}
                min={FREQUENCY_COUNT_RANGE[frequencyUnitUI].min}
                max={FREQUENCY_COUNT_RANGE[frequencyUnitUI].max}
                aria-label="Repeat count"
              />
              <Typography variant="caption" color="text.secondary">How often this expense is due</Typography>
            </Stack>
          </Stack>
          <Divider />
          <Typography variant="body2" color="text.secondary">Payment plan (optional)</Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Number of payments"
              type="number"
              value={paymentsInput}
              onChange={(e) => handlePaymentsChange(e.target.value)}
              fullWidth
              inputProps={{ min: 1, step: 1, inputMode: 'numeric' }}
              helperText="Sets the end date automatically"
            />
            <TextField
              label="End date"
              type="date"
              value={endDateStr}
              onChange={(e) => handleEndDateChange(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Sets the payment count automatically"
            />
          </Stack>
        </>
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
      <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} fullWidth>
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
        required={!isFixed}
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
  )

  if (embedded) {
    return (
      <>
        {form}
        <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}>
          {onSkip && <Button onClick={onSkip} color="inherit">Skip</Button>}
          <Button variant="contained" onClick={handleSave} disabled={!canSave || isPending}>
            {isPending ? 'Saving…' : 'Save & Finish'}
          </Button>
        </Stack>
      </>
    )
  }

  return (
    <Dialog open={open ?? false} onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>Add Transaction</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>{form}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={!canSave || isPending}>
          {isPending ? 'Saving…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
