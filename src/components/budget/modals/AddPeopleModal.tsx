'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import DeleteIcon from '@mui/icons-material/Delete'

interface Props {
  budgetProfileId: string
  embedded?: boolean
  onSkip: () => void
  onDone: () => void
}

export function AddPeopleModal({ budgetProfileId, onSkip, onDone }: Props) {
  const { showError } = useSnackbar()
  const [name, setName] = useState('')
  const [pending, setPending] = useState<string[]>([])
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()

  const { data: existingData, isLoading } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })
  const existing = existingData?.people ?? []

  const { mutateAsync, isPending } = useMutation({
    mutationFn: (names: string[]) =>
      client.addBudgetPeople({ budgetProfileId, people: names.map((userName) => ({ userName, userId: '' })) }),
  })

  function addPerson() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!pending.includes(trimmed)) {
      setPending((p) => [...p, trimmed])
    }
    setName('')
  }

  async function handleSave() {
    if (pending.length === 0) return onDone()
    try {
      await mutateAsync(pending)
      logger.info('budget.people.add', { budgetProfileId, count: pending.length })
      await queryClient.invalidateQueries({ queryKey: ['budget-people', budgetProfileId] })
      onDone()
    } catch (err) {
      showError(err)
    }
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Add other people who share this budget. You&apos;ve already been added.
      </Typography>

      {isLoading ? (
        <CircularProgress size={20} />
      ) : existing.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>ALREADY IN THIS BUDGET</Typography>
          <List dense disablePadding>
            {existing.map((p) => (
              <ListItem key={p.id.toString()} disableGutters>
                <ListItemText primary={p.userName} />
                {p.userId && <Chip label="You" size="small" color="primary" variant="outlined" sx={{ ml: 1 }} />}
              </ListItem>
            ))}
          </List>
          <Divider />
        </>
      )}

      <Stack direction="row" spacing={1}>
        <TextField
          label="Add another person"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addPerson()}
          fullWidth
          size="small"
          placeholder="e.g. Jane"
        />
        <Button variant="outlined" onClick={addPerson} disabled={!name.trim()}>Add</Button>
      </Stack>

      {pending.length > 0 && (
        <List dense disablePadding>
          {pending.map((p, i) => (
            <ListItem key={i} disableGutters secondaryAction={
              <IconButton edge="end" size="small" onClick={() => setPending((prev) => prev.filter((_, idx) => idx !== i))}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            }>
              <ListItemText primary={p} />
            </ListItem>
          ))}
        </List>
      )}

      <Stack direction="row" spacing={1} justifyContent="flex-end">
        <Button onClick={onSkip} color="inherit">Skip</Button>
        <LoadingButton variant="contained" onClick={handleSave} loading={isPending}>
          {pending.length === 0 ? 'Continue' : 'Save & Continue'}
        </LoadingButton>
      </Stack>
    </Stack>
  )
}
