import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import { BudgetList } from '@/components/budget/BudgetList'
import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner'

export default function BudgetsPage() {
  return (
    <>
      <EmailVerificationBanner />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Box>
          <BudgetList />
        </Box>
      </Container>
    </>
  )
}
