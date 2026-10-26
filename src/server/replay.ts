import { WebhookError } from 'good-webhooks'
import { delivery } from './delivery.ts'

/** The library's default retention. Older deliveries are gone, so there is nothing to replay. */
export const REPLAY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export interface ReplayFailedResult {
  ok: boolean
  message: string
  replayed: number
  skipped: number
}

const invalid = (message: string) => ({ ok: false, message, replayed: 0, skipped: 0 })

const messages: Record<string, string> = {
  NOT_FOUND: 'This endpoint was deleted or does not exist.',
  INVALID_STATE: 'Resume the endpoint before replaying.',
  INVALID_INPUT: 'Pick a valid date and time.',
}

/** Bulk replay every failed delivery to the user's endpoint created at or after `sinceIso`. */
export async function replayFailedSince(
  userId: string,
  endpointId: string,
  sinceIso: unknown,
  now = new Date(),
): Promise<ReplayFailedResult> {
  const since = typeof sinceIso === 'string' ? new Date(sinceIso) : new Date(Number.NaN)
  if (Number.isNaN(since.getTime())) return invalid('Pick a valid date and time.')
  if (since > now) return invalid('Pick a time in the past.')
  if (now.getTime() - since.getTime() > REPLAY_WINDOW_MS)
    return invalid('Pick a time within the last 7 days. Older deliveries are gone.')

  const deliveries = (await delivery()).forScope({ type: 'user', id: userId }).deliveries
  let replayed = 0
  let skipped = 0
  let before: string | undefined
  try {
    do {
      const page = await deliveries.replayMany({ endpointId, status: 'failed', since, before })
      replayed += page.replayed
      skipped += page.skipped
      before = page.nextCursor ?? undefined
    } while (before)
  } catch (error) {
    if (!(error instanceof WebhookError) || !Object.hasOwn(messages, error.code)) throw error
    // Earlier pages committed, so say what already went out.
    const done = replayed > 0 ? ` Replayed ${count(replayed)} before that.` : ''
    return { ok: false, message: `${messages[error.code]}${done}`, replayed, skipped }
  }
  if (replayed === 0 && skipped === 0)
    return { ok: true, message: 'No failed deliveries since then.', replayed, skipped }
  return {
    ok: true,
    message: `Replayed ${count(replayed)}${skipped > 0 ? `, skipped ${skipped}` : ''}.`,
    replayed,
    skipped,
  }
}

const count = (n: number) => `${n} failed ${n === 1 ? 'delivery' : 'deliveries'}`
