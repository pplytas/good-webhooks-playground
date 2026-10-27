import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'
import { CreateEndpointForm } from '@/components/create-endpoint-form'
import { PingForm } from '@/components/ping-form'
import { EndpointStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { headers } from 'next/headers'
import { auth } from '@/server/auth'
import { delivery } from '@/server/delivery'
import { MAX_ENDPOINTS_PER_USER, MAX_PINGS_PER_HOUR } from '@/server/limits'
import { requireSession, userScope } from '@/server/session'

export const metadata: Metadata = { title: 'Endpoints' }

async function Endpoints() {
  const session = await requireSession()
  const requestHeaders = await headers()
  const endpoints = await auth().api.listWebhookEndpoints({ headers: requestHeaders, body: {} })
  const full = endpoints.length >= MAX_ENDPOINTS_PER_USER
  const stats =
    endpoints.length === 0
      ? null
      : await (await delivery()).forScope(userScope(session.user.id)).deliveries.stats()
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        {endpoints.length === 0 ? (
          <p className="text-muted-foreground">
            No endpoints yet. Add one below, and the next clock tick reaches it within 5 minutes.
          </p>
        ) : (
          <>
            {stats && (
              <p className="text-sm text-muted-foreground">
                Your deliveries: {stats.deliveries.succeeded} succeeded, {stats.deliveries.failed}{' '}
                failed, {stats.deliveries.pending + stats.deliveries.in_flight} pending.{' '}
                {Object.values(stats.attemptsLastHour).reduce((sum, n) => sum + n, 0)} attempts in
                the last hour.
              </p>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>URL</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {endpoints.map((endpoint) => (
                  <TableRow key={endpoint.id}>
                    <TableCell className="max-w-80 truncate">
                      <Link
                        href={`/endpoints/${endpoint.id}`}
                        className="font-medium underline underline-offset-4"
                      >
                        {endpoint.url}
                      </Link>
                      {endpoint.description && (
                        <span className="block truncate text-sm text-muted-foreground">
                          {endpoint.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {endpoint.eventTypes.join(', ')}
                    </TableCell>
                    <TableCell>
                      <EndpointStatusBadge status={endpoint.status} reason={endpoint.pauseReason} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Add an endpoint</CardTitle>
            <CardDescription>
              {full
                ? `You have ${MAX_ENDPOINTS_PER_USER} endpoints, the most an account can have. Delete one to add another.`
                : `HTTPS and a public address. ${endpoints.length} of ${MAX_ENDPOINTS_PER_USER} used.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateEndpointForm disabled={full} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Send a ping</CardTitle>
            <CardDescription>
              Publishes ping.requested to every active endpoint that subscribes to it. Up to{' '}
              {MAX_PINGS_PER_HOUR} an hour.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PingForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default function EndpointsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Endpoints</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading endpoints…</p>}>
        <Endpoints />
      </Suspense>
    </div>
  )
}
