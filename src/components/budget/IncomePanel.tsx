'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { IncomeSource } from '@/gen/spendsense/v1/budget_pb'
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
  budgetProfileId: string
  showBeforeTax?: boolean
}

function formatMoney(units: bigint, nanos: number): string {
  const total = Number(units) + nanos / 1e9
  return total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function IncomePanel({ budgetProfileId, showBeforeTax }: Props) {
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()
  const [editingSource, setEditingSource] = useState<IncomeSource | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['income-sources', budgetProfileId],
    queryFn: () => client.listIncomeSources({ budgetProfileId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { mutateAsync: doDelete } = useMutation({
    mutationFn: (id: bigint) => client.deleteIncomeSource({ id, budgetProfileId }),
  })

  function invalidateSavings() {
    queryClient.invalidateQueries({ queryKey: ['savings-sources', budgetProfileId] })
  }

  async function handleDelete(id: bigint) {
    try {
      await doDelete(id)
      logger.info('income.delete', { budgetProfileId, id: id.toString() })
      refetch()
      invalidateSavings()
    } catch (err) {
      showError(err)
    }
  }

  const sources = data?.sources ?? []
  const people = peopleData?.people ?? []
  const personMap = new Map(people.map((p) => [p.id.toString(), p.userName]))
  const total = sources.reduce(
    (sum, s) => sum + Number(s.defaultAmount?.units ?? 0) + (s.defaultAmount?.nanos ?? 0) / 1e9,
    0
  )

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
      {sources.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No income sources yet.</Typography>
      ) : (
        <List dense disablePadding>
          {sources.map((src) => {
            const personName = src.budgetPersonId !== 0n
              ? personMap.get(src.budgetPersonId.toString())
              : undefined
            return (
              <ListItem
                key={src.id.toString()}
                disableGutters
                secondaryAction={
                  <Box>
                    <IconButton size="small" onClick={() => setEditingSource(src)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleDelete(src.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                }
              >
                <ListItemText
                  primary={src.name}
                  secondary={
                    <>
                      {formatMoney(src.defaultAmount?.units ?? 0n, src.defaultAmount?.nanos ?? 0)}
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
          budgetProfileId={budgetProfileId}
          showBeforeTax={showBeforeTax}
          onClose={() => setAddOpen(false)}
          onDone={() => { setAddOpen(false); refetch(); invalidateSavings() }}
        />
      )}

      {editingSource && (
        <EditIncomeModal
          budgetProfileId={budgetProfileId}
          source={editingSource}
          showBeforeTax={showBeforeTax}
          onClose={() => setEditingSource(null)}
          onDone={() => {
            setEditingSource(null)
            refetch()
            invalidateSavings()
          }}
        />
      )}
    </Box>
  )
}
