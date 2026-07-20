'use client'

import { useState, useEffect } from 'react'
import type { BudgetPerson, PaymentMethod, IncomeSource } from '@/gen/wellspent/v1/budget_pb'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Stack from '@mui/material/Stack'
import Alert from '@mui/material/Alert'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface Props {
  person: BudgetPerson | null
  people: BudgetPerson[]
  paymentMethods: PaymentMethod[]
  incomeSources: IncomeSource[]
  isRemoving: boolean
  onCancel: () => void
  onConfirm: (replacementPersonId: bigint, replacementPmId: string) => void
}

export function RemovePersonDialog({ person, people, paymentMethods, incomeSources, isRemoving, onCancel, onConfirm }: Props) {
  const [replacementPersonId, setReplacementPersonId] = useState<bigint>(0n)
  const [replacementPmId, setReplacementPmId] = useState('')

  useEffect(() => {
    setReplacementPersonId(0n)
    setReplacementPmId('')
  }, [person])

  const needsReplacement = !!person && (
    incomeSources.some((s) => s.budgetPersonId === person.id) ||
    paymentMethods.some((pm) => pm.budgetPersonId === person.id)
  )
  const replacementPeople = people.filter((p) => person && p.id !== person.id)
  const replacementPersonPMs = paymentMethods.filter((pm) => pm.budgetPersonId === replacementPersonId)
  const canConfirm = !needsReplacement || (replacementPersonId !== 0n && replacementPmId !== '')

  return (
    <Dialog open={person !== null} onClose={onCancel} maxWidth="xs" fullWidth>
      <DialogTitle>Remove {person?.userName}</DialogTitle>
      <DialogContent>
        {needsReplacement ? (
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Alert severity="warning" sx={{ fontSize: '0.8rem' }}>
              This person has income sources or payment methods. Choose a replacement before removing.
            </Alert>

            <FormControl fullWidth size="small">
              <InputLabel>Step 1 — Replacement person</InputLabel>
              <Select
                label="Step 1 — Replacement person"
                value={replacementPersonId === 0n ? '' : replacementPersonId.toString()}
                onChange={(e) => {
                  setReplacementPersonId(BigInt(e.target.value as string))
                  setReplacementPmId('')
                }}
              >
                {replacementPeople.length === 0 ? (
                  <MenuItem disabled value="">No other people in this budget</MenuItem>
                ) : (
                  replacementPeople.map((p) => (
                    <MenuItem key={p.id.toString()} value={p.id.toString()}>
                      {p.userName}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small" disabled={replacementPersonId === 0n}>
              <InputLabel>Step 2 — Replacement payment method</InputLabel>
              <Select
                label="Step 2 — Replacement payment method"
                value={replacementPmId}
                onChange={(e) => setReplacementPmId(e.target.value as string)}
              >
                {replacementPersonPMs.length === 0 ? (
                  <MenuItem disabled value="">
                    {replacementPersonId === 0n ? 'Select a person first' : 'This person has no payment methods'}
                  </MenuItem>
                ) : (
                  replacementPersonPMs.map((pm) => (
                    <MenuItem key={pm.id} value={pm.id}>{pm.alias || pm.name}</MenuItem>
                  ))
                )}
              </Select>
            </FormControl>

            {replacementPersonId !== 0n && replacementPersonPMs.length === 0 && (
              <Alert severity="error" sx={{ fontSize: '0.8rem' }}>
                This person has no payment methods. Choose a different replacement.
              </Alert>
            )}
          </Stack>
        ) : (
          <Typography sx={{ mt: 1 }}>
            Remove <strong>{person?.userName}</strong> from this budget?
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">Cancel</Button>
        <LoadingButton
          variant="contained"
          color="error"
          onClick={() => onConfirm(needsReplacement ? replacementPersonId : 0n, needsReplacement ? replacementPmId : '')}
          disabled={!canConfirm}
          loading={isRemoving}
        >
          Remove
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
