'use client'

import { useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { usePathname, useRouter } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Transaction, Category, PaymentMethod, BudgetPerson, FixedExpense, ExpenseAllocation } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { useViewPreference } from '@/hooks/useViewPreference'
import { logger } from '@/lib/logger'
import { AddTransactionModal } from './modals/AddTransactionModal'
import { EditTransactionModal } from './modals/EditTransactionModal'
import { EditFixedExpenseModal } from './modals/EditFixedExpenseModal'
import { MarkAsPaidDialog } from './modals/MarkAsPaidDialog'
import { MarkForReviewDialog } from './modals/MarkForReviewDialog'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Tabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableSortLabel from '@mui/material/TableSortLabel'
import TextField from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import InputAdornment from '@mui/material/InputAdornment'
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import FlagIcon from '@mui/icons-material/Flag'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import ViewStreamIcon from '@mui/icons-material/ViewStream'
import TabIcon from '@mui/icons-material/Tab'
import SearchIcon from '@mui/icons-material/Search'
import ClearIcon from '@mui/icons-material/Clear'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import type { ViewMode } from '@/hooks/useViewPreference'

interface Props {
  budgetPeriodId: string
  budgetProfileId: string
  isEditable?: boolean
  addOpen?: boolean
  onAddClose?: () => void
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatVariableAmount(amount: number): { text: string; color: string | undefined } {
  if (amount < 0) return { text: `+${formatMoney(-amount)}`, color: 'success.main' }
  if (amount > 0) return { text: `-${formatMoney(amount)}`, color: 'error.main' }
  return { text: formatMoney(0), color: undefined }
}

function formatDate(ts: { seconds: bigint } | undefined): string {
  if (!ts || ts.seconds === 0n) return ''
  return new Date(Number(ts.seconds) * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function txAmount(t: Transaction): number {
  return Number(t.amount?.units ?? 0n) + (t.amount?.nanos ?? 0) / 1e9
}

function txPlannedAmount(t: Transaction): number {
  return Number(t.plannedAmount?.units ?? 0n) + (t.plannedAmount?.nanos ?? 0) / 1e9
}

function fixedExpensePlannedAmount(fe: FixedExpense): number {
  return Number(fe.plannedAmount?.units ?? 0n) + (fe.plannedAmount?.nanos ?? 0) / 1e9
}

function nextDueDateLabel(fe: FixedExpense): string {
  if (!fe.nextDueDate || fe.nextDueDate.seconds === 0n) return ''
  return new Date(Number(fe.nextDueDate.seconds) * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

type SortKey = 'name' | 'day' | 'amount' | 'category' | 'paymentMethod' | 'owner'

function resolveDay(t: Transaction): number {
  return Number(t.date?.seconds ?? 0n)
}

export function resolveCategoryName(categoryId: number, categoryMap: Map<number, Category>): string {
  return categoryId ? (categoryMap.get(categoryId)?.name ?? '') : ''
}

export function resolveMethodName(paymentMethodId: string, methodMap: Map<string, PaymentMethod>): string {
  return paymentMethodId ? (methodMap.get(paymentMethodId)?.name ?? '') : ''
}

export function resolveOwnerName(
  paymentMethodId: string,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): string {
  const method = paymentMethodId ? methodMap.get(paymentMethodId) : undefined
  const person = method?.budgetPersonId && method.budgetPersonId !== 0n
    ? personMap.get(method.budgetPersonId.toString())
    : undefined
  return person?.userName ?? ''
}

export function matchesSearch(
  name: string,
  categoryId: number,
  paymentMethodId: string,
  query: string,
  categoryMap: Map<number, Category>,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  return (
    name.toLowerCase().includes(q) ||
    resolveCategoryName(categoryId, categoryMap).toLowerCase().includes(q) ||
    resolveOwnerName(paymentMethodId, methodMap, personMap).toLowerCase().includes(q)
  )
}

export function compareTransactions(
  a: Transaction,
  b: Transaction,
  key: SortKey,
  dir: 'asc' | 'desc',
  categoryMap: Map<number, Category>,
  methodMap: Map<string, PaymentMethod>,
  personMap: Map<string, BudgetPerson>,
): number {
  const sign = dir === 'asc' ? 1 : -1
  let primary: number
  switch (key) {
    case 'name': primary = a.name.localeCompare(b.name) * sign; break
    case 'day': primary = (resolveDay(a) - resolveDay(b)) * sign; break
    case 'amount': primary = (txPlannedAmount(a) - txPlannedAmount(b)) * sign; break
    case 'category':
      primary = resolveCategoryName(a.categoryId, categoryMap).localeCompare(resolveCategoryName(b.categoryId, categoryMap)) * sign
      break
    case 'paymentMethod':
      primary = resolveMethodName(a.paymentMethodId, methodMap).localeCompare(resolveMethodName(b.paymentMethodId, methodMap)) * sign
      break
    case 'owner':
      primary = resolveOwnerName(a.paymentMethodId, methodMap, personMap).localeCompare(resolveOwnerName(b.paymentMethodId, methodMap, personMap)) * sign
      break
  }
  return primary !== 0 ? primary : a.id.localeCompare(b.id)
}

function SortHeader({
  col, sortKey, sortDir, onSort, align, children,
}: {
  col: SortKey
  sortKey: SortKey
  sortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  children: React.ReactNode
}) {
  return (
    <TableCell align={align} sortDirection={sortKey === col ? sortDir : false}>
      <TableSortLabel
        active={sortKey === col}
        direction={sortKey === col ? sortDir : 'asc'}
        onClick={() => onSort(col)}
      >
        {children}
      </TableSortLabel>
    </TableCell>
  )
}

interface TableProps {
  transactions: Transaction[]
  isLoading: boolean
  isEditable: boolean
  isFixed: boolean
  savingsCategoryId?: number
  budgetPeriodId: string
  budgetProfileId: string
  label: string
  categoryMap: Map<number, Category>
  methodMap: Map<string, PaymentMethod>
  personMap: Map<string, BudgetPerson>
  notDueFixedExpenses?: FixedExpense[]
  searchQuery?: string
  spentOnly?: boolean
  exceededOnly?: boolean
  overBudgetTxIds?: Set<string>
  onToggleSpentOnly?: () => void
  onToggleExceededOnly?: () => void
  onDeleted: () => void
  onEdit: (t: Transaction) => void
  onEditFixedExpense?: (fe: FixedExpense) => void
  onRefresh: () => void
}

function TransactionTable({
  transactions, isLoading, isEditable, isFixed, savingsCategoryId, budgetPeriodId, budgetProfileId, label,
  categoryMap, methodMap, personMap, notDueFixedExpenses = [], searchQuery = '', spentOnly = false,
  exceededOnly = false, overBudgetTxIds, onToggleSpentOnly, onToggleExceededOnly,
  onDeleted, onEdit, onEditFixedExpense, onRefresh,
}: TableProps) {
  const t = useTranslations('budget.transactions')
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
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

  const isRowEditable = (tx: Transaction) => isEditable && !isSavingsRow(tx)

  const canMarkPaid = (tx: Transaction) =>
    isFixed && isEditable && !tx.isPaid

  const filteredTransactions = transactions.filter((tx) => {
    if (!isFixed && spentOnly && txAmount(tx) <= 0) return false
    if (!isFixed && exceededOnly && overBudgetTxIds && !overBudgetTxIds.has(tx.id)) return false
    return matchesSearch(tx.name, tx.categoryId, tx.paymentMethodId, searchQuery, categoryMap, methodMap, personMap)
  })
  const filteredNotDue = notDueFixedExpenses.filter((fe) =>
    matchesSearch(fe.name, fe.categoryId, fe.paymentMethodId, searchQuery, categoryMap, methodMap, personMap))

  const sorted = [...filteredTransactions].sort((a, b) =>
    compareTransactions(a, b, sortKey, sortDir, categoryMap, methodMap, personMap))

  if (isLoading) return <CircularProgress size={20} />

  if (isMobile) {
    const colSpan = isEditable ? 3 : 2
    return (
      <>
        <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
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
              ) : (
                <>
                  {sorted.map((tx) => {
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
                            <Typography variant="body2" fontWeight={500}>{tx.name}</Typography>
                            {dateStr && (
                              <Typography variant="caption" color="text.secondary">{dateStr}</Typography>
                            )}
                            {(method || person) && (
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                {method && (
                                  <Typography variant="caption" sx={{ color: method.color || 'text.secondary' }}>{method.name}</Typography>
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
                              const { text, color } = formatVariableAmount(txAmount(tx))
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
                              {canMarkPaid(tx) && (
                                <Tooltip title={t('markAsPaid.title')}>
                                  <IconButton size="small" onClick={() => setMarkPaidTarget(tx)} color="default">
                                    <CheckCircleOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {isFixed && tx.isPaid && (
                                <Tooltip title={t('markAsPaid.alreadyPaid')}>
                                  <IconButton size="small" onClick={() => handleUnmark(tx)} disabled={unmarkPending} color="success">
                                    <CheckCircleIcon fontSize="small" color="success" />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {!isFixed && isEditable && (
                                <Tooltip title={t('markForReview')}>
                                  <IconButton size="small" onClick={() => setMarkReviewTarget(tx)}>
                                    <FlagIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
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
                  })}
                  {filteredNotDue.map((fe) => {
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
                                  <Typography variant="caption" color="text.disabled">{method.name}</Typography>
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
                  })}
                </>
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
  // Variable: Item | Day | Category | Payment Method | Owner | Amount | (actions)
  const colSpan = isFixed
    ? (isEditable ? 8 : 7)
    : (isEditable ? 7 : 6)

  return (
    <>
      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <SortHeader col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.item')}
              </SortHeader>
              <SortHeader col="day" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                {t('columns.day')}
              </SortHeader>
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
            ) : (
              <>
                {sorted.map((tx) => {
                  const category = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined
                  const method = tx.paymentMethodId ? methodMap.get(tx.paymentMethodId) : undefined
                  const person = method?.budgetPersonId && method.budgetPersonId !== 0n
                    ? personMap.get(method.budgetPersonId.toString())
                    : undefined
                  return (
                    <TableRow key={tx.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight={500}>{tx.name}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                        {formatDate(tx.date)}
                      </TableCell>
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
                            {method.name}
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
                            const { text, color } = formatVariableAmount(txAmount(tx))
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
                                <IconButton size="small" onClick={() => handleUnmark(tx)} disabled={unmarkPending} color="success">
                                  <CheckCircleIcon fontSize="small" color="success" />
                                </IconButton>
                              </Tooltip>
                            )}
                            {!isFixed && isEditable && (
                              <Tooltip title={t('markForReview')}>
                                <IconButton size="small" onClick={() => setMarkReviewTarget(tx)}>
                                  <FlagIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
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
                })}
                {filteredNotDue.map((fe) => {
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
                          <Typography variant="body2" color="text.disabled">{method.name}</Typography>
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
                })}
              </>
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

export function TransactionsPanel({ budgetPeriodId, budgetProfileId, isEditable = true, addOpen = false, onAddClose }: Props) {
  const t = useTranslations('budget.transactions')
  const queryClient = useQueryClient()
  const client = useClient(BudgetService)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const router = useRouter()
  const [viewMode, setViewMode] = useViewPreference('tabbed')
  const [editTarget, setEditTarget] = useState<Transaction | null>(null)
  const [editFixedExpenseTarget, setEditFixedExpenseTarget] = useState<FixedExpense | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [spentOnly, setSpentOnly] = useState(false)
  const [exceededOnly, setExceededOnly] = useState(false)
  const touchStartXRef = useRef<number | null>(null)

  // Which sub-tab (Fixed vs Variable) is stored in the URL, not component
  // state, so a page reload lands back where you were.
  const tabIndex = searchParams.get('tab') === 'variable' ? 1 : 0

  function setTabIndex(index: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', index === 1 ? 'variable' : 'fixed')
    router.replace({ pathname, query: Object.fromEntries(params) }, { scroll: false })
  }

  // Split view needs room for two columns side by side — always tabbed on mobile.
  const effectiveViewMode: ViewMode = isMobile ? 'tabbed' : viewMode

  function handleTouchStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const startX = touchStartXRef.current
    touchStartXRef.current = null
    if (startX === null) return
    const deltaX = e.changedTouches[0].clientX - startX
    const threshold = 50
    if (deltaX > threshold) setTabIndex(Math.max(0, tabIndex - 1))
    else if (deltaX < -threshold) setTabIndex(Math.min(1, tabIndex + 1))
  }

  const { data: fixedData, isLoading: fixedLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId, 1],
    queryFn: () => client.listTransactions({ budgetPeriodId, transactionTypeId: 1 }),
  })
  const { data: variableData, isLoading: variableLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId, 2],
    queryFn: () => client.listTransactions({ budgetPeriodId, transactionTypeId: 2 }),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['categories', budgetProfileId],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })
  const { data: methodsData } = useQuery({
    queryKey: ['paymentMethods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })
  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })
  const { data: fixedExpensesData } = useQuery({
    queryKey: ['fixed-expenses', budgetProfileId],
    queryFn: () => client.listFixedExpenses({ budgetProfileId }),
  })
  const { data: allocationsData } = useQuery({
    queryKey: ['expense-allocations', budgetProfileId],
    queryFn: () => client.listExpenseAllocations({ budgetProfileId }),
  })

  const categoryMap = new Map((categoriesData?.categories ?? []).map((c) => [c.id, c]))
  const methodMap = new Map((methodsData?.methods ?? []).map((m) => [m.id, m]))
  const personMap = new Map((peopleData?.people ?? []).map((p) => [p.id.toString(), p]))

  const savingsCategoryId = (categoriesData?.categories ?? []).find(
    (c) => c.name === 'Savings' && c.isSystem,
  )?.id

  const fixedTxs = fixedData?.transactions ?? []
  const variableTxs = variableData?.transactions ?? []

  // Active fixed expenses with no transaction yet this period — not due yet
  // (e.g. a future-dated anchor). Shown as a muted row so they're never
  // simply invisible until their due date arrives.
  const notDueFixedExpenses = (fixedExpensesData?.expenses ?? []).filter(
    (fe) => fe.isActive && !fixedTxs.some((tx) => tx.fixedExpenseId === fe.id),
  )

  // Fixed/variable totals feed only the panel's overall grand-total line —
  // per-tab totals were removed from the tab labels themselves (too much
  // visual weight on mobile for little value).
  const fixedPlannedTotal = fixedTxs.reduce((sum, tx) => sum + txPlannedAmount(tx), 0)
  const variableTotal = variableTxs.reduce((sum, tx) => sum + txAmount(tx), 0)
  const grandTotal = fixedPlannedTotal + variableTotal

  // Per-transaction IDs where the transaction is the one that pushed its category
  // over the total plan (expense allocations + fixed expense planned amounts).
  // Walks variable transactions chronologically per category; includes spent
  // transactions from the moment the running total first exceeds the plan.
  const overBudgetTxIds = (() => {
    const plannedByCat = new Map<number, number>()
    ;(allocationsData?.allocations ?? []).forEach((a: ExpenseAllocation) => {
      const p = Number(a.plannedAmount?.units ?? 0n) + (a.plannedAmount?.nanos ?? 0) / 1e9
      plannedByCat.set(a.categoryId, (plannedByCat.get(a.categoryId) ?? 0) + p)
    })
    fixedTxs.forEach((tx) => {
      if (!tx.categoryId) return
      plannedByCat.set(tx.categoryId, (plannedByCat.get(tx.categoryId) ?? 0) + txPlannedAmount(tx))
    })
    const fixedTxExpenseIds = new Set(fixedTxs.map((tx) => tx.fixedExpenseId).filter(Boolean))
    ;(fixedExpensesData?.expenses ?? []).filter((fe) => fe.isActive && !fixedTxExpenseIds.has(fe.id)).forEach((fe) => {
      if (!fe.categoryId) return
      plannedByCat.set(fe.categoryId, (plannedByCat.get(fe.categoryId) ?? 0) + fixedExpensePlannedAmount(fe))
    })
    // Group variable txs by category, then walk chronologically
    const txsByCat = new Map<number, Transaction[]>()
    variableTxs.forEach((tx) => {
      if (!txsByCat.has(tx.categoryId)) txsByCat.set(tx.categoryId, [])
      txsByCat.get(tx.categoryId)!.push(tx)
    })
    const ids = new Set<string>()
    txsByCat.forEach((txs, catId) => {
      const planned = plannedByCat.get(catId) ?? 0
      const sorted = [...txs].sort(
        (a, b) => Number(a.date?.seconds ?? 0n) - Number(b.date?.seconds ?? 0n) || a.id.localeCompare(b.id)
      )
      let running = 0
      for (const tx of sorted) {
        running += txAmount(tx)
        // Include spent transactions from the point the running total crosses the plan
        if (running > planned && txAmount(tx) > 0) ids.add(tx.id)
      }
    })
    return ids
  })()

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId] })

  const sharedTableProps = {
    isEditable,
    savingsCategoryId,
    budgetPeriodId,
    budgetProfileId,
    categoryMap,
    methodMap,
    personMap,
    searchQuery,
    spentOnly,
    exceededOnly,
    overBudgetTxIds,
    onToggleSpentOnly: () => setSpentOnly((v) => !v),
    onToggleExceededOnly: () => setExceededOnly((v) => !v),
    onDeleted: refresh,
    onEdit: setEditTarget,
    onRefresh: refresh,
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
          {grandTotal > 0 && (
            <Typography variant="subtitle2" color="text.secondary">
              {t('grandTotal', { amount: formatMoney(grandTotal) })}
            </Typography>
          )}
        </Box>
        {!isMobile && (
          <ToggleButtonGroup
            size="small"
            value={viewMode}
            exclusive
            onChange={(_, v: ViewMode) => v && setViewMode(v)}
          >
            <ToggleButton value="tabbed"><TabIcon fontSize="small" /></ToggleButton>
            <ToggleButton value="split"><ViewStreamIcon fontSize="small" /></ToggleButton>
          </ToggleButtonGroup>
        )}
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder={t('searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          fullWidth={isMobile}
          sx={{ width: { xs: '100%', sm: 320 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
              </InputAdornment>
            ),
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')} aria-label={t('clearSearch')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        {!isMobile && (effectiveViewMode === 'split' || tabIndex === 1) && (
          <>
            <ToggleButton
              value="spentOnly"
              selected={spentOnly}
              onChange={() => setSpentOnly((v) => !v)}
              size="small"
            >
              {t('filter.spentOnly')}
            </ToggleButton>
            <ToggleButton
              value="exceededOnly"
              selected={exceededOnly}
              onChange={() => setExceededOnly((v) => !v)}
              size="small"
            >
              {t('filter.exceededOnly')}
            </ToggleButton>
          </>
        )}
      </Box>

      {effectiveViewMode === 'tabbed' ? (
        <Box onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 1 }}>
            <Tab label={t('fixed')} sx={{ fontWeight: 700 }} />
            <Tab label={t('variable')} sx={{ fontWeight: 700 }} />
          </Tabs>
          {tabIndex === 0
            ? <TransactionTable {...sharedTableProps} isFixed transactions={fixedTxs} isLoading={fixedLoading} label={t('fixed')} notDueFixedExpenses={notDueFixedExpenses} onEditFixedExpense={setEditFixedExpenseTarget} />
            : <TransactionTable {...sharedTableProps} isFixed={false} transactions={variableTxs} isLoading={variableLoading} label={t('variable')} />
          }
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>{t('fixed').toUpperCase()}</Typography>
            <TransactionTable {...sharedTableProps} isFixed transactions={fixedTxs} isLoading={fixedLoading} label={t('fixed')} notDueFixedExpenses={notDueFixedExpenses} onEditFixedExpense={setEditFixedExpenseTarget} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>{t('variable').toUpperCase()}</Typography>
            <TransactionTable {...sharedTableProps} isFixed={false} transactions={variableTxs} isLoading={variableLoading} label={t('variable')} />
          </Box>
        </Box>
      )}

      {isEditable && (
        <AddTransactionModal
          budgetPeriodId={budgetPeriodId}
          budgetProfileId={budgetProfileId}
          open={addOpen}
          defaultTypeId={effectiveViewMode !== 'tabbed' || tabIndex === 0 ? 1 : 2}
          onClose={() => onAddClose?.()}
          onDone={() => { onAddClose?.(); refresh() }}
        />
      )}

      {editTarget && (editTarget.fixedExpenseId ? (
        (() => {
          const fe = (fixedExpensesData?.expenses ?? []).find((f) => f.id === editTarget.fixedExpenseId)
          if (!fe) return null
          return (
            <EditFixedExpenseModal
              budgetProfileId={budgetProfileId}
              fixedExpense={fe}
              onClose={() => setEditTarget(null)}
              onDone={() => { setEditTarget(null); refresh(); queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] }) }}
            />
          )
        })()
      ) : (
        <EditTransactionModal
          budgetProfileId={budgetProfileId}
          transaction={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); refresh() }}
        />
      ))}

      {editFixedExpenseTarget && (
        <EditFixedExpenseModal
          budgetProfileId={budgetProfileId}
          fixedExpense={editFixedExpenseTarget}
          onClose={() => setEditFixedExpenseTarget(null)}
          onDone={() => {
            setEditFixedExpenseTarget(null)
            refresh()
            queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] })
          }}
        />
      )}
    </Box>
  )
}
