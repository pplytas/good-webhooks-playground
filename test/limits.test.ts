import { afterAll, beforeAll, expect, test } from 'vitest'
import { createGithubUser, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

test('an account can have at most 3 endpoints', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { headers } = await createGithubUser()
  const create = (n: number) =>
    auth().api.createWebhookEndpoint({
      headers,
      body: { url: `https://receiver.example/${n}`, eventTypes: ['ping.requested'] },
    })
  for (const n of [1, 2, 3]) await create(n)
  await expect(create(4)).rejects.toMatchObject({ status: 'FORBIDDEN' })

  // Deleting one frees a slot.
  const [first] = await auth().api.listWebhookEndpoints({ headers, body: {} })
  await auth().api.removeWebhookEndpoint({ headers, body: { id: first!.id } })
  await expect(create(5)).resolves.toMatchObject({ endpoint: { status: 'active' } })
})

test('a user can send 10 pings an hour', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { requestPing } = await import('../src/server/pings.ts')
  const { user, headers } = await createGithubUser()
  await auth().api.createWebhookEndpoint({
    headers,
    body: { url: 'https://receiver.example/pings', eventTypes: ['ping.requested'] },
  })
  const start = new Date('2026-10-17T10:00:00.000Z')
  const at = (minutes: number) => new Date(start.getTime() + minutes * 60_000)

  for (let n = 0; n < 10; n++)
    expect(await requestPing(user.id, at(n))).toEqual({ limited: false, deliveryCount: 1 })
  expect(await requestPing(user.id, at(30))).toEqual({ limited: true })
  // An hour after the first ping, one slot opens.
  expect(await requestPing(user.id, at(60.5))).toEqual({ limited: false, deliveryCount: 1 })
})
