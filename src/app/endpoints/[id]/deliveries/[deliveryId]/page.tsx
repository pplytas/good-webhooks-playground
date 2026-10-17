import { WebhookError } from 'good-webhooks'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { ReplayButton } from '@/components/replay-button'
import { DeliveryStatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/format'
import { delivery } from '@/server/delivery'
import { requireSession, userScope } from '@/server/session'

export const metadata: Metadata = { title: 'Delivery' }

async function Delivery({ params }: PageProps<'/endpoints/[id]/deliveries/[deliveryId]'>) {
  const session = await requireSession()
  const { id, deliveryId } = await params
  const engine = await delivery()
  const detail = await engine
    .forScope(userScope(session.user.id))
    .deliveries.get(deliveryId)
    .catch((error: unknown) => {
      if (error instanceof WebhookError && ['NOT_FOUND', 'INVALID_INPUT'].includes(error.code))
        notFound()
      throw error
    })
  if (detail.endpointId !== id) notFound()
  const replayable = detail.replayOf === null && ['succeeded', 'failed'].includes(detail.status)

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <Link
          href={`/endpoints/${id}`}
          className="text-sm text-muted-foreground underline underline-offset-4"
        >
          Back to the endpoint
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Delivery {detail.id}</h1>
          <DeliveryStatusBadge status={detail.status} />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted-foreground">Event ID</dt>
          <dd className="font-mono">{detail.eventId}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatTime(detail.createdAt)}</dd>
          {detail.status === 'pending' && (
            <>
              <dt className="text-muted-foreground">Next attempt</dt>
              <dd>{formatTime(detail.nextAttemptAt)}</dd>
            </>
          )}
          {detail.replayOf && (
            <>
              <dt className="text-muted-foreground">Replay of</dt>
              <dd>
                <Link
                  href={`/endpoints/${id}/deliveries/${detail.replayOf}`}
                  className="underline underline-offset-4"
                >
                  Delivery {detail.replayOf}
                </Link>
              </dd>
            </>
          )}
        </dl>
        {replayable && <ReplayButton deliveryId={detail.id} />}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Attempts</h2>
        {detail.attempts.length === 0 ? (
          <p className="text-muted-foreground">No attempts yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Outcome</TableHead>
                <TableHead>Response</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detail.attempts.map((attempt) => (
                <TableRow key={attempt.number} className="align-top">
                  <TableCell>{attempt.number}</TableCell>
                  <TableCell>
                    {formatTime(attempt.startedAt)}
                    {attempt.finishedAt && (
                      <span className="block text-sm text-muted-foreground">
                        {attempt.finishedAt.getTime() - attempt.startedAt.getTime()} ms
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{attempt.outcome}</TableCell>
                  <TableCell className="max-w-96 whitespace-normal">
                    <span className="block">
                      {attempt.responseStatus
                        ? `HTTP ${attempt.responseStatus}`
                        : (attempt.error ?? '–')}
                    </span>
                    {attempt.responseBody && (
                      <pre className="mt-1 max-h-40 overflow-auto bg-muted p-2 font-mono text-xs whitespace-pre-wrap break-all">
                        {attempt.responseBody}
                      </pre>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  )
}

export default function DeliveryPage(props: PageProps<'/endpoints/[id]/deliveries/[deliveryId]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading delivery…</p>}>
      <Delivery {...props} />
    </Suspense>
  )
}
