import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { createGithubUser, signedRequest, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
  const { ensureReceivers } = await import('../src/server/receivers.ts')
  await ensureReceivers()
})
afterAll(() => teardown())

const url = 'http://localhost:3000/api/demo'
const forgedSecret = `whsec_${Buffer.alloc(32, 1).toString('base64')}`

async function demoEndpointId() {
  const { receiverEndpoints } = await import('../src/server/receivers.ts')
  return (await receiverEndpoints()).find((receiver) => receiver.name === 'demo')!.endpointId
}

/** Publish ping.requested in the demo scope and return its event ID, read from delivery history. */
async function publishDemoPing() {
  const { delivery } = await import('../src/server/delivery.ts')
  const { demoScope } = await import('../src/server/demo.ts')
  const scoped = (await delivery()).forScope(demoScope)
  const requestedAt = new Date().toISOString()
  const { eventId } = await scoped.publish({ type: 'ping.requested', data: { requestedAt } })
  const { items } = await scoped.deliveries.list({ endpointId: await demoEndpointId(), eventId })
  expect(items).toHaveLength(1)
  return { eventId: items[0]!.eventId, requestedAt }
}

async function receiptRows(eventId: string) {
  const { pool } = await import('../src/server/db.ts')
  const { rows } = await pool().query<{
    delivery_id: string
    headers: Record<string, string>
    body: string
  }>('SELECT delivery_id, headers, body FROM playground_demo_receipt WHERE event_id = $1', [
    eventId,
  ])
  return rows
}

test('setup creates the demo endpoint in the demo scope, outside application scope', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { demoScope } = await import('../src/server/demo.ts')
  const { receiverSecret } = await import('../src/server/receivers.ts')
  const { createBetterAuthManagement } = await import('good-webhooks/better-auth')
  const management = await createBetterAuthManagement(auth())
  const id = await demoEndpointId()

  const endpoint = await management.get(demoScope, id)
  expect(endpoint.url).toBe(url)
  expect(endpoint.eventTypes).toEqual(['clock.ticked', 'ping.requested'])
  expect((await management.list(null)).map((item) => item.id)).not.toContain(id)
  expect(await receiverSecret('demo')).toMatch(/^whsec_/)
})

test('the demo receiver keeps the first signed request for a demo-scope event', async () => {
  const { receiverSecret } = await import('../src/server/receivers.ts')
  const { POST } = await import('../src/app/api/demo/route.ts')
  const secret = (await receiverSecret('demo'))!
  const { eventId, requestedAt } = await publishDemoPing()
  const event = { type: 'ping.requested', data: { requestedAt } }
  const request = signedRequest(url, secret, eventId, event, {
    'user-agent': 'good-webhooks-test',
    'x-forwarded-for': '203.0.113.7',
    cookie: 'session=private',
  })
  const body = await request.clone().text()

  expect((await POST(request)).status).toBe(204)
  const [row] = await receiptRows(eventId)
  expect(Object.keys(row!.headers).toSorted()).toEqual([
    'content-type',
    'user-agent',
    'webhook-id',
    'webhook-signature',
    'webhook-timestamp',
  ])
  expect(row!.headers['webhook-id']).toBe(eventId)
  expect(row!.headers['user-agent']).toBe('good-webhooks-test')
  expect(row!.body).toBe(body)
  expect(row!.delivery_id).toMatch(/\S/)

  // Anyone holding the public secret can sign a second request for the same event. It loses.
  const forged = { type: 'ping.requested', data: { requestedAt: '2000-01-01T00:00:00.000Z' } }
  expect((await POST(signedRequest(url, secret, eventId, forged))).status).toBe(204)
  expect(await receiptRows(eventId)).toEqual([row])
})

