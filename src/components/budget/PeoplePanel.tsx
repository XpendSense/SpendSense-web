'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { BudgetPerson, PaymentMethod } from '@/gen/spendsense/v1/budget_pb'
import { BudgetRole } from '@/gen/spendsense/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Chip from '@mui/material/Chip'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Alert from '@mui/material/Alert'
import DeleteIcon from '@mui/icons-material/Delete'
import PaletteIcon from '@mui/icons-material/Palette'

interface Props {
  budgetProfileId: string
  canManageUsers?: boolean
}

function useRoleLabel() {
  const t = useTranslations('budget.invites.roles')
  return (role: BudgetRole) => {
    switch (role) {
      case BudgetRole.ADMIN: return t('admin')
      case BudgetRole.COLLABORATOR: return t('collaborator')
      case BudgetRole.VIEWER: return t('viewer')
      default: return t('unspecified')
    }
  }
}

export function PeoplePanel({ budgetProfileId, canManageUsers = true }: Props) {
  const { showError, showSuccess } = useSnackbar()
  const roleLabel = useRoleLabel()
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [pendingNames, setPendingNames] = useState<string[]>([])
  const [removingPerson, setRemovingPerson] = useState<BudgetPerson | null>(null)
  const [needsReplacement, setNeedsReplacement] = useState(false)
  const [replacementPersonId, setReplacementPersonId] = useState<bigint>(0n)
  const [replacementPmId, setReplacementPmId] = useState<string>('')
  const [editingPerson, setEditingPerson] = useState<BudgetPerson | null>(null)
  const [editColor, setEditColor] = useState('')

  const { data: profileData } = useQuery({
    queryKey: ['budget-profile', budgetProfileId],
    queryFn: () => client.getBudgetProfile({ id: budgetProfileId }),
  })
  const budgetOwnerId = profileData?.profile?.userId ?? ''

  const { data, isLoading } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { data: pmData } = useQuery({
    queryKey: ['paymentMethods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })

  const { data: incomeData } = useQuery({
    queryKey: ['income-sources', budgetProfileId],
    queryFn: () => client.listIncomeSources({ budgetProfileId }),
  })

  const { mutateAsync: doAdd, isPending: isAdding } = useMutation({
    mutationFn: (names: string[]) =>
      client.addBudgetPeople({ budgetProfileId, people: names.map((userName) => ({ userName, userId: '' })) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-people', budgetProfileId] })
    },
  })

  const { mutateAsync: doRemove, isPending: isRemoving } = useMutation({
    mutationFn: ({ personId, replacementPersonId, replacementPaymentMethodId }: {
      personId: bigint
      replacementPersonId: bigint
      replacementPaymentMethodId: string
    }) => client.removeBudgetPerson({ budgetProfileId, personId, replacementPersonId, replacementPaymentMethodId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-people', budgetProfileId] })
      queryClient.invalidateQueries({ queryKey: ['paymentMethods', budgetProfileId] })
      queryClient.invalidateQueries({ queryKey: ['income-sources', budgetProfileId] })
    },
  })

  const { mutateAsync: doUpdatePerson, isPending: isUpdatingPerson } = useMutation({
    mutationFn: (vars: { id: bigint; budgetProfileId: string; color: string }) =>
      client.updateBudgetPerson(vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-people', budgetProfileId] })
    },
  })

  const { mutateAsync: doUpdateRole } = useMutation({
    mutationFn: (vars: { personId: bigint; role: BudgetRole }) =>
      client.updateBudgetPersonRole({ budgetProfileId, personId: vars.personId, role: vars.role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget-people', budgetProfileId] })
    },
  })

  function addToList() {
    if (name.trim()) {
      setPendingNames((p) => [...p, name.trim()])
      setName('')
    }
  }

  async function handleAdd() {
    if (pendingNames.length === 0) return
    try {
      await doAdd(pendingNames)
      logger.info('budget.people.add', { budgetProfileId, count: pendingNames.length })
      showSuccess(`Added ${pendingNames.length} person${pendingNames.length > 1 ? 's' : ''}`)
      setPendingNames([])
    } catch (err) {
      showError(err)
    }
  }

  function openRemoveDialog(person: BudgetPerson) {
    const hasIncome = (incomeData?.sources ?? []).some((s) => s.budgetPersonId === person.id)
    const hasPMs = (pmData?.methods ?? []).some((pm) => pm.budgetPersonId === person.id)
    setRemovingPerson(person)
    setNeedsReplacement(hasIncome || hasPMs)
    setReplacementPersonId(0n)
    setReplacementPmId('')
  }

  function closeRemoveDialog() {
    setRemovingPerson(null)
    setNeedsReplacement(false)
    setReplacementPersonId(0n)
    setReplacementPmId('')
  }

  async function handleRemove() {
    if (!removingPerson) return
    if (needsReplacement && (replacementPersonId === 0n || !replacementPmId)) return
    try {
      await doRemove({
        personId: removingPerson.id,
        replacementPersonId: needsReplacement ? replacementPersonId : 0n,
        replacementPaymentMethodId: needsReplacement ? replacementPmId : '',
      })
      logger.info('budget.people.remove', {
        budgetProfileId,
        personId: removingPerson.id.toString(),
        withReplacement: needsReplacement,
      })
      showSuccess(`${removingPerson.userName} removed`)
      closeRemoveDialog()
    } catch (err) {
      showError(err)
    }
  }

  function openEditColor(person: BudgetPerson) {
    setEditingPerson(person)
    setEditColor(person.color)
  }

  async function handleUpdateColor() {
    if (!editingPerson) return
    try {
      await doUpdatePerson({ id: editingPerson.id, budgetProfileId, color: editColor })
      logger.info('budget.people.update_color', { budgetProfileId, personId: editingPerson.id.toString() })
      showSuccess(`Color updated for ${editingPerson.userName}`)
      setEditingPerson(null)
    } catch (err) {
      showError(err)
    }
  }

  async function handleUpdateRole(personId: bigint, role: BudgetRole) {
    try {
      await doUpdateRole({ personId, role })
      logger.info('budget.people.update_role', { budgetProfileId, personId: personId.toString(), role })
      showSuccess('Role updated')
    } catch (err) {
      showError(err)
    }
  }

  const people = data?.people ?? []
  const replacementPeople = people.filter((p) => removingPerson && p.id !== removingPerson.id)
  const replacementPersonPMs: PaymentMethod[] = (pmData?.methods ?? []).filter(
    (pm) => pm.budgetPersonId === replacementPersonId
  )
  const canConfirmRemoval = !needsReplacement || (replacementPersonId !== 0n && replacementPmId !== '')

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box>
        <Typography variant="subtitle1" fontWeight={600} mb={1}>Members</Typography>
        {isLoading ? (
          <CircularProgress size={20} />
        ) : people.length === 0 ? (
          <Typography variant="body2" color="text.secondary">No people yet.</Typography>
        ) : (
          <List dense disablePadding>
            {people.map((p) => {
              const isOwner = p.userId !== '' && p.userId === budgetOwnerId
              return (
                <ListItem
                  key={p.id.toString()}
                  disableGutters
                  secondaryAction={
                    canManageUsers ? (
                      <Box sx={{ display: 'flex', gap: 0.5 }}>
                        <IconButton size="small" onClick={() => openEditColor(p)} aria-label="set color">
                          <PaletteIcon fontSize="small" sx={p.color ? { color: p.color } : {}} />
                        </IconButton>
                        {!isOwner && (
                          <IconButton size="small" onClick={() => openRemoveDialog(p)} aria-label="remove">
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Box>
                    ) : undefined
                  }
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        {p.color && (
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
                        )}
                        <span>{p.userName}</span>
                        {canManageUsers && !isOwner && p.userId && p.role !== BudgetRole.UNSPECIFIED ? (
                          <FormControl size="small">
                            <Select
                              value={p.role}
                              onChange={(e) => handleUpdateRole(p.id, e.target.value as BudgetRole)}
                              size="small"
                              sx={{ fontSize: '0.75rem', '.MuiSelect-select': { py: 0.5 } }}
                            >
                              <MenuItem value={BudgetRole.ADMIN}>{roleLabel(BudgetRole.ADMIN)}</MenuItem>
                              <MenuItem value={BudgetRole.COLLABORATOR}>{roleLabel(BudgetRole.COLLABORATOR)}</MenuItem>
                              <MenuItem value={BudgetRole.VIEWER}>{roleLabel(BudgetRole.VIEWER)}</MenuItem>
                            </Select>
                          </FormControl>
                        ) : (
                          <Chip
                            label={roleLabel(p.role)}
                            size="small"
                            color={isOwner ? 'primary' : 'default'}
                            variant="outlined"
                          />
                        )}
                      </Stack>
                    }
                    secondary={p.userId ? undefined : 'Pending invite'}
                  />
                </ListItem>
              )
            })}
          </List>
        )}
      </Box>

      {canManageUsers && (
        <>
          <Divider />

          <Box>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>Add people</Typography>
            <Stack direction="row" spacing={1} mb={1}>
              <TextField
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addToList()}
                size="small"
                fullWidth
                placeholder="e.g. Jane"
              />
              <Button variant="outlined" onClick={addToList} disabled={!name.trim()}>Add</Button>
            </Stack>
            {pendingNames.length > 0 && (
              <List dense disablePadding sx={{ mb: 1 }}>
                {pendingNames.map((n, i) => (
                  <ListItem key={i} disableGutters secondaryAction={
                    <IconButton size="small" onClick={() => setPendingNames((prev) => prev.filter((_, idx) => idx !== i))}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  }>
                    <ListItemText primary={n} secondary="pending" />
                  </ListItem>
                ))}
              </List>
            )}
            <Button
              variant="contained"
              onClick={handleAdd}
              disabled={pendingNames.length === 0 || isAdding}
              fullWidth
            >
              {isAdding ? 'Saving…' : pendingNames.length > 0 ? `Save (${pendingNames.length})` : 'Save'}
            </Button>
          </Box>
        </>
      )}

      {/* Edit color dialog */}
      <Dialog open={editingPerson !== null} onClose={() => setEditingPerson(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Color for {editingPerson?.userName}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <ColorPicker value={editColor} onChange={setEditColor} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingPerson(null)} color="inherit">Cancel</Button>
          <Button
            variant="contained"
            onClick={handleUpdateColor}
            disabled={isUpdatingPerson}
          >
            {isUpdatingPerson ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Remove dialog */}
      <Dialog open={removingPerson !== null} onClose={closeRemoveDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Remove {removingPerson?.userName}</DialogTitle>
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
                      <MenuItem key={pm.id} value={pm.id}>{pm.name}</MenuItem>
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
              Remove <strong>{removingPerson?.userName}</strong> from this budget?
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeRemoveDialog} color="inherit">Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleRemove}
            disabled={!canConfirmRemoval || isRemoving}
          >
            {isRemoving ? 'Removing…' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
