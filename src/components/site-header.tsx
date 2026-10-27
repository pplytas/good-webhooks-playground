import Link from 'next/link'
import { Suspense } from 'react'
import { Mark } from '@/components/mark'
import { SignInButton } from '@/components/sign-in-button'
import { getSession } from '@/server/session'

async function SessionLinks() {
  const session = await getSession()
  if (!session) return <SignInButton />
  return (
    <>
      <Link href="/endpoints" className="hover:text-foreground">
        Endpoints
      </Link>
      <Link href="/account" className="hover:text-foreground">
        Account
      </Link>
    </>
  )
}

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Mark className="size-6" />
          <span>Good Webhooks Playground</span>
        </Link>
        <nav className="flex items-center gap-5 text-sm text-muted-foreground">
          <Link href="/events" className="hover:text-foreground">
            Events
          </Link>
          <Link href="/status" className="hover:text-foreground">
            Status
          </Link>
          <a href="https://good-webhooks.dev/docs" className="hover:text-foreground">
            Docs
          </a>
          <Suspense fallback={null}>
            <SessionLinks />
          </Suspense>
        </nav>
      </div>
    </header>
  )
}