test('the demo receiver ignores unknown events and rejects bad signatures', async () => {
  const { receiverSecret } = await import('../src/server/receivers.ts')
  const { POST } = await import('../src/app/api/demo/route.ts')
  const secret = (await receiverSecret('demo'))!

  const unknown = randomUUID()
  expect((await POST(signedRequest(url, secret, unknown))).status).toBe(204)
  expect(await receiptRows(unknown)).toEqual([])

  const { eventId } = await publishDemoPing()
  expect((await POST(signedRequest(url, forgedSecret, eventId))).status).toBe(400)
  expect(await receiptRows(eventId)).toEqual([])
})

test('readDemo reads only the demo scope and shares one read for 5 seconds', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { delivery } = await import('../src/server/delivery.ts')
  const { readDemo } = await import('../src/server/demo.ts')
  const owner = await createGithubUser()
  await auth().api.createWebhookEndpoint({
    headers: owner.headers,
    body: { url: 'https://receiver.example/hooks', eventTypes: ['ping.requested'] },
  })
  const visitor = await (
    await delivery()
  )
    .forScope({ type: 'user', id: owner.user.id })
    .publish({ type: 'ping.requested', data: { requestedAt: new Date().toISOString() } })
  expect(visitor.deliveryCount).toBe(1)
  const { eventId } = await publishDemoPing()

  const now = Date.now()
  const demo = await readDemo(now)
  expect(demo).not.toBeNull()
  const endpointId = await demoEndpointId()
  expect(demo!.endpoint.id).toBe(endpointId)
  expect(demo!.secret).toMatch(/^whsec_/)
  expect(demo!.deliveries.length).toBeGreaterThan(0)
  expect(demo!.deliveries.every((item) => item.endpointId === endpointId)).toBe(true)
  expect(demo!.deliveries.map((item) => item.eventId)).toContain(eventId)
  expect(demo!.deliveries.map((item) => item.eventId)).not.toContain(visitor.eventId)
  // The receipt recorded in the earlier test is joined in.
  expect(Object.keys(demo!.receipts).length).toBeGreaterThan(0)
  expect(demo!.stats.deliveries.pending).toBe(demo!.deliveries.length)

  // Concurrent and repeat callers within 5 seconds share the same read; after that it reloads.
  expect(await readDemo(now + 4_999)).toBe(demo)
  expect(await readDemo(now + 5_000)).not.toBe(demo)
})

test('requestDemoEvent allows 3 per IP every 10 minutes and 60 an hour in total', async () => {
  const { pool } = await import('../src/server/db.ts')
  const { demoIpHash, requestDemoEvent } = await import('../src/server/demo.ts')
  const first = demoIpHash('203.0.113.7')
  expect(first).toMatch(/^[0-9a-f]{64}$/)
  expect(first).not.toBe(demoIpHash('203.0.113.8'))

  const now = new Date('2030-01-01T10:00:00.000Z')
  for (let index = 0; index < 3; index++)
    expect(await requestDemoEvent(first, now)).toEqual({ limited: false, deliveryCount: 1 })
  expect(await requestDemoEvent(first, now)).toEqual({ limited: 'ip' })
  expect(await requestDemoEvent(demoIpHash('203.0.113.8'), now)).toEqual({
    limited: false,
    deliveryCount: 1,
  })
  // Ten minutes later the first visitor may send again.
  const later = new Date(now.getTime() + 10 * 60 * 1000 + 1)
  expect(await requestDemoEvent(first, later)).toEqual({ limited: false, deliveryCount: 1 })

  // A day later, 60 requests from others in the past hour fill the shared cap.
  const busy = new Date('2030-01-02T10:00:00.000Z')
  await pool().query(
    `INSERT INTO playground_demo_request (ip_hash, created_at)
     SELECT 'other-' || n, $1::timestamptz - interval '30 minutes' FROM generate_series(1, 60) n`,
    [busy],
  )
  expect(await requestDemoEvent(demoIpHash('203.0.113.9'), busy)).toEqual({ limited: 'global' })
})
