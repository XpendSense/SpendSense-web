'use client'

import { useTranslations } from 'next-intl'
import { spentColor } from './helpers'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'

interface Props {
  totalCommitted: number
  remainder: number
  totalActualSpent: number
  formatMoney: (amount: number) => string
}

export function PlanSummary({ totalCommitted, remainder, totalActualSpent, formatMoney }: Props) {
  const t = useTranslations('budget.expenses')

  if (totalCommitted <= 0) return null

  return (
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="body2" color="text.secondary">{t('spent')}</Typography>
          <Typography variant="body2" fontWeight={700} sx={{ ml: 2, whiteSpace: 'nowrap', color: spentColor(totalActualSpent, totalCommitted) }}>
            {formatMoney(totalActualSpent)}
          </Typography>
        </Box>
      </Box>
    </Box>
  )
}
