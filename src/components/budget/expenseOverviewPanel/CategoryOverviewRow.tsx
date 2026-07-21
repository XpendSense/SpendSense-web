'use client'

import { useTranslations } from 'next-intl'
import type { Category, BudgetPerson, ExpenseAllocation } from '@/gen/wellspent/v1/budget_pb'
import { parseMoney } from '../expensesPanel/helpers'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import IconButton from '@mui/material/IconButton'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

interface Props {
  cat: Category
  people: BudgetPerson[]
  actual: number
  planned: number
  txnActualByPersonCat: Map<string, number>
  allocMap: Map<string, ExpenseAllocation>
  savingsByPerson: Map<string, number>
  isSavings: boolean
  isExpanded: boolean
  onToggle: () => void
  formatMoney: (v: number) => string
}

export function CategoryOverviewRow({
  cat, people, actual, planned, txnActualByPersonCat, allocMap, savingsByPerson,
  isSavings, isExpanded, onToggle, formatMoney,
}: Props) {
  const t = useTranslations('budget.overview')
  const isOver = planned > 0 && actual > planned
  const actualColor = actual > 0 ? (isOver ? 'error.main' : 'success.main') : 'text.disabled'
  const hasPeople = people.length > 1

  return (
    <>
      <TableRow
        hover
        sx={{ cursor: hasPeople ? 'pointer' : 'default' }}
        onClick={hasPeople ? onToggle : undefined}
      >
        <TableCell sx={{ width: 36, py: 0.5, pr: 0 }}>
          {hasPeople && (
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); onToggle() }}>
              {isExpanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
            </IconButton>
          )}
        </TableCell>
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
        <TableCell align="right">
          <Typography variant="body2" sx={{ color: actualColor, fontWeight: actual > 0 ? 600 : 400 }}>
            {actual > 0 ? formatMoney(actual) : '—'}
          </Typography>
        </TableCell>
        <TableCell align="right">
          <Typography variant="body2" color="text.secondary">
            {planned > 0 ? formatMoney(planned) : '—'}
          </Typography>
        </TableCell>
        <TableCell sx={{ whiteSpace: 'nowrap' }}>
          {isOver && (
            <Chip
              label={`+${formatMoney(actual - planned)}`}
              size="small"
              color="error"
              variant="outlined"
              sx={{ fontSize: '0.7rem', height: 20 }}
            />
          )}
        </TableCell>
      </TableRow>

      {hasPeople && isExpanded && people.map((p) => {
        const personActual = txnActualByPersonCat.get(`${cat.id}:${p.id}`) ?? 0
        let personPlanned = 0
        if (isSavings) {
          personPlanned = savingsByPerson.get(p.id.toString()) ?? 0
        } else {
          const alloc = allocMap.get(`${cat.id}:${p.id}`)
          personPlanned = alloc
            ? parseMoney(alloc.plannedAmount?.units ?? 0n, alloc.plannedAmount?.nanos ?? 0)
            : 0
        }
        if (personActual === 0 && personPlanned === 0) return null
        const isPersonOver = personPlanned > 0 && personActual > personPlanned
        return (
          <TableRow key={p.id.toString()} sx={{ bgcolor: 'action.hover' }}>
            <TableCell sx={{ py: 0.5, pr: 0 }} />
            <TableCell sx={{ py: 0.5, pl: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {p.color && (
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: p.color, flexShrink: 0 }} />
                )}
                <Typography variant="body2" sx={{ color: p.color || 'text.primary' }} noWrap>
                  {p.userName}
                </Typography>
              </Box>
            </TableCell>
            <TableCell align="right" sx={{ py: 0.5 }}>
              <Typography
                variant="body2"
                sx={{ color: isPersonOver ? 'error.main' : (personActual > 0 ? 'success.main' : 'text.disabled') }}
              >
                {personActual > 0 ? formatMoney(personActual) : '—'}
              </Typography>
            </TableCell>
            <TableCell align="right" sx={{ py: 0.5 }}>
              <Typography variant="body2" color="text.secondary">
                {personPlanned > 0 ? formatMoney(personPlanned) : '—'}
              </Typography>
            </TableCell>
            <TableCell sx={{ py: 0.5 }}>
              {isPersonOver && (
                <Chip
                  label={`+${formatMoney(personActual - personPlanned)}`}
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              )}
            </TableCell>
          </TableRow>
        )
      })}
    </>
  )
}
