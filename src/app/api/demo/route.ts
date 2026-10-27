import { recordDemoReceipt } from '@/server/demo'
import { receive } from '@/server/receive'

/**
 * The public demo receiver. Its secret is shown on /demo, so it verifies like every receiver,
 * then keeps the request only for events the demo scope published. It answers 204 either way.
 */
export async function POST(request: Request) {
  const copy = request.clone()
  return receive('demo', request, async (event) => {
    await recordDemoReceipt(event.id, {
      headers: copy.headers,
      body: new Uint8Array(await copy.arrayBuffer()),
    })
    return new Response(null, { status: 204 })
  })
}
