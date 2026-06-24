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
  budgetId: string
  open?: boolean
  embedded?: boolean
  onClose?: () => void
  onSkip?: () => void
  onDone: () => void
}

export function AddTransactionModal({ budgetId, open, embedded, onClose, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [categoryId, setCategoryId] = useState<number>(0)
  const [paymentMethodId, setPaymentMethodId] = useState('')
  const [typeId, setTypeId] = useState<number>(1)
  const [recurring, setRecurring] = useState(false)
  const client = useClient(BudgetService)

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({}),
  })
  const { data: methodsData } = useQuery({
    queryKey: ['paymentMethods', budgetId],
    queryFn: () => client.listPaymentMethods({ budgetId }),
  })
  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: {
      name: string
      amount: { units: bigint; nanos: number }
      categoryId: number
      paymentMethodId: string
      transactionTypeId: number
      transactionFrequencyId: number
      recurring: boolean
    }) => client.createTransaction({ budgetId, plannedAmount: vars.amount, ...vars }),
  })

  async function handleSave() {
    if (!name.trim() || !amount) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    try {
      await mutateAsync({
        name,
        amount: { units: BigInt(units), nanos },
        categoryId,
        paymentMethodId,
        transactionTypeId: typeId,
        transactionFrequencyId: recurring ? 4 : 1,
        recurring,
      })
      logger.info('transaction.create', { budgetId, name, amount })
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
      <TextField select label="Category" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} fullWidth>
        <MenuItem value={0}>— None —</MenuItem>
        {(categoriesData?.categories ?? []).map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
        ))}
      </TextField>
      <TextField select label="Payment method" value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)} fullWidth>
        <MenuItem value="">— None —</MenuItem>
        {(methodsData?.methods ?? []).map((m) => (
          <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
        ))}
      </TextField>
      <FormControlLabel
        control={<Checkbox checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />}
        label="Recurring"
      />
    </Stack>
  )

  if (embedded) {
    return (
      <>
        {form}
        <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}>
          {onSkip && <Button onClick={onSkip} color="inherit">Skip</Button>}
          <Button variant="contained" onClick={handleSave} disabled={!name.trim() || !amount || isPending}>
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
        <Button variant="contained" onClick={handleSave} disabled={!name.trim() || !amount || isPending}>
          {isPending ? 'Saving…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
