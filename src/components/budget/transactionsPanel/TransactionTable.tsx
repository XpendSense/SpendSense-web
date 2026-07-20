'use client'

import { Fragment, useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTranslations } from 'next-intl'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Transaction, Category, PaymentMethod, BudgetPerson, FixedExpense } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useCurrency } from '@/hooks/useCurrency'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { formatMoneyFromNumber } from '@/lib/format'
import { MarkAsPaidDialog } from '../modals/MarkAsPaidDialog'
import { MarkForReviewDialog } from '../modals/MarkForReviewDialog'
import { SortHeader } from './SortHeader'
import { MobileRowActions } from './MobileRowActions'
import {
  type SortKey,
  formatVariableAmount,
  formatDate,
  txAmount,
  txPlannedAmount,
  fixedExpensePlannedAmount,
  paymentProgress,
  nextDueDateLabel,
  matchesSearch,
  compareTransactions,
  groupTransactionsByDay,
  isTransactionExcluded,
} from './helpers'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import IconButton from '@mui/material/IconButton'
import { LoadingIconButton } from '@/components/ui/LoadingIconButton'
import ToggleButton from '@mui/material/ToggleButton'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import FlagIcon from '@mui/icons-material/Flag'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff'
import VisibilityIcon from '@mui/icons-material/Visibility'

export interface TransactionTableProps {
  transactions: Transaction[]
  isLoading: boolean
  isEditable: boolean
  isFixed: boolean
  savingsCategoryId?: number
  incomeCategoryId?: number
  budgetPeriodId: string
  budgetProfileId: string
  label: string
  categoryMap: Map<number, Category>
  methodMap: Map<string, PaymentMethod>
  personMap: Map<string, BudgetPerson>
  notDueFixedExpenses?: FixedExpense[]
  fixedExpenseMap?: Map<string, FixedExpense>
  pendingReviewMatchByTxId?: Map<string, string>
  searchQuery?: string
  spentOnly?: boolean
  exceededOnly?: boolean
  excludedOnly?: boolean
  overBudgetTxIds?: Set<string>
  onToggleSpentOnly?: () => void
  onToggleExceededOnly?: () => void
  onToggleExcludedOnly?: () => void
  onDeleted: () => void
  onEdit: (t: Transaction) => void
  onEditFixedExpense?: (fe: FixedExpense) => void
  onRefresh: () => void
}

