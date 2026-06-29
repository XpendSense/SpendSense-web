'use client'

import { useQuery } from '@tanstack/react-query'
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

interface Props {
  budgetId: string
}

export function BudgetView({ budgetId }: Props) {
  const client = useClient(BudgetService)
  const userClient = useClient(UserService)

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
  if (profileError) return <Typography color="error">Failed to load budget.</Typography>

  const profile = profileData?.profile
  const periods = periodsData?.periods ?? []
  const activePeriod = periods.find((p) => !p.isArchived) ?? periods[0]
  // Fall back to the user's country when the profile pre-dates the country_code column
  const effectiveCountry = profile?.countryCode || meData?.user?.countryCode || ''
  const showBeforeTax = effectiveCountry === 'US'

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
          <IncomePanel budgetProfileId={budgetId} showBeforeTax={showBeforeTax} />
        </Box>
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <SavingsPanel budgetProfileId={budgetId} />
        </Box>
        <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
          <PaymentMethodsPanel budgetProfileId={budgetId} budgetPeriodId={activePeriod?.id} />
        </Box>
      </Box>

      <Divider />

      <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        {activePeriod ? (
          <TransactionsPanel budgetPeriodId={activePeriod.id} budgetProfileId={budgetId} />
        ) : (
          <Typography variant="body2" color="text.secondary">No active period found.</Typography>
        )}
      </Box>

      <Divider />

      <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 2 }}>
        <ExpensesPanel budgetProfileId={budgetId} budgetPeriodId={activePeriod?.id} />
      </Box>
    </Box>
  )
}
