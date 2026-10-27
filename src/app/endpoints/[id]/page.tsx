import { APIError } from 'better-auth/api'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { EndpointActions } from '@/components/endpoint-actions'
import { ReplayFailedForm } from '@/components/replay-failed-form'
import { DeliveryStatusBadge, EndpointStatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/format'
import { auth } from '@/server/auth'
import { delivery } from '@/server/delivery'
import { requireSession, userScope } from '@/server/session'

export const metadata: Metadata = { title: 'Endpoint' }

async function loadEndpoint(id: string) {
  try {
    const requestHeaders = await headers()
    return await auth().api.getWebhookEndpoint({ headers: requestHeaders, body: { id } })
  } catch (error) {
    if (error instanceof APIError && error.status === 'NOT_FOUND') notFound()
    throw error
  }
}

async function Endpoint({ params, searchParams }: PageProps<'/endpoints/[id]'>) {
  const session = await requireSession()
  const { id } = await params
  const before = (await searchParams).before
  const endpoint = await loadEndpoint(id)
  const cursor = typeof before === 'string' && /^\d{1,19}$/.test(before) ? before : undefined
  const page = await (
    await delivery()
  )
    .forScope(userScope(session.user.id))
    .deliveries.list({ endpointId: id, limit: 25, ...(cursor ? { before: cursor } : {}) })

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all text-2xl font-semibold">{endpoint.url}</h1>
          <EndpointStatusBadge status={endpoint.status} reason={endpoint.pauseReason} />
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[max-content_1fr]">
          {endpoint.description && (
            <>
              <dt className="text-muted-foreground">Description</dt>
              <dd>{endpoint.description}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Events</dt>
          <dd className="font-mono">{endpoint.eventTypes.join(', ')}</dd>
          {Object.keys(endpoint.headers).length > 0 && (
            <>
              <dt className="text-muted-foreground">Headers</dt>
              <dd className="font-mono break-all whitespace-pre-line">
                {Object.entries(endpoint.headers)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join('\n')}
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Endpoint ID</dt>
          <dd className="font-mono">{endpoint.id}</dd>
          <dt className="text-muted-foreground">Created</dt>
          <dd>{formatTime(endpoint.createdAt)}</dd>
        </dl>
        {endpoint.status !== 'deleted' && (
          <EndpointActions id={endpoint.id} status={endpoint.status} />
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Deliveries</h2>
        {endpoint.status === 'active' && <ReplayFailedForm endpointId={endpoint.id} />}
        {page.items.length === 0 ? (
          <p className="text-muted-foreground">
            {cursor
              ? 'No older deliveries.'
              : 'No deliveries yet. The next clock tick is at most 5 minutes away.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link
                      href={`/endpoints/${id}/deliveries/${item.id}`}
                      className="underline underline-offset-4"
                    >
                      {formatTime(item.createdAt)}
                    </Link>
                    {item.replayOf && (
                      <span className="ml-2 text-sm text-muted-foreground">replay</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{item.eventType}</TableCell>
                  <TableCell>
                    <DeliveryStatusBadge status={item.status} />
                  </TableCell>
                  <TableCell>{item.attemptCount}</TableCell>
                  <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                    {item.lastError ?? (item.lastStatus ? `HTTP ${item.lastStatus}` : '–')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="flex gap-2">
          {cursor && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/endpoints/${id}`} />}
            >
              Newest
            </Button>
          )}
          {page.nextCursor && (
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/endpoints/${id}?before=${page.nextCursor}`} />}
            >
              Older
            </Button>
          )}
        </div>
      </section>
    </div>
  )
}

export default function EndpointPage(props: PageProps<'/endpoints/[id]'>) {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Loading endpoint…</p>}>
      <Endpoint {...props} />
    </Suspense>
  )
}