export function TransactionTable({
  transactions, isLoading, isEditable, isFixed, savingsCategoryId, incomeCategoryId, budgetPeriodId, budgetProfileId, label,
  categoryMap, methodMap, personMap, notDueFixedExpenses = [], fixedExpenseMap, pendingReviewMatchByTxId, searchQuery = '', spentOnly = false,
  exceededOnly = false, excludedOnly = false, overBudgetTxIds, onToggleSpentOnly, onToggleExceededOnly, onToggleExcludedOnly,
  onDeleted, onEdit, onEditFixedExpense, onRefresh,
}: TransactionTableProps) {
  const t = useTranslations('budget.transactions')
  const { showError } = useSnackbar()
  const { currency, locale } = useCurrency()
  const formatMoney = (amount: number) => formatMoneyFromNumber(amount, currency, locale)
  const client = useClient(BudgetService)
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>('day')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [markPaidTarget, setMarkPaidTarget] = useState<Transaction | null>(null)
  const [markReviewTarget, setMarkReviewTarget] = useState<Transaction | null>(null)

  const queryClient = useQueryClient()

  const { mutateAsync: doDeleteTx } = useMutation({
    mutationFn: (id: string) => client.deleteTransaction({ id }),
  })
  const { mutateAsync: doDeleteFixed } = useMutation({
    mutationFn: (id: string) => client.deleteFixedExpense({ id, budgetProfileId }),
  })
  const { mutateAsync: doUnmark, isPending: unmarkPending } = useMutation({
    mutationFn: (tx: Transaction) => client.unmarkTransactionAsPaid({ id: tx.id, budgetPeriodId }),
  })
  const { mutateAsync: doSetExcluded, isPending: setExcludedPending } = useMutation({
    mutationFn: (args: { id: string; excluded: boolean }) =>
      client.setTransactionExcluded({ id: args.id, budgetPeriodId, excluded: args.excluded }),
  })

  async function handleDeleteFixedExpense(fe: FixedExpense) {
    try {
      await doDeleteFixed(fe.id)
      logger.info('fixedExpense.delete', { id: fe.id })
      queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] })
      onDeleted()
    } catch (err) {
      showError(err)
    }
  }

  async function handleUnmark(tx: Transaction) {
    try {
      await doUnmark(tx)
      logger.info('transaction.unmarkAsPaid', { id: tx.id })
      queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId] })
      onRefresh()
    } catch (err) {
      showError(err)
    }
  }

  async function handleToggleExcluded(tx: Transaction) {
    try {
      await doSetExcluded({ id: tx.id, excluded: !tx.isExcluded })
      logger.info('transaction.setExcluded', { id: tx.id, excluded: !tx.isExcluded })
      queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId] })
      onRefresh()
    } catch (err) {
      showError(err)
    }
  }

  async function handleDelete(tx: Transaction) {
    try {
      if (isFixed && tx.fixedExpenseId) {
        await doDeleteFixed(tx.fixedExpenseId)
        logger.info('fixedExpense.delete', { id: tx.fixedExpenseId })
      } else {
        await doDeleteTx(tx.id)
        logger.info('transaction.delete', { id: tx.id })
      }
      onDeleted()
    } catch (err) {
      showError(err)
    }
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const isSavingsRow = (tx: Transaction) =>
    savingsCategoryId != null && tx.categoryId === savingsCategoryId

  const isIncomeRow = (tx: Transaction) =>
    incomeCategoryId != null && tx.categoryId === incomeCategoryId

  const isRowEditable = (tx: Transaction) => isEditable && !isSavingsRow(tx)

  const canMarkPaid = (tx: Transaction) =>
    isFixed && isEditable && !tx.isPaid

  const filteredTransactions = transactions.filter((tx) => {
    if (!isFixed && spentOnly && txAmount(tx) <= 0) return false
    if (!isFixed && exceededOnly && overBudgetTxIds && !overBudgetTxIds.has(tx.id)) return false
    if (excludedOnly && !isTransactionExcluded(tx, incomeCategoryId)) return false
    return matchesSearch(tx.name, tx.categoryId, tx.paymentMethodId, searchQuery, categoryMap, methodMap, personMap)
  })
  const filteredNotDue = notDueFixedExpenses.filter((fe) =>
    matchesSearch(fe.name, fe.categoryId, fe.paymentMethodId, searchQuery, categoryMap, methodMap, personMap))

  const sorted = [...filteredTransactions].sort((a, b) =>
    compareTransactions(a, b, sortKey, sortDir, categoryMap, methodMap, personMap))

  const dayGroups = isFixed
    ? []
    : groupTransactionsByDay(filteredTransactions, sortKey, sortDir, categoryMap, methodMap, personMap)

  if (isLoading) return <CircularProgress size={20} />

  if (isMobile) {
    const colSpan = isEditable ? 3 : 2

    const renderRow = (tx: Transaction) => {
      const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined
      const method = tx.paymentMethodId ? methodMap.get(tx.paymentMethodId) : undefined
      const person = method?.budgetPersonId && method.budgetPersonId !== 0n
        ? personMap.get(method.budgetPersonId.toString())
        : undefined
      const dateStr = formatDate(tx.date)
      return (
        <TableRow key={tx.id} hover>
          <TableCell>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" fontWeight={500}>{tx.name}</Typography>
                {isFixed && tx.fixedExpenseId && (() => {
                  const fe = fixedExpenseMap?.get(tx.fixedExpenseId)
                  const progress = fe ? paymentProgress(fe) : null
                  return progress ? (
                    <Typography variant="caption" color="text.secondary">({progress})</Typography>
                  ) : null
                })()}
                {!isFixed && pendingReviewMatchByTxId?.has(tx.id) && (
                  <Tooltip title={t('linkedToFixedTooltip', { name: pendingReviewMatchByTxId.get(tx.id) ?? '' })}>
                    <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
                      ({t('linkedToFixed')})
                    </Typography>
                  </Tooltip>
                )}
              </Box>
              {isFixed && dateStr && (
                <Typography variant="caption" color="text.secondary">{dateStr}</Typography>
              )}
              {(method || person) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {method && (
                    <Typography variant="caption" sx={{ color: method.color || 'text.secondary' }}>{method.alias || method.name}</Typography>
                  )}
                  {method && person && (
                    <Typography variant="caption" color="text.secondary">·</Typography>
                  )}
                  {person && (
                    <Typography variant="caption" sx={{ color: person.color || 'text.secondary' }}>{person.userName}</Typography>
                  )}
                </Box>
              )}
              {category && (
                <Typography variant="caption" sx={{ color: category.color || 'text.secondary' }}>{category.name}</Typography>
              )}
            </Box>
          </TableCell>
          <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top', pt: 1.5 }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              {isFixed ? (
                <Typography variant="body2">{formatMoney(txPlannedAmount(tx))}</Typography>
              ) : (() => {
                const { text, color } = formatVariableAmount(txAmount(tx), currency, locale)
                return <Typography variant="body2" color={color ?? 'inherit'}>{text}</Typography>
              })()}
              {isFixed && tx.isPaid && (
                <Typography variant="caption" color="success.main">
                  {t('paid')}: {formatMoney(txAmount(tx))}
                </Typography>
              )}
            </Box>
          </TableCell>
          {isEditable && (
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top', pt: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <MobileRowActions
                  canMarkPaid={canMarkPaid(tx)}
                  isAlreadyPaid={isFixed && tx.isPaid}
                  unmarkPending={unmarkPending}
                  canFlagForReview={!isFixed && isEditable}
                  isExcluded={tx.isExcluded}
                  isIncomeRow={isIncomeRow(tx)}
                  excludePending={setExcludedPending}
                  isRowEditable={isRowEditable(tx)}
                  onMarkPaid={() => setMarkPaidTarget(tx)}
                  onUnmark={() => handleUnmark(tx)}
                  onFlagForReview={() => setMarkReviewTarget(tx)}
                  onToggleExcluded={() => handleToggleExcluded(tx)}
                  onEdit={() => onEdit(tx)}
                  onDelete={() => handleDelete(tx)}
                />
              </Box>
            </TableCell>
          )}
        </TableRow>
      )
    }

    const renderNotDueRow = (fe: FixedExpense) => {
      const category = fe.categoryId ? categoryMap.get(fe.categoryId) : undefined
      const method = fe.paymentMethodId ? methodMap.get(fe.paymentMethodId) : undefined
      const person = method?.budgetPersonId && method.budgetPersonId !== 0n
        ? personMap.get(method.budgetPersonId.toString())
        : undefined
      return (
        <TableRow key={fe.id} hover>
          <TableCell>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Typography variant="body2" fontWeight={500} color="text.disabled">{fe.name}</Typography>
                {(() => {
                  const progress = paymentProgress(fe)
                  return progress ? (
                    <Typography variant="caption" color="text.disabled">({progress})</Typography>
                  ) : null
                })()}
                <IconButton size="small" onClick={() => onEditFixedExpense?.(fe)}>
                  <ErrorOutlineIcon sx={{ fontSize: 16 }} color="warning" />
                </IconButton>
              </Box>
              <Typography variant="caption" color="warning.main">
                {t('notDueTooltip', { date: nextDueDateLabel(fe) })}
              </Typography>
              {(method || person) && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {method && (
                    <Typography variant="caption" color="text.disabled">{method.alias || method.name}</Typography>
                  )}
                  {method && person && (
                    <Typography variant="caption" color="text.disabled">·</Typography>
                  )}
                  {person && (
                    <Typography variant="caption" color="text.disabled">{person.userName}</Typography>
                  )}
                </Box>
              )}
              {category && (
                <Typography variant="caption" color="text.disabled">{category.name}</Typography>
              )}
            </Box>
          </TableCell>
          <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top', pt: 1.5 }}>
            <Typography variant="body2" color="text.disabled">{formatMoney(fixedExpensePlannedAmount(fe))}</Typography>
          </TableCell>
          {isEditable && (
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', verticalAlign: 'top', pt: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <IconButton size="small" onClick={() => onEditFixedExpense?.(fe)}><EditIcon fontSize="small" /></IconButton>
                <IconButton size="small" onClick={() => handleDeleteFixedExpense(fe)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            </TableCell>
          )}
        </TableRow>
      )
    }

    return (
      <>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          <TextField
            select
            size="small"
            label={t('sortBy')}
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="name">{t('columns.item')}</MenuItem>
            <MenuItem value="day">{t('columns.day')}</MenuItem>
            <MenuItem value="amount">{isFixed ? t('columns.planned') : t('columns.amount')}</MenuItem>
            <MenuItem value="category">{t('columns.category')}</MenuItem>
            <MenuItem value="paymentMethod">{t('columns.paymentMethod')}</MenuItem>
            <MenuItem value="owner">{t('columns.owner')}</MenuItem>
          </TextField>
          <IconButton
            size="small"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            sx={{ alignSelf: 'center' }}
            aria-label={t('sortBy')}
          >
            {sortDir === 'asc' ? <ArrowUpwardIcon fontSize="small" /> : <ArrowDownwardIcon fontSize="small" />}
          </IconButton>
          {!isFixed && (
            <>
              <ToggleButton
                value="spentOnly"
                selected={spentOnly}
                onChange={() => onToggleSpentOnly?.()}
                size="small"
                sx={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
              >
                {t('filter.spentOnly')}
              </ToggleButton>
              <ToggleButton
                value="exceededOnly"
                selected={exceededOnly}
                onChange={() => onToggleExceededOnly?.()}
                size="small"
                sx={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
              >
                {t('filter.exceededOnly')}
              </ToggleButton>
            </>
          )}
          <ToggleButton
            value="excludedOnly"
            selected={excludedOnly}
            onChange={() => onToggleExcludedOnly?.()}
            size="small"
            sx={{ alignSelf: 'center', whiteSpace: 'nowrap' }}
          >
            {t('filter.excludedOnly')}
          </ToggleButton>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('columns.item')}</TableCell>
                <TableCell align="right">{isFixed ? t('columns.planned') : t('columns.amount')}</TableCell>
                {isEditable && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.length === 0 && filteredNotDue.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {t('empty', { label })}
                  </TableCell>
                </TableRow>
              ) : isFixed ? (
                <>
                  {sorted.map((tx) => renderRow(tx))}
                  {filteredNotDue.map((fe) => renderNotDueRow(fe))}
                </>
              ) : (
                dayGroups.map((group) => (
                  <Fragment key={group.day}>
                    <TableRow>
                      <TableCell colSpan={colSpan} sx={{ bgcolor: 'action.hover', py: 0.5 }}>
                        <Typography variant="caption" fontWeight={600} color="text.secondary">{group.label}</Typography>
                      </TableCell>
                    </TableRow>
                    {group.transactions.map((tx) => renderRow(tx))}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </Box>
        {markPaidTarget && (
          <MarkAsPaidDialog
            transaction={markPaidTarget}
            budgetPeriodId={budgetPeriodId}
            isSavings={isSavingsRow(markPaidTarget)}
            onClose={() => setMarkPaidTarget(null)}
            onDone={() => { setMarkPaidTarget(null); onRefresh() }}
          />
        )}
        <MarkForReviewDialog
          open={!!markReviewTarget}
          transaction={markReviewTarget}
          budgetProfileId={budgetProfileId}
          budgetPeriodId={budgetPeriodId}
          categoryMap={categoryMap}
          methodMap={methodMap}
          personMap={personMap}
          onClose={() => setMarkReviewTarget(null)}
        />
      </>
    )
  }

  // Desktop layout
  // Fixed: Item | Day | Category | Payment Method | Owner | Planned | Actual | (actions)
  // Variable: Item | Category | Payment Method | Owner | Amount | (actions) — grouped under day headers
  const colSpan = isFixed
    ? (isEditable ? 8 : 7)
    : (isEditable ? 6 : 5)

  const renderRow = (tx: Transaction) => {
    const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined
    const method = tx.paymentMethodId ? methodMap.get(tx.paymentMethodId) : undefined
    const person = method?.budgetPersonId && method.budgetPersonId !== 0n
      ? personMap.get(method.budgetPersonId.toString())
      : undefined
    return (
      <TableRow key={tx.id} hover>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={500}>{tx.name}</Typography>
            {isFixed && tx.fixedExpenseId && (() => {
              const fe = fixedExpenseMap?.get(tx.fixedExpenseId)
              const progress = fe ? paymentProgress(fe) : null
              return progress ? (
                <Typography variant="caption" color="text.secondary">({progress})</Typography>
              ) : null
            })()}
            {!isFixed && pendingReviewMatchByTxId?.has(tx.id) && (
              <Tooltip title={t('linkedToFixedTooltip', { name: pendingReviewMatchByTxId.get(tx.id) ?? '' })}>
                <Typography variant="caption" color="text.secondary" sx={{ cursor: 'default' }}>
                  ({t('linkedToFixed')})
                </Typography>
              </Tooltip>
            )}
          </Box>
        </TableCell>
        {isFixed && (
          <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
            {formatDate(tx.date)}
          </TableCell>
        )}
        <TableCell>
          {category && (
            <Typography variant="body2" sx={{ color: category.color || 'text.secondary' }}>
              {category.name}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          {method && (
            <Typography variant="body2" sx={{ color: method.color || 'inherit' }}>
              {method.alias || method.name}
            </Typography>
          )}
        </TableCell>
        <TableCell>
          {person && (
            <Typography variant="body2" sx={{ color: person.color || 'text.secondary' }}>
              {person.userName}
            </Typography>
          )}
        </TableCell>
        {isFixed ? (
          <>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
              {formatMoney(txPlannedAmount(tx))}
            </TableCell>
            <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: tx.isPaid ? 'success.main' : 'text.disabled' }}>
              {tx.isPaid ? formatMoney(txAmount(tx)) : '—'}
            </TableCell>
          </>
        ) : (
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
            {(() => {
              const { text, color } = formatVariableAmount(txAmount(tx), currency, locale)
              return <Typography variant="body2" component="span" color={color ?? 'inherit'}>{text}</Typography>
            })()}
          </TableCell>
        )}
        {isEditable && (
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              {canMarkPaid(tx) && (
                <Tooltip title={t('markAsPaid.title')}>
                  <IconButton size="small" onClick={() => setMarkPaidTarget(tx)}>
                    <CheckCircleOutlineIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {isFixed && tx.isPaid && (
                <Tooltip title={t('markAsPaid.alreadyPaid')}>
                  <LoadingIconButton size="small" onClick={() => handleUnmark(tx)} loading={unmarkPending} color="success">
                    <CheckCircleIcon fontSize="small" color="success" />
                  </LoadingIconButton>
                </Tooltip>
              )}
              {!isFixed && isEditable && (
                <Tooltip title={t('markForReview')}>
                  <IconButton size="small" onClick={() => setMarkReviewTarget(tx)}>
                    <FlagIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={isIncomeRow(tx) ? t('exclude.incomeAlwaysExcluded') : (tx.isExcluded ? t('exclude.unexclude') : t('exclude.exclude'))}>
                <span>
                  <LoadingIconButton
                    size="small"
                    onClick={() => handleToggleExcluded(tx)}
                    disabled={isIncomeRow(tx)}
                    loading={setExcludedPending}
                    color={tx.isExcluded || isIncomeRow(tx) ? 'warning' : 'default'}
                  >
                    {tx.isExcluded || isIncomeRow(tx) ? <VisibilityIcon fontSize="small" /> : <VisibilityOffIcon fontSize="small" />}
                  </LoadingIconButton>
                </span>
              </Tooltip>
              {isRowEditable(tx) && (
                <>
                  <IconButton size="small" onClick={() => onEdit(tx)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" onClick={() => handleDelete(tx)}><DeleteIcon fontSize="small" /></IconButton>
                </>
              )}
            </Box>
          </TableCell>
        )}
      </TableRow>
    )
  }

  const renderNotDueRow = (fe: FixedExpense) => {
    const category = fe.categoryId ? categoryMap.get(fe.categoryId) : undefined
    const method = fe.paymentMethodId ? methodMap.get(fe.paymentMethodId) : undefined
    const person = method?.budgetPersonId && method.budgetPersonId !== 0n
      ? personMap.get(method.budgetPersonId.toString())
      : undefined
    return (
      <TableRow key={fe.id} hover>
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="body2" fontWeight={500} color="text.disabled">{fe.name}</Typography>
            {(() => {
              const progress = paymentProgress(fe)
              return progress ? (
                <Typography variant="caption" color="text.disabled">({progress})</Typography>
              ) : null
            })()}
            <Tooltip title={t('notDueTooltip', { date: nextDueDateLabel(fe) })}>
              <IconButton size="small" onClick={() => onEditFixedExpense?.(fe)}>
                <ErrorOutlineIcon sx={{ fontSize: 16 }} color="warning" />
              </IconButton>
            </Tooltip>
          </Box>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.disabled' }}>
          {nextDueDateLabel(fe)}
        </TableCell>
        <TableCell>
          {category && (
            <Typography variant="body2" color="text.disabled">{category.name}</Typography>
          )}
        </TableCell>
        <TableCell>
          {method && (
            <Typography variant="body2" color="text.disabled">{method.alias || method.name}</Typography>
          )}
        </TableCell>
        <TableCell>
          {person && (
            <Typography variant="body2" color="text.disabled">{person.userName}</Typography>
          )}
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.disabled' }}>
          {formatMoney(fixedExpensePlannedAmount(fe))}
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: 'text.disabled' }}>
          —
        </TableCell>
        {isEditable && (
          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <IconButton size="small" onClick={() => onEditFixedExpense?.(fe)}><EditIcon fontSize="small" /></IconButton>
              <IconButton size="small" onClick={() => handleDeleteFixedExpense(fe)}><DeleteIcon fontSize="small" /></IconButton>
            </Box>
          </TableCell>
        )}
      </TableRow>
    )
  }

  return (
    <>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.item')}
              </SortHeader>
              {isFixed && (
                <SortHeader col="day" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  {t('columns.day')}
                </SortHeader>
              )}
              <SortHeader col="category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.category')}
              </SortHeader>
              <SortHeader col="paymentMethod" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.paymentMethod')}
              </SortHeader>
              <SortHeader col="owner" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.owner')}
              </SortHeader>
              {isFixed ? (
                <>
                  <SortHeader col="amount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">
                    {t('columns.planned')}
                  </SortHeader>
                  <TableCell align="right">{t('columns.actual')}</TableCell>
                </>
              ) : (
                <SortHeader col="amount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">
                  {t('columns.amount')}
                </SortHeader>
              )}
              {isEditable && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.length === 0 && filteredNotDue.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  {t('empty', { label })}
                </TableCell>
              </TableRow>
            ) : isFixed ? (
              <>
                {sorted.map((tx) => renderRow(tx))}
                {filteredNotDue.map((fe) => renderNotDueRow(fe))}
              </>
            ) : (
              dayGroups.map((group) => (
                <Fragment key={group.day}>
                  <TableRow>
                    <TableCell colSpan={colSpan} sx={{ bgcolor: 'action.hover', py: 0.5 }}>
                      <Typography variant="caption" fontWeight={600} color="text.secondary">{group.label}</Typography>
                    </TableCell>
                  </TableRow>
                  {group.transactions.map((tx) => renderRow(tx))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
      {markPaidTarget && (
        <MarkAsPaidDialog
          transaction={markPaidTarget}
          budgetPeriodId={budgetPeriodId}
          onClose={() => setMarkPaidTarget(null)}
          onDone={() => { setMarkPaidTarget(null); onRefresh() }}
        />
      )}
      <MarkForReviewDialog
        open={!!markReviewTarget}
        transaction={markReviewTarget}
        budgetProfileId={budgetProfileId}
        budgetPeriodId={budgetPeriodId}
        categoryMap={categoryMap}
        methodMap={methodMap}
        personMap={personMap}
        onClose={() => setMarkReviewTarget(null)}
      />
    </>
  )
}
