import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { createBetterAuthManagement } from 'good-webhooks/better-auth'
import { eventTypes } from '../lib/event-types.ts'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { env } from './env.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The demo receiver's named scope. Better Auth has no scope policy for it, so signed-in users
 * cannot reach it through the plugin's routes; only the Playground's own code reads it.
 */
export const demoScope = { type: 'demo', id: 'public' } as const

/**
 * Endpoints the Playground answers itself. The canary always succeeds; the chaos receivers fail
 * on purpose so retries, timeouts, Retry-After, and pauses keep happening. These live in
 * application scope. The demo receiver lives in the demo scope, and its secret is public.
 */
export const receivers = {
  canary: { path: '/api/canary', description: 'Always succeeds', resumeAfterMs: null, scope: null },
  flaky: {
    path: '/api/receivers/flaky',
    description: 'Answers 500 30% of the time',
    resumeAfterMs: null,
    scope: null,
  },
  slow: {
    path: '/api/receivers/slow',
    description: 'Outlasts the 10 s timeout 20% of the time',
    resumeAfterMs: null,
    scope: null,
  },
  busy: {
    path: '/api/receivers/busy',
    description: 'Answers 429 with Retry-After: 60 25% of the time',
    resumeAfterMs: null,
    scope: null,
  },
  gone: {
    path: '/api/receivers/gone',
    description: 'Always answers 410',
    resumeAfterMs: DAY_MS,
    scope: null,
  },
  failing: {
    path: '/api/receivers/failing',
    description: 'Always answers 500',
    resumeAfterMs: DAY_MS,
    scope: null,
  },
  demo: {
    path: '/api/demo',
    description: 'Public demo receiver',
    resumeAfterMs: null,
    scope: demoScope,
  },
} as const
export type ReceiverName = keyof typeof receivers
export const receiverNames = Object.keys(receivers) as ReceiverName[]

const management = () => createBetterAuthManagement(auth())

/** Create any missing receiver endpoint. Safe to run on every deploy. */
export async function ensureReceivers(): Promise<ReceiverName[]> {
  const { rows } = await pool().query<{ name: string }>('SELECT name FROM playground_receiver')
  const existing = new Set(rows.map((row) => row.name))
  const created: ReceiverName[] = []
  for (const name of receiverNames) {
    if (existing.has(name)) continue
    const providers = await management()
    const { scope } = receivers[name]
    const { endpoint, secret } = await providers.create(scope, {
      url: new URL(receivers[name].path, env().baseUrl).href,
      description: `Playground ${name} receiver`,
      // The canary and the demo hear everything; chaos receivers only need the steady ticks.
      eventTypes: name === 'canary' || name === 'demo' ? [...eventTypes] : ['clock.ticked'],
    })
    const encrypted = await symmetricEncrypt({ key: env().authSecret, data: secret })
    const inserted = await pool().query(
      `INSERT INTO playground_receiver (name, endpoint_id, encrypted_secret) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO NOTHING`,
      [name, endpoint.id, encrypted],
    )
    // A concurrent setup won the race. Retire the duplicate endpoint.
    if (!inserted.rowCount) await providers.remove(scope, endpoint.id)
    else created.push(name)
  }
  return created
}

export async function receiverSecret(name: ReceiverName): Promise<string | null> {
  const { rows } = await pool().query<{ encrypted_secret: string }>(
    'SELECT encrypted_secret FROM playground_receiver WHERE name = $1',
    [name],
  )
  if (!rows[0]) return null
  return symmetricDecrypt({ key: env().authSecret, data: rows[0].encrypted_secret })
}

export async function receiverEndpoints(): Promise<{ name: ReceiverName; endpointId: string }[]> {
  const { rows } = await pool().query<{ name: ReceiverName; endpoint_id: string }>(
    'SELECT name, endpoint_id FROM playground_receiver',
  )
  return rows
    .filter((row) => row.name in receivers)
    .map((row) => ({ name: row.name, endpointId: row.endpoint_id }))
    .toSorted((a, b) => receiverNames.indexOf(a.name) - receiverNames.indexOf(b.name))
}

/** Resume chaos receivers that have stayed paused long enough, so their failures repeat. */
export async function resumePausedReceivers(now = Date.now()): Promise<ReceiverName[]> {
  const providers = await management()
  const resumed: ReceiverName[] = []
  for (const { name, endpointId } of await receiverEndpoints()) {
    const after = receivers[name].resumeAfterMs
    if (after === null) continue
    const { scope } = receivers[name]
    const endpoint = await providers.get(scope, endpointId)
    if (endpoint.status !== 'paused' || now - endpoint.updatedAt.getTime() < after) continue
    await providers.resume(scope, endpointId)
    resumed.push(name)
  }
  return resumed
}

export async function recordCanaryReceipt(event: {
  id: string
  type: string
  occurredAt: string
}): Promise<void> {
  await pool().query(
    `INSERT INTO playground_canary_receipt (event_id, event_type, occurred_at)
     VALUES ($1, $2, $3) ON CONFLICT (event_id) DO NOTHING`,
    [event.id, event.type, event.occurredAt],
  )
}
