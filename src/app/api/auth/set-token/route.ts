import { NextRequest, NextResponse } from 'next/server'
import { TOKEN_COOKIE, SESSION_COOKIE_OPTIONS, PERSISTENT_COOKIE_OPTIONS } from '@/lib/auth/token'

export async function POST(req: NextRequest) {
  const { token, rememberMe } = await req.json() as { token: string; rememberMe?: boolean }

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(TOKEN_COOKIE, token, rememberMe ? PERSISTENT_COOKIE_OPTIONS : SESSION_COOKIE_OPTIONS)
  return res
}
