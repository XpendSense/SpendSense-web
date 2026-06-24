'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BudgetService } from '@/gen/spendsense/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { formatError } from '@/lib/errors'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import CardContent from '@mui/material/CardContent'
import CircularProgress from '@mui/material/CircularProgress'
import AddIcon from '@mui/icons-material/Add'
import { BudgetSetupFlow } from './BudgetSetupFlow'
import { useRouter } from 'next/navigation'

export function BudgetList() {
  const router = useRouter()
  const { showError } = useSnackbar()
  const [setupOpen, setSetupOpen] = useState(false)
  const client = useClient(BudgetService)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['budgets', 'list'],
    queryFn: () => client.listBudgets({}),
  })

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
  }

  if (isError) {
    const message = formatError(error)
    logger.error('budget.list.failed', { error: message })
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography color="error" mb={2}>{message}</Typography>
        <Button variant="outlined" onClick={() => refetch()}>Retry</Button>
      </Box>
    )
  }

  const budgets = data?.budgets ?? []

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5" fontWeight={700}>Your Budgets</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setSetupOpen(true)}>
          New Budget
        </Button>
      </Box>

      {budgets.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
          <Typography variant="body1" mb={2}>No budgets yet. Create your first one to get started.</Typography>
          <Button variant="outlined" onClick={() => setSetupOpen(true)}>Create Budget</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 2 }}>
          {budgets.map((budget) => (
            <Card key={budget.id} variant="outlined">
              <CardActionArea onClick={() => {
                logger.info('budget.open', { budgetId: budget.id })
                router.push(`/budgets/${budget.id}`)
              }}>
                <CardContent>
                  <Typography variant="h6">{budget.name}</Typography>
                  <Typography variant="body2" color={budget.active ? 'success.main' : 'text.secondary'}>
                    {budget.active ? 'Active' : 'Inactive'}
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}

      <BudgetSetupFlow
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        onComplete={() => {
          setSetupOpen(false)
          refetch()
        }}
      />
    </Box>
  )
}
