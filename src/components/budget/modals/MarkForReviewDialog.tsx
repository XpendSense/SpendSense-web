'use client'

import { useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Transaction, Category, PaymentMethod, BudgetPerson } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import InputAdornment from '@mui/material/InputAdornment'
import Chip from '@mui/material/Chip'
import SearchIcon from '@mui/icons-material/Search'
import { logger } from '@/lib/logger'

function fmtMoney(tx: Transaction): string {
  const n = Number(tx.plannedAmount?.units ?? 0n) + (tx.plannedAmount?.nanos ?? 0) / 1e9
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) return '—'
  return new Date(Number(ts.seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

interface Props {
  open: boolean
  onClose: () => void
  transaction: Transaction | null
  budgetProfileId: string
  budgetPeriodId: string
  categoryMap: Map<number, Category>
  methodMap: Map<string, PaymentMethod>
  personMap: Map<string, BudgetPerson>
}

export function MarkForReviewDialog({
  open, onClose, transaction, budgetProfileId, budgetPeriodId,
  categoryMap, methodMap, personMap,
}: Props) {
  const t = useTranslations('budget.markForReview')
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()
  const { showError } = useSnackbar()
  const isMobile = useIsMobile()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  // Candidates are the period's own Fixed-type transactions — the exact same
  // query the Fixed tab uses. Savings-derived transactions are transaction_type_id
  // 1 (Fixed) too, so they're already included with no separate lookup.
  const { data: fixedTxData, isLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId, 1],
    queryFn: () => client.listTransactions({ budgetPeriodId, transactionTypeId: 1 }),
    enabled: open,
  })

  const { mutateAsync: doMark, isPending } = useMutation({
    mutationFn: () =>
      client.markTransactionForReview({
        transactionId: transaction!.id,
        matchedTransactionId: selectedId!,
        budgetProfileId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-reviews', budgetProfileId] })
      logger.info('review.markForReview', { transactionId: transaction?.id, matchedTransactionId: selectedId })
      onClose()
    },
  })

  async function handleConfirm() {
    try {
      await doMark()
    } catch (err) {
      showError(err)
    }
  }

  function handleClose() {
    setSelectedId(null)
    setFilter('')
    onClose()
  }

  const category = transaction?.categoryId ? categoryMap.get(transaction.categoryId) : undefined
  const method = transaction?.paymentMethodId ? methodMap.get(transaction.paymentMethodId) : undefined
  const owner = method?.budgetPersonId
    ? personMap.get(method.budgetPersonId.toString())
    : undefined

  const filterLower = filter.toLowerCase()
  const candidates = (fixedTxData?.transactions ?? []).filter(
    (tx) => !filterLower || tx.name.toLowerCase().includes(filterLower),
  )

  return (
    <Dialog open={open} onClose={handleClose} fullScreen={isMobile} maxWidth="sm" fullWidth>
      <DialogTitle>{t('title')}</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {/* Transaction summary */}
        {transaction && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>{transaction.name}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">{t('date')}</Typography>
                <Typography variant="body2">{fmtDate(transaction.date)}</Typography>
              </Box>
              {category && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">{t('category')}</Typography>
                  <Typography variant="body2">{category.name}</Typography>
                </Box>
              )}
              {method && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">{t('paymentMethod')}</Typography>
                  <Typography variant="body2">{method.alias || method.name}</Typography>
                </Box>
              )}
              {owner && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">{t('owner')}</Typography>
                  <Typography variant="body2">{owner.userName}</Typography>
                </Box>
              )}
            </Box>
          </Box>
        )}

        <Divider />

        {/* Fixed expense filter */}
        <Box sx={{ px: 2, py: 1 }}>
          <TextField
            size="small"
            fullWidth
            placeholder={t('filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Candidate list — any Fixed-type transaction this period, whether
            spawned from a fixed expense template or a savings source */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : candidates.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {filter ? t('noResults') : t('noFixed')}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {candidates.map((tx) => (
              <ListItem key={tx.id} disablePadding>
                <ListItemButton
                  selected={selectedId === tx.id}
                  onClick={() => setSelectedId(tx.id)}
                >
                  <ListItemText
                    primary={tx.name}
                    secondary={fmtMoney(tx)}
                  />
                  {tx.isPaid && <Chip label={t('paidBadge')} size="small" variant="outlined" sx={{ ml: 1 }} />}
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>{t('cancel')}</Button>
        <LoadingButton
          onClick={handleConfirm}
          variant="contained"
          disabled={!selectedId}
          loading={isPending}
        >
          {t('confirm')}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  )
}
