import { receive } from '@/server/receive'
import { recordCanaryReceipt } from '@/server/receivers'

/** The Playground's own receiver. It verifies every event and records it once. */
export async function POST(request: Request) {
  return receive('canary', request, async (event) => {
    await recordCanaryReceipt(event)
    return new Response(null, { status: 204 })
  })
}
