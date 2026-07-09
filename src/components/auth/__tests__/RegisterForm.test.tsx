import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RegisterForm } from '../RegisterForm'
import en from '../../../../messages/en.json'

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPush = jest.fn()
jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

type Messages = Record<string, unknown>
jest.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => {
    const parts = [...namespace.split('.'), key]
    let val: unknown = en
    for (const p of parts) val = (val as Messages)?.[p]
    return typeof val === 'string' ? val : key
  },
  useLocale: () => 'en',
}))

let mockRegister: jest.Mock
let mockListCountries: jest.Mock
jest.mock('@connectrpc/connect', () => ({
  createClient: () => ({
    register: (...args: unknown[]) => mockRegister?.(...args),
    listCountries: (...args: unknown[]) => mockListCountries?.(...args),
    updateMe: jest.fn().mockResolvedValue({}),
  }),
}))
jest.mock('@/lib/api/client', () => ({
  publicTransport: {},
  createTransport: () => ({}),
}))
jest.mock('@/gen/spendsense/v1/auth_connect', () => ({ AuthService: {} }))
jest.mock('@/gen/spendsense/v1/user_connect', () => ({ UserService: {} }))

// ── helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockRegister = jest.fn()
  mockListCountries = jest.fn().mockResolvedValue({ countries: [] })
  global.fetch = jest.fn().mockResolvedValue({ ok: true })
  localStorage.clear()
})

async function fillAndSubmit(overrides: { firstName?: string; email?: string; password?: string } = {}) {
  await userEvent.type(screen.getByLabelText(/first name/i), overrides.firstName ?? 'Jane')
  await userEvent.type(screen.getByLabelText(/email/i), overrides.email ?? 'jane@example.com')
  await userEvent.type(screen.getByLabelText(/password/i), overrides.password ?? 'Secret1!')
  await userEvent.click(screen.getByRole('button', { name: /create account/i }))
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('RegisterForm', () => {
  it('renders first name, email, and password fields', () => {
    render(<RegisterForm />)
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders the Google sign-in button as disabled', () => {
    render(<RegisterForm />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled()
  })

  it('calls the register RPC with name, email, password, language, and currency', async () => {
    mockRegister.mockResolvedValueOnce({ accessToken: 'tok' })
    render(<RegisterForm />)
    await fillAndSubmit()
    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(expect.objectContaining({
        firstName: 'Jane',
        email: 'jane@example.com',
        password: 'Secret1!',
        language: 'en',
        currency: 'USD',
      }))
    })
  })

  it('sends the access token and its real expiry to the set-token API route', async () => {
    mockRegister.mockResolvedValueOnce({ accessToken: 'newtoken', expiresIn: 3600 })
    render(<RegisterForm />)
    await fillAndSubmit()
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/set-token', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'newtoken', expiresIn: 3600 }),
      }))
    })
  })

  it('redirects to /budgets after successful registration', async () => {
    mockRegister.mockResolvedValueOnce({ accessToken: 'tok' })
    render(<RegisterForm />)
    await fillAndSubmit()
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/budgets', expect.objectContaining({ locale: 'en' }))
    )
  })

  it('shows an error message when registration fails', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Email already in use'))
    render(<RegisterForm />)
    await fillAndSubmit()
    expect(await screen.findByText('Email already in use')).toBeInTheDocument()
  })

  it('does not redirect when registration fails', async () => {
    mockRegister.mockRejectedValueOnce(new Error('Email already in use'))
    render(<RegisterForm />)
    await fillAndSubmit()
    await screen.findByText('Email already in use')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
