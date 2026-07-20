'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { PaymentType } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { logger } from '@/lib/logger'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Typography from '@mui/material/Typography'
import MenuItem from '@mui/material/MenuItem'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import Divider from '@mui/material/Divider'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'

const PAYMENT_TYPE_LABELS: Record<number, string> = {
  [PaymentType.CASH]: 'Cash',
  [PaymentType.CREDIT]: 'Credit Card',
  [PaymentType.DEBIT]: 'Debit Card',
  [PaymentType.DIGITAL_WALLET]: 'Digital Wallet',
  [PaymentType.BANK_TRANSFER]: 'Bank Transfer',
  [PaymentType.CRYPTO]: 'Crypto',
  [PaymentType.INVESTMENT]: 'Investment',
  [PaymentType.OTHER]: 'Other',
}

const PAYMENT_TYPE_OPTIONS = [
  PaymentType.CASH,
  PaymentType.CREDIT,
  PaymentType.DEBIT,
  PaymentType.DIGITAL_WALLET,
  PaymentType.BANK_TRANSFER,
  PaymentType.CRYPTO,
  PaymentType.INVESTMENT,
  PaymentType.OTHER,
]

interface Props {
  budgetProfileId: string
  onSkip: () => void
  onDone: () => void
}

export function AddPaymentMethodsStep({ budgetProfileId, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const [name, setName] = useState('')
  const [type, setType] = useState<PaymentType>(PaymentType.DEBIT)
  const [budgetPersonId, setBudgetPersonId] = useState<bigint>(0n)
  const [color, setColor] = useState('')
  const [savedMethods, setSavedMethods] = useState<string[]>([])
  const client = useClient(BudgetService)

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })
  const people = useMemo(() => peopleData?.people ?? [], [peopleData])

  // Pre-select the first person (the owner) once people load
  useEffect(() => {
    if (people.length > 0 && budgetPersonId === 0n) {
      setBudgetPersonId(people[0].id)
    }
  }, [people, budgetPersonId])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (vars: { name: string; type: PaymentType; budgetPersonId: bigint; color: string }) =>
      client.createPaymentMethod(vars),
  })

  async function handleAdd() {
    if (!name.trim() || budgetPersonId === 0n) return
    try {
      await mutateAsync({ name, type, budgetPersonId, color })
      logger.info('budget.payment_method.add', { budgetProfileId, name })
      setSavedMethods((prev) => [...prev, `${name} (${PAYMENT_TYPE_LABELS[type] ?? 'Other'})`])
      setName('')
      setColor('')
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Add your payment methods (e.g. Chase Visa, Cash). You&apos;ll use these when recording transactions.
      </Typography>

      {savedMethods.length > 0 && (
        <>
          <List dense disablePadding>
            {savedMethods.map((m, i) => (
              <ListItem key={i} disableGutters sx={{ gap: 1 }}>
                <CheckCircleOutlineIcon fontSize="small" color="success" />
                <ListItemText primary={m} />
              </ListItem>
            ))}
          </List>
          <Divider />
        </>
      )}

      <TextField
        label="Payment method name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        fullWidth
        placeholder="e.g. Chase Visa"
      />

      <FormControl fullWidth size="small">
        <InputLabel>Type</InputLabel>
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as PaymentType)}
        >
          {PAYMENT_TYPE_OPTIONS.map((t) => (
            <MenuItem key={t} value={t}>{PAYMENT_TYPE_LABELS[t]}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {people.length > 1 && (
        <FormControl fullWidth size="small">
          <InputLabel>Belongs to</InputLabel>
          <Select
            label="Belongs to"
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

      <ColorPicker value={color} onChange={setColor} />

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <LoadingButton variant="outlined" onClick={handleAdd} disabled={!name.trim() || budgetPersonId === 0n} loading={isPending}>
          Add
        </LoadingButton>
        <Button variant="contained" onClick={onDone}>
          {savedMethods.length === 0 ? 'Skip' : 'Continue'}
        </Button>
      </Stack>
    </Stack>
  )
}
