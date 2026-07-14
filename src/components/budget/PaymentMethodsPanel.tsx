'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { PaymentType } from '@/gen/wellspent/v1/common_pb'
import type { PaymentMethod } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { ColorPicker } from '@/components/ui/ColorPicker'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import CircularProgress from '@mui/material/CircularProgress'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'

const PAYMENT_TYPE_KEYS: { value: PaymentType; key: string }[] = [
  { value: PaymentType.CASH, key: 'cash' },
  { value: PaymentType.CREDIT, key: 'credit' },
  { value: PaymentType.DEBIT, key: 'debit' },
  { value: PaymentType.DIGITAL_WALLET, key: 'digitalWallet' },
  { value: PaymentType.BANK_TRANSFER, key: 'bankTransfer' },
  { value: PaymentType.CRYPTO, key: 'crypto' },
  { value: PaymentType.INVESTMENT, key: 'investment' },
]

interface Props {
  budgetProfileId: string
  budgetPeriodId?: string
  canEdit?: boolean
}

export function PaymentMethodsPanel({ budgetProfileId, budgetPeriodId, canEdit = true }: Props) {
  const t = useTranslations('budget.paymentMethods')
  const { showError, showSuccess } = useSnackbar()
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))

  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<PaymentType>(PaymentType.DEBIT)
  const [newPersonId, setNewPersonId] = useState<bigint>(0n)
  const [newColor, setNewColor] = useState('')

  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null)
  const [editName, setEditName] = useState('')
  const [editAlias, setEditAlias] = useState('')
  const [editColor, setEditColor] = useState('')

  const [deletingMethod, setDeletingMethod] = useState<PaymentMethod | null>(null)
  const [replacementId, setReplacementId] = useState('')

  const client = useClient(BudgetService)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['paymentMethods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { data: transactionsData } = useQuery({
    queryKey: ['transactions', budgetPeriodId],
    queryFn: () => client.listTransactions({ budgetPeriodId: budgetPeriodId! }),
    enabled: !!budgetPeriodId,
  })

  const { mutateAsync: doCreate, isPending: isCreating } = useMutation({
    mutationFn: (vars: { name: string; type: PaymentType; budgetPersonId: bigint; color: string }) =>
      client.createPaymentMethod(vars),
  })

  const { mutateAsync: doUpdate, isPending: isUpdating } = useMutation({
    mutationFn: (vars: { id: string; name: string; color: string; alias: string }) => client.updatePaymentMethod(vars),
  })

  const { mutateAsync: doDelete, isPending: isDeleting } = useMutation({
    mutationFn: (vars: { id: string; replacementId: string; budgetProfileId: string }) =>
      client.deletePaymentMethod(vars),
  })

  async function handleCreate() {
    try {
      await doCreate({ name: newName, type: newType, budgetPersonId: newPersonId, color: newColor })
      logger.info('paymentMethod.create', { name: newName, budgetPersonId: newPersonId.toString() })
      showSuccess(`Payment method "${newName}" added`)
      setNewName('')
      setNewPersonId(0n)
      setNewColor('')
      setAddOpen(false)
      refetch()
    } catch (err) {
      showError(err)
    }
  }

  function openEdit(method: PaymentMethod) {
    setEditingMethod(method)
    setEditName(method.name)
    setEditAlias(method.alias)
    setEditColor(method.color)
  }

  async function openDelete(method: PaymentMethod) {
    const hasTransactions = transactions.some((t) => t.paymentMethodId === method.id)
    if (!hasTransactions) {
      const replacement = methods.find((m) => m.id !== method.id)
      if (!replacement) return
      try {
        await doDelete({ id: method.id, replacementId: replacement.id, budgetProfileId })
        logger.info('paymentMethod.deactivate', { id: method.id, replacementId: replacement.id, budgetProfileId })
        showSuccess(`"${method.alias || method.name}" deactivated`)
        refetch()
      } catch (err) {
        showError(err)
      }
      return
    }
    setDeletingMethod(method)
    setReplacementId('')
  }

  async function handleDelete() {
    if (!deletingMethod || !replacementId) return
    try {
      await doDelete({ id: deletingMethod.id, replacementId, budgetProfileId })
      logger.info('paymentMethod.deactivate', { id: deletingMethod.id, replacementId, budgetProfileId })
      showSuccess(`"${deletingMethod.alias || deletingMethod.name}" deactivated`)
      setDeletingMethod(null)
      refetch()
    } catch (err) {
      showError(err)
    }
  }

  async function handleUpdate() {
    if (!editingMethod) return
    try {
      await doUpdate({ id: editingMethod.id, name: editName, color: editColor, alias: editAlias })
      logger.info('paymentMethod.update', { id: editingMethod.id, name: editName, alias: editAlias })
      showSuccess(`"${editAlias || editName}" updated`)
      setEditingMethod(null)
      refetch()
    } catch (err) {
      showError(err)
    }
  }

  if (isLoading) return <CircularProgress size={20} />

  const methods = data?.methods ?? []
  const people = peopleData?.people ?? []
  const transactions = transactionsData?.transactions ?? []
  const personMap = new Map(people.map((p) => [p.id.toString(), p.userName]))

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
        {canEdit && (
          <IconButton size="small" onClick={() => setAddOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {methods.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {methods.map((m) => {
            const personName = m.budgetPersonId !== 0n
              ? personMap.get(m.budgetPersonId.toString())
              : undefined
            return (
              <ListItem
                key={m.id}
                disableGutters
                secondaryAction={
                  canEdit ? (
                    <Box>
                      <Tooltip title={t('editTooltip')}>
                        <IconButton size="small" onClick={() => openEdit(m)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('deactivateTooltip')}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => openDelete(m)}
                            disabled={methods.length <= 1}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  ) : undefined
                }
              >
                <ListItemText
                  primary={m.alias || m.name}
                  secondary={
                    <>
                      {m.alias && <span style={{ opacity: 0.5 }}>{m.name} · </span>}
                      {personName}
                    </>
                  }
                />
                <Chip
                  label={PaymentType[m.type]}
                  size="small"
                  variant="outlined"
                  sx={{ mr: 4, ...(m.color ? { bgcolor: m.color, color: 'white', borderColor: m.color } : {}) }}
                />
              </ListItem>
            )
          })}
        </List>
      )}

      {/* Add dialog */}
      <Dialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setNewName(''); setNewPersonId(0n); setNewColor('') }}
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
      >
        <DialogTitle>{t('addDialog.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('addDialog.name')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              fullWidth
              placeholder={t('addDialog.namePlaceholder')}
            />
            <TextField
              select
              label={t('addDialog.type')}
              value={newType}
              onChange={(e) => setNewType(Number(e.target.value) as PaymentType)}
              fullWidth
            >
              {PAYMENT_TYPE_KEYS.map((pt) => (
                <MenuItem key={pt.value} value={pt.value}>{t(`types.${pt.key}`)}</MenuItem>
              ))}
            </TextField>
            <FormControl fullWidth size="small" required>
              <InputLabel>{t('addDialog.owner')}</InputLabel>
              <Select
                label={t('addDialog.owner')}
                value={newPersonId.toString()}
                onChange={(e) => setNewPersonId(BigInt(e.target.value))}
                displayEmpty
              >
                <MenuItem value="0" disabled><em>{t('addDialog.selectPerson')}</em></MenuItem>
                {people.map((p) => (
                  <MenuItem key={p.id.toString()} value={p.id.toString()}>
                    {p.userName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                {t('addDialog.colorOptional')}
              </Typography>
              <ColorPicker value={newColor} onChange={setNewColor} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setAddOpen(false); setNewName(''); setNewPersonId(0n); setNewColor('') }} color="inherit">{t('addDialog.cancel')}</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim() || newPersonId === 0n || isCreating}>
            {isCreating ? t('addDialog.adding') : t('addDialog.add')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete dialog */}
      <Dialog
        open={deletingMethod !== null}
        onClose={() => setDeletingMethod(null)}
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
      >
        <DialogTitle>{t('deactivateDialog.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {t('deactivateDialog.body', { name: deletingMethod ? (deletingMethod.alias || deletingMethod.name) : '' })}
            </Typography>
            <TextField
              select
              label={t('deactivateDialog.reassignTo')}
              value={replacementId}
              onChange={(e) => setReplacementId(e.target.value)}
              fullWidth
            >
              {methods
                .filter((m) => m.id !== deletingMethod?.id)
                .map((m) => {
                  const owner = m.budgetPersonId !== 0n ? personMap.get(m.budgetPersonId.toString()) : undefined
                  return (
                    <MenuItem key={m.id} value={m.id}>
                      {m.alias || m.name}{owner ? ` · ${owner}` : ''}
                    </MenuItem>
                  )
                })}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingMethod(null)} color="inherit">{t('deactivateDialog.cancel')}</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={!replacementId || isDeleting}
          >
            {isDeleting ? t('deactivateDialog.deactivating') : t('deactivateDialog.deactivate')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit dialog (rename + color) */}
      <Dialog
        open={editingMethod !== null}
        onClose={() => setEditingMethod(null)}
        maxWidth="xs"
        fullWidth
        fullScreen={fullScreen}
      >
        <DialogTitle>{t('editDialog.title')}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label={t('editDialog.alias')}
              value={editAlias}
              onChange={(e) => setEditAlias(e.target.value)}
              fullWidth
              placeholder={editName}
              helperText={t('editDialog.aliasHint')}
            />
            <TextField
              label={t('editDialog.name')}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              placeholder={t('editDialog.namePlaceholder')}
              helperText={t('editDialog.nameHint')}
            />
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                {t('editDialog.colorOptional')}
              </Typography>
              <ColorPicker value={editColor} onChange={setEditColor} />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingMethod(null)} color="inherit">{t('editDialog.cancel')}</Button>
          <Button
            variant="contained"
            onClick={handleUpdate}
            disabled={!editName.trim() || isUpdating}
          >
            {isUpdating ? t('editDialog.saving') : t('editDialog.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
