import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

/** Sign like a Standard Webhooks sender: HMAC-SHA256 over "id.timestamp.body". */
function signedRequest(secret: string, body: string, id = randomUUID()) {
  const timestamp = Math.floor(Date.now() / 1000)
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Request('http://localhost:3000/api/canary', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
    },
    body,
  })
}

test('setup creates the canary endpoint once and keeps its secret', async () => {
  const { canarySecret, ensureCanary } = await import('../src/server/canary.ts')
  expect(await ensureCanary()).toBe('created')
  expect(await ensureCanary()).toBe('exists')
  expect(await canarySecret()).toMatch(/^whsec_/)
})

test('the canary records a verified event once and rejects a bad signature', async () => {
  const { canarySecret, ensureCanary } = await import('../src/server/canary.ts')
  const { pool } = await import('../src/server/db.ts')
  const { POST } = await import('../src/app/api/canary/route.ts')
  await ensureCanary()
  const secret = (await canarySecret())!
  const id = randomUUID()
  const body = JSON.stringify({
    id,
    type: 'clock.ticked',
    occurredAt: new Date().toISOString(),
    data: { tickedAt: '2026-10-17T10:00:00.000Z', intervalSeconds: 300 },
  })

  expect((await POST(signedRequest(secret, body, id))).status).toBe(204)
  expect((await POST(signedRequest(secret, body, id))).status).toBe(204)
  const { rows } = await pool().query<{ count: number }>(
    'SELECT count(*)::int AS count FROM playground_canary_receipt WHERE event_id = $1',
    [id],
  )
  expect(rows[0]?.count).toBe(1)

  const forged = signedRequest(`whsec_${Buffer.alloc(32, 1).toString('base64')}`, body)
  expect((await POST(forged)).status).toBe(400)
})
