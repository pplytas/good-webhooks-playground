import { afterAll, beforeAll, expect, test } from 'vitest'
import { createGithubUser, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

const hour = 60 * 60 * 1000

async function createEndpoint() {
  const { auth } = await import('../src/server/auth.ts')
  const owner = await createGithubUser()
  const { endpoint } = await auth().api.createWebhookEndpoint({
    headers: owner.headers,
    body: { url: 'https://receiver.example/replay', eventTypes: ['ping.requested'] },
  })
  return { ...owner, endpoint }
}

test('replaying an endpoint with no failed deliveries replays nothing', async () => {
  const { replayFailedSince } = await import('../src/server/replay.ts')
  const { requestPing } = await import('../src/server/pings.ts')
  const { user, endpoint } = await createEndpoint()
  // A pending delivery is not failed, so bulk replay leaves it alone.
  await requestPing(user.id)
  const since = new Date(Date.now() - 24 * hour).toISOString()
  expect(await replayFailedSince(user.id, endpoint.id, since)).toEqual({
    ok: true,
    message: 'No failed deliveries since then.',
    replayed: 0,
    skipped: 0,
  })
})

test('a paused endpoint must be resumed first', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { replayFailedSince } = await import('../src/server/replay.ts')
  const { user, headers, endpoint } = await createEndpoint()
  await auth().api.pauseWebhookEndpoint({ headers, body: { id: endpoint.id } })
  const since = new Date(Date.now() - hour).toISOString()
  expect(await replayFailedSince(user.id, endpoint.id, since)).toMatchObject({
    ok: false,
    message: 'Resume the endpoint before replaying.',
  })
})

test("another owner's endpoint is not found", async () => {
  const { replayFailedSince } = await import('../src/server/replay.ts')
  const { endpoint } = await createEndpoint()
  const { user: stranger } = await createGithubUser()
  const since = new Date(Date.now() - hour).toISOString()
  expect(await replayFailedSince(stranger.id, endpoint.id, since)).toMatchObject({
    ok: false,
    message: 'This endpoint was deleted or does not exist.',
  })
})

test('an invalid, future, or too old time is rejected before replaying', async () => {
  const { replayFailedSince } = await import('../src/server/replay.ts')
  const { user, endpoint } = await createEndpoint()
  const now = new Date('2026-10-26T12:00:00.000Z')
  const attempt = (since: unknown) => replayFailedSince(user.id, endpoint.id, since, now)
  expect(await attempt('yesterday')).toMatchObject({
    ok: false,
    message: 'Pick a valid date and time.',
  })
  expect(await attempt(12)).toMatchObject({ ok: false, message: 'Pick a valid date and time.' })
  expect(await attempt('2026-10-26T12:01:00.000Z')).toMatchObject({
    ok: false,
    message: 'Pick a time in the past.',
  })
  expect(await attempt('2026-10-19T11:59:00.000Z')).toMatchObject({
    ok: false,
    message: 'Pick a time within the last 7 days. Older deliveries are gone.',
  })
  // The boundary itself is allowed.
  expect(await attempt('2026-10-19T12:00:00.000Z')).toMatchObject({ ok: true, replayed: 0 })
})
