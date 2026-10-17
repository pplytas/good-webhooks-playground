import type { Metadata } from 'next'
import { Suspense } from 'react'
import { AccountActions } from '@/components/account-actions'
import { requireSession } from '@/server/session'

export const metadata: Metadata = { title: 'Account' }

async function Account() {
  const { user } = await requireSession()
  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Name</dt>
        <dd>{user.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{user.email}</dd>
      </dl>
      <p className="max-w-2xl text-muted-foreground">
        Deleting your account removes your endpoints at once, so nothing more is sent to them. Their
        delivery history expires within 7 days.
      </p>
      <AccountActions />
    </div>
  )
}

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Account</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading account…</p>}>
        <Account />
      </Suspense>
    </div>
  )
}
