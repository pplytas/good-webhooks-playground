import { createBetterAuthManagement } from 'good-webhooks/better-auth'
import { createDelivery, type DeliveryHooks } from 'good-webhooks/delivery'
import { auth } from './auth.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { events } from './events.ts'

export async function createPlaygroundDelivery(hooks?: DeliveryHooks) {
  const management = await createBetterAuthManagement(auth())
  // Library defaults stay on: retries, Retry-After, automatic pause, and 7-day retention.
  return createDelivery({
    database: pool(),
    source: management.source,
    events,
    allowLocalhost: env().allowLocalhost,
    ...(hooks === undefined ? {} : { hooks }),
  })
}

export type PlaygroundDelivery = Awaited<ReturnType<typeof createPlaygroundDelivery>>
let instance: Promise<PlaygroundDelivery> | undefined

/** The web app's engine. It publishes and reads history; only the worker sends. */
export function delivery(): Promise<PlaygroundDelivery> {
  instance ??= createPlaygroundDelivery().catch((error: unknown) => {
    instance = undefined
    throw error
  })
  return instance
}
