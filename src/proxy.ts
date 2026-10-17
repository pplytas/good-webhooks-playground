import { getSessionCookie } from 'better-auth/cookies'
import { NextResponse, type NextRequest } from 'next/server'

/** Optimistic redirect for signed-out visitors. Pages and actions still check the session. */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next()
  return NextResponse.redirect(new URL('/', request.url))
}

export const config = { matcher: ['/endpoints/:path*', '/account'] }
