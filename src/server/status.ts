import { pool } from './db.ts'

export const STALE_AFTER_MS = 15 * 60 * 1000

export interface PlaygroundStatus {
  healthy: boolean
  workerSeenAt: Date | null
  canaryReceivedAt: Date | null
  deliveries24h: Record<string, number>
  endpoints: Record<string, number>
  users: number
  checkedAt: Date
}

const tally = (rows: { status: string; count: number }[]) =>
  Object.fromEntries(rows.map((row) => [row.status, row.count]))

/** Live numbers for /status and /api/health. Reads the tables directly; there is no stats API. */
export async function readStatus(now = Date.now()): Promise<PlaygroundStatus> {
  const database = pool()
  const [worker, canary, deliveries, endpoints, users] = await Promise.all([
    database.query<{ seen_at: Date | null }>(
      'SELECT max(seen_at) AS seen_at FROM playground_worker',
    ),
    database.query<{ received_at: Date | null }>(
      'SELECT max(received_at) AS received_at FROM playground_canary_receipt',
    ),
    database.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM webhook_deliveries
       WHERE created_at > now() - interval '24 hours' GROUP BY status`,
    ),
    database.query<{ status: string; count: number }>(
      `SELECT status, count(*)::int AS count FROM "webhookEndpoint"
       WHERE status <> 'deleted' GROUP BY status`,
    ),
    database.query<{ count: number }>('SELECT count(*)::int AS count FROM "user"'),
  ])
  const workerSeenAt = worker.rows[0]?.seen_at ?? null
  const canaryReceivedAt = canary.rows[0]?.received_at ?? null
  const fresh = (date: Date | null) => date !== null && now - date.getTime() <= STALE_AFTER_MS
  return {
    healthy: fresh(workerSeenAt) && fresh(canaryReceivedAt),
    workerSeenAt,
    canaryReceivedAt,
    deliveries24h: tally(deliveries.rows),
    endpoints: tally(endpoints.rows),
    users: users.rows[0]?.count ?? 0,
    checkedAt: new Date(now),
  }
}
