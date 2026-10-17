import { parseWebhook, WebhookError } from 'good-webhooks/verify'
import { events } from './events.ts'
import { receiverSecret, type ReceiverName } from './receivers.ts'

const rejections = new Set(['SIGNATURE_INVALID', 'SIGNATURE_EXPIRED', 'PAYLOAD_INVALID'])
type ParsedEvent = Awaited<ReturnType<typeof parseWebhook<typeof events>>>

/**
 * Verify a request for one of the Playground's receivers, then let `respond` decide the answer.
 * Every receiver verifies first, so its failures are deliberate, never signature errors.
 */
export async function receive(
  name: ReceiverName,
  request: Request,
  respond: (event: ParsedEvent) => Promise<Response>,
): Promise<Response> {
  if (Number(request.headers.get('content-length')) > 512 * 1024)
    return new Response('Webhook body is too large', { status: 413 })
  const secret = await receiverSecret(name)
  if (!secret) return new Response('This receiver is not set up', { status: 503 })
  let event: ParsedEvent
  try {
    event = await parseWebhook({
      body: new Uint8Array(await request.arrayBuffer()),
      headers: request.headers,
      secret,
      events,
    })
  } catch (error) {
    if (error instanceof WebhookError && rejections.has(error.code))
      return new Response('Invalid webhook', { status: 400 })
    throw error // 500: the worker retries.
  }
  return respond(event)
}
