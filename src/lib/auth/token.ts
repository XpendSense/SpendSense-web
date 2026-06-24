export const TOKEN_COOKIE = 'spendsense_token'

const BASE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
}

// Expires when the browser closes
export const SESSION_COOKIE_OPTIONS = BASE_OPTIONS

// Persists for 30 days when "Remember me" is checked
export const PERSISTENT_COOKIE_OPTIONS = {
  ...BASE_OPTIONS,
  maxAge: 60 * 60 * 24 * 30,
}
