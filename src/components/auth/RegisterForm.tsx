'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@connectrpc/connect'
import { AuthService } from '@/gen/spendsense/v1/auth_connect'
import { UserService } from '@/gen/spendsense/v1/user_connect'
import { FilingStatus } from '@/gen/spendsense/v1/common_pb'
import { publicTransport, createTransport } from '@/lib/api/client'
import { logger } from '@/lib/logger'
import { isEnabled } from '@/lib/config/features'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import Typography from '@mui/material/Typography'
import Tooltip from '@mui/material/Tooltip'
import Link from '@mui/material/Link'
import NextLink from 'next/link'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import InputLabel from '@mui/material/InputLabel'
import FormControl from '@mui/material/FormControl'
import CircularProgress from '@mui/material/CircularProgress'
import InputAdornment from '@mui/material/InputAdornment'

const authClient = createClient(AuthService, publicTransport)
const userClient = createClient(UserService, publicTransport)

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

export function RegisterForm() {
  const router = useRouter()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(FilingStatus.UNSPECIFIED)
  const [countries, setCountries] = useState<{ code: string; name: string }[]>([])
  const [countriesLoading, setCountriesLoading] = useState(true)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    userClient.listCountries({}).then((res) => {
      setCountries(res.countries.map((c) => ({ code: c.code, name: c.name })))
    }).catch((err) => {
      logger.error('register.listCountries.failed', { error: err instanceof Error ? err.message : String(err) })
    }).finally(() => {
      setCountriesLoading(false)
    })
  }, [])

  async function handleGoogleSignIn() {
    const state = crypto.randomUUID()
    sessionStorage.setItem('google_oauth_state', state)
    try {
      const res = await authClient.getGoogleAuthURL({ state })
      window.location.href = res.url
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initiate Google sign-in'
      setError(message)
      logger.error('auth.google.initiate.failed', { error: message })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authClient.register({ firstName, lastName, email, password, countryCode, stateCode })

      // Persist filing status before setting the cookie so profile is complete on first load
      if (countryCode === 'US' && filingStatus !== FilingStatus.UNSPECIFIED) {
        const authedUserClient = createClient(UserService, createTransport(res.accessToken))
        await authedUserClient.updateMe({
          firstName,
          lastName,
          countryCode,
          stateCode,
          filingStatus,
          taxPaymentFrequency: 0,
        }).catch((err) => {
          logger.error('register.updateFilingStatus.failed', { error: err instanceof Error ? err.message : String(err) })
        })
      }

      await fetch('/api/auth/set-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: res.accessToken }),
      })
      logger.info('auth.register')
      router.push('/budgets')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed'
      setError(message)
      logger.error('auth.register.failed', { error: message })
    } finally {
      setLoading(false)
    }
  }

  const isUS = countryCode === 'US'

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Stack direction="row" spacing={2}>
        <TextField
          label="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          fullWidth
        />
        <TextField
          label="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          fullWidth
        />
      </Stack>
      <TextField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        fullWidth
        autoComplete="email"
      />
      <TextField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        fullWidth
        autoComplete="new-password"
        helperText="8+ characters with uppercase, lowercase, digit, and special character"
      />

      <FormControl fullWidth size="small" disabled={countriesLoading}>
        <InputLabel>Country</InputLabel>
        <Select
          label="Country"
          value={countryCode}
          onChange={(e) => { setCountryCode(e.target.value); setStateCode(''); setFilingStatus(FilingStatus.UNSPECIFIED) }}
          endAdornment={
            countriesLoading ? (
              <InputAdornment position="end" sx={{ mr: 3 }}>
                <CircularProgress size={16} />
              </InputAdornment>
            ) : undefined
          }
        >
          <MenuItem value="">Prefer not to say</MenuItem>
          {countries.map((c) => (
            <MenuItem key={c.code} value={c.code}>{c.name}</MenuItem>
          ))}
        </Select>
      </FormControl>

      {isUS && (
        <FormControl fullWidth size="small">
          <InputLabel>State</InputLabel>
          <Select
            label="State"
            value={stateCode}
            onChange={(e) => setStateCode(e.target.value)}
          >
            <MenuItem value="">— Select state —</MenuItem>
            {US_STATES.map(([code, name]) => (
              <MenuItem key={code} value={code}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {isUS && (
        <FormControl fullWidth size="small">
          <InputLabel>Filing status</InputLabel>
          <Select
            label="Filing status"
            value={filingStatus}
            onChange={(e) => setFilingStatus(e.target.value as FilingStatus)}
          >
            <MenuItem value={FilingStatus.UNSPECIFIED}>— Select filing status —</MenuItem>
            {FILING_STATUS_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
      <Button type="submit" variant="contained" fullWidth disabled={loading}>
        {loading ? 'Creating account…' : 'Create account'}
      </Button>

      <Divider>or</Divider>

      {isEnabled('googleAuth') ? (
        <Button variant="outlined" fullWidth onClick={handleGoogleSignIn} disabled={loading}>
          Continue with Google
        </Button>
      ) : (
        <Tooltip title="Google sign-in is not available yet" placement="top">
          <span>
            <Button variant="outlined" fullWidth disabled sx={{ pointerEvents: 'none', opacity: 0.5 }}>
              Continue with Google
            </Button>
          </span>
        </Tooltip>
      )}

      <Typography variant="body2" textAlign="center">
        Already have an account?{' '}
        <Link component={NextLink} href="/login">
          Sign in
        </Link>
      </Typography>
    </Stack>
  )
}
