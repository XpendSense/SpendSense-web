'use client'

import { useTranslations } from 'next-intl'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BudgetService } from '@/gen/wellspent/v1/budget_connect'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Card from '@mui/material/Card'
import CardContent from '@mui/material/CardContent'
import CardActions from '@mui/material/CardActions'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Chip from '@mui/material/Chip'
import CircularProgress from '@mui/material/CircularProgress'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import BlockIcon from '@mui/icons-material/Block'

interface Props {
  budgetProfileId: string
  budgetPeriodId: string | undefined
  isEditable: boolean
}

export function TransactionReviewPanel({ budgetProfileId, budgetPeriodId, isEditable }: Props) {
  const t = useTranslations('budget.review')
  const client = useClient(BudgetService)
  const queryClient = useQueryClient()
  const { showError } = useSnackbar()

  const { data, isLoading } = useQuery({
    queryKey: ['transaction-reviews', budgetProfileId],
    queryFn: () => client.listTransactionReviews({ budgetProfileId }),
    enabled: !!budgetProfileId,
  })

  const confirmMutation = useMutation({
    mutationFn: (reviewId: string) =>
      client.confirmTransactionReview({ reviewId, budgetProfileId }),
    onSuccess: (_, reviewId) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-reviews', budgetProfileId] })
      queryClient.invalidateQueries({ queryKey: ['transactions', budgetPeriodId] })
      queryClient.invalidateQueries({ queryKey: ['fixed-expenses', budgetProfileId] })
      logger.info('review.confirm', { reviewId })
    },
  })

  const dismissMutation = useMutation({
    mutationFn: (reviewId: string) =>
      client.dismissTransactionReview({ reviewId }),
    onSuccess: (_, reviewId) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-reviews', budgetProfileId] })
      logger.info('review.dismiss', { reviewId })
    },
  })

  async function handleConfirm(reviewId: string) {
    try {
      await confirmMutation.mutateAsync(reviewId)
    } catch (err) {
      showError(err)
    }
  }

  async function handleDismiss(reviewId: string) {
    try {
      await dismissMutation.mutateAsync(reviewId)
    } catch (err) {
      showError(err)
    }
  }

  const reviews = data?.reviews ?? []

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}><CircularProgress /></Box>
  }

  if (reviews.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 6 }}>
        <CheckCircleOutlineIcon sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
        <Typography variant="body2" color="text.secondary">{t('empty')}</Typography>
      </Box>
    )
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">{t('description')}</Typography>
      {reviews.map((review) => {
        const isPending = confirmMutation.isPending || dismissMutation.isPending
        const amount = review.transactionAmount
          ? `${(Number(review.transactionAmount.units) + review.transactionAmount.nanos / 1e9).toFixed(2)}`
          : '—'
        const score = Math.round(review.matchScore)

        return (
          <Card key={review.id} variant="outlined">
            <CardContent sx={{ pb: 0 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" noWrap>{review.transactionName}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t('matchedTo')} <strong>{review.matchedTransactionName}</strong>
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5} alignItems="center" flexShrink={0}>
                  <Typography variant="body2" fontWeight={600}>${amount}</Typography>
                  <Chip
                    label={`${score}%`}
                    size="small"
                    color={score >= 90 ? 'success' : 'warning'}
                    sx={{ height: 20, fontSize: 11 }}
                  />
                </Stack>
              </Stack>
            </CardContent>
            {isEditable && (
              <CardActions sx={{ pt: 0, justifyContent: 'flex-end' }}>
                <LoadingButton
                  size="small"
                  startIcon={<BlockIcon />}
                  onClick={() => handleDismiss(review.id)}
                  disabled={isPending}
                  loading={dismissMutation.isPending}
                  color="inherit"
                >
                  {t('dismiss')}
                </LoadingButton>
                <LoadingButton
                  size="small"
                  startIcon={<CheckCircleOutlineIcon />}
                  onClick={() => handleConfirm(review.id)}
                  disabled={isPending}
                  loading={confirmMutation.isPending}
                  color="primary"
                  variant="contained"
                >
                  {t('confirm')}
                </LoadingButton>
              </CardActions>
            )}
          </Card>
        )
      })}
    </Stack>
  )
}

export function transactionReviewCount(reviews: { status: string }[]): number {
  return reviews.filter((r) => r.status === 'pending').length
}
