'use client'

import { useState } from 'react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useTranslations } from 'next-intl'
import { useMutation, useQuery } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { UserService } from '@/gen/wellspent/v1/user_connect'
import { BudgetCycle } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import { LoadingButton } from '@/components/ui/LoadingButton'
import TextField from '@mui/material/TextField'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Stepper from '@mui/material/Stepper'
import Step from '@mui/material/Step'
import StepLabel from '@mui/material/StepLabel'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import { AddPeopleModal } from './modals/AddPeopleModal'
import { AddIncomeModal } from './modals/AddIncomeModal'
import { AddPaymentMethodsStep } from './modals/AddPaymentMethodsStep'

interface Props {
  open: boolean
  onClose: () => void
  onComplete: () => void
}

export function BudgetSetupFlow({ open, onClose, onComplete }: Props) {
  const t = useTranslations('budget.setup')
  const { showError, showSuccess } = useSnackbar()
  const fullScreen = useIsMobile()
  const [step, setStep] = useState(0)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [budgetName, setBudgetName] = useState('')
  const client = useClient(BudgetService)
  const userClient = useClient(UserService)

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => userClient.getMe({}),
  })
  const showBeforeTax = meData?.user?.countryCode === 'US'

  const { mutateAsync: doCreateProfile, isPending } = useMutation({
    mutationFn: (name: string) => client.createBudgetProfile({ name, cycle: BudgetCycle.MONTHLY }),
  })

  function reset() {
    setStep(0)
    setProfileId(null)
    setBudgetName('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleFinishLater() {
    showSuccess('Budget created! You can finish setup from the budget view.')
    reset()
    onComplete()
  }

  async function handleCreateBudget() {
    try {
      const res = await doCreateProfile(budgetName)
      const id = res.profile?.id ?? ''
      setProfileId(id)
      logger.info('budget.create', { budgetId: id, name: budgetName })
      setStep(1)
    } catch (err) {
      showError(err)
    }
  }

  function handleSkipOrNext() {
    const steps = [t('steps.create'), t('steps.addPeople'), t('steps.addIncome'), t('steps.paymentMethods')]
    if (step < steps.length - 1) {
      setStep((s) => s + 1)
    } else {
      showSuccess('Budget set up successfully!')
      reset()
      onComplete()
    }
  }

  return (
    <Dialog open={open} onClose={step === 0 ? handleClose : undefined} maxWidth="sm" fullWidth fullScreen={fullScreen}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Set up your budget
        {step > 0 && (
          <IconButton size="small" onClick={handleFinishLater} title="Finish later">
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </DialogTitle>

      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 3 }}>
          {[t('steps.create'), t('steps.addPeople'), t('steps.addIncome'), t('steps.paymentMethods')].map((label) => (
            <Step key={label}><StepLabel>{label}</StepLabel></Step>
          ))}
        </Stepper>

        {step === 0 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">Give your budget a name to get started.</Typography>
            <TextField
              label="Budget name"
              value={budgetName}
              onChange={(e) => setBudgetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && budgetName.trim() && !isPending && handleCreateBudget()}
              fullWidth
              autoFocus
            />
          </Stack>
        )}

        {step === 1 && profileId && (
          <AddPeopleModal budgetProfileId={profileId} embedded onSkip={handleSkipOrNext} onDone={handleSkipOrNext} />
        )}

        {step === 2 && profileId && (
          <AddIncomeModal budgetProfileId={profileId} embedded showBeforeTax={showBeforeTax} onSkip={handleSkipOrNext} onDone={handleSkipOrNext} />
        )}

        {step === 3 && profileId && (
          <AddPaymentMethodsStep budgetProfileId={profileId} onSkip={handleSkipOrNext} onDone={handleSkipOrNext} />
        )}
      </DialogContent>

      {step === 0 && (
        <DialogActions>
          <Button onClick={handleClose} color="inherit">Cancel</Button>
          <LoadingButton variant="contained" onClick={handleCreateBudget} disabled={!budgetName.trim()} loading={isPending}>
            Create
          </LoadingButton>
        </DialogActions>
      )}

      {step > 0 && (
        <DialogActions sx={{ justifyContent: 'space-between' }}>
          <Button onClick={handleFinishLater} color="inherit" size="small">Finish later</Button>
          {step > 1 && (
            <Button onClick={() => setStep((s) => s - 1)} color="inherit" size="small">Back</Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  )
}
