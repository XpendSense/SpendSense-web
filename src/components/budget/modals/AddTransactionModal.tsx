'use client'

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
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
  const d = new Date(year, month - 1, day, 12)
  return { seconds: BigInt(Math.floor(d.getTime() / 1000)), nanos: 0 }
}

function dayOfMonthToTimestamp(day: number): { seconds: bigint; nanos: number } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), day, 12)
  return { seconds: BigInt(Math.floor(d.getTime() / 1000)), nanos: 0 }
}

export function AddTransactionModal({ budgetPeriodId, budgetProfileId, open, embedded, onClose, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayString)
  const [dayOfMonth, setDayOfMonth] = useState(todayDay)
  const [categoryId, setCategoryId] = useState<number>(0)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [typeId, setTypeId] = useState<number>(1)
  const [recurring, setRecurring] = useState(false)
  const client = useClient(BudgetService)

  const isFixed = typeId === 1

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({}),
  })
  const { data: methodsData } = useQuery({
    queryKey: ['paymentMethods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
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
    }) => client.createTransaction({ budgetPeriodId, plannedAmount: vars.amount, ...vars }),
  })

  const isDateValid = isFixed ? dayOfMonth >= 1 && dayOfMonth <= 31 : !!date
  const canSave = !!name.trim() && !!amount && !!paymentMethodId && isDateValid

  async function handleSave() {
    if (!canSave) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    const txDate = isFixed ? dayOfMonthToTimestamp(dayOfMonth) : dateStringToTimestamp(date)
    try {
      await mutateAsync({
        name,
        amount: { units: BigInt(units), nanos },
        date: txDate,
        categoryId,
        paymentMethodId,
        transactionTypeId: typeId,
        transactionFrequencyId: recurring ? 4 : 1,
        recurring,
      })
      logger.info('transaction.create', { budgetPeriodId, name, amount })
      setName('')
      setAmount('')
      setDate(todayString())
      setDayOfMonth(todayDay())
      setCategoryId(0)
      setPaymentMethodId('')
      setTypeId(1)
      setRecurring(false)
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
        inputProps={{ min: 0, step: '0.01' }}
      />
      <TextField select label="Type" value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} fullWidth>
        <MenuItem value={1}>Fixed</MenuItem>
        <MenuItem value={2}>Variable</MenuItem>
      </TextField>
      {isFixed ? (
        <TextField
          label="Day of month"
          type="number"
          value={dayOfMonth}
          onChange={(e) => setDayOfMonth(Math.min(31, Math.max(1, Number(e.target.value))))}
          fullWidth
          inputProps={{ min: 1, max: 31 }}
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
      <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} fullWidth>
        <MenuItem value={0}>— None —</MenuItem>
        {(categoriesData?.categories ?? []).map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
      <TextField select label="Payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} fullWidth required>
        {(methodsData?.methods ?? []).map((m) => (
          <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
        ))}
      </TextField>
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
    <Dialog open={open ?? false} onClose={onClose} maxWidth="sm" fullWidth>
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
