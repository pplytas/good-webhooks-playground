import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

/** Sign like a Standard Webhooks sender: HMAC-SHA256 over "id.timestamp.body". */
function signedRequest(url: string, secret: string, id = randomUUID()) {
  const body = JSON.stringify({
    id,
    type: 'clock.ticked',
    occurredAt: new Date().toISOString(),
    data: { tickedAt: '2026-10-17T10:00:00.000Z', intervalSeconds: 300 },
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Request(url, {
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
const forgedSecret = `whsec_${Buffer.alloc(32, 1).toString('base64')}`

test('setup creates each receiver endpoint once', async () => {
  const { ensureReceivers, receiverNames, receiverSecret } =
    await import('../src/server/receivers.ts')
  expect(await ensureReceivers()).toEqual(receiverNames)
  expect(await ensureReceivers()).toEqual([])
  for (const name of receiverNames) expect(await receiverSecret(name)).toMatch(/^whsec_/)
})

test('the canary records a verified event once and rejects a bad signature', async () => {
  const { pool } = await import('../src/server/db.ts')
  const { receiverSecret } = await import('../src/server/receivers.ts')
  const { POST } = await import('../src/app/api/canary/route.ts')
  const secret = (await receiverSecret('canary'))!
  const id = randomUUID()
  const url = 'http://localhost:3000/api/canary'

  expect((await POST(signedRequest(url, secret, id))).status).toBe(204)
  expect((await POST(signedRequest(url, secret, id))).status).toBe(204)
  const { rows } = await pool().query<{ count: number }>(
    'SELECT count(*)::int AS count FROM playground_canary_receipt WHERE event_id = $1',
    [id],
  )
  expect(rows[0]?.count).toBe(1)
  expect((await POST(signedRequest(url, forgedSecret))).status).toBe(400)
})

test('chaos receivers verify first, then fail on purpose', async () => {
  const { receiverSecret } = await import('../src/server/receivers.ts')
  const { POST } = await import('../src/app/api/receivers/[mode]/route.ts')
  const call = async (mode: string, secret: string) =>
    (
      await POST(signedRequest(`http://localhost:3000/api/receivers/${mode}`, secret), {
        params: Promise.resolve({ mode }),
      })
    ).status

  expect(await call('gone', (await receiverSecret('gone'))!)).toBe(410)
  expect(await call('failing', (await receiverSecret('failing'))!)).toBe(500)
  expect(await call('failing', forgedSecret)).toBe(400)
  expect(await call('canary', forgedSecret)).toBe(404)
})

test('paused gone and failing receivers are resumed after a day, others are left alone', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { receiverEndpoints, resumePausedReceivers } = await import('../src/server/receivers.ts')
  const { createBetterAuthManagement } = await import('good-webhooks/better-auth')
  const management = await createBetterAuthManagement(auth())
  const ids = Object.fromEntries((await receiverEndpoints()).map((r) => [r.name, r.endpointId]))
  for (const name of ['gone', 'flaky']) await management.pause(null, ids[name]!)

  expect(await resumePausedReceivers()).toEqual([])
  expect(await resumePausedReceivers(Date.now() + 25 * 60 * 60 * 1000)).toEqual(['gone'])
  expect((await management.get(null, ids.gone!)).status).toBe('active')
  expect((await management.get(null, ids.flaky!)).status).toBe('paused')
})
