'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SecretReveal } from '@/components/secret-reveal'
import { Button } from '@/components/ui/button'
import type { TestEventResult } from 'good-webhooks'
import { authClient } from '@/lib/auth-client'

const transportErrors: Record<string, string> = {
  timeout: 'it did not answer within 10 seconds',
  dns_error: 'its host name did not resolve',
  network_error: 'the connection failed',
  unsafe_url: 'its address is not a public HTTPS destination',
}

export function EndpointActions({ id, status }: { id: string; status: 'active' | 'paused' }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [test, setTest] = useState<TestEventResult | null>(null)

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
            setTest(null)
            const { data, error: failure } = await authClient.goodWebhooks.sendTestEvent({ id })
            setPending(false)
            if (failure) return setError(failure.message ?? 'The test event could not be sent.')
            setTest(data)
          }}
        >
          Send test event
        </Button>
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
      {test && <TestEventOutcome result={test} />}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

/** What the receiver answered. A test creates no delivery, so this is the only record of it. */
function TestEventOutcome({ result }: { result: TestEventResult }) {
  const answer =
    result.responseStatus === null
      ? `No answer: ${transportErrors[result.error ?? ''] ?? 'the request failed'}`
      : `Your receiver answered HTTP ${result.responseStatus}`
  return (
    <div className="flex flex-col gap-1 text-sm" role="status">
      <p className={result.ok ? 'text-foreground' : 'text-destructive'}>
        {result.ok ? 'Test event accepted. ' : 'Test event failed. '}
        {answer} in {result.durationMs} ms.
      </p>
      {result.responseBody && (
        <pre className="max-h-40 overflow-auto rounded-md bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
          {result.responseBody}
        </pre>
      )}
    </div>
  )
}
