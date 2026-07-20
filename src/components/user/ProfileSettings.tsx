'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/navigation'
import { useSearchParams } from 'next/navigation'
import { useQuery, useMutation } from '@tanstack/react-query'
import { UserService } from '@/gen/wellspent/v1/user_connect'
import { FilingStatus, TaxPaymentFrequency } from '@/gen/wellspent/v1/common_pb'
import { useClient } from '@/hooks/useClient'
import { useSnackbar } from '@/components/ui/ErrorSnackbar'
import { logger } from '@/lib/logger'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { LoadingButton } from '@/components/ui/LoadingButton'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import Divider from '@mui/material/Divider'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'
import Alert from '@mui/material/Alert'
import IconButton from '@mui/material/IconButton'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { PlaidSection } from './PlaidSection'

const US_STATES = [
  ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'],
  ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'],
  ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'],
  ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'],
  ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
  ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'],
  ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'],
  ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'],
  ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'],
  ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
  ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'],
  ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'], ['WY', 'Wyoming'], ['DC', 'District of Columbia'],
]

const FILING_STATUS_OPTIONS = [
  { value: FilingStatus.SINGLE, label: 'Single' },
  { value: FilingStatus.MARRIED_FILING_JOINTLY, label: 'Married Filing Jointly' },
  { value: FilingStatus.MARRIED_FILING_SEPARATELY, label: 'Married Filing Separately' },
  { value: FilingStatus.HEAD_OF_HOUSEHOLD, label: 'Head of Household' },
  { value: FilingStatus.QUALIFYING_SURVIVING_SPOUSE, label: 'Qualifying Surviving Spouse' },
]

const TAX_FREQUENCY_OPTIONS = [
  { value: TaxPaymentFrequency.MONTHLY, label: 'Monthly' },
  { value: TaxPaymentFrequency.QUARTERLY, label: 'Quarterly (every 3 months)' },
  { value: TaxPaymentFrequency.FOUR_MONTHLY, label: 'Every 4 months' },
  { value: TaxPaymentFrequency.SEMI_ANNUAL, label: 'Semi-annual (every 6 months)' },
  { value: TaxPaymentFrequency.ANNUAL, label: 'Annual' },
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
]

const CURRENCY_OPTIONS = [
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'ARS', label: 'ARS — Argentine Peso' },
  { value: 'EUR', label: 'EUR — Euro' },
]

