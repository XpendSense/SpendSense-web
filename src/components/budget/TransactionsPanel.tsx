'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Transaction, Category, PaymentMethod, BudgetPerson } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { useViewPreference } from '@/hooks/useViewPreference'
import { logger } from '@/lib/logger'
import { AddTransactionModal } from './modals/AddTransactionModal'
import { EditTransactionModal } from './modals/EditTransactionModal'
import { EditFixedExpenseModal } from './modals/EditFixedExpenseModal'
import { MarkAsPaidDialog } from './modals/MarkAsPaidDialog'
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
import IconButton from '@mui/material/IconButton'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import CircularProgress from '@mui/material/CircularProgress'
import Tooltip from '@mui/material/Tooltip'
import useMediaQuery from '@mui/material/useMediaQuery'
import { useTheme } from '@mui/material/styles'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ViewStreamIcon from '@mui/icons-material/ViewStream'
import TabIcon from '@mui/icons-material/Tab'
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

type SortKey = 'name' | 'day' | 'amount'

function resolveDay(t: Transaction): number {
  return Number(t.date?.seconds ?? 0n)
}

function compareTransactions(
  a: Transaction,
  b: Transaction,
  key: SortKey,
  dir: 'asc' | 'desc',
): number {
  const sign = dir === 'asc' ? 1 : -1
  let primary: number
  switch (key) {
    case 'name': primary = a.name.localeCompare(b.name) * sign; break
    case 'day': primary = (resolveDay(a) - resolveDay(b)) * sign; break
    case 'amount': primary = (txPlannedAmount(a) - txPlannedAmount(b)) * sign; break
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
  onDeleted: () => void
  onEdit: (t: Transaction) => void
  onRefresh: () => void
}

function TransactionTable({
  transactions, isLoading, isEditable, isFixed, savingsCategoryId, budgetPeriodId, budgetProfileId, label,
  categoryMap, methodMap, personMap, onDeleted, onEdit, onRefresh,
}: TableProps) {
  const t = useTranslations('budget.transactions')
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [sortKey, setSortKey] = useState<SortKey>('day')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [markPaidTarget, setMarkPaidTarget] = useState<Transaction | null>(null)

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

  const sorted = [...transactions].sort((a, b) => compareTransactions(a, b, sortKey, sortDir))

  if (isLoading) return <CircularProgress size={20} />

  if (isMobile) {
    const colSpan = isEditable ? 3 : 2
    return (
      <>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHeader col="name" sortKey={sortKey} sortDir={sortDir} onSort={handleSort}>
                  {t('columns.item')}
                </SortHeader>
                <SortHeader col="amount" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right">
                  {isFixed ? t('columns.planned') : t('columns.amount')}
                </SortHeader>
                {isEditable && <TableCell />}
              </TableRow>
            </TableHead>
            <TableBody>
              {sorted.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    {t('empty', { label })}
                  </TableCell>
                </TableRow>
              ) : sorted.map((tx) => {
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
                        <Typography variant="body2">{formatMoney(txPlannedAmount(tx))}</Typography>
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
              <TableCell>{t('columns.category')}</TableCell>
              <TableCell>{t('columns.paymentMethod')}</TableCell>
              <TableCell>{t('columns.owner')}</TableCell>
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
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colSpan} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                  {t('empty', { label })}
                </TableCell>
              </TableRow>
            ) : sorted.map((tx) => {
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
                      {formatMoney(txAmount(tx))}
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
    </>
  )
}

export function TransactionsPanel({ budgetPeriodId, budgetProfileId, isEditable = true, addOpen = false, onAddClose }: Props) {
  const t = useTranslations('budget.transactions')
  const queryClient = useQueryClient()
  const client = useClient(BudgetService)
  const [viewMode, setViewMode] = useViewPreference('tabbed')
  const [editTarget, setEditTarget] = useState<Transaction | null>(null)
  const [tabIndex, setTabIndex] = useState(0)

  const { data: fixedData, isLoading: fixedLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId, 1],
    queryFn: () => client.listTransactions({ budgetPeriodId, transactionTypeId: 1 }),
  })
  const { data: variableData, isLoading: variableLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId, 2],
    queryFn: () => client.listTransactions({ budgetPeriodId, transactionTypeId: 2 }),
  })
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({}),
  })
  const { data: methodsData } = useQuery({
    queryKey: ['paymentMethods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })
  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const categoryMap = new Map((categoriesData?.categories ?? []).map((c) => [c.id, c]))
  const methodMap = new Map((methodsData?.methods ?? []).map((m) => [m.id, m]))
  const personMap = new Map((peopleData?.people ?? []).map((p) => [p.id.toString(), p]))

  const savingsCategoryId = (categoriesData?.categories ?? []).find(
    (c) => c.name === 'Savings' && c.isSystem,
  )?.id

  const fixedTxs = fixedData?.transactions ?? []
  const variableTxs = variableData?.transactions ?? []

  // Fixed totals: planned total always; actual only from paid transactions
  const fixedPlannedTotal = fixedTxs.reduce((sum, tx) => sum + txPlannedAmount(tx), 0)
  const fixedActualTotal = fixedTxs.filter((tx) => tx.isPaid).reduce((sum, tx) => sum + txAmount(tx), 0)
  const variableTotal = variableTxs.reduce((sum, tx) => sum + txAmount(tx), 0)
  const grandTotal = fixedPlannedTotal + variableTotal

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId] })

  const sharedTableProps = {
    isEditable,
    savingsCategoryId,
    budgetPeriodId,
    budgetProfileId,
    categoryMap,
    methodMap,
    personMap,
    onDeleted: refresh,
    onEdit: setEditTarget,
    onRefresh: refresh,
  }

  const fixedLabel = fixedTxs.length
    ? `${t('fixed')} · ${formatMoney(fixedPlannedTotal)}${fixedActualTotal > 0 ? ` / ${formatMoney(fixedActualTotal)} ${t('paid')}` : ''}`
    : t('fixed')

  const variableLabel = variableTxs.length ? `${t('variable')} · ${formatMoney(variableTotal)}` : t('variable')

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
          {grandTotal > 0 && (
            <Typography variant="subtitle2" color="text.secondary">
              {t('grandTotal', { amount: formatMoney(grandTotal) })}
            </Typography>
          )}
        </Box>
        <ToggleButtonGroup
          size="small"
          value={viewMode}
          exclusive
          onChange={(_, v: ViewMode) => v && setViewMode(v)}
        >
          <ToggleButton value="tabbed"><TabIcon fontSize="small" /></ToggleButton>
          <ToggleButton value="split"><ViewStreamIcon fontSize="small" /></ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {viewMode === 'tabbed' ? (
        <>
          <Tabs value={tabIndex} onChange={(_, v) => setTabIndex(v)} sx={{ mb: 1 }}>
            <Tab label={fixedLabel} />
            <Tab label={variableLabel} />
          </Tabs>
          {tabIndex === 0
            ? <TransactionTable {...sharedTableProps} isFixed transactions={fixedTxs} isLoading={fixedLoading} label={t('fixed')} />
            : <TransactionTable {...sharedTableProps} isFixed={false} transactions={variableTxs} isLoading={variableLoading} label={t('variable')} />
          }
        </>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
          <Box>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ mb: 1, display: 'block' }}>{t('fixed').toUpperCase()}</Typography>
            <TransactionTable {...sharedTableProps} isFixed transactions={fixedTxs} isLoading={fixedLoading} label={t('fixed')} />
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
          defaultTypeId={viewMode !== 'tabbed' || tabIndex === 0 ? 1 : 2}
          onClose={() => onAddClose?.()}
          onDone={() => { onAddClose?.(); refresh() }}
        />
      )}

      {editTarget && (editTarget.fixedExpenseId ? (
        <EditFixedExpenseModal
          budgetProfileId={budgetProfileId}
          transaction={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); refresh() }}
        />
      ) : (
        <EditTransactionModal
          budgetProfileId={budgetProfileId}
          transaction={editTarget}
          onClose={() => setEditTarget(null)}
          onDone={() => { setEditTarget(null); refresh() }}
        />
      ))}
    </Box>
  )
}
