import { afterAll, beforeAll, expect, test } from 'vitest'
import { useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

test('readStatus reports application-scope stats with every status and outcome', async () => {
  const { delivery } = await import('../src/server/delivery.ts')
  const { ensureReceivers, receiverNames } = await import('../src/server/receivers.ts')
  const { readStatus } = await import('../src/server/status.ts')
  await ensureReceivers()
  // Every receiver subscribes to clock.ticked, so one tick makes one pending delivery each.
  await (
    await delivery()
  ).publish({
    type: 'clock.ticked',
    data: { tickedAt: '2026-10-27T10:00:00.000Z', intervalSeconds: 300 },
  })

  const { stats } = await readStatus()
  expect(stats.deliveries).toEqual({
    pending: receiverNames.length,
    in_flight: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0,
  })
  expect(stats.oldestPendingAgeMs).toBeGreaterThanOrEqual(0)
  expect(stats.attemptsLastHour).toEqual({
    started: 0,
    succeeded: 0,
    retry: 0,
    failed: 0,
    abandoned: 0,
  })
})

test('describeEvents lists both events with a JSON Schema each', async () => {
  const { describeEvents } = await import('good-webhooks')
  const { delivery } = await import('../src/server/delivery.ts')
  const { events } = await import('../src/server/events.ts')
  const catalog = (await delivery()).describeEvents()
  expect(catalog.map((entry) => entry.type)).toEqual(['clock.ticked', 'ping.requested'])
  for (const entry of catalog)
    expect(entry.schema).toMatchObject({
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
    })
  // The events page uses the standalone function, which needs no engine.
  expect(describeEvents(events)).toEqual(catalog)
})
