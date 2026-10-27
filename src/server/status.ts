import type { DeliveryStats } from 'good-webhooks'
import { createBetterAuthManagement } from 'good-webhooks/better-auth'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { delivery } from './delivery.ts'
import { receiverEndpoints, receivers, type ReceiverName } from './receivers.ts'

export const STALE_AFTER_MS = 15 * 60 * 1000

export interface PlaygroundStatus extends PlaygroundHealth {
  stats: DeliveryStats
  endpoints: Record<string, number>
  users: number
}

const tally = (rows: { status: string; count: number }[]) =>
  Object.fromEntries(rows.map((row) => [row.status, row.count]))

export interface PlaygroundHealth {
  healthy: boolean
  workerSeenAt: Date | null
  canaryReceivedAt: Date | null
  checkedAt: Date
}

/** Worker and canary liveness for /api/health. Two small reads, nothing else. */
export async function readHealth(now = Date.now()): Promise<PlaygroundHealth> {
  const database = pool()
  const [worker, canary] = await Promise.all([
    database.query<{ seen_at: Date | null }>(
      'SELECT max(seen_at) AS seen_at FROM playground_worker',
    ),
    database.query<{ received_at: Date | null }>(
      'SELECT max(received_at) AS received_at FROM playground_canary_receipt',
    ),
  ])
  const workerSeenAt = worker.rows[0]?.seen_at ?? null
  const canaryReceivedAt = canary.rows[0]?.received_at ?? null
  const fresh = (date: Date | null) => date !== null && now - date.getTime() <= STALE_AFTER_MS
  return {
    healthy: fresh(workerSeenAt) && fresh(canaryReceivedAt),
    workerSeenAt,
    canaryReceivedAt,
    checkedAt: new Date(now),
  }
}

/**
 * Live numbers for /status. `stats` comes from `deliveries.stats()` for the application scope,
 * so it covers the Playground's own receivers only. Visitor endpoint counts and the account
 * count come from SQL.
 */
export async function readStatus(now = Date.now()): Promise<PlaygroundStatus> {
  const database = pool()
  const [health, stats, endpoints, users] = await Promise.all([
    readHealth(now),
    delivery().then((engine) => engine.deliveries.stats()),
    database.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM "webhookEndpoint"
       WHERE status <> 'deleted' AND id NOT IN (SELECT endpoint_id FROM playground_receiver)
       GROUP BY status`,
    ),
    database.query<{ count: number }>('SELECT count(*)::int AS count FROM "user"'),
  ])
  return {
    ...health,
    stats,
    endpoints: tally(endpoints.rows),
    users: users.rows[0]?.count ?? 0,
  }
}

export interface ReceiverStatus {
  name: ReceiverName
  description: string
  status: 'active' | 'paused' | 'deleted'
  pauseReason: string | null
  deliveries: Record<string, number>
  attempts: Record<string, number>
  lastError: { at: Date; error: string } | null
}

const forEndpoint = (rows: { endpoint_id: string; status: string; count: number }[], id: string) =>
  tally(rows.filter((row) => row.endpoint_id === id))

/**
 * Per-receiver state and the last 24 hours of deliveries and attempt outcomes. SQL, because
 * `deliveries.stats()` has no per-endpoint variant.
 */
export async function readReceivers(): Promise<ReceiverStatus[]> {
  const list = await receiverEndpoints()
  const ids = list.map((item) => item.endpointId)
  const database = pool()
  const [management, deliveries, attempts, errors] = await Promise.all([
    createBetterAuthManagement(auth()),
    database.query<{ endpoint_id: string; status: string; count: number }>(
      `SELECT endpoint_id, status, count(*)::int AS count FROM webhook_deliveries
       WHERE endpoint_id = ANY($1) AND created_at > now() - interval '24 hours'
       GROUP BY endpoint_id, status`,
      [ids],
    ),
    database.query<{ endpoint_id: string; status: string; count: number }>(
      `SELECT d.endpoint_id, a.outcome AS status, count(*)::int AS count
       FROM webhook_attempts a JOIN webhook_deliveries d ON d.id = a.delivery_id
       WHERE d.endpoint_id = ANY($1) AND a.started_at > now() - interval '24 hours'
       GROUP BY d.endpoint_id, a.outcome`,
      [ids],
    ),
    database.query<{ endpoint_id: string; started_at: Date; error: string }>(
      `SELECT DISTINCT ON (d.endpoint_id) d.endpoint_id, a.started_at, a.error
       FROM webhook_attempts a JOIN webhook_deliveries d ON d.id = a.delivery_id
       WHERE d.endpoint_id = ANY($1) AND a.error IS NOT NULL
       ORDER BY d.endpoint_id, a.started_at DESC`,
      [ids],
    ),
  ])
  return Promise.all(
    list.map(async ({ name, endpointId }) => {
      const endpoint = await management.get(receivers[name].scope, endpointId)
      const failure = errors.rows.find((row) => row.endpoint_id === endpointId)
      return {
        name,
        description: receivers[name].description,
        status: endpoint.status,
        pauseReason: endpoint.pauseReason ?? null,
        deliveries: forEndpoint(deliveries.rows, endpointId),
        attempts: forEndpoint(attempts.rows, endpointId),
        lastError: failure ? { at: failure.started_at, error: failure.error } : null,
      }
    }),
  )
}
