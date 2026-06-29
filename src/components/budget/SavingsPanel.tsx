'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { SavingsSource } from '@/gen/spendsense/v1/budget_pb'
import { RecurringType } from '@/gen/spendsense/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { AddSavingsDialog } from './modals/AddSavingsDialog'
import { EditSavingsModal } from './modals/EditSavingsModal'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import Chip from '@mui/material/Chip'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  budgetProfileId: string
}

function formatMoney(units: bigint, nanos: number): string {
  const total = Number(units) + nanos / 1e9
  return total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const FREQ_LABEL: Record<RecurringType, string> = {
  [RecurringType.UNSPECIFIED]: '',
  [RecurringType.ONE_OFF]: 'one-off',
  [RecurringType.WEEKLY]: 'weekly',
  [RecurringType.BI_WEEKLY]: 'bi-weekly',
  [RecurringType.MONTHLY]: 'monthly',
  [RecurringType.YEARLY]: 'yearly',
}

const MONTHLY_MULTIPLIER: Record<RecurringType, number> = {
  [RecurringType.UNSPECIFIED]: 0,
  [RecurringType.ONE_OFF]: 0,
  [RecurringType.WEEKLY]: 52 / 12,
  [RecurringType.BI_WEEKLY]: 26 / 12,
  [RecurringType.MONTHLY]: 1,
  [RecurringType.YEARLY]: 1 / 12,
}

function toMonthlyAmount(src: SavingsSource): number {
  const amount = Number(src.amount?.units ?? 0n) + (src.amount?.nanos ?? 0) / 1e9
  return amount * (MONTHLY_MULTIPLIER[src.frequency] ?? 0)
}

export function SavingsPanel({ budgetProfileId }: Props) {
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const [editingSource, setEditingSource] = useState<SavingsSource | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['savings-sources', budgetProfileId],
    queryFn: () => client.listSavingsSources({ budgetProfileId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { mutateAsync: doDelete } = useMutation({
    mutationFn: (id: bigint) => client.deleteSavingsSource({ id, budgetProfileId }),
  })

  async function handleDelete(id: bigint) {
    try {
      await doDelete(id)
      logger.info('budget.savings.delete', { budgetProfileId, id: id.toString() })
      refetch()
    } catch (err) {
      showError(err)
    }
  }

  const sources = data?.sources ?? []
  const people = peopleData?.people ?? []
  const personMap = new Map(people.map((p) => [p.id.toString(), p.userName]))
  const monthlyTotal = sources.reduce((sum, s) => sum + toMonthlyAmount(s), 0)

  if (isLoading) return <CircularProgress size={20} />

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>Savings</Typography>
          <IconButton size="small" onClick={() => setAddOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="subtitle2" color="info.main">
          {monthlyTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} / mo
        </Typography>
      </Box>
      {sources.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No savings sources yet.</Typography>
      ) : (
        <List dense disablePadding>
          {sources.map((src) => {
            const personName = src.budgetPersonId !== 0n
              ? personMap.get(src.budgetPersonId.toString())
              : undefined
            const freqLabel = FREQ_LABEL[src.frequency]
            return (
              <ListItem
                key={src.id.toString()}
                disableGutters
                secondaryAction={
                  src.isTaxReserve ? (
                    <Tooltip title="Auto-calculated monthly set-aside for estimated tax payments. Updated each budget period." placement="left">
                      <InfoOutlinedIcon fontSize="small" sx={{ color: 'text.secondary', mt: 0.5 }} />
                    </Tooltip>
                  ) : (
                    <Box>
                      <IconButton size="small" onClick={() => setEditingSource(src)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleDelete(src.id)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  )
                }
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                      {src.name}
                      {src.isTaxReserve && (
                        <Chip label="tax estimate" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                      {!src.isTaxReserve && freqLabel && (
                        <Chip label={freqLabel} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                    </Box>
                  }
                  secondary={
                    <>
                      {formatMoney(src.amount?.units ?? 0n, src.amount?.nanos ?? 0)}
                      {src.isTaxReserve && src.federalAmount && src.stateAmount && (
                        <> · Fed: {formatMoney(src.federalAmount.units, src.federalAmount.nanos)} · State: {formatMoney(src.stateAmount.units, src.stateAmount.nanos)}</>
                      )}
                      {src.isTaxReserve && src.federalAmount && !src.stateAmount && (
                        <> · Fed: {formatMoney(src.federalAmount.units, src.federalAmount.nanos)}</>
                      )}
                      {personName && <> · {personName}</>}
                    </>
                  }
                />
              </ListItem>
            )
          })}
        </List>
      )}

      {addOpen && (
        <AddSavingsDialog
          budgetProfileId={budgetProfileId}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); refetch() }}
        />
      )}

      {editingSource && (
        <EditSavingsModal
          budgetProfileId={budgetProfileId}
          source={editingSource}
          onClose={() => setEditingSource(null)}
          onDone={() => {
            setEditingSource(null)
            refetch()
          }}
        />
      )}
    </Box>
  )
}
