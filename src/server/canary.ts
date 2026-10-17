import { symmetricDecrypt, symmetricEncrypt } from 'better-auth/crypto'
import { createBetterAuthManagement } from 'good-webhooks/better-auth'
import { eventTypes } from '../lib/event-types.ts'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { env } from './env.ts'

export const CANARY_PATH = '/api/canary'

/** Create the canary's application-scope endpoint once. Safe to run on every deploy. */
export async function ensureCanary(): Promise<'created' | 'exists'> {
  const existing = await pool().query('SELECT 1 FROM playground_canary')
  if (existing.rowCount) return 'exists'
  const management = await createBetterAuthManagement(auth())
  const { endpoint, secret } = await management.create(null, {
    url: new URL(CANARY_PATH, env().baseUrl).href,
    description: 'Playground canary',
    eventTypes: [...eventTypes],
  })
  const encrypted = await symmetricEncrypt({ key: env().authSecret, data: secret })
  const inserted = await pool().query(
    'INSERT INTO playground_canary (endpoint_id, encrypted_secret) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [endpoint.id, encrypted],
  )
  // A concurrent setup won the race. Retire the duplicate endpoint.
  if (!inserted.rowCount) await management.remove(null, endpoint.id)
  return inserted.rowCount ? 'created' : 'exists'
}

export async function canarySecret(): Promise<string | null> {
  const { rows } = await pool().query<{ encrypted_secret: string }>(
    'SELECT encrypted_secret FROM playground_canary',
  )
  if (!rows[0]) return null
  return symmetricDecrypt({ key: env().authSecret, data: rows[0].encrypted_secret })
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
