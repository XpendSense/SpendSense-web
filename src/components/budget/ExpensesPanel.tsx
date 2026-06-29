'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import type { Category, ExpenseAllocation } from '@/gen/spendsense/v1/budget_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TableFooter from '@mui/material/TableFooter'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Divider from '@mui/material/Divider'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import ClearIcon from '@mui/icons-material/Clear'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import Tooltip from '@mui/material/Tooltip'

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
  if (ratio >= 0.9) return 'warning.main'
  return 'success.main'
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
      {value != null ? formatMoney(value) : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}
    </Box>
  )
}

export function ExpensesPanel({ budgetProfileId, budgetPeriodId }: Props) {
  const { showError } = useSnackbar()
  const client = useClient(BudgetService)
  const [pinnedCategoryIds, setPinnedCategoryIds] = useState<Set<number>>(new Set())
  const [autocompleteValue, setAutocompleteValue] = useState<Category | null>(null)

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

  const { data: savingsData, isLoading: savingsLoading } = useQuery({
    queryKey: ['savings-sources', budgetProfileId],
    queryFn: () => client.listSavingsSources({ budgetProfileId }),
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
        await upsertAlloc({
          budgetProfileId,
          categoryId,
          budgetPersonId,
          plannedAmount: { units, nanos },
        })
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

  const isLoading = catsLoading || peopleLoading || allocsLoading || txnsLoading || savingsLoading
  if (isLoading) return <Box sx={{ py: 2 }}><CircularProgress size={20} /></Box>

  const categories = categoriesData?.categories ?? []
  const people = peopleData?.people ?? []
  const allocations = allocationsData?.allocations ?? []
  const transactions = transactionsData?.transactions ?? []
  const savingsSources = savingsData?.sources ?? []

  const allocMap = new Map<string, ExpenseAllocation>()
  for (const a of allocations) {
    allocMap.set(`${a.categoryId}:${a.budgetPersonId}`, a)
  }

  const txnActualByCat = new Map<number, number>()
  for (const t of transactions) {
    if (!t.categoryId) continue
    const cur = txnActualByCat.get(t.categoryId) ?? 0
    const amt = Number(t.amount?.units ?? 0n) + (t.amount?.nanos ?? 0) / 1e9
    txnActualByCat.set(t.categoryId, cur + amt)
  }

  const catIdsWithAllocs = new Set(allocations.map((a) => a.categoryId))

  const visibleCats = categories.filter(
    (c) => catIdsWithAllocs.has(c.id) || txnActualByCat.has(c.id) || pinnedCategoryIds.has(c.id),
  )

  const visibleCatIds = new Set(visibleCats.map((c) => c.id))
  const addableCategories = categories.filter((c) => !visibleCatIds.has(c.id))

  const savingsByPerson = new Map<string, number>()
  for (const s of savingsSources) {
    const personKey = s.budgetPersonId.toString()
    const monthly = (() => {
      const amt = parseMoney(s.amount?.units ?? 0n, s.amount?.nanos ?? 0)
      const freq = s.frequency
      const mult = freq === 2 ? 52 / 12 : freq === 3 ? 26 / 12 : freq === 4 ? 1 : freq === 5 ? 1 / 12 : 0
      return amt * mult
    })()
    savingsByPerson.set(personKey, (savingsByPerson.get(personKey) ?? 0) + monthly)
  }
  const savingsTotal = [...savingsByPerson.values()].reduce((a, b) => a + b, 0)

  const footerCellSx = { borderTop: '2px solid', borderColor: 'divider', fontSize: '0.95rem', fontWeight: 700 }

  return (
    <Box>
      <Typography variant="subtitle1" fontWeight={600} mb={1}>Expense Plan</Typography>

      <Table size="small" sx={{ tableLayout: 'auto' }}>
        <TableHead>
          <TableRow>
            <TableCell rowSpan={2} sx={{ fontWeight: 600, verticalAlign: 'bottom' }}>Category</TableCell>
            <TableCell
              colSpan={people.length + 1}
              align="center"
              sx={{ fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}
            >
              Planned Amount
            </TableCell>
            <TableCell rowSpan={2} align="right" sx={{ fontWeight: 600, verticalAlign: 'bottom' }}>Actual</TableCell>
          </TableRow>
          <TableRow>
            {people.map((p) => (
              <TableCell key={p.id.toString()} align="right" sx={{ fontWeight: 600 }}>
                {p.userName}
              </TableCell>
            ))}
            <TableCell align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {visibleCats.length === 0 ? (
            <TableRow>
              <TableCell colSpan={people.length + 3} sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                No categories yet — use the picker below to add one.
              </TableCell>
            </TableRow>
          ) : (
            visibleCats.map((cat) => {
              const actual = txnActualByCat.get(cat.id) ?? 0
              let plannedTotal = 0
              for (const p of people) {
                const alloc = allocMap.get(`${cat.id}:${p.id}`)
                if (alloc) {
                  plannedTotal += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                }
              }
              const color = actualColor(actual, plannedTotal)
              return (
                <TableRow key={cat.id} hover>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      {cat.color && (
                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: cat.color, flexShrink: 0 }} />
                      )}
                      {cat.name}
                      {cat.isSystem && (
                        <Chip label="global" size="small" variant="outlined" sx={{ fontSize: '0.6rem', height: 16 }} />
                      )}
                      <Tooltip title="Remove row" placement="right">
                        <IconButton size="small" onClick={() => handleRemoveCategory(cat.id)} sx={{ ml: 0.5, opacity: 0.4, '&:hover': { opacity: 1 } }}>
                          <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                  {people.map((p) => {
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
                  <TableCell align="right">{plannedTotal > 0 ? formatMoney(plannedTotal) : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}</TableCell>
                  <TableCell align="right" sx={{ color }}>{actual > 0 ? formatMoney(actual) : <Typography component="span" variant="body2" color="text.disabled">—</Typography>}</TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
        {visibleCats.length > 0 && (
          <TableFooter>
            <TableRow sx={{ '& td': footerCellSx }}>
              <TableCell>Total</TableCell>
              {people.map((p) => {
                let total = 0
                for (const cat of visibleCats) {
                  const alloc = allocMap.get(`${cat.id}:${p.id}`)
                  if (alloc) total += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                }
                return <TableCell key={p.id.toString()} align="right">{total > 0 ? formatMoney(total) : '—'}</TableCell>
              })}
              <TableCell align="right">
                {formatMoney(visibleCats.reduce((sum, cat) => {
                  let t = 0
                  for (const p of people) {
                    const alloc = allocMap.get(`${cat.id}:${p.id}`)
                    if (alloc) t += parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
                  }
                  return sum + t
                }, 0))}
              </TableCell>
              <TableCell align="right">
                {formatMoney([...txnActualByCat.values()].reduce((a, b) => a + b, 0))}
              </TableCell>
            </TableRow>
          </TableFooter>
        )}
      </Table>

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
            <TextField {...params} label="Add category to plan…" size="small" />
          )}
          sx={{ mt: 1.5, maxWidth: 320 }}
          size="small"
        />
      )}

      {savingsSources.length > 0 && (
        <Box mt={3}>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="subtitle2" fontWeight={600} color="text.secondary" mb={1}>
            Committed Savings
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ fontWeight: 600, verticalAlign: 'bottom' }}>Source</TableCell>
                <TableCell
                  colSpan={people.length + 1}
                  align="center"
                  sx={{ fontWeight: 600, borderBottom: '1px solid', borderColor: 'divider', pb: 0.5 }}
                >
                  Monthly (per person)
                </TableCell>
              </TableRow>
              <TableRow>
                {people.map((p) => (
                  <TableCell key={p.id.toString()} align="right" sx={{ fontWeight: 600 }}>{p.userName}</TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {people.map((p) => {
                const personSources = savingsSources.filter((s) => s.budgetPersonId === p.id)
                if (personSources.length === 0) return null
                return personSources.map((s) => {
                  const freq = s.frequency
                  const mult = freq === 2 ? 52 / 12 : freq === 3 ? 26 / 12 : freq === 4 ? 1 : freq === 5 ? 1 / 12 : 0
                  const amt = parseMoney(s.amount?.units ?? 0n, s.amount?.nanos ?? 0)
                  const monthly = amt * mult
                  return (
                    <TableRow key={s.id.toString()}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {s.name}
                          {s.isTaxReserve && (
                            <Chip label="tax" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.6rem', height: 16 }} />
                          )}
                        </Box>
                      </TableCell>
                      {people.map((person) => (
                        <TableCell key={person.id.toString()} align="right">
                          {person.id === p.id ? formatMoney(monthly) : '—'}
                        </TableCell>
                      ))}
                      <TableCell align="right">{formatMoney(monthly)}</TableCell>
                    </TableRow>
                  )
                })
              })}
            </TableBody>
            <TableFooter>
              <TableRow sx={{ '& td': footerCellSx }}>
                <TableCell>Total</TableCell>
                {people.map((p) => {
                  const total = savingsByPerson.get(p.id.toString()) ?? 0
                  return <TableCell key={p.id.toString()} align="right">{total > 0 ? formatMoney(total) : '—'}</TableCell>
                })}
                <TableCell align="right">{formatMoney(savingsTotal)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </Box>
      )}
    </Box>
  )
}
