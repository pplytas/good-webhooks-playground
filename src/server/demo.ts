import { createHmac } from 'node:crypto'
import type { Delivery, DeliveryStats } from 'good-webhooks'
import { pool } from './db.ts'
import { delivery } from './delivery.ts'
import { env } from './env.ts'
import { MAX_DEMO_EVENTS_PER_HOUR, MAX_DEMO_EVENTS_PER_IP_PER_10_MIN } from './limits.ts'
import { demoScope, receivers, receiverSecret } from './receivers.ts'

/** The only request headers a receipt keeps. Everything else the request carried is dropped. */
export const receiptHeaders = [
  'webhook-id',
  'webhook-timestamp',
  'webhook-signature',
  'content-type',
  'user-agent',
] as const
export const MAX_RECEIPT_BODY_BYTES = 4 * 1024
/** Each kept header value is cut here, so a forged request cannot fill the page. */
export const MAX_RECEIPT_HEADER_CHARS = 256
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface DemoReceipt {
  eventId: string
  deliveryId: string | null
  headers: Partial<Record<(typeof receiptHeaders)[number], string>>
  body: string
  receivedAt: Date
}

async function demoEndpointId(): Promise<string | null> {
  const { rows } = await pool().query<{ endpoint_id: string }>(
    "SELECT endpoint_id FROM playground_receiver WHERE name = 'demo'",
  )
  return rows[0]?.endpoint_id ?? null
}

/**
 * Keep a verified request to the demo receiver, but only for an event the demo scope published.
 * The demo secret is public, so anyone can sign a request; this check keeps forged requests off
 * the page. The first request for an event wins, so a later forgery cannot replace it.
 */
export async function recordDemoReceipt(
  eventId: string,
  request: { headers: Headers; body: Uint8Array },
): Promise<void> {
  // Playground event IDs are UUIDs. Anything else is a forgery, and would make list() throw.
  if (!uuid.test(eventId) || request.body.byteLength > MAX_RECEIPT_BODY_BYTES) return
  const endpointId = await demoEndpointId()
  if (!endpointId) return
  const { items } = await (
    await delivery()
  )
    .forScope(demoScope)
    .deliveries.list({ endpointId, eventId, limit: 1 })
  const match = items[0]
  if (!match) return
  const headers = Object.fromEntries(
    receiptHeaders.flatMap((name) => {
      const value = request.headers.get(name)
      return value === null ? [] : [[name, value.slice(0, MAX_RECEIPT_HEADER_CHARS)]]
    }),
  )
  await pool().query(
    `INSERT INTO playground_demo_receipt (event_id, delivery_id, headers, body)
     VALUES ($1, $2, $3, $4) ON CONFLICT (event_id) DO NOTHING`,
    [eventId, match.id, JSON.stringify(headers), new TextDecoder().decode(request.body)],
  )
}

export interface DemoView {
  endpointId: string
  url: string
  secret: string
  deliveries: Delivery[]
  stats: DeliveryStats
  /** Receipts for the listed deliveries, by event ID. */
  receipts: Record<string, DemoReceipt>
}

async function loadDemo(): Promise<DemoView | null> {
  const [endpointId, secret] = await Promise.all([demoEndpointId(), receiverSecret('demo')])
  if (!endpointId || !secret) return null
  const scoped = (await delivery()).forScope(demoScope)
  const [page, stats] = await Promise.all([
    scoped.deliveries.list({ endpointId, limit: 10 }),
    scoped.deliveries.stats(),
  ])
  const { rows } = await pool().query<{
    event_id: string
    delivery_id: string | null
    headers: DemoReceipt['headers']
    body: string
    received_at: Date
  }>(
    `SELECT event_id, delivery_id, headers, body, received_at FROM playground_demo_receipt
     WHERE event_id = ANY($1)`,
    [page.items.map((item) => item.eventId)],
  )
  return {
    endpointId,
    // The same URL setup registered, so the page needs no management read.
    url: new URL(receivers.demo.path, env().baseUrl).href,
    secret,
    deliveries: page.items,
    stats,
    receipts: Object.fromEntries(
      rows.map((row) => [
        row.event_id,
        {
          eventId: row.event_id,
          deliveryId: row.delivery_id,
          headers: row.headers,
          body: row.body,
          receivedAt: row.received_at,
        },
      ]),
    ),
  }
}

const DEMO_CACHE_MS = 5_000
let cached: { at: number; promise: Promise<DemoView | null> } | undefined

/**
 * Everything the public demo page shows, read from the demo scope and the demo endpoint only.
 * The page is public and refreshes itself, so this process shares one read for 5 seconds:
 * concurrent callers await the same promise, and a burst of visitors costs at most one read
 * every 5 seconds per web process. A failed read is not cached.
 */
export function readDemo(now = Date.now()): Promise<DemoView | null> {
  if (cached && now - cached.at < DEMO_CACHE_MS) return cached.promise
  const promise = loadDemo()
  cached = { at: now, promise }
  promise.catch(() => {
    if (cached?.promise === promise) cached = undefined
  })
  return promise
}

/** Key a visitor's IP with the auth secret, so the raw address is never stored. */
export function demoIpHash(ip: string): string {
  return createHmac('sha256', env().authSecret).update(ip).digest('hex')
}

export type DemoEventResult =
  { limited: 'ip' } | { limited: 'global' } | { limited: false; deliveryCount: number }

/**
 * Publish ping.requested in the demo scope for a signed-out visitor. Each hashed IP gets
 * MAX_DEMO_EVENTS_PER_IP_PER_10_MIN every 10 minutes, and everyone together gets
 * MAX_DEMO_EVENTS_PER_HOUR an hour.
 */
export async function requestDemoEvent(ipHash: string, now = new Date()): Promise<DemoEventResult> {
  const engine = await delivery()
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    // One global lock: the hourly cap is shared, so every request must see every other one.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('playground:demo'))")
    const { rows } = await client.query<{ ip: number; total: number }>(
      `SELECT count(*) FILTER (WHERE ip_hash = $1 AND created_at > $2::timestamptz - interval '10 minutes')::int AS ip,
              count(*)::int AS total
       FROM playground_demo_request WHERE created_at > $2::timestamptz - interval '1 hour'`,
      [ipHash, now],
    )
    const limited =
      (rows[0]?.ip ?? 0) >= MAX_DEMO_EVENTS_PER_IP_PER_10_MIN
        ? 'ip'
        : (rows[0]?.total ?? 0) >= MAX_DEMO_EVENTS_PER_HOUR
          ? 'global'
          : null
    if (limited) {
      await client.query('ROLLBACK')
      return { limited }
    }
    await client.query(
      'INSERT INTO playground_demo_request (ip_hash, created_at) VALUES ($1, $2)',
      [ipHash, now],
    )
    // Same transaction: the request counts only if the event is accepted.
    const result = await engine
      .forScope(demoScope)
      .publish(
        { type: 'ping.requested', data: { requestedAt: now.toISOString() } },
        { transaction: client },
      )
    await client.query('COMMIT')
    // Show the new delivery on the next render. The caps above bound how often this happens.
    cached = undefined
    return { limited: false, deliveryCount: result.deliveryCount }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
