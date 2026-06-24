import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { TOKEN_COOKIE } from '@/lib/auth/token'

export default async function Home() {
  const token = (await cookies()).get(TOKEN_COOKIE)
  redirect(token ? '/budgets' : '/login')
}
