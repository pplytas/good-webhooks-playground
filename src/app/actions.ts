'use server'

import { WebhookError } from 'good-webhooks'
import { refresh } from 'next/cache'
import { headers } from 'next/headers'
import { delivery } from '@/server/delivery'
import { demoIpHash, requestDemoEvent } from '@/server/demo'
import { MAX_DEMO_EVENTS_PER_IP_PER_10_MIN, MAX_PINGS_PER_HOUR } from '@/server/limits'
import { requestPing } from '@/server/pings'
import { replayFailedSince as replayFailed } from '@/server/replay'
import { getSession, userScope } from '@/server/session'

export interface ActionState {
  message: string | null
  ok?: boolean
}

/** Publish ping.requested to the signed-in user's endpoints. */
export async function sendPing(_previous: ActionState): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { message: 'Sign in to send a ping.' }
  const result = await requestPing(session.user.id)
  if (result.limited)
    return { message: `You can send ${MAX_PINGS_PER_HOUR} pings an hour. Try again later.` }
  refresh()
  const count = result.deliveryCount
  return count === 0
    ? { message: 'No active endpoint subscribes to ping.requested, so nothing was queued.' }
    : { ok: true, message: `Queued ${count} ${count === 1 ? 'delivery' : 'deliveries'}.` }
}

/** Publish ping.requested to the public demo receiver. No sign-in; limited per IP and in total. */
export async function sendDemoEvent(_previous: ActionState): Promise<ActionState> {
  // Railway's edge sets X-Real-IP to the client address; clients cannot supply it. Local dev has none.
  const ip = (await headers()).get('x-real-ip') ?? 'local'
  const result = await requestDemoEvent(demoIpHash(ip))
  if (result.limited === 'ip')
    return {
      message: `You can send ${MAX_DEMO_EVENTS_PER_IP_PER_10_MIN} demo events every 10 minutes. The clock still ticks every 5 minutes.`,
    }
  if (result.limited === 'global')
    return {
      message: 'The demo is busy right now. The next clock tick is at most 5 minutes away.',
    }
  refresh()
  return result.deliveryCount === 0
    ? { message: 'The demo receiver is not active right now, so nothing was queued.' }
    : { ok: true, message: 'Queued a ping.requested delivery. It should arrive in a few seconds.' }
}

const expected = new Set(['NOT_FOUND', 'INVALID_INPUT', 'INVALID_STATE', 'REPLAY_IN_PROGRESS'])

/** Replay an original succeeded or failed delivery in the signed-in user's scope. */
export async function replayDelivery(deliveryId: string): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { message: 'Sign in to replay a delivery.' }
  try {
    await (await delivery()).forScope(userScope(session.user.id)).deliveries.replay(deliveryId)
  } catch (error) {
    if (error instanceof WebhookError && expected.has(error.code)) return { message: error.message }
    throw error
  }
  refresh()
  return { ok: true, message: 'Replay queued.' }
}

export type ReplayFailedState = ActionState & { replayed?: number; skipped?: number }

/** Bulk replay the failed deliveries to one of the signed-in user's endpoints since a time. */
export async function replayFailedSince(
  endpointId: string,
  sinceIso: string,
): Promise<ReplayFailedState> {
  const session = await getSession()
  if (!session) return { message: 'Sign in to replay deliveries.' }
  const result = await replayFailed(session.user.id, endpointId, sinceIso)
  if (result.replayed > 0) refresh()
  return result
}
