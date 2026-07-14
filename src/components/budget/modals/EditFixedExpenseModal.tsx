'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Timestamp } from '@bufbuild/protobuf'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { FixedExpense } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { PaymentMethodSelect } from '@/components/budget/PaymentMethodSelect'
import { ScrollNumberPicker } from '@/components/ui/ScrollNumberPicker'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Divider from '@mui/material/Divider'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

interface Props {
  budgetProfileId: string
  fixedExpense: FixedExpense
  onClose: () => void
  onDone: () => void
}

function moneyToString(units: bigint, nanos: number): string {
  return (Number(units) + nanos / 1e9).toFixed(2)
}

function timestampToDateString(ts: { seconds: bigint } | undefined): string {
  const d = ts && ts.seconds !== 0n ? new Date(Number(ts.seconds) * 1000) : new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function dateStringToTimestamp(str: string): { seconds: bigint; nanos: number } {
  const [year, month, day] = str.split('-').map(Number)
  return { seconds: BigInt(Math.floor(Date.UTC(year, month - 1, day) / 1000)), nanos: 0 }
}

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

type FrequencyUnitUI = 'week' | 'month' | 'year'

const FREQUENCY_COUNT_RANGE: Record<FrequencyUnitUI, { min: number; max: number }> = {
  week: { min: 1, max: 52 },
  month: { min: 1, max: 24 },
  year: { min: 1, max: 10 },
}

const DAY_OF_WEEK_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const

function frequencyUnitUIFromWire(frequencyUnit: number): FrequencyUnitUI {
  return frequencyUnit === 2 ? 'week' : 'month'
}

function frequencyFieldsFor(unit: FrequencyUnitUI, count: number, dayOfWeek: number) {
  if (unit === 'week') {
    return { frequencyUnit: 2, intervalMonths: 1, intervalWeeks: count, dayOfWeek }
  }
  return { frequencyUnit: 1, intervalMonths: unit === 'year' ? count * 12 : count, intervalWeeks: 1, dayOfWeek: 1 }
}

export function EditFixedExpenseModal({ budgetProfileId, fixedExpense, onClose, onDone }: Props) {
  const t = useTranslations('budget.fixedExpense')
  const { showError } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const client = useClient(BudgetService)

  const [name, setName] = useState(fixedExpense.name)
  const [amount, setAmount] = useState(() =>
    moneyToString(fixedExpense.plannedAmount?.units ?? 0n, fixedExpense.plannedAmount?.nanos ?? 0)
  )
  const [categoryId, setCategoryId] = useState(fixedExpense.categoryId)
  const [paymentMethodId, setPaymentMethodId] = useState(fixedExpense.paymentMethodId)
  const [dayOfMonth, setDayOfMonth] = useState(fixedExpense.dayOfMonth)
  const [dayOfWeek, setDayOfWeek] = useState(fixedExpense.dayOfWeek || 1)
  const [frequencyUnitUI, setFrequencyUnitUI] = useState<FrequencyUnitUI>(() => frequencyUnitUIFromWire(fixedExpense.frequencyUnit))
  const [frequencyCount, setFrequencyCount] = useState(() =>
    frequencyUnitUIFromWire(fixedExpense.frequencyUnit) === 'week' ? (fixedExpense.intervalWeeks || 1) : (fixedExpense.intervalMonths || 1)
  )
  const [isFutureStart, setIsFutureStart] = useState(!!fixedExpense.anchorDate?.seconds)
  const [anchorDateStr, setAnchorDateStr] = useState(() => timestampToDateString(fixedExpense.anchorDate))

  const [endDateStr, setEndDateStr] = useState(() =>
    fixedExpense.endDate?.seconds ? timestampToDateString(fixedExpense.endDate) : ''
  )
  const [paymentsInput, setPaymentsInput] = useState(() =>
    fixedExpense.totalPayments > 0 ? String(fixedExpense.totalPayments) : ''
  )

  useEffect(() => {
    setName(fixedExpense.name)
    setAmount(moneyToString(fixedExpense.plannedAmount?.units ?? 0n, fixedExpense.plannedAmount?.nanos ?? 0))
    setCategoryId(fixedExpense.categoryId)
    setPaymentMethodId(fixedExpense.paymentMethodId)
    setDayOfMonth(fixedExpense.dayOfMonth)
    setDayOfWeek(fixedExpense.dayOfWeek || 1)
    const unit = frequencyUnitUIFromWire(fixedExpense.frequencyUnit)
    setFrequencyUnitUI(unit)
    setFrequencyCount(unit === 'week' ? (fixedExpense.intervalWeeks || 1) : (fixedExpense.intervalMonths || 1))
    setIsFutureStart(!!fixedExpense.anchorDate?.seconds)
    setAnchorDateStr(timestampToDateString(fixedExpense.anchorDate))
    setEndDateStr(fixedExpense.endDate?.seconds ? timestampToDateString(fixedExpense.endDate) : '')
    setPaymentsInput(fixedExpense.totalPayments > 0 ? String(fixedExpense.totalPayments) : '')
  }, [fixedExpense])

  function getAnchor(): Date {
    if (isFutureStart && anchorDateStr) return parseUTCDate(anchorDateStr)
    if (fixedExpense.anchorDate?.seconds) return new Date(Number(fixedExpense.anchorDate.seconds) * 1000)
    return new Date()
  }

  function handleFrequencyUnitChange(next: FrequencyUnitUI) {
    setFrequencyUnitUI(next)
    setFrequencyCount(1)
  }

  function handlePaymentsChange(val: string) {
    setPaymentsInput(val)
    const n = parseInt(val, 10)
    if (!isNaN(n) && n > 0) {
      const anchor = getAnchor()
      if (frequencyUnitUI === 'week') {
        setEndDateStr(dateToString(addUTCWeeks(anchor, (n - 1) * frequencyCount)))
      } else {
        const intervalMonths = frequencyUnitUI === 'year' ? frequencyCount * 12 : frequencyCount
        setEndDateStr(dateToString(addUTCMonths(anchor, (n - 1) * intervalMonths)))
      }
    } else if (val === '') {
      setEndDateStr('')
    }
  }

  function handleEndDateChange(val: string) {
    setEndDateStr(val)
    if (val) {
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
    } else {
      setPaymentsInput('')
    }
  }

  // Compute payments made client-side from anchor and interval.
  function computePaymentsMade(): number {
    const total = parseInt(paymentsInput, 10)
    if (!total || total <= 0) return 0
    const anchor = getAnchor()
    const now = new Date()
    let made: number
    if (frequencyUnitUI === 'week') {
      made = Math.floor(weeksBetween(anchor, now) / frequencyCount) + 1
    } else {
      const intervalMonths = frequencyUnitUI === 'year' ? frequencyCount * 12 : frequencyCount
      made = Math.floor(monthsBetween(anchor, now) / intervalMonths) + 1
    }
    return Math.min(Math.max(0, made), total)
  }

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
      intervalMonths: number
      frequencyUnit: number
      intervalWeeks: number
      dayOfWeek: number
      anchorDate?: { seconds: bigint; nanos: number }
      endDate?: Timestamp
      totalPayments: number
    }) => client.updateFixedExpense({ id: fixedExpense.id, budgetProfileId, ...vars }),
  })

  const canSave = !!name.trim() && !!amount && (
    isFutureStart
      ? !!anchorDateStr
      : frequencyUnitUI === 'week'
        ? dayOfWeek >= 1 && dayOfWeek <= 7
        : dayOfMonth >= 1 && dayOfMonth <= 31
  )

  async function handleSave() {
    if (!canSave) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    const totalPayments = parseInt(paymentsInput, 10) || 0
    let endDate: Timestamp | undefined
    if (endDateStr) {
      endDate = Timestamp.fromDate(parseUTCDate(endDateStr))
    }
    try {
      await mutateAsync({
        name,
        plannedAmount: { units: BigInt(units), nanos },
        categoryId,
        paymentMethodId,
        dayOfMonth,
        ...frequencyFieldsFor(frequencyUnitUI, frequencyCount, dayOfWeek),
        ...(isFutureStart ? { anchorDate: dateStringToTimestamp(anchorDateStr) } : {}),
        endDate,
        totalPayments,
      })
      logger.info('fixedExpense.update', { budgetProfileId, id: fixedExpense.id, name })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  const paymentsMade = computePaymentsMade()
  const totalPaymentsParsed = parseInt(paymentsInput, 10)

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle>{t('editTitle')}</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('fields.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth />
          <TextField
            label={t('fields.amount')}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
          />
          {isFutureStart ? (
            <TextField
              label={t('fields.anchorDate')}
              type="date"
              value={anchorDateStr}
              onChange={(e) => setAnchorDateStr(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
              helperText={t('fields.anchorDateHint')}
            />
          ) : frequencyUnitUI === 'week' ? (
            <TextField
              select
              label={t('fields.dayOfWeek')}
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              fullWidth
              helperText={t('fields.dayOfWeekHint')}
            >
              {DAY_OF_WEEK_KEYS.map((key, i) => (
                <MenuItem key={key} value={i + 1}>{t(`days.${key}`)}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label={t('fields.dayOfMonth')}
              type="number"
              value={dayOfMonth}
              onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
              fullWidth
              inputProps={{ min: 1, max: 31, inputMode: 'decimal' }}
              helperText={t('fields.dayOfMonthHint')}
            />
          )}
          <FormControlLabel
            control={<Checkbox checked={isFutureStart} onChange={(e) => setIsFutureStart(e.target.checked)} />}
            label={t('fields.startsInFuture')}
          />
          <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="flex-start">
            <TextField
              select
              label={t('fields.repeatsEvery')}
              value={frequencyUnitUI}
              onChange={(e) => handleFrequencyUnitChange(e.target.value as FrequencyUnitUI)}
              sx={{ minWidth: 140 }}
            >
              <MenuItem value="week">{t('fields.unitWeek')}</MenuItem>
              <MenuItem value="month">{t('fields.unitMonth')}</MenuItem>
              <MenuItem value="year">{t('fields.unitYear')}</MenuItem>
            </TextField>
            <Stack spacing={0.5} alignItems="center">
              <ScrollNumberPicker
                value={frequencyCount}
                onChange={setFrequencyCount}
                min={FREQUENCY_COUNT_RANGE[frequencyUnitUI].min}
                max={FREQUENCY_COUNT_RANGE[frequencyUnitUI].max}
                aria-label={t('fields.repeatCount')}
              />
              <Typography variant="caption" color="text.secondary">{t('fields.repeatsHint')}</Typography>
            </Stack>
          </Stack>
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
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">{t('paymentPlan.label')}</Typography>
            {totalPaymentsParsed > 0 && (
              <Typography variant="caption" color="text.secondary">
                {t('paymentPlan.paymentsMade', { made: paymentsMade, total: totalPaymentsParsed })}
              </Typography>
            )}
          </Stack>
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
          {isPending ? t('saving') : t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
