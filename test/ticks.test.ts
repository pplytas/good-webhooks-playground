import { afterAll, beforeAll, expect, test } from 'vitest'
import { createGithubUser, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

test('tick windows are aligned to 5 minutes', async () => {
  const { tickWindow } = await import('../src/worker/ticks.ts')
  expect(tickWindow(new Date('2026-10-17T10:04:59.999Z')).toISOString()).toBe(
    '2026-10-17T10:00:00.000Z',
  )
  expect(tickWindow(new Date('2026-10-17T10:05:00.000Z')).toISOString()).toBe(
    '2026-10-17T10:05:00.000Z',
  )
})

test('a tick reaches each subscribed user once per window, and skips users without endpoints', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { pool } = await import('../src/server/db.ts')
  const { createPlaygroundDelivery } = await import('../src/server/delivery.ts')
  const { createBetterAuthManagement } = await import('good-webhooks/better-auth')
  const { publishTicks } = await import('../src/worker/ticks.ts')

  const subscribed = await createGithubUser()
  await createGithubUser() // signed in, no endpoints
  await auth().api.createWebhookEndpoint({
    headers: subscribed.headers,
    body: { url: 'https://receiver.example/hooks', eventTypes: ['clock.ticked'] },
  })
  const delivery = await createPlaygroundDelivery()
  const input = {
    database: pool(),
    delivery,
    source: (await createBetterAuthManagement(auth())).source,
  }
  const window = new Date('2026-10-17T10:00:00.000Z')

  // Application scope, plus the one subscribed user. The demo endpoint does not exist here.
  expect(await publishTicks(input, window)).toEqual({ scopes: 2, deliveries: 1 })
  // The same window again: the idempotency key accepts it as a duplicate.
  expect(await publishTicks(input, window)).toEqual({ scopes: 2, deliveries: 1 })
  const { rows } = await pool().query<{ count: number }>(
    'SELECT count(*)::int AS count FROM webhook_deliveries',
  )
  expect(rows[0]?.count).toBe(1)
})
