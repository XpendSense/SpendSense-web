'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useIsMobile } from '@/hooks/useIsMobile'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import type { Category, ExpenseAllocation, FixedExpense } from '@/gen/wellspent/v1/budget_pb'
import { EditFixedExpenseModal } from '@/components/budget/modals/EditFixedExpenseModal'
import { useClient } from '@/hooks/useClient'
import { useCurrency } from '@/hooks/useCurrency'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import { formatMoneyFromNumber } from '@/lib/format'
import { parseMoney, moneyToProto, computeCategoryRow, computeActualTotals, type NotDueInfo } from './expensesPanel/helpers'
import { ExpenseChart, type ExpenseChartDatum } from './expensesPanel/ExpenseChart'
import { CategoryCardMobile } from './expensesPanel/CategoryCardMobile'
import { CategoryTableRow } from './expensesPanel/CategoryTableRow'
import { PlanSummary } from './expensesPanel/PlanSummary'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableFooter from '@mui/material/TableFooter'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6', '#f97316']

interface Props {
  budgetProfileId: string
  budgetPeriodId: string | undefined
  canEdit?: boolean
}

export function ExpensesPanel({ budgetProfileId, budgetPeriodId, canEdit = true }: Props) {
  const t = useTranslations('budget.expenses')
  const isMobile = useIsMobile()
  const { showError } = useSnackbar()
  const { currency, locale } = useCurrency()
  const formatMoney = useCallback(
    (amount: number) => formatMoneyFromNumber(amount, currency, locale),
    [currency, locale],
  )
  const client = useClient(BudgetService)

  const [pinnedCategoryIds, setPinnedCategoryIds] = useState<Set<number>>(new Set())
  const [autocompleteValue, setAutocompleteValue] = useState<Category | null>(null)
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie')
  const [chartGrouping, setChartGrouping] = useState<'person' | 'category'>('category')
  const [editDialog, setEditDialog] = useState<{
    open: boolean
    catId: number
    catName: string
    personId: bigint
    personName: string
    existing: ExpenseAllocation | undefined
  }>({ open: false, catId: 0, catName: '', personId: 0n, personName: '', existing: undefined })
  const [editDraft, setEditDraft] = useState('')
  const [editFixedExpense, setEditFixedExpense] = useState<FixedExpense | null>(null)

  const { data: categoriesData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({ budgetProfileId }),
  })

  const { data: peopleData, isLoading: peopleLoading } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const { data: allocationsData, isLoading: allocsLoading, refetch: refetchAllocs } = useQuery({
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

  const { data: incomeData, isLoading: incomeLoading } = useQuery({
    queryKey: ['income-sources', budgetProfileId],
    queryFn: () => client.listIncomeSources({ budgetProfileId }),
  })

  const { data: fixedExpensesData, isLoading: fixedExpensesLoading, refetch: refetchFixedExpenses } = useQuery({
    queryKey: ['fixed-expenses', budgetProfileId],
    queryFn: () => client.listFixedExpenses({ budgetProfileId }),
  })

  const { mutateAsync: upsertAlloc } = useMutation({
    mutationFn: (req: Parameters<typeof client.upsertExpenseAllocation>[0]) =>
      client.upsertExpenseAllocation(req),
  })

  const { mutateAsync: deleteAlloc } = useMutation({
    mutationFn: (req: Parameters<typeof client.deleteExpenseAllocation>[0]) =>
      client.deleteExpenseAllocation(req),
  })

  const handleUpsert = useCallback(async (
    categoryId: number,
    budgetPersonId: bigint,
    amount: number | null,
    existing: ExpenseAllocation | undefined,
  ) => {
    try {
      if (amount === null) {
        if (existing) {
          await deleteAlloc({ id: existing.id, budgetProfileId })
          logger.info('budget.allocation.delete', { budgetProfileId, id: existing.id.toString() })
        }
      } else {
        const { units, nanos } = moneyToProto(amount)
        await upsertAlloc({ budgetProfileId, categoryId, budgetPersonId, plannedAmount: { units, nanos } })
        logger.info('budget.allocation.upsert', { budgetProfileId, categoryId, amount })
      }
      refetchAllocs()
    } catch (err) {
      showError(err)
    }
  }, [budgetProfileId, deleteAlloc, upsertAlloc, refetchAllocs, showError])

  const handleRemoveCategory = useCallback(async (categoryId: number) => {
    try {
      const catAllocs = (allocationsData?.allocations ?? []).filter((a) => a.categoryId === categoryId)
      await Promise.all(catAllocs.map((a) => deleteAlloc({ id: a.id, budgetProfileId })))
      setPinnedCategoryIds((prev) => { const next = new Set(prev); next.delete(categoryId); return next })
      if (catAllocs.length > 0) {
        logger.info('budget.allocation.remove-category', { budgetProfileId, categoryId })
        refetchAllocs()
      }
    } catch (err) {
      showError(err)
    }
  }, [allocationsData, deleteAlloc, budgetProfileId, refetchAllocs, showError])

  function openEditDialog(
    cat: Category,
    personId: bigint,
    personName: string,
    currentValue: number | undefined,
    existing: ExpenseAllocation | undefined,
  ) {
    setEditDraft(currentValue != null ? currentValue.toFixed(2) : '')
    setEditDialog({ open: true, catId: cat.id, catName: cat.name, personId, personName, existing })
  }

  async function commitEditDialog() {
    const n = parseFloat(editDraft)
    const amount = !isNaN(n) && n >= 0 ? n : null
    await handleUpsert(editDialog.catId, editDialog.personId, amount, editDialog.existing)
    setEditDialog((prev) => ({ ...prev, open: false }))
  }

  const isLoading = catsLoading || peopleLoading || allocsLoading || txnsLoading || pmLoading || savingsLoading || incomeLoading || fixedExpensesLoading
  if (isLoading) return <Box sx={{ py: 2 }}><CircularProgress size={20} /></Box>

  const categories = categoriesData?.categories ?? []
  const people = peopleData?.people ?? []
  const allocations = allocationsData?.allocations ?? []
  const transactions = transactionsData?.transactions ?? []
  const paymentMethods = paymentMethodsData?.methods ?? []
  const savingsSources = savingsData?.sources ?? []
  const incomeSources = incomeData?.sources ?? []
  const fixedExpenses = (fixedExpensesData?.expenses ?? []).filter((fe) => fe.isActive)

  // allocation lookup: "catId:personId" → allocation
  const allocMap = new Map<string, ExpenseAllocation>()
  for (const a of allocations) {
    allocMap.set(`${a.categoryId}:${a.budgetPersonId}`, a)
  }

  // payment method → budget person
  const pmPersonMap = new Map<string, bigint>()
  for (const pm of paymentMethods) {
    pmPersonMap.set(pm.id, pm.budgetPersonId)
  }

  // actual per category (total) and per person per category
  const { byCat: txnActualByCat, byPersonCat: txnActualByPersonCat, uncategorized: uncategorizedActual } =
    computeActualTotals(transactions, pmPersonMap)

  // "Savings" system category auto-shows when savings sources exist
  const savingsCat = categories.find((c) => c.name === 'Savings' && c.isSystem)

  const catIdsWithAllocs = new Set(allocations.map((a) => a.categoryId))

  // planned amounts from fixed transactions by category (excluding savings)
  const fixedPlannedByCat = new Map<number, number>()
  const fixedPlannedByPersonCat = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.transactionTypeId !== 1 || !tx.categoryId) continue
    if (savingsCat && tx.categoryId === savingsCat.id) continue
    const amt = parseMoney(tx.plannedAmount?.units ?? 0n, tx.plannedAmount?.nanos ?? 0)
    fixedPlannedByCat.set(tx.categoryId, (fixedPlannedByCat.get(tx.categoryId) ?? 0) + amt)
    const personId = tx.paymentMethodId ? pmPersonMap.get(tx.paymentMethodId) : undefined
    if (personId !== undefined) {
      const key = `${tx.categoryId}:${personId}`
      fixedPlannedByPersonCat.set(key, (fixedPlannedByPersonCat.get(key) ?? 0) + amt)
    }
  }

  // Fixed-expense categories not reflected by a due transaction this period
  // — shown as a muted "not due" row so the category never simply vanishes
  // between due periods (see docs/features/fixed-transactions-frequency.md).
  const notDueFixedByCat = new Map<number, NotDueInfo>()
  const fixedExpenseCatIds = new Set<number>()
  for (const fe of fixedExpenses) {
    if (!fe.categoryId) continue
    if (savingsCat && fe.categoryId === savingsCat.id) continue
    fixedExpenseCatIds.add(fe.categoryId)
    if (fixedPlannedByCat.has(fe.categoryId)) continue // already has a due transaction this period
    const amt = parseMoney(fe.plannedAmount?.units ?? 0n, fe.plannedAmount?.nanos ?? 0)
    const nextDue = fe.nextDueDate ? new Date(Number(fe.nextDueDate.seconds) * 1000) : undefined
    const existing = notDueFixedByCat.get(fe.categoryId)
    if (existing) {
      existing.amount += amt
      if (nextDue && (!existing.nextDue || nextDue < existing.nextDue)) existing.nextDue = nextDue
    } else {
      notDueFixedByCat.set(fe.categoryId, { amount: amt, nextDue, fixedExpense: fe })
    }
  }

  const visibleCats = categories.filter(
    (c) => catIdsWithAllocs.has(c.id) || txnActualByCat.has(c.id) || pinnedCategoryIds.has(c.id) ||
           (savingsCat?.id === c.id && savingsSources.length > 0) ||
           fixedPlannedByCat.has(c.id) || fixedExpenseCatIds.has(c.id),
  )
  const visibleCatIds = new Set(visibleCats.map((c) => c.id))
  // Savings category is system-managed — exclude from the manual picker
  const addableCategories = categories.filter(
    (c) => !visibleCatIds.has(c.id) && c.id !== savingsCat?.id,
  )

  // savings — amount is already the monthly figure; frequency is the cadence, not a multiplier
  const savingsByPerson = new Map<string, number>()
  for (const s of savingsSources) {
    const personKey = s.budgetPersonId.toString()
    const amt = parseMoney(s.amount?.units ?? 0n, s.amount?.nanos ?? 0)
    savingsByPerson.set(personKey, (savingsByPerson.get(personKey) ?? 0) + amt)
  }
  const savingsTotal = [...savingsByPerson.values()].reduce((a, b) => a + b, 0)

  const categoryRowContext = {
    people, savingsCat, savingsTotal, notDueFixedByCat, catIdsWithAllocs, fixedPlannedByCat, allocMap, txnActualByCat,
  }

  // chart data — Savings uses savings sources; fixed-only categories fall back to fixedPlannedByCat
  const chartData: ExpenseChartDatum[] = (() => {
    if (chartGrouping === 'category') {
      return visibleCats.map((cat, i) => {
        let value = 0
        if (savingsCat && cat.id === savingsCat.id) {
          value = savingsTotal
        } else {
          for (const p of people) {
            const alloc = allocMap.get(`${cat.id}:${p.id}`)
            if (alloc) value += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
          }
          if (value === 0) value = fixedPlannedByCat.get(cat.id) ?? 0
        }
        return { name: cat.name, value, color: cat.color || CHART_COLORS[i % CHART_COLORS.length] }
      }).filter((d) => d.value > 0)
    }
    return people.map((p, i) => {
      let value = 0
      for (const cat of visibleCats) {
        if (savingsCat && cat.id === savingsCat.id) {
          value += savingsByPerson.get(p.id.toString()) ?? 0
        } else {
          const alloc = allocMap.get(`${cat.id}:${p.id}`)
          if (alloc) {
            value += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
          } else {
            value += fixedPlannedByPersonCat.get(`${cat.id}:${p.id}`) ?? 0
          }
        }
      }
      return { name: p.userName, value, color: p.color || CHART_COLORS[i % CHART_COLORS.length] }
    }).filter((d) => d.value > 0)
  })()

  const plannedExpenseTotal = visibleCats.reduce((sum, cat) => {
    let catTotal = 0
    if (savingsCat && cat.id === savingsCat.id) {
      catTotal = savingsTotal
    } else {
      for (const p of people) {
        const alloc = allocMap.get(`${cat.id}:${p.id}`)
        if (alloc) catTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
      }
    }
    return sum + catTotal
  }, 0)

  const fixedExpenseTotal = transactions
    .filter((tx) =>
      tx.transactionTypeId === 1 &&
      (!tx.categoryId || !catIdsWithAllocs.has(tx.categoryId)) &&
      (!savingsCat || tx.categoryId !== savingsCat.id),
    )
    .reduce((sum, tx) => sum + parseMoney(tx.plannedAmount?.units ?? 0n, tx.plannedAmount?.nanos ?? 0), 0)

  const incomeTotal = incomeSources.reduce(
    (sum, s) => sum + parseMoney(s.defaultAmount?.units ?? 0n, s.defaultAmount?.nanos ?? 0),
    0,
  )

  // savings are now part of plannedExpenseTotal (shown as the Savings category row)
  const totalCommitted = plannedExpenseTotal + fixedExpenseTotal
  const remainder = incomeTotal - totalCommitted

  // "Spent" counts unplanned actual spend in full (nothing to compare it
  // against — this includes uncategorized transactions, which can never
  // have a plan), and for planned categories only the amount that exceeds
  // the plan — not the full actual — and only once the plan is exceeded.
  let totalActualSpent = uncategorizedActual
  for (const cat of visibleCats) {
    const { plannedTotal, actual } = computeCategoryRow(cat, categoryRowContext)
    if (plannedTotal <= 0) {
      totalActualSpent += actual
    } else if (actual > plannedTotal) {
      totalActualSpent += actual - plannedTotal
    }
  }

  const footerCellSx = { borderTop: '2px solid', borderColor: 'divider', fontSize: '0.95rem', fontWeight: 700 }

  return (
    <Box>
      {/* Header: title + add-category picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
        {canEdit && addableCategories.length > 0 && (
          <Autocomplete
            options={addableCategories}
            getOptionLabel={(c) => c.name}
            value={autocompleteValue}
            onChange={(_, cat) => {
              if (!cat) return
              setPinnedCategoryIds((prev) => new Set([...prev, cat.id]))
              setAutocompleteValue(null)
            }}
            renderInput={(params) => (
              <TextField {...params} label={t('addCategory')} size="small" />
            )}
            sx={{ width: { xs: '100%', sm: 260 } }}
            size="small"
          />
        )}
      </Box>

      {visibleCats.length > 0 && (
        <ExpenseChart
          chartData={chartData}
          chartType={chartType}
          chartGrouping={chartGrouping}
          onChartTypeChange={setChartType}
          onChartGroupingChange={setChartGrouping}
          formatMoney={formatMoney}
          isMobile={isMobile}
        />
      )}

      {/* Category list */}
      {visibleCats.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
          {t('noCategories')}
        </Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visibleCats.map((cat) => (
            <CategoryCardMobile
              key={cat.id}
              cat={cat}
              people={people}
              rowData={computeCategoryRow(cat, categoryRowContext)}
              allocMap={allocMap}
              fixedPlannedByPersonCat={fixedPlannedByPersonCat}
              txnActualByPersonCat={txnActualByPersonCat}
              savingsByPerson={savingsByPerson}
              canEdit={canEdit}
              formatMoney={formatMoney}
              onRemoveCategory={handleRemoveCategory}
              onOpenEditDialog={openEditDialog}
              onEditFixedExpense={setEditFixedExpense}
            />
          ))}
        </Box>
      ) : (
        // Desktop: table with actions column at end
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ tableLayout: 'auto' }}>
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ fontWeight: 600, verticalAlign: 'bottom', whiteSpace: 'nowrap' }}>{t('category')}</TableCell>
                <TableCell
                  colSpan={people.length + 1}
                  align="center"
                  sx={{ fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}
                >
                  {t('plannedAmount')}
                </TableCell>
                <TableCell rowSpan={2} align="right" sx={{ fontWeight: 600, verticalAlign: 'bottom' }}>{t('actual')}</TableCell>
                <TableCell rowSpan={2} />
              </TableRow>
              <TableRow>
                {people.map((p) => (
                  <TableCell key={p.id.toString()} align="right" sx={{ fontWeight: 600 }}>
                    {p.userName}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600 }}>{t('total')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleCats.map((cat) => (
                <CategoryTableRow
                  key={cat.id}
                  cat={cat}
                  people={people}
                  rowData={computeCategoryRow(cat, categoryRowContext)}
                  allocMap={allocMap}
                  fixedPlannedByPersonCat={fixedPlannedByPersonCat}
                  savingsByPerson={savingsByPerson}
                  canEdit={canEdit}
                  currency={currency}
                  locale={locale}
                  formatMoney={formatMoney}
                  onRemoveCategory={handleRemoveCategory}
                  onUpsert={handleUpsert}
                  onEditFixedExpense={setEditFixedExpense}
                />
              ))}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': footerCellSx }}>
                <TableCell>{t('total')}</TableCell>
                {people.map((p) => {
                  let personTotal = 0
                  for (const cat of visibleCats) {
                    if (savingsCat?.id === cat.id) {
                      personTotal += savingsByPerson.get(p.id.toString()) ?? 0
                    } else {
                      const alloc = allocMap.get(`${cat.id}:${p.id}`)
                      if (alloc) personTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                    }
                  }
                  return (
                    <TableCell key={p.id.toString()} align="right">
                      {personTotal > 0 ? formatMoney(personTotal) : '—'}
                    </TableCell>
                  )
                })}
                <TableCell align="right">{formatMoney(totalCommitted)}</TableCell>
                <TableCell align="right">
                  {formatMoney([...txnActualByCat.values()].reduce((a, b) => a + b, 0) + uncategorizedActual)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}

      {/* Edit dialog (used on mobile) */}
      <Dialog
        open={editDialog.open}
        onClose={() => setEditDialog((prev) => ({ ...prev, open: false }))}
        fullScreen={isMobile}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t('editDialog.title')}</DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <Typography variant="body2" color="text.secondary" mb={2}>
            {editDialog.catName} — {editDialog.personName}
          </Typography>
          <TextField
            label={t('editDialog.plannedAmount')}
            value={editDraft}
            onChange={(e) => setEditDraft(e.target.value)}
            type="number"
            fullWidth
            size="small"
            autoFocus
            inputProps={{ min: 0, step: 0.01, inputMode: 'decimal' }}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEditDialog() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog((prev) => ({ ...prev, open: false }))}>{t('editDialog.cancel')}</Button>
          <Button onClick={commitEditDialog} variant="contained">{t('editDialog.save')}</Button>
        </DialogActions>
      </Dialog>

      {editFixedExpense && (
        <EditFixedExpenseModal
          budgetProfileId={budgetProfileId}
          fixedExpense={editFixedExpense}
          onClose={() => setEditFixedExpense(null)}
          onDone={() => { setEditFixedExpense(null); refetchFixedExpenses() }}
        />
      )}

      <PlanSummary
        totalCommitted={totalCommitted}
        remainder={remainder}
        totalActualSpent={totalActualSpent}
        formatMoney={formatMoney}
      />
    </Box>
  )
}
