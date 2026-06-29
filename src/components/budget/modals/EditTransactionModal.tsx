'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Transaction } from '@/gen/spendsense/v1/budget_pb'
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
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

interface Props {
  budgetProfileId: string
  transaction: Transaction
  onClose: () => void
  onDone: () => void
}

function moneyToString(units: bigint, nanos: number): string {
  const total = Number(units) + nanos / 1e9
  return total.toFixed(2)
}

function timestampToDateString(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const d = new Date(Number(ts.seconds) * 1000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateStringToTimestamp(str: string): { seconds: bigint; nanos: number } {
  const [year, month, day] = str.split('-').map(Number)
  const d = new Date(year, month - 1, day, 12)
  return { seconds: BigInt(Math.floor(d.getTime() / 1000)), nanos: 0 }
}

export function EditTransactionModal({ budgetProfileId, transaction, onClose, onDone }: Props) {
  const { showError } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const client = useClient(BudgetService)

  const [name, setName] = useState(transaction.name)
  const [amount, setAmount] = useState(() =>
    moneyToString(transaction.amount?.units ?? 0n, transaction.amount?.nanos ?? 0)
  )
  const [date, setDate] = useState(() => timestampToDateString(transaction.date))
  const [categoryId, setCategoryId] = useState(transaction.categoryId)
  const [paymentMethodId, setPaymentMethodId] = useState(transaction.paymentMethodId)
  const [typeId, setTypeId] = useState(transaction.transactionTypeId)
  const [recurring, setRecurring] = useState(transaction.recurring)

  useEffect(() => {
    setName(transaction.name)
    setAmount(moneyToString(transaction.amount?.units ?? 0n, transaction.amount?.nanos ?? 0))
    setDate(timestampToDateString(transaction.date))
    setCategoryId(transaction.categoryId)
    setPaymentMethodId(transaction.paymentMethodId)
    setTypeId(transaction.transactionTypeId)
    setRecurring(transaction.recurring)
  }, [transaction])

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
    }) => client.updateTransaction({ id: transaction.id, plannedAmount: vars.amount, ...vars }),
  })

  async function handleSave() {
    if (!name.trim() || !amount || !date || !paymentMethodId) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    try {
      await mutateAsync({
        name,
        amount: { units: BigInt(units), nanos },
        date: dateStringToTimestamp(date),
        categoryId,
        paymentMethodId,
        transactionTypeId: typeId,
        transactionFrequencyId: recurring ? 4 : 1,
        recurring,
      })
      logger.info('transaction.update', { budgetProfileId, id: transaction.id, name })
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
          <TextField
            label="Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01' }}
          />
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            fullWidth
            required
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            select
            label="Type"
            value={typeId}
            onChange={(e) => setTypeId(Number(e.target.value))}
            fullWidth
          >
            <MenuItem value={1}>Fixed</MenuItem>
            <MenuItem value={2}>Variable</MenuItem>
          </TextField>
          <TextField
            select
            label="Category"
            value={categoryId}
            onChange={(e) => setCategoryId(Number(e.target.value))}
            fullWidth
          >
            <MenuItem value={0}>— None —</MenuItem>
            {(categoriesData?.categories ?? []).map((c) => (
              <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Payment method"
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            fullWidth
            required
          >
            {(methodsData?.methods ?? []).map((m) => (
              <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
            ))}
          </TextField>
          <FormControlLabel
            control={<Checkbox checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />}
            label="Recurring"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={!name.trim() || !amount || !date || !paymentMethodId || isPending}
        >
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
