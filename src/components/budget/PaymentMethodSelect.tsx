'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'

interface Props {
  budgetProfileId: string
  value: string
  onChange: (value: string) => void
  label: string
  required?: boolean
  includeNone?: boolean
  noneLabel?: string
  size?: 'small' | 'medium'
}

export function PaymentMethodSelect({
  budgetProfileId,
  value,
  onChange,
  label,
  required,
  includeNone,
  noneLabel = '— None —',
  size = 'small',
}: Props) {
  const client = useClient(BudgetService)

  const { data: pmData } = useQuery({
    queryKey: ['payment-methods', budgetProfileId],
    queryFn: () => client.listPaymentMethods({ budgetProfileId }),
  })
  const { data: peopleData } = useQuery({
    queryKey: ['budget-people', budgetProfileId],
    queryFn: () => client.listBudgetPeople({ budgetProfileId }),
  })

  const methods = useMemo(() => pmData?.methods ?? [], [pmData])
  const personMap = useMemo(
    () => new Map((peopleData?.people ?? []).map((p) => [p.id.toString(), p])),
    [peopleData],
  )

  function renderMethodItem(id: string) {
    const m = methods.find((x) => x.id === id)
    if (!m) return <span>{id}</span>
    const person = m.budgetPersonId && m.budgetPersonId !== 0n ? personMap.get(m.budgetPersonId.toString()) : undefined
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {m.color && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: m.color, flexShrink: 0 }} />}
        <span>{m.name}{person ? ` · ${person.userName}` : ''}</span>
      </Box>
    )
  }

  return (
    <FormControl fullWidth size={size} required={required}>
      <InputLabel>{label}</InputLabel>
      <Select
        label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        renderValue={(val) => renderMethodItem(val as string)}
      >
        {includeNone && <MenuItem value="">{noneLabel}</MenuItem>}
        {methods.map((m) => {
          const person = m.budgetPersonId && m.budgetPersonId !== 0n ? personMap.get(m.budgetPersonId.toString()) : undefined
          return (
            <MenuItem key={m.id} value={m.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  sx={{
                    width: 12, height: 12, borderRadius: '50%', flexShrink: 0,
                    bgcolor: m.color || 'transparent',
                    border: '1px solid',
                    borderColor: m.color ? 'transparent' : 'divider',
                  }}
                />
                <Box>
                  <Typography variant="body2" sx={{ lineHeight: 1.3 }}>{m.name}</Typography>
                  {person && (
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>
                      {person.userName}
                    </Typography>
                  )}
                </Box>
              </Box>
            </MenuItem>
          )
        })}
      </Select>
    </FormControl>
  )
}
