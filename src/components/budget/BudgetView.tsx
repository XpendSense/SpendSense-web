'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import { UserService } from '@/gen/spendsense/v1/user_connect'
import { useClient } from '@/hooks/useClient'
import { IncomePanel } from './IncomePanel'
import { SavingsPanel } from './SavingsPanel'
import { PaymentMethodsPanel } from './PaymentMethodsPanel'
import { TransactionsPanel } from './TransactionsPanel'
import { ExpensesPanel } from './ExpensesPanel'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CircularProgress from '@mui/material/CircularProgress'
import Divider from '@mui/material/Divider'
import SpeedDial from '@mui/material/SpeedDial'
import SpeedDialAction from '@mui/material/SpeedDialAction'
import SpeedDialIcon from '@mui/material/SpeedDialIcon'
import AddIcon from '@mui/icons-material/Add'
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'
import SavingsIcon from '@mui/icons-material/Savings'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'

type AddTarget = 'income' | 'savings' | 'transaction' | null

interface Props {
  budgetId: string
}

export function BudgetView({ budgetId }: Props) {
  const t = useTranslations('budget.view')
  const tFab = useTranslations('budget.fab')
  const client = useClient(BudgetService)
  const userClient = useClient(UserService)
  const [activeAdd, setActiveAdd] = useState<AddTarget>(null)

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => userClient.getMe({}),
  })

  const { data: profileData, isLoading: profileLoading, error: profileError } = useQuery({
    queryKey: ['budget-profile', budgetId],
    queryFn: () => client.getBudgetProfile({ id: budgetId }),
  })

  const { data: periodsData, isLoading: periodsLoading } = useQuery({
    queryKey: ['budget-periods', budgetId],
    queryFn: () => client.listBudgetPeriods({ budgetProfileId: budgetId }),
    enabled: !!profileData,
  })

  if (profileLoading || periodsLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 8 }}><CircularProgress /></Box>
  }
  if (profileError) return <Typography color="error">{t('failedToLoad')}</Typography>

  const profile = profileData?.profile
  const periods = periodsData?.periods ?? []
  const activePeriod = [...periods]
    .filter((p) => !p.isArchived)
    .sort((a, b) => Number(b.startDate?.seconds ?? 0n) - Number(a.startDate?.seconds ?? 0n))[0]
    ?? periods[0]
  // Fall back to the user's country when the profile pre-dates the country_code column
  const effectiveCountry = profile?.countryCode || meData?.user?.countryCode || ''
  const showBeforeTax = effectiveCountry === 'US'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pb: 10 }}>
      <Box>
        <Typography variant="h5" fontWeight={700}>{profile?.name}</Typography>
        {activePeriod?.startDate && activePeriod?.endDate && (
          <Typography variant="body2" color="text.secondary">
            {new Date(Number(activePeriod.startDate.seconds) * 1000).toLocaleDateString()} —{' '}
            {new Date(Number(activePeriod.endDate.seconds) * 1000).toLocaleDateString()}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 3 }}>
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <IncomePanel
            budgetProfileId={budgetId}
            showBeforeTax={showBeforeTax}
            addOpen={activeAdd === 'income'}
            onAddClose={() => setActiveAdd(null)}
          />
        </Box>
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <SavingsPanel
            budgetProfileId={budgetId}
            activePeriodStart={activePeriod?.startDate ? new Date(Number(activePeriod.startDate.seconds) * 1000) : undefined}
            addOpen={activeAdd === 'savings'}
            onAddClose={() => setActiveAdd(null)}
          />
        </Box>
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <PaymentMethodsPanel budgetProfileId={budgetId} budgetPeriodId={activePeriod?.id} />
        </Box>
      </Box>

      <Divider />

      <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        {activePeriod ? (
          <TransactionsPanel
            budgetPeriodId={activePeriod.id}
            budgetProfileId={budgetId}
            addOpen={activeAdd === 'transaction'}
            onAddClose={() => setActiveAdd(null)}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">{t('noActivePeriod')}</Typography>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <ExpensesPanel budgetProfileId={budgetId} budgetPeriodId={activePeriod?.id} />
      </Box>

      <SpeedDial
        ariaLabel={tFab('label')}
        icon={<SpeedDialIcon openIcon={<AddIcon />} />}
        sx={{ position: 'fixed', bottom: { xs: 80, sm: 24 }, right: 24 }}
      >
        <SpeedDialAction
          icon={<ReceiptLongIcon />}
          tooltipTitle={tFab('addTransaction')}
          onClick={() => setActiveAdd('transaction')}
        />
        <SpeedDialAction
          icon={<SavingsIcon />}
          tooltipTitle={tFab('addSavings')}
          onClick={() => setActiveAdd('savings')}
        />
        <SpeedDialAction
          icon={<AttachMoneyIcon />}
          tooltipTitle={tFab('addIncome')}
          onClick={() => setActiveAdd('income')}
        />
      </SpeedDial>
    </Box>
  )
}
