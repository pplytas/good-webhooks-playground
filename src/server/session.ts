import 'server-only'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth.ts'

export async function getSession() {
  // Read request headers first: during prerendering this postpones before auth() needs secrets.
  const requestHeaders = await headers()
  return auth().api.getSession({ headers: requestHeaders })
}

/** The proxy redirects signed-out visitors optimistically; this is the real check. */
export async function requireSession() {
  const session = await getSession()
  if (!session) redirect('/')
  return session
}

export const userScope = (userId: string) => ({ type: 'user', id: userId })
