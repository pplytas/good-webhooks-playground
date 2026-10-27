import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { EndpointStatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAge, formatDuration, formatTime } from '@/lib/format'
import { readReceivers, readStatus } from '@/server/status'

export const metadata: Metadata = { title: 'Status' }

const deliveryOrder = ['succeeded', 'failed', 'pending', 'in_flight', 'cancelled'] as const
const outcomes = [
  ['succeeded', 'succeeded'],
  ['retry', 'retried'],
  ['failed', 'failed'],
  ['abandoned', 'abandoned'],
  ['started', 'in progress'],
] as const

async function Status() {
  await connection()
  const status = await readStatus()
  const now = status.checkedAt.getTime()
  const { deliveries, oldestPendingAgeMs, attemptsLastHour } = status.stats
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <Badge variant={status.healthy ? 'default' : 'destructive'}>
          {status.healthy ? 'Healthy' : 'Degraded'}
        </Badge>
        <span className="text-sm text-muted-foreground">
          Healthy means the worker and the canary both reported in the last 15 minutes.
        </span>
      </div>
      <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[max-content_1fr]">
        <dt className="text-muted-foreground">Worker last seen</dt>
        <dd>{formatAge(status.workerSeenAt, now)}</dd>
        <dt className="text-muted-foreground">Canary last verified an event</dt>
        <dd>{formatAge(status.canaryReceivedAt, now)}</dd>
        <dt className="text-muted-foreground">Accounts</dt>
        <dd>{status.users}</dd>
        <dt className="text-muted-foreground">Visitor endpoints</dt>
        <dd>
          {status.endpoints.active ?? 0} active, {status.endpoints.paused ?? 0} paused
        </dd>
      </dl>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Receiver deliveries</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Deliveries to the Playground&apos;s own receivers (application scope), kept for 7 days.
        </p>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {deliveryOrder.map((name) => (
            <div key={name} className="contents">
              <dt className="text-muted-foreground">{name.replace('_', ' ')}</dt>
              <dd>{deliveries[name]}</dd>
            </div>
          ))}
          <dt className="text-muted-foreground">Oldest pending</dt>
          <dd>{oldestPendingAgeMs === null ? 'none' : formatDuration(oldestPendingAgeMs)}</dd>
          <dt className="text-muted-foreground">Attempts in the last hour</dt>
          <dd>
            {outcomes.map(([name, label]) => `${attemptsLastHour[name]} ${label}`).join(', ')}
          </dd>
        </dl>
      </section>
    </div>
  )
}

const count = (tally: Record<string, number>, ...names: string[]) =>
  names.reduce((sum, name) => sum + (tally[name] ?? 0), 0)

async function Receivers() {
  await connection()
  const rows = await readReceivers()
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">Playground receivers</h2>
      <p className="max-w-2xl text-sm text-muted-foreground">
        Endpoints the Playground answers itself. The canary and the demo receiver always succeed;
        the others fail on purpose so retries, timeouts, Retry-After, and automatic pauses keep
        happening. Paused gone and failing receivers are resumed after a day.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Receiver</TableHead>
            <TableHead>State</TableHead>
            <TableHead>Deliveries, 24 h</TableHead>
            <TableHead>Attempts, 24 h</TableHead>
            <TableHead>Latest error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.name} className="align-top">
              <TableCell>
                <span className="font-mono">{row.name}</span>
                <span className="block text-sm text-muted-foreground">{row.description}</span>
              </TableCell>
              <TableCell>
                <EndpointStatusBadge
                  status={row.status}
                  reason={row.pauseReason as 'owner' | 'failing' | 'gone' | null}
                />
              </TableCell>
              <TableCell className="text-sm">
                {count(row.deliveries, 'succeeded')} succeeded, {count(row.deliveries, 'failed')}{' '}
                failed, {count(row.deliveries, 'pending', 'in_flight')} open
              </TableCell>
              <TableCell className="text-sm">
                {count(row.attempts, 'succeeded')} ok, {count(row.attempts, 'retry')} retried,{' '}
                {count(row.attempts, 'failed')} failed
              </TableCell>
              <TableCell className="max-w-64 text-sm whitespace-normal text-muted-foreground">
                {row.lastError ? `${row.lastError.error} (${formatTime(row.lastError.at)})` : '–'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  )
}

export default function StatusPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Status</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading status…</p>}>
        <Status />
      </Suspense>
      <Suspense fallback={null}>
        <Receivers />
      </Suspense>
    </div>
  )
}
