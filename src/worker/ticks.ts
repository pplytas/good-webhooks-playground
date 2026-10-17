import type { EndpointSource } from 'good-webhooks/delivery'
import type { Pool } from 'pg'
import type { PlaygroundDelivery } from '../server/delivery.ts'
import { TICK_INTERVAL_SECONDS } from '../server/events.ts'

/** The start of the tick window containing `now`. */
export function tickWindow(now: Date): Date {
  const size = TICK_INTERVAL_SECONDS * 1000
  return new Date(Math.floor(now.getTime() / size) * size)
}

/**
 * Publish one tick to the canary (application scope) and to every user with a subscribed endpoint.
 * The idempotency key makes repeats for the same window harmless, across restarts and replicas.
 */
export async function publishTicks(
  input: { database: Pool; delivery: PlaygroundDelivery; source: EndpointSource },
  window: Date,
): Promise<{ scopes: number; deliveries: number }> {
  const tickedAt = window.toISOString()
  const event = {
    type: 'clock.ticked' as const,
    data: { tickedAt, intervalSeconds: TICK_INTERVAL_SECONDS } as const,
    idempotencyKey: `tick:${tickedAt}`,
  }
  let scopes = 1
  let deliveries = (await input.delivery.publish(event)).deliveryCount
  const { rows } = await input.database.query<{ id: string }>('SELECT id FROM "user" ORDER BY id')
  for (const { id } of rows) {
    const scope = { type: 'user', id }
    // Skip users with no subscribed endpoint, so their scope stores no empty events.
    if (!(await input.source.matchRecipients(scope, event.type)).length) continue
    deliveries += (await input.delivery.forScope(scope).publish(event)).deliveryCount
    scopes += 1
  }
  return { scopes, deliveries }
}
