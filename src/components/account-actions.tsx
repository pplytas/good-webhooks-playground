'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function AccountActions() {
  const router = useRouter()
  const [confirm, setConfirm] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function leave(operation: () => Promise<{ error: { message?: string } | null }>) {
    setPending(true)
    setError(null)
    const { error: failure } = await operation()
    setPending(false)
    if (failure) return setError(failure.message ?? 'The request failed.')
    router.push('/')
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => leave(() => authClient.signOut())}
        >
          Sign out
        </Button>
        {confirm ? (
          <>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => leave(() => authClient.deleteUser({ callbackURL: '/' }))}
            >
              Delete my account and endpoints
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirm(true)}>
            Delete account
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
