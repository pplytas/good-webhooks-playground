import { receive } from '@/server/receive'
import { receivers, type ReceiverName } from '@/server/receivers'

const chaos = ['flaky', 'slow', 'busy', 'gone', 'failing'] as const satisfies ReceiverName[]
type Chaos = (typeof chaos)[number]

const answers: Record<Chaos, () => Promise<Response>> = {
  flaky: async () => status(Math.random() < 0.3 ? 500 : 204),
  slow: async () => {
    // Longer than the worker's 10 s timeout, so the attempt times out and is retried.
    if (Math.random() < 0.2) await new Promise((resolve) => setTimeout(resolve, 12_000))
    return status(204)
  },
  busy: async () =>
    Math.random() < 0.25
      ? new Response('Busy, try later', { status: 429, headers: { 'retry-after': '60' } })
      : status(204),
  gone: async () => status(410),
  failing: async () => status(500),
}

function status(code: number): Response {
  return new Response(code === 204 ? null : `Playground receiver answered ${code} on purpose`, {
    status: code,
  })
}

/** Receivers that fail on purpose. Each verifies the signature first. */
export async function POST(request: Request, { params }: RouteContext<'/api/receivers/[mode]'>) {
  const { mode } = await params
  if (!(chaos as readonly string[]).includes(mode) || !(mode in receivers))
    return new Response('Unknown receiver', { status: 404 })
  return receive(mode as Chaos, request, () => answers[mode as Chaos]())
}
