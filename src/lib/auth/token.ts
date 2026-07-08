export const TOKEN_COOKIE = 'spendsense_token'

const BASE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
}

// Matches the backend's default (non-remember-me) JWT lifetime — 24h.
// Previously this had no maxAge at all ("expires when the browser closes"),
// but mobile browsers evict those session-only cookies on backgrounding far
// more readily than desktop ever closes its browser process, so the cookie
// vanished long before the JWT actually expired. Giving it an explicit
// maxAge means it survives exactly as long as the token it carries.
export const SESSION_COOKIE_OPTIONS = {
  ...BASE_OPTIONS,
  maxAge: 60 * 60 * 24,
}

// Persists for 90 days when "Remember me" is checked — matches JWT lifetime
export const PERSISTENT_COOKIE_OPTIONS = {
  ...BASE_OPTIONS,
  maxAge: 60 * 60 * 24 * 90,
}

/**
 * Decodes the JWT payload and checks whether the token is expired.
 * Works in both Node.js (server) and browser (client) environments.
 * Returns true for malformed tokens (treat as expired).
 */
export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    // base64url → standard base64
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(base64, 'base64').toString('utf-8')
        : atob(base64)
    const payload = JSON.parse(json) as { exp?: number }
    if (!payload.exp) return false
    return Math.floor(Date.now() / 1000) >= payload.exp
  } catch {
    return true
  }
}
