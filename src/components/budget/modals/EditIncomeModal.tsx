'use client'

import { useEffect, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { IncomeSource } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'

interface Props {
  budgetProfileId: string
  source: IncomeSource
  showBeforeTax?: boolean
  onClose: () => void
  onDone: () => void
}

export function EditIncomeModal({ budgetProfileId, source, showBeforeTax, onClose, onDone }: Props) {
  const { showError } = useSnackbar()
  const fullScreen = useIsMobile()

  const [name, setName] = useState(source.name)
  const [amount, setAmount] = useState(() => {
    const total = Number(source.defaultAmount?.units ?? 0n) + (source.defaultAmount?.nanos ?? 0) / 1e9
    return total.toString()
  })
  const [recurring, setRecurring] = useState(source.recurring)
  const [beforeTax, setBeforeTax] = useState(source.beforeTax)
  const [budgetPersonId, setBudgetPersonId] = useState<bigint>(source.budgetPersonId)

  useEffect(() => {
    setName(source.name)
    const total = Number(source.defaultAmount?.units ?? 0n) + (source.defaultAmount?.nanos ?? 0) / 1e9
    setAmount(total.toString())
    setRecurring(source.recurring)
    setBeforeTax(source.beforeTax)
    setBudgetPersonId(source.budgetPersonId)
  }, [source])

  const client = useClient(BudgetService)

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })
  const people = peopleData?.people ?? []

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: {
      name: string
      defaultAmount: { units: bigint; nanos: number }
      recurring: boolean
      beforeTax: boolean
      budgetPersonId: bigint
    }) => client.updateIncomeSource({ id: source.id, budgetProfileId, ...vars }),
  })

  const amountError = amount !== '' && parseFloat(amount) <= 0 ? 'Amount must be greater than zero' : ''

  async function handleSave() {
    if (!name.trim() || !amount || amountError) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    try {
      await mutateAsync({ name, defaultAmount: { units: BigInt(units), nanos }, recurring, beforeTax, budgetPersonId })
      logger.info('budget.income.update', { budgetProfileId, id: source.id.toString(), name })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="xs">
      <DialogTitle>Edit income source</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Source name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            placeholder="e.g. Salary"
          />
          <TextField
            label="Monthly amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            fullWidth
            inputProps={{ min: 0, step: '0.01', inputMode: 'decimal' }}
            error={!!amountError}
            helperText={amountError}
          />
          <FormControlLabel
            control={<Checkbox checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />}
            label="Recurring monthly"
          />
          {showBeforeTax && (
            <FormControlLabel
              control={<Checkbox checked={beforeTax} onChange={(e) => setBeforeTax(e.target.checked)} />}
              label="Before-tax income (used for tax reserve estimate)"
            />
          )}
          {people.length > 0 && (
            <FormControl fullWidth size="small">
              <InputLabel>Attributed to</InputLabel>
              <Select
                label="Attributed to"
                value={budgetPersonId.toString()}
                onChange={(e) => setBudgetPersonId(BigInt(e.target.value))}
              >
                {people.map((p) => (
                  <MenuItem key={p.id.toString()} value={p.id.toString()}>
                    {p.userName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          onClick={handleSave}
          disabled={!name.trim() || !amount || !!amountError}
          loading={isPending}
        >
          Save
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
