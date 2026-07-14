'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Transaction, FixedExpense, Category, PaymentMethod, BudgetPerson } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { useTheme } from '@mui/material/styles'
import useMediaQuery from '@mui/material/useMediaQuery'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
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
import SearchIcon from '@mui/icons-material/Search'
import { logger } from '@/lib/logger'

function fmtMoney(fe: FixedExpense): string {
  const n = Number(fe.plannedAmount?.units ?? 0n) + (fe.plannedAmount?.nanos ?? 0) / 1e9
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
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const { data: feData, isLoading } = useQuery({
    queryKey: ['fixed-expenses', budgetProfileId],
    queryFn: () => client.listFixedExpenses({ budgetProfileId }),
    enabled: open,
  })

  const { mutateAsync: doMark, isPending } = useMutation({
    mutationFn: () =>
      client.markTransactionForReview({
        transactionId: transaction!.id,
        fixedExpenseId: selectedId!,
        budgetProfileId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaction-reviews', budgetProfileId] })
      logger.info('review.markForReview', { transactionId: transaction?.id, fixedExpenseId: selectedId })
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
  const fixedExpenses = (feData?.expenses ?? []).filter(
    (fe) => !filterLower || fe.name.toLowerCase().includes(filterLower),
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
                  <Typography variant="body2">{method.name}</Typography>
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

        {/* Fixed expense list */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress />
          </Box>
        ) : fixedExpenses.length === 0 ? (
          <Box sx={{ px: 2, py: 3 }}>
            <Typography variant="body2" color="text.secondary">
              {filter ? t('noResults') : t('noFixed')}
            </Typography>
          </Box>
        ) : (
          <List disablePadding>
            {fixedExpenses.map((fe) => (
              <ListItem key={fe.id} disablePadding>
                <ListItemButton
                  selected={selectedId === fe.id}
                  onClick={() => setSelectedId(fe.id)}
                >
                  <ListItemText
                    primary={fe.name}
                    secondary={fmtMoney(fe)}
                  />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isPending}>{t('cancel')}</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!selectedId || isPending}
        >
          {t('confirm')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
