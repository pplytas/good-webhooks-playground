import { parseWebhook, WebhookError } from 'good-webhooks/verify'
import { canarySecret, recordCanaryReceipt } from '@/server/canary'
import { events } from '@/server/events'

const rejections = new Set(['SIGNATURE_INVALID', 'SIGNATURE_EXPIRED', 'PAYLOAD_INVALID'])

/** The Playground's own receiver. It verifies every event and records it once. */
export async function POST(request: Request) {
  if (Number(request.headers.get('content-length')) > 512 * 1024)
    return new Response('Webhook body is too large', { status: 413 })
  const secret = await canarySecret()
  if (!secret) return new Response('The canary is not set up', { status: 503 })
  try {
    const event = await parseWebhook({
      body: new Uint8Array(await request.arrayBuffer()),
      headers: request.headers,
      secret,
      events,
    })
    await recordCanaryReceipt(event)
    return new Response(null, { status: 204 })
  } catch (error) {
    if (error instanceof WebhookError && rejections.has(error.code))
      return new Response('Invalid webhook', { status: 400 })
    throw error // 500: the worker retries.
  }
}
