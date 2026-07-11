'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
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
import Stack from '@mui/material/Stack'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Typography from '@mui/material/Typography'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

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

function todayDay(): number {
  return new Date().getDate()
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

const DAY_OF_WEEK_OPTIONS = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
]

// frequencyUnit wire values: 1 = MONTH (default, also covers YEAR client-side
// via interval_months = years * 12), 2 = WEEK.
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
  const [dayOfMonth, setDayOfMonth] = useState(todayDay)
  const [dayOfWeek, setDayOfWeek] = useState(1) // ISO 8601: 1 = Monday ... 7 = Sunday
  const [frequencyUnitUI, setFrequencyUnitUI] = useState<FrequencyUnitUI>('month')
  const [frequencyCount, setFrequencyCount] = useState(1)
  const [isFutureStart, setIsFutureStart] = useState(false)
  const [anchorDateStr, setAnchorDateStr] = useState(todayString)
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
    }) => client.createFixedExpense({ budgetProfileId, ...vars }),
  })

  const isPending = txPending || fixedPending

  function handleFrequencyUnitChange(next: FrequencyUnitUI) {
    setFrequencyUnitUI(next)
    setFrequencyCount(1) // a count picked in one unit isn't a meaningful default in another
  }

  const isDateValid = isFixed
    ? isFutureStart
      ? !!anchorDateStr
      : frequencyUnitUI === 'week'
        ? dayOfWeek >= 1 && dayOfWeek <= 7
        : dayOfMonth >= 1 && dayOfMonth <= 31
    : !!date
  const canSave = !!name.trim() && !!amount && isDateValid && (isFixed || !!paymentMethodId)

  function resetForm() {
    setName('')
    setAmount('')
    setCategoryId(0)
    setPaymentMethodId('')
    setIsFutureStart(false)
    setFlow('spent')
    // Intentionally keep typeId, date, and dayOfMonth so the next transaction
    // defaults to the same type and date the user just used.
  }

  async function handleSave() {
    if (!canSave) return
    try {
      if (isFixed) {
        // Fixed expenses are always outgoing — no flow sign
        const rawAmt = parseFloat(amount)
        const units = BigInt(Math.trunc(rawAmt))
        const nanos = Math.round((rawAmt - Number(units)) * 1e9)
        await createFixed({
          name,
          plannedAmount: { units, nanos },
          categoryId,
          paymentMethodId,
          dayOfMonth,
          ...frequencyFieldsFor(frequencyUnitUI, frequencyCount, dayOfWeek),
          ...(isFutureStart ? { anchorDate: dateStringToTimestamp(anchorDateStr) } : {}),
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
          {isFutureStart ? (
            <TextField
              label="Start date"
              type="date"
              value={anchorDateStr}
              onChange={(e) => setAnchorDateStr(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              helperText="First date this expense is due — no transaction until then"
            />
          ) : frequencyUnitUI === 'week' ? (
            <TextField
              select
              label="Day of week"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              fullWidth
              helperText="Which day of the week this expense falls on"
            >
              {DAY_OF_WEEK_OPTIONS.map((o) => (
                <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="Day of month"
              type="number"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
              fullWidth
              inputProps={{ min: 1, max: 31, inputMode: 'decimal' }}
              helperText="Which day of the month this expense falls on"
            />
          )}
          <FormControlLabel
            control={<Checkbox checked={isFutureStart} onChange={(e) => setIsFutureStart(e.target.checked)} />}
            label="This expense starts in the future"
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
                onChange={setFrequencyCount}
                min={FREQUENCY_COUNT_RANGE[frequencyUnitUI].min}
                max={FREQUENCY_COUNT_RANGE[frequencyUnitUI].max}
                aria-label="Repeat count"
              />
              <Typography variant="caption" color="text.secondary">How often this expense is due</Typography>
            </Stack>
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
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
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
