'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SecretReveal } from '@/components/secret-reveal'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function EndpointActions({ id, status }: { id: string; status: 'active' | 'paused' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  async function run(operation: () => Promise<{ error: { message?: string } | null }>) {
    setPending(true)
    setError(null)
    const { error: failure } = await operation()
    setPending(false)
    if (failure) setError(failure.message ?? 'The request failed.')
    return !failure
  }

  if (secret) return <SecretReveal secret={secret} onDone={() => setSecret(null)} />

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {status === 'active' ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () =>
              (await run(() => authClient.goodWebhooks.pause({ id }))) && router.refresh()
            }
          >
            Pause
          </Button>
        ) : (
          <Button
            disabled={pending}
            onClick={async () =>
              (await run(() => authClient.goodWebhooks.resume({ id }))) && router.refresh()
            }
          >
            Resume
          </Button>
        )}
        <Button
          variant="outline"
          disabled={pending}
          onClick={async () => {
            setPending(true)
            setError(null)
            const { data, error: failure } = await authClient.goodWebhooks.rotateSecret({ id })
            setPending(false)
            if (failure) return setError(failure.message ?? 'The secret could not be rotated.')
            setSecret(data.secret)
          }}
        >
          Rotate secret
        </Button>
        {confirmDelete ? (
          <>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (await run(() => authClient.goodWebhooks.remove({ id })))
                  router.push('/endpoints')
              }}
            >
              Delete for good
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </>
        ) : (
          <Button variant="ghost" disabled={pending} onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Rotating keeps the old secret valid for 24 hours, and both sign each request.
      </p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}
