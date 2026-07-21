import Container from '@mui/material/Container'
import { ProfileSettings } from '@/components/user/ProfileSettings'
import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner'

export default function SettingsPage() {
  return (
    <>
      <EmailVerificationBanner />
      <Container maxWidth="md" sx={{ py: 4 }}>
        <ProfileSettings />
      </Container>
    </>
  )
}
