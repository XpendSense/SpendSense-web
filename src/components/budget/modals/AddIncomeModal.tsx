'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { IncomeType } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Typography from '@mui/material/Typography'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import Divider from '@mui/material/Divider'

interface Props {
  budgetProfileId: string
  embedded?: boolean
  showBeforeTax?: boolean
  onSkip: () => void
  onDone: () => void
}

export function AddIncomeModal({ budgetProfileId, showBeforeTax, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [beforeTax, setBeforeTax] = useState(false)
  const [budgetPersonId, setBudgetPersonId] = useState<bigint>(0n)
  const [savedSources, setSavedSources] = useState<string[]>([])
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
    }) => client.addIncomeSource({ budgetProfileId, incomeType: IncomeType.SALARY, ...vars }),
  })

  const amountError = amount !== '' && parseFloat(amount) <= 0 ? 'Amount must be greater than zero' : ''

  async function handleAdd() {
    if (!name.trim() || !amount || amountError) return
    const units = Math.floor(parseFloat(amount))
    const nanos = Math.round((parseFloat(amount) - units) * 1e9)
    try {
      await mutateAsync({ name, defaultAmount: { units: BigInt(units), nanos }, recurring, beforeTax, budgetPersonId })
      logger.info('budget.income.add', { budgetProfileId, name, amount })
      setSavedSources((prev) => [...prev, `${name} — $${parseFloat(amount).toFixed(2)}`])
      setName('')
      setAmount('')
      setBeforeTax(false)
    } catch (err) {
      showError(err)
      throw err
    }
  }

  async function handleDone() {
    if (name.trim() && amount && !amountError) {
      try {
        await handleAdd()
      } catch {
        return
      }
    }
    onDone()
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Add income sources for this budget. You can add as many as you need.
      </Typography>

      {savedSources.length > 0 && (
        <>
          <List dense disablePadding>
            {savedSources.map((src, i) => (
              <ListItem key={i} disableGutters sx={{ gap: 1 }}>
                <CheckCircleOutlineIcon fontSize="small" color="success" />
                <ListItemText primary={src} />
              </ListItem>
            ))}
          </List>
          <Divider />
        </>
      )}

      <TextField
        label="Source name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
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

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <LoadingButton variant="outlined" onClick={handleAdd} disabled={!name.trim() || !amount || !!amountError} loading={isPending}>
          Add
        </LoadingButton>
        <Button variant="contained" onClick={handleDone} disabled={isPending}>
          {savedSources.length === 0 ? 'Skip' : 'Continue'}
        </Button>
      </Stack>
    </Stack>
  )
}
