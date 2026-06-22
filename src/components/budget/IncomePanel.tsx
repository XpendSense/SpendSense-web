'use client'

import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { IncomeEntry } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { EditIncomeModal } from './modals/EditIncomeModal'
import { AddIncomeDialog } from './modals/AddIncomeDialog'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemText from '@mui/material/ListItemText'
import IconButton from '@mui/material/IconButton'
import CircularProgress from '@mui/material/CircularProgress'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'

interface Props {
  budgetId: string
}

function formatMoney(units: bigint, nanos: number): string {
  const total = Number(units) + nanos / 1e9
  return total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function IncomePanel({ budgetId }: Props) {
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const [editingEntry, setEditingEntry] = useState<IncomeEntry | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['income', budgetId],
    queryFn: () => client.listIncomeEntries({ budgetId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetId],
    queryFn: () => client.listBudgetPeople({ budgetId }),
  })

  const { mutateAsync: doDelete } = useMutation({
    mutationFn: (id: bigint) => client.deleteIncomeEntry({ id, budgetId }),
  })

  async function handleDelete(id: bigint) {
    try {
      await doDelete(id)
      logger.info('income.delete', { budgetId, id: id.toString() })
      refetch()
    } catch (err) {
      showError(err)
    }
  }

  const entries = data?.entries ?? []
  const people = peopleData?.people ?? []
  const personMap = new Map(people.map((p) => [p.id.toString(), p.userName]))
  const total = entries.reduce((sum, e) => sum + Number(e.amount?.units ?? 0) + (e.amount?.nanos ?? 0) / 1e9, 0)

  if (isLoading) return <CircularProgress size={20} />

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>Income</Typography>
          <IconButton size="small" onClick={() => setAddOpen(true)}>
            <AddIcon fontSize="small" />
          </IconButton>
        </Box>
        <Typography variant="subtitle2" color="success.main">
          {total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} / mo
        </Typography>
      </Box>
      {entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No income entries yet.</Typography>
      ) : (
        <List dense disablePadding>
          {entries.map((entry) => {
            const personName = entry.budgetPersonId !== 0n
              ? personMap.get(entry.budgetPersonId.toString())
              : undefined
            return (
              <ListItem
                key={entry.id.toString()}
                disableGutters
                secondaryAction={
                  <Box>
                    <IconButton size="small" onClick={() => setEditingEntry(entry)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(entry.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={entry.name}
                  secondary={
                    <>
                      {formatMoney(entry.amount?.units ?? 0n, entry.amount?.nanos ?? 0)}
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
        <AddIncomeDialog
          budgetId={budgetId}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); refetch() }}
        />
      )}

      {editingEntry && (
        <EditIncomeModal
          budgetId={budgetId}
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onDone={() => {
            setEditingEntry(null)
            refetch()
          }}
        />
      )}
    </Box>
  )
}
