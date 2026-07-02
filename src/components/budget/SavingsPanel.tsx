'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import Tooltip from '@mui/material/Tooltip'

interface Props {
  budgetProfileId: string
  activePeriodStart?: Date
  addOpen?: boolean
  onAddClose?: () => void
}

function formatMoney(units: bigint, nanos: number): string {
  const total = Number(units) + nanos / 1e9
  return total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

const FREQ_KEY: Record<RecurringType, string> = {
  [RecurringType.UNSPECIFIED]: '',
  [RecurringType.ONE_OFF]: 'oneOff',
  [RecurringType.WEEKLY]: 'weekly',
  [RecurringType.BI_WEEKLY]: 'biWeekly',
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

export function SavingsPanel({ budgetProfileId, activePeriodStart, addOpen = false, onAddClose }: Props) {
  const t = useTranslations('budget.savings')
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const [editingSource, setEditingSource] = useState<SavingsSource | null>(null)
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['savings-sources', budgetProfileId],
    queryFn: () => client.listSavingsSources({ budgetProfileId }),
  })

  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { data: pmData } = useQuery({
    queryKey: ['payment-methods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })

  const { mutateAsync: doDelete } = useMutation({
    mutationFn: (id: bigint) => client.deleteSavingsSource({ id, budgetProfileId }),
  })

  async function handleDelete(id: bigint) {
    try {
      await doDelete(id)
      logger.info('budget.savings.delete', { budgetProfileId, id: id.toString() })
      refetch()
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    } catch (err) {
      showError(err)
    }
  }

  const sources = data?.sources ?? []
  const people = peopleData?.people ?? []
  const personMap = new Map(people.map((p) => [p.id.toString(), p.userName]))
  const pmMap = new Map((pmData?.methods ?? []).map((pm) => [pm.id, pm.name]))
  const monthlyTotal = sources.reduce((sum, s) => sum + toMonthlyAmount(s), 0)

  if (isLoading) return <CircularProgress size={20} />

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
        </Box>
        <Typography variant="subtitle2" color="info.main">
          {monthlyTotal.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} {t('perMonth')}
        </Typography>
      </Box>
      {sources.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{t('empty')}</Typography>
      ) : (
        <List dense disablePadding>
          {sources.map((src) => {
            const personName = src.budgetPersonId !== 0n
              ? personMap.get(src.budgetPersonId.toString())
              : undefined
            const pmName = src.paymentMethodId ? pmMap.get(src.paymentMethodId) : undefined
            return (
              <ListItem
                key={src.id.toString()}
                disableGutters
                secondaryAction={
                  src.isTaxReserve ? (
                    <Tooltip title={t('taxTooltip')} placement="left">
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
                        <Chip label={t('taxEstimate')} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                      {!src.isTaxReserve && src.paymentDays.length > 0 && (
                        <Chip label={src.paymentDays.join(', ')} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                      {!src.isTaxReserve && src.paymentDays.length === 0 && FREQ_KEY[src.frequency] && (
                        <Chip label={t(`freq.${FREQ_KEY[src.frequency]}`)} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                      )}
                    </Box>
                  }
                  secondary={
                    <>
                      {formatMoney(src.amount?.units ?? 0n, src.amount?.nanos ?? 0)}
                      {src.isTaxReserve && src.federalAmount && src.stateAmount && (
                        <> · {t('federal')} {formatMoney(src.federalAmount.units, src.federalAmount.nanos)} · {t('state')} {formatMoney(src.stateAmount.units, src.stateAmount.nanos)}</>
                      )}
                      {src.isTaxReserve && src.federalAmount && !src.stateAmount && (
                        <> · {t('federal')} {formatMoney(src.federalAmount.units, src.federalAmount.nanos)}</>
                      )}
                      {personName && <> · {personName}</>}
                      {pmName && <> · {pmName}</>}
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
          activePeriodStart={activePeriodStart}
          onClose={() => onAddClose?.()}
          onDone={() => { onAddClose?.(); refetch() }}
        />
      )}

      {editingSource && (
        <EditSavingsModal
          budgetProfileId={budgetProfileId}
          activePeriodStart={activePeriodStart}
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
