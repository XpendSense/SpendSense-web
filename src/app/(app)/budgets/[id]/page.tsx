import Container from '@mui/material/Container'
import { BudgetView } from '@/components/budget/BudgetView'

export default async function BudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <Container maxWidth="xl" sx={{ py: 3 }}>
      <BudgetView budgetId={id} />
    </Container>
  )
}
