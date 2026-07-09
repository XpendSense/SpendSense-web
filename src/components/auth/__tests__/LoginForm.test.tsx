import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from '../LoginForm'
import en from '../../../../messages/en.json'

// ── mocks ─────────────────────────────────────────────────────────────────────

const mockPush = jest.fn()
const mockReplace = jest.fn()
jest.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}))
jest.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

// Resolve translation keys against actual en.json so label text matches
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

let mockLogin: jest.Mock
jest.mock('@connectrpc/connect', () => ({
  createClient: () => ({ login: (...args: unknown[]) => mockLogin?.(...args) }),
}))
jest.mock('@/lib/api/client', () => ({ publicTransport: {} }))
jest.mock('@/gen/spendsense/v1/auth_connect', () => ({ AuthService: {} }))

// ── helpers ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  mockLogin = jest.fn()
  global.fetch = jest.fn().mockResolvedValue({ ok: true })
  localStorage.clear()
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('LoginForm', () => {
  it('renders the email and password fields', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders the Google sign-in button as disabled', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /continue with google/i })).toBeDisabled()
  })

  it('calls the login RPC with email and password on submit', async () => {
    mockLogin.mockResolvedValueOnce({ accessToken: 'tok' })
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret123', rememberMe: false })
    })
  })

  it('sends the access token and its real expiry to the set-token API route', async () => {
    mockLogin.mockResolvedValueOnce({ accessToken: 'abc123', expiresIn: 86400 })
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/auth/set-token', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'abc123', expiresIn: 86400 }),
      }))
    })
  })

  it('redirects to /budgets after successful login', async () => {
    mockLogin.mockResolvedValueOnce({ accessToken: 'tok' })
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith('/budgets', expect.objectContaining({ locale: 'en' }))
    )
  })

  it('shows an error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
  })

  it('does not redirect when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))
    render(<LoginForm />)
    await userEvent.type(screen.getByLabelText(/email/i), 'user@example.com')
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await screen.findByText('Invalid credentials')
    expect(mockPush).not.toHaveBeenCalled()
  })
})
