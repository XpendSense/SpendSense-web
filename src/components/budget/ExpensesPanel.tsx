'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTheme, useMediaQuery } from '@mui/material'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Category, ExpenseAllocation } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip, ResponsiveContainer,
} from 'recharts'
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
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import ClearIcon from '@mui/icons-material/Clear'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import EditIcon from '@mui/icons-material/Edit'
import Tooltip from '@mui/material/Tooltip'

const CHART_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6', '#a855f7', '#14b8a6', '#f97316']

interface Props {
  budgetProfileId: string
  budgetPeriodId: string | undefined
}

function parseMoney(units: bigint, nanos: number): number {
  return Number(units) + nanos / 1e9
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function moneyToProto(amount: number) {
  const units = BigInt(Math.trunc(amount))
  const nanos = Math.round((amount - Number(units)) * 1e9)
  return { units, nanos }
}

function actualColor(actual: number, plannedTotal: number): string | undefined {
  if (plannedTotal <= 0) return undefined
  const ratio = actual / plannedTotal
  if (ratio > 1) return 'error.main'
  if (ratio >= 1) return 'success.main'
  if (ratio >= 0.9) return 'warning.main'
  return 'success.main'
}

// Savings rows use inverted thresholds: more saved = greener
function savingsActualColor(actual: number, plannedTotal: number): string | undefined {
  if (plannedTotal <= 0) return undefined
  const ratio = actual / plannedTotal
  if (ratio >= 0.9) return 'success.main'
  if (ratio >= 0.7) return '#eab308'
  if (ratio >= 0.5) return 'warning.main'
  return 'error.main'
}

interface EditCellProps {
  value: number | undefined
  onSave: (amount: number | null) => void
}

function EditCell({ value, onSave }: EditCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  function startEdit() {
    setDraft(value != null ? value.toFixed(2) : '')
    setEditing(true)
  }

  function commit() {
    setEditing(false)
    const n = parseFloat(draft)
    if (!isNaN(n) && n >= 0) {
      onSave(n)
    } else if (draft.trim() === '') {
      onSave(null)
    }
  }

  if (editing) {
    return (
      <TextField
        size="small"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
        inputProps={{ style: { width: 80, padding: '2px 6px', fontSize: 13 } }}
        variant="outlined"
      />
    )
  }

  return (
    <Box
      sx={{ cursor: 'text', minWidth: 80, display: 'inline-block', '&:hover': { textDecoration: 'underline dotted' } }}
      onClick={startEdit}
    >
      {value != null
        ? formatMoney(value)
        : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
    </Box>
  )
}

export function ExpensesPanel({ budgetProfileId, budgetPeriodId }: Props) {
  const t = useTranslations('budget.expenses')
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const { showError } = useSnackbar()
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

  const { data: categoriesData, isLoading: catsLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => client.listCategories({}),
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

  const isLoading = catsLoading || peopleLoading || allocsLoading || txnsLoading || pmLoading || savingsLoading || incomeLoading
  if (isLoading) return <Box sx={{ py: 2 }}><CircularProgress size={20} /></Box>

  const categories = categoriesData?.categories ?? []
  const people = peopleData?.people ?? []
  const allocations = allocationsData?.allocations ?? []
  const transactions = transactionsData?.transactions ?? []
  const paymentMethods = paymentMethodsData?.methods ?? []
  const savingsSources = savingsData?.sources ?? []
  const incomeSources = incomeData?.sources ?? []

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
  const txnActualByCat = new Map<number, number>()
  const txnActualByPersonCat = new Map<string, number>()
  for (const tx of transactions) {
    if (!tx.categoryId) continue
    const amt = parseMoney(tx.amount?.units ?? 0n, tx.amount?.nanos ?? 0)
    txnActualByCat.set(tx.categoryId, (txnActualByCat.get(tx.categoryId) ?? 0) + amt)
    const personId = tx.paymentMethodId ? pmPersonMap.get(tx.paymentMethodId) : undefined
    if (personId !== undefined) {
      const key = `${tx.categoryId}:${personId}`
      txnActualByPersonCat.set(key, (txnActualByPersonCat.get(key) ?? 0) + amt)
    }
  }

  // "Savings" system category auto-shows when savings sources exist
  const savingsCat = categories.find((c) => c.name === 'Savings' && c.isSystem)

  const catIdsWithAllocs = new Set(allocations.map((a) => a.categoryId))
  const visibleCats = categories.filter(
    (c) => catIdsWithAllocs.has(c.id) || txnActualByCat.has(c.id) || pinnedCategoryIds.has(c.id) ||
           (savingsCat?.id === c.id && savingsSources.length > 0),
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

  // chart data — Savings category uses savings sources as planned amounts
  const chartData = (() => {
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
          if (alloc) value += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
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
    .filter((tx) => tx.transactionTypeId === 1 && (!tx.categoryId || !catIdsWithAllocs.has(tx.categoryId)))
    .reduce((sum, tx) => sum + parseMoney(tx.amount?.units ?? 0n, tx.amount?.nanos ?? 0), 0)

  const incomeTotal = incomeSources.reduce(
    (sum, s) => sum + parseMoney(s.defaultAmount?.units ?? 0n, s.defaultAmount?.nanos ?? 0),
    0,
  )

  // savings are now part of plannedExpenseTotal (shown as the Savings category row)
  const totalCommitted = plannedExpenseTotal + fixedExpenseTotal
  const remainder = incomeTotal - totalCommitted

  const footerCellSx = { borderTop: '2px solid', borderColor: 'divider', fontSize: '0.95rem', fontWeight: 700 }

  return (
    <Box>
      {/* Header: title + add-category picker */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" fontWeight={600}>{t('title')}</Typography>
        {addableCategories.length > 0 && (
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

      {/* Chart */}
      {visibleCats.length > 0 && (
        <Box mb={2}>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={chartType}
              onChange={(_, v) => v && setChartType(v)}
            >
              <ToggleButton value="pie">{t('chart.pie')}</ToggleButton>
              <ToggleButton value="bar">{t('chart.bar')}</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={chartGrouping}
              onChange={(_, v) => v && setChartGrouping(v)}
            >
              <ToggleButton value="category">{t('chart.byCategory')}</ToggleButton>
              <ToggleButton value="person">{t('chart.byPerson')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          {chartData.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>{t('chart.noData')}</Typography>
          ) : (
            <>
              {chartType === 'pie' ? (
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
                  <PieChart>
                    <Pie data={chartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={isMobile ? 70 : 90}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartTooltip formatter={(v) => typeof v === 'number' ? formatMoney(v) : ''} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 240}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 32 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" interval={0} />
                    <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11 }} />
                    <RechartTooltip formatter={(v) => typeof v === 'number' ? formatMoney(v) : ''} />
                    <Bar dataKey="value" name={t('plannedAmount')} radius={[4, 4, 0, 0]}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
              {/* Custom legend with per-item values and grand total */}
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, mt: 1 }}>
                {chartData.map((entry, i) => (
                  <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: entry.color, flexShrink: 0 }} />
                    <Typography variant="caption">
                      {entry.name} ({formatMoney(entry.value)})
                    </Typography>
                  </Box>
                ))}
                {chartData.length > 1 && (
                  <Typography variant="caption" fontWeight={700} sx={{ mt: 0.5 }}>
                    Total: {formatMoney(chartData.reduce((s, d) => s + d.value, 0))}
                  </Typography>
                )}
              </Box>
            </>
          )}
        </Box>
      )}

      {/* Category list */}
      {visibleCats.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', py: 1 }}>
          {t('noCategories')}
        </Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {visibleCats.map((cat) => {
            const isSavings = savingsCat?.id === cat.id
            const actual = txnActualByCat.get(cat.id) ?? 0
            let plannedTotal = 0
            if (isSavings) {
              plannedTotal = savingsTotal
            } else {
              for (const p of people) {
                const alloc = allocMap.get(`${cat.id}:${p.id}`)
                if (alloc) plannedTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
              }
            }
            const colorFn = isSavings ? savingsActualColor : actualColor
            const headerActualColor = colorFn(actual, plannedTotal)
            return (
              <Paper key={cat.id} variant="outlined" sx={{ p: 1.5 }}>
                {/* Card header */}
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    {cat.color && (
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color, flexShrink: 0 }} />
                    )}
                    <Typography variant="body2" fontWeight={600} noWrap>{cat.name}</Typography>
                    {cat.isSystem && (
                      <Chip label={t('global')} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 16 }} />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary" display="block">{t('plannedAmount')}</Typography>
                      <Typography variant="body2" fontWeight={600}>
                        {plannedTotal > 0 ? formatMoney(plannedTotal) : '—'}
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="text.secondary" display="block">{t('actual')}</Typography>
                      <Typography variant="body2" fontWeight={600} sx={{ color: headerActualColor }}>
                        {actual > 0 ? formatMoney(actual) : '—'}
                      </Typography>
                    </Box>
                    {!isSavings && (
                      <IconButton size="small" onClick={() => handleRemoveCategory(cat.id)}>
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    )}
                  </Box>
                </Box>
                {/* Person rows */}
                {people.length > 0 && (
                  <>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                      {people.map((p) => {
                        const personActual = txnActualByPersonCat.get(`${cat.id}:${p.id}`) ?? 0
                        let val: number | undefined
                        if (isSavings) {
                          const sv = savingsByPerson.get(p.id.toString())
                          val = sv !== undefined ? sv : undefined
                        } else {
                          const alloc = allocMap.get(`${cat.id}:${p.id}`)
                          val = alloc
                            ? parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                            : undefined
                        }
                        const alloc = isSavings ? undefined : allocMap.get(`${cat.id}:${p.id}`)
                        return (
                          <Box key={p.id.toString()} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {p.color && (
                              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ flex: 1, color: p.color || 'text.primary', minWidth: 0 }}
                              noWrap
                            >
                              {p.userName}
                            </Typography>
                            <Typography variant="body2" sx={{ minWidth: 64, textAlign: 'right', color: 'text.secondary' }}>
                              {val != null ? formatMoney(val) : '—'}
                            </Typography>
                            <Typography
                              variant="body2"
                              sx={{ minWidth: 64, textAlign: 'right', color: colorFn(personActual, val ?? 0) || 'text.secondary' }}
                            >
                              {personActual > 0 ? formatMoney(personActual) : '—'}
                            </Typography>
                            {!isSavings && (
                              <IconButton size="small" onClick={() => openEditDialog(cat, p.id, p.userName, val, alloc)}>
                                <EditIcon sx={{ fontSize: 15 }} />
                              </IconButton>
                            )}
                          </Box>
                        )
                      })}
                    </Box>
                  </>
                )}
              </Paper>
            )
          })}
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
              {visibleCats.map((cat) => {
                const isSavings = savingsCat?.id === cat.id
                const actual = txnActualByCat.get(cat.id) ?? 0
                let plannedTotal = 0
                if (isSavings) {
                  plannedTotal = savingsTotal
                } else {
                  for (const p of people) {
                    const alloc = allocMap.get(`${cat.id}:${p.id}`)
                    if (alloc) plannedTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                  }
                }
                const colorFn = isSavings ? savingsActualColor : actualColor
                const color = colorFn(actual, plannedTotal)
                return (
                  <TableRow key={cat.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {cat.color && (
                          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color, flexShrink: 0 }} />
                        )}
                        {cat.name}
                        {cat.isSystem && (
                          <Chip label={t('global')} size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 16 }} />
                        )}
                      </Box>
                    </TableCell>
                    {people.map((p) => {
                      if (isSavings) {
                        const sv = savingsByPerson.get(p.id.toString())
                        return (
                          <TableCell key={p.id.toString()} align="right">
                            {sv != null && sv > 0
                              ? formatMoney(sv)
                              : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
                          </TableCell>
                        )
                      }
                      const alloc = allocMap.get(`${cat.id}:${p.id}`)
                      const val = alloc
                        ? parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                        : undefined
                      return (
                        <TableCell key={p.id.toString()} align="right">
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                            <EditCell
                              value={val}
                              onSave={(amount) => handleUpsert(cat.id, p.id, amount, alloc)}
                            />
                            {alloc && (
                              <IconButton size="small" onClick={() => handleUpsert(cat.id, p.id, null, alloc)}>
                                <ClearIcon sx={{ fontSize: 14 }} />
                              </IconButton>
                            )}
                          </Box>
                        </TableCell>
                      )
                    })}
                    <TableCell align="right">
                      {plannedTotal > 0
                        ? formatMoney(plannedTotal)
                        : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ color }}>
                      {actual > 0
                        ? formatMoney(actual)
                        : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
                    </TableCell>
                    <TableCell align="right">
                      {!isSavings && (
                        <Tooltip title={t('removeRow')} placement="left">
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveCategory(cat.id)}
                            sx={{ opacity: 0.4, '&:hover': { opacity: 1 } }}
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
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
                <TableCell align="right">{formatMoney(plannedExpenseTotal)}</TableCell>
                <TableCell align="right">
                  {formatMoney([...txnActualByCat.values()].reduce((a, b) => a + b, 0))}
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
            inputProps={{ min: 0, step: 0.01 }}
            onKeyDown={(e) => { if (e.key === 'Enter') commitEditDialog() }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog((prev) => ({ ...prev, open: false }))}>{t('editDialog.cancel')}</Button>
          <Button onClick={commitEditDialog} variant="contained">{t('editDialog.save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Plan summary */}
      {totalCommitted > 0 && (
        <Box mt={3}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary" mb={1.5}>
            {t('planSummary')}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, maxWidth: 420 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{t('plannedAllocations')}</Typography>
              <Typography variant="body2" fontWeight={700} sx={{ ml: 2, whiteSpace: 'nowrap' }}>
                {formatMoney(totalCommitted)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary">{t('remainder')}</Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                sx={{ ml: 2, whiteSpace: 'nowrap' }}
                color={remainder < 0 ? 'error.main' : 'success.main'}
              >
                {formatMoney(remainder)}
              </Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  )
}
