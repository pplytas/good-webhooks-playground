import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Badge } from '@/components/ui/badge'
import { formatAge } from '@/lib/format'
import { readStatus } from '@/server/status'

export const metadata: Metadata = { title: 'Status' }

const deliveryOrder = ['succeeded', 'failed', 'pending', 'in_flight', 'cancelled'] as const

async function Status() {
  await connection()
  const status = await readStatus()
  const now = status.checkedAt.getTime()
  const delivered = deliveryOrder.map((name) => [name, status.deliveries24h[name] ?? 0] as const)
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
        <dt className="text-muted-foreground">Endpoints</dt>
        <dd>
          {status.endpoints.active ?? 0} active, {status.endpoints.paused ?? 0} paused
        </dd>
      </dl>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Deliveries in the last 24 hours</h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {delivered.map(([name, count]) => (
            <div key={name} className="contents">
              <dt className="text-muted-foreground">{name.replace('_', ' ')}</dt>
              <dd>{count}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

export default function StatusPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Status</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading status…</p>}>
        <Status />
      </Suspense>
    </div>
  )
}
