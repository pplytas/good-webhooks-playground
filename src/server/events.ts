import * as z from 'zod'
import type { EventType } from '../lib/event-types.ts'

export const TICK_INTERVAL_SECONDS = 300

export const events = {
  'clock.ticked': z.object({
    tickedAt: z.iso.datetime(),
    intervalSeconds: z.literal(TICK_INTERVAL_SECONDS),
  }),
  'ping.requested': z.object({ requestedAt: z.iso.datetime() }),
} satisfies Record<EventType, z.ZodType>
