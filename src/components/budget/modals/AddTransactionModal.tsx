'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
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
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Typography from '@mui/material/Typography'

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

const INTERVAL_OPTIONS = Array.from({ length: 24 }, (_, i) => i + 1)

function intervalLabel(n: number): string {
  if (n === 1) return 'Monthly'
  if (n === 12) return 'Yearly'
  return `Every ${n} months`
}

export function AddTransactionModal({ budgetPeriodId, budgetProfileId, open, embedded, defaultTypeId = 1, onClose, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayString)
  const [dayOfMonth, setDayOfMonth] = useState(todayDay)
  const [intervalMonths, setIntervalMonths] = useState(1)
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
    }) => client.createFixedExpense({ budgetProfileId, ...vars }),
  })

  const isPending = txPending || fixedPending

  const isDateValid = isFixed ? dayOfMonth >= 1 && dayOfMonth <= 31 : !!date
  const canSave = !!name.trim() && !!amount && isDateValid && (isFixed || !!paymentMethodId)

  function resetForm() {
    setName('')
    setAmount('')
    setCategoryId(0)
    setPaymentMethodId('')
    // Intentionally keep typeId, date, and dayOfMonth so the next transaction
    // defaults to the same type and date the user just used.
  }

  async function handleSave() {
    if (!canSave) return
    const units = BigInt(Math.floor(parseFloat(amount)))
    const nanos = Math.round((parseFloat(amount) - Number(units)) * 1e9)
    try {
      if (isFixed) {
        await createFixed({ name, plannedAmount: { units, nanos }, categoryId, paymentMethodId, dayOfMonth, intervalMonths })
        logger.info('fixedExpense.create', { budgetProfileId, name, amount })
        queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId, 1] })
        queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] })
      } else {
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
        logger.info('transaction.create', { budgetPeriodId, name, amount })
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
      <TextField
        label="Amount"
        type="number"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        fullWidth
        inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
      />
      <TextField select label="Type" value={typeId} onChange={(e) => { const t = Number(e.target.value); setTypeId(t); setRecurring(t === 1) }} fullWidth>
        <MenuItem value={1}>Fixed</MenuItem>
        <MenuItem value={2}>Variable</MenuItem>
      </TextField>
      {isFixed ? (
        <>
          <TextField
            label="Day of month"
            type="number"
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
            fullWidth
            inputProps={{ min: 1, max: 31, inputMode: 'decimal' }}
            helperText="Which day of the month this expense falls on"
          />
          <TextField
            select
            label="Repeats"
            value={intervalMonths}
            onChange={(e) => setIntervalMonths(Number(e.target.value))}
            fullWidth
            helperText="How often this expense is due"
          >
            {INTERVAL_OPTIONS.map((n) => (
              <MenuItem key={n} value={n}>{intervalLabel(n)}</MenuItem>
            ))}
          </TextField>
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
