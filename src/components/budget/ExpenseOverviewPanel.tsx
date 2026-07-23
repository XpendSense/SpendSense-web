'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery } from '@tanstack/react-query'
import { useIsMobile } from '@/hooks/useIsMobile'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { ExpenseAllocation, Category, PaymentMethod, BudgetPerson, Transaction } from '@/gen/wellspent/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useCurrency } from '@/hooks/useCurrency'
import { formatMoneyFromNumber } from '@/lib/format'
import { parseMoney, computeActualTotals } from './expensesPanel/helpers'
import { isTransactionExcluded } from './transactionsPanel/helpers'
import { ExpenseChart, type ExpenseChartDatum } from './expensesPanel/ExpenseChart'
import { CategoryOverviewRow } from './expenseOverviewPanel/CategoryOverviewRow'
import { CategoryOverviewCard } from './expenseOverviewPanel/CategoryOverviewCard'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6', '#f97316']

interface Props {
  budgetProfileId: string
  budgetPeriodId: string | undefined
}

export function ExpenseOverviewPanel({ budgetProfileId, budgetPeriodId }: Props) {
  const t = useTranslations('budget.overview')
  const isMobile = useIsMobile()
  const { currency, locale } = useCurrency()
  const formatMoney = useCallback(
    (amount: number) => formatMoneyFromNumber(amount, currency, locale),
    [currency, locale],
  )
  const client = useClient(BudgetService)

  const [chartType, setChartType] = useState<'pie' | 'bar'>('bar')
  const [chartGrouping, setChartGrouping] = useState<'person' | 'category'>('category')
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set())

  const { data: categoriesData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })
  const { data: peopleData, isLoading: peopleLoading } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })
  const { data: allocationsData, isLoading: allocsLoading } = useQuery({
    queryKey: ['expense-allocations', budgetProfileId],
    queryFn: () => client.listExpenseAllocations({ budgetProfileId }),
  })
  const { data: transactionsData, isLoading: txnsLoading } = useQuery({
    queryKey: ['transactions', budgetPeriodId],
    queryFn: () => client.listTransactions({ budgetPeriodId: budgetPeriodId! }),
    enabled: !!budgetPeriodId,
  })
  const { data: paymentMethodsData, isLoading: pmLoading } = useQuery({
    queryKey: ['payment-methods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })
  const { data: savingsData, isLoading: savingsLoading } = useQuery({
    queryKey: ['savings-sources', budgetProfileId],
    queryFn: () => client.listSavingsSources({ budgetProfileId }),
  })
  const { data: fixedExpensesData, isLoading: fixedExpensesLoading } = useQuery({
    queryKey: ['fixed-expenses', budgetProfileId],
    queryFn: () => client.listFixedExpenses({ budgetProfileId }),
  })
  const { data: incomeData, isLoading: incomeLoading } = useQuery({
    queryKey: ['income-entries', budgetPeriodId],
    queryFn: () => client.listIncomeEntries({ budgetPeriodId: budgetPeriodId! }),
    enabled: !!budgetPeriodId,
  })

  const isLoading = catsLoading || peopleLoading || allocsLoading || txnsLoading || pmLoading || savingsLoading || fixedExpensesLoading || incomeLoading
  if (isLoading) return <Box sx={{ py: 2 }}><CircularProgress size={20} /></Box>

  const categories = categoriesData?.categories ?? []
  const people = peopleData?.people ?? []
  const allocations = allocationsData?.allocations ?? []
  const incomeCategoryId = categories.find((c) => c.name === 'Income' && c.isSystem)?.id
  const transactions = (transactionsData?.transactions ?? []).filter((tx) => !isTransactionExcluded(tx, incomeCategoryId))
  const paymentMethods = paymentMethodsData?.methods ?? []
  const savingsSources = savingsData?.sources ?? []
  const fixedExpenses = (fixedExpensesData?.expenses ?? []).filter((fe) => fe.isActive)

  const categoryMap = new Map<number, Category>(categories.map((c) => [c.id, c]))
  const methodMap = new Map<string, PaymentMethod>(paymentMethods.map((pm) => [pm.id, pm]))
  const personMap = new Map<string, BudgetPerson>(people.map((p) => [p.id.toString(), p]))

  const transactionsByCatId = new Map<number, Transaction[]>()
  for (const tx of transactions) {
    if (!tx.categoryId) continue
    if (tx.transactionTypeId === 1 && !tx.isPaid) continue  // unpaid fixed: not yet spent
    if (!transactionsByCatId.has(tx.categoryId)) transactionsByCatId.set(tx.categoryId, [])
    transactionsByCatId.get(tx.categoryId)!.push(tx)
  }

  const pmPersonMap = new Map<string, bigint>()
  for (const pm of paymentMethods) {
    pmPersonMap.set(pm.id, pm.budgetPersonId)
  }

  const { byCat: txnActualByCat, byPersonCat: txnActualByPersonCat, uncategorized: uncategorizedActual } = computeActualTotals(transactions, pmPersonMap)

  const allocMap = new Map<string, ExpenseAllocation>()
  for (const a of allocations) {
    allocMap.set(`${a.categoryId}:${a.budgetPersonId}`, a)
  }
  const catIdsWithAllocs = new Set(allocations.map((a) => a.categoryId))

  // Fixed planned per category (for plan comparison)
  const fixedPlannedByCat = new Map<number, number>()
  for (const tx of transactions) {
    if (tx.transactionTypeId !== 1 || !tx.categoryId) continue
    const amt = parseMoney(tx.plannedAmount?.units ?? 0n, tx.plannedAmount?.nanos ?? 0)
    fixedPlannedByCat.set(tx.categoryId, (fixedPlannedByCat.get(tx.categoryId) ?? 0) + amt)
  }
  // Also include planned amounts from active fixed expense templates (not yet due this period)
  for (const fe of fixedExpenses) {
    if (!fe.categoryId || fixedPlannedByCat.has(fe.categoryId)) continue
    const amt = parseMoney(fe.plannedAmount?.units ?? 0n, fe.plannedAmount?.nanos ?? 0)
    fixedPlannedByCat.set(fe.categoryId, (fixedPlannedByCat.get(fe.categoryId) ?? 0) + amt)
  }

  const savingsCat = categories.find((c) => c.name === 'Savings' && c.isSystem)
  const savingsByPerson = new Map<string, number>()
  for (const s of savingsSources) {
    const personKey = s.budgetPersonId.toString()
    const amt = parseMoney(s.amount?.units ?? 0n, s.amount?.nanos ?? 0)
    savingsByPerson.set(personKey, (savingsByPerson.get(personKey) ?? 0) + amt)
  }
  const savingsTotal = [...savingsByPerson.values()].reduce((a, b) => a + b, 0)

  function getCategoryPlanned(catId: number): number {
    if (savingsCat?.id === catId) return savingsTotal
    let planned = 0
    for (const p of people) {
      const alloc = allocMap.get(`${catId}:${p.id}`)
      if (alloc) planned += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
    }
    return planned > 0 ? planned : (fixedPlannedByCat.get(catId) ?? 0)
  }

  // Show categories with actual spending OR a plan (so unspent budget is visible too)
  const visibleCats = categories.filter((c) =>
    txnActualByCat.has(c.id) ||
    catIdsWithAllocs.has(c.id) ||
    (savingsCat?.id === c.id && savingsSources.length > 0) ||
    fixedPlannedByCat.has(c.id),
  )

  const incomeEntries = incomeData?.entries ?? []
  const totalIncome = incomeEntries.reduce((sum, e) => sum + parseMoney(e.amount?.units ?? 0n, e.amount?.nanos ?? 0), 0)

  const totalActual = [...txnActualByCat.values()].reduce((a, b) => a + b, 0) + uncategorizedActual
  const totalPlanned = visibleCats.reduce((sum, cat) => sum + getCategoryPlanned(cat.id), 0)
  const actualRemainder = totalIncome - totalActual
  const plannedRemainder = totalIncome - totalPlanned

  let totalOverBudget = 0
  let totalUnplanned = uncategorizedActual
  for (const cat of visibleCats) {
    const actual = txnActualByCat.get(cat.id) ?? 0
    const planned = getCategoryPlanned(cat.id)
    if (planned <= 0) totalUnplanned += actual
    else if (actual > planned) totalOverBudget += actual - planned
  }

  const footerCellSx = { borderTop: '2px solid', borderColor: 'divider', fontSize: '0.95rem', fontWeight: 700 }

  function toggleCategory(catId: number) {
    setExpandedCats((prev) => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  // Chart: actual amounts per category (red when overspent), or by person
  const chartData: ExpenseChartDatum[] = (() => {
    if (chartGrouping === 'category') {
      return visibleCats.map((cat, i) => {
        const actual = txnActualByCat.get(cat.id) ?? 0
        const planned = getCategoryPlanned(cat.id)
        const isOver = planned > 0 && actual > planned
        return {
          name: cat.name,
          value: actual,
          color: isOver ? '#ef4444' : (cat.color || CHART_COLORS[i % CHART_COLORS.length]),
        }
      }).filter((d) => d.value > 0)
    }
    return people.map((p, i) => {
      let value = 0
      for (const cat of visibleCats) {
        value += txnActualByPersonCat.get(`${cat.id}:${p.id}`) ?? 0
      }
      return { name: p.userName, value, color: p.color || CHART_COLORS[i % CHART_COLORS.length] }
    }).filter((d) => d.value > 0)
  })()

  return (
    <Box>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
      </Box>

      {visibleCats.length > 0 && chartData.length > 0 && (
        <ExpenseChart
          chartData={chartData}
          chartType={chartType}
          chartGrouping={chartGrouping}
          onChartTypeChange={setChartType}
          onChartGroupingChange={setChartGrouping}
          formatMoney={formatMoney}
          isMobile={isMobile}
          barLabel={t('actual')}
          noDataText={t('noData')}
        />
      )}

      {visibleCats.length === 0 && uncategorizedActual === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
          {t('noData')}
        </Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visibleCats.map((cat) => (
            <CategoryOverviewCard
              key={cat.id}
              cat={cat}
              people={people}
              actual={txnActualByCat.get(cat.id) ?? 0}
              planned={getCategoryPlanned(cat.id)}
              txnActualByPersonCat={txnActualByPersonCat}
              allocMap={allocMap}
              savingsByPerson={savingsByPerson}
              isSavings={savingsCat?.id === cat.id}
              isExpanded={expandedCats.has(cat.id)}
              onToggle={() => toggleCategory(cat.id)}
              formatMoney={formatMoney}
              catTransactions={transactionsByCatId.get(cat.id) ?? []}
              categoryMap={categoryMap}
              methodMap={methodMap}
              personMap={personMap}
            />
          ))}
          {uncategorizedActual !== 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 1, py: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>{t('uncategorized')}</Typography>
              <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>{formatMoney(uncategorizedActual)}</Typography>
            </Box>
          )}
          <Box sx={{ pt: 1, borderTop: '2px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" fontWeight={700}>{t('total')}</Typography>
              <Typography variant="body2" fontWeight={700}>{totalActual > 0 ? formatMoney(totalActual) : '—'}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" color="text.secondary">{t('planned')}</Typography>
              <Typography variant="body2">{totalPlanned > 0 ? formatMoney(totalPlanned) : '—'}</Typography>
            </Box>
            {totalIncome > 0 && (
              <>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color={actualRemainder < 0 ? 'error.main' : 'success.main'} fontWeight={600}>{t('remainderActual')}</Typography>
                  <Typography variant="body2" color={actualRemainder < 0 ? 'error.main' : 'success.main'} fontWeight={600}>{formatMoney(actualRemainder)}</Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" color={plannedRemainder < 0 ? 'error.main' : 'success.main'} fontWeight={600}>{t('remainderPlan')}</Typography>
                  <Typography variant="body2" color={plannedRemainder < 0 ? 'error.main' : 'success.main'} fontWeight={600}>{formatMoney(plannedRemainder)}</Typography>
                </Box>
              </>
            )}
            {totalOverBudget > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight={700} color="error.main">{t('overBudget')}</Typography>
                <Typography variant="body2" fontWeight={700} color="error.main">{formatMoney(totalOverBudget)}</Typography>
              </Box>
            )}
            {totalUnplanned > 0 && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight={700} color="warning.main">{t('unplanned')}</Typography>
                <Typography variant="body2" fontWeight={700} color="warning.main">{formatMoney(totalUnplanned)}</Typography>
              </Box>
            )}
          </Box>
        </Box>
      ) : (
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 36 }} />
                <TableCell sx={{ fontWeight: 600 }}>{t('category')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('actual')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('planned')}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleCats.map((cat) => (
                <CategoryOverviewRow
                  key={cat.id}
                  cat={cat}
                  people={people}
                  actual={txnActualByCat.get(cat.id) ?? 0}
                  planned={getCategoryPlanned(cat.id)}
                  txnActualByPersonCat={txnActualByPersonCat}
                  allocMap={allocMap}
                  savingsByPerson={savingsByPerson}
                  isSavings={savingsCat?.id === cat.id}
                  isExpanded={expandedCats.has(cat.id)}
                  onToggle={() => toggleCategory(cat.id)}
                  formatMoney={formatMoney}
                  catTransactions={transactionsByCatId.get(cat.id) ?? []}
                  categoryMap={categoryMap}
                  methodMap={methodMap}
                  personMap={personMap}
                />
              ))}
              {uncategorizedActual !== 0 && (
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ py: 0.5, pr: 0 }} />
                  <TableCell sx={{ py: 0.5 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      {t('uncategorized')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.5 }}>
                    <Typography variant="body2" sx={{ color: 'warning.main', fontWeight: 600 }}>
                      {formatMoney(uncategorizedActual)}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 0.5 }}>
                    <Typography variant="body2" color="text.secondary">—</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 0.5 }} />
                </TableRow>
              )}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': footerCellSx }}>
                <TableCell />
                <TableCell>{t('total')}</TableCell>
                <TableCell align="right">{totalActual > 0 ? formatMoney(totalActual) : '—'}</TableCell>
                <TableCell align="right">{totalPlanned > 0 ? formatMoney(totalPlanned) : '—'}</TableCell>
                <TableCell />
              </TableRow>
              {totalIncome > 0 && (
                <TableRow sx={{ '& td': { ...footerCellSx, borderTop: 'none' } }}>
                  <TableCell />
                  <TableCell>{t('remainder')}</TableCell>
                  <TableCell align="right" sx={{ color: actualRemainder < 0 ? 'error.main' : 'success.main' }}>{formatMoney(actualRemainder)}</TableCell>
                  <TableCell align="right" sx={{ color: plannedRemainder < 0 ? 'error.main' : 'success.main' }}>{formatMoney(plannedRemainder)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              {totalOverBudget > 0 && (
                <TableRow sx={{ '& td': { ...footerCellSx, borderTop: 'none', color: 'error.main' } }}>
                  <TableCell />
                  <TableCell>{t('overBudget')}</TableCell>
                  <TableCell align="right">{formatMoney(totalOverBudget)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
              {totalUnplanned > 0 && (
                <TableRow sx={{ '& td': { ...footerCellSx, borderTop: 'none', color: 'warning.main' } }}>
                  <TableCell />
                  <TableCell>{t('unplanned')}</TableCell>
                  <TableCell align="right">{formatMoney(totalUnplanned)}</TableCell>
                  <TableCell />
                  <TableCell />
                </TableRow>
              )}
            </TableFooter>
          </Table>
        </TableContainer>
      )}

    </Box>
  )
}