export function ProfileSettings() {
  const t = useTranslations('settings')
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromBudgetId = searchParams.get('from')
  const client = useClient(UserService)
  const { showError } = useSnackbar()
  const [saved, setSaved] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => client.getMe({}),
  })
  const user = data?.user

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(FilingStatus.UNSPECIFIED)
  const [taxFrequency, setTaxFrequency] = useState<TaxPaymentFrequency>(TaxPaymentFrequency.UNSPECIFIED)
  const [language, setLanguage] = useState('en')
  const [currency, setCurrency] = useState('USD')
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [countriesLoading, setCountriesLoading] = useState(true)

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
      setCountryCode(user.countryCode)
      setStateCode(user.stateCode)
      setFilingStatus(user.filingStatus)
      setTaxFrequency(user.taxPaymentFrequency)
      setLanguage(user.language || 'en')
      setCurrency(user.currency || 'USD')
    }
  }, [user])

  useEffect(() => {
    client.listCountries({}).then((res) => {
      setCountries(res.countries.map((c) => ({ code: c.code, name: c.name })))
    }).catch((err) => {
      logger.error('settings.listCountries.failed', { error: err instanceof Error ? err.message : String(err) })
    }).finally(() => {
      setCountriesLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { mutateAsync, isPending } = useMutation({
    mutationFn: () =>
      client.updateMe({ firstName, lastName, countryCode, stateCode, filingStatus, taxPaymentFrequency: taxFrequency, language, currency }),
  })

  async function handleSave() {
    try {
      await mutateAsync()
      localStorage.setItem('wellspent_locale', language)
      localStorage.setItem('wellspent_currency', currency)
      logger.info('user.profile.update')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      // If language changed, navigate to the new locale's settings page
      if (language !== user?.language) {
        router.replace(
          fromBudgetId ? { pathname: '/settings', query: { from: fromBudgetId } } : '/settings',
          { locale: language }
        )
      }
    } catch (err) {
      showError(err)
    }
  }

  if (isLoading) return <CircularProgress size={24} />

  const isUS = countryCode === 'US'

  return (
    <Box sx={{ maxWidth: 480 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <IconButton onClick={() => router.push(fromBudgetId ? `/budgets/${fromBudgetId}` : '/budgets')} size="small">
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6" fontWeight={700}>{t('title')}</Typography>
      </Box>

      <Stack spacing={2}>
        <Stack direction="row" spacing={2}>
          <TextField
            label={t('firstName')}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            fullWidth
          />
          <TextField
            label={t('lastName')}
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            fullWidth
          />
        </Stack>

        <TextField
          label={t('email')}
          value={user?.email ?? ''}
          fullWidth
          disabled
          helperText={t('emailReadOnly')}
        />

        <Stack direction="row" spacing={2}>
          <FormControl fullWidth size="small">
            <InputLabel>{t('language')}</InputLabel>
            <Select
              label={t('language')}
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGE_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small">
            <InputLabel>{t('currency')}</InputLabel>
            <Select
              label={t('currency')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>

        <FormControl fullWidth size="small" disabled={countriesLoading}>
          <InputLabel>{t('country')}</InputLabel>
          <Select
            label={t('country')}
            value={countryCode}
            onChange={(e) => { setCountryCode(e.target.value); setStateCode('') }}
            endAdornment={
              countriesLoading ? (
                <InputAdornment position="end" sx={{ mr: 3 }}>
                  <CircularProgress size={16} />
                </InputAdornment>
              ) : undefined
            }
          >
            <MenuItem value="">{t('notSet')}</MenuItem>
            {countries.map((c) => (
              <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>
            ))}
          </Select>
        </FormControl>

        {isUS && (
          <FormControl fullWidth size="small">
            <InputLabel>{t('state')}</InputLabel>
            <Select
              label={t('state')}
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
            >
              <MenuItem value="">{t('notSet')}</MenuItem>
              {US_STATES.map(([code, name]) => (
                <MenuItem key={code} value={code}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {isUS && (
          <>
            <Divider>
              <Typography variant="caption" color="text.secondary">{t('taxSettings')}</Typography>
            </Divider>

            <FormControl fullWidth size="small">
              <InputLabel>{t('filingStatus')}</InputLabel>
              <Select
                label={t('filingStatus')}
                value={filingStatus}
                onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
              >
                <MenuItem value={FilingStatus.UNSPECIFIED}>{t('notSet')}</MenuItem>
                {FILING_STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel>{t('taxFrequency')}</InputLabel>
              <Select
                label={t('taxFrequency')}
                value={taxFrequency}
                onChange={(e) => setTaxFrequency(e.target.value as TaxPaymentFrequency)}
              >
                <MenuItem value={TaxPaymentFrequency.UNSPECIFIED}>{t('notSet')}</MenuItem>
                {TAX_FREQUENCY_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="caption" color="text.secondary">
              {t('taxNote')}
            </Typography>
          </>
        )}

        {isUS && (
          <>
            <Divider>
              <Typography variant="caption" color="text.secondary">{t('plaidTitle')}</Typography>
            </Divider>
            <PlaidSection />
          </>
        )}

        {saved && <Alert severity="success">{t('saved')}</Alert>}

        <LoadingButton
          variant="contained"
          onClick={handleSave}
          loading={isPending}
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('save')}
        </LoadingButton>
      </Stack>
    </Box>
  )
}
