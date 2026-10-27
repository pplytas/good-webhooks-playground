// The worker process: sends deliveries, publishes ticks, records liveness, prunes history, and resumes chaos receivers.
import { hostname } from 'node:os'
import { createBetterAuthManagement } from 'good-webhooks/better-auth'
import { auth } from '../server/auth.ts'
import { pool } from '../server/db.ts'
import { createPlaygroundDelivery } from '../server/delivery.ts'
import { resumePausedReceivers } from '../server/receivers.ts'
import { publishTicks, tickWindow } from './ticks.ts'

const LOOP_MS = 10_000
const PRUNE_EVERY_MS = 60 * 60 * 1000
const workerId = `${hostname()}:${process.pid}`
const stop = new AbortController()
const log = (event: string, fields: object = {}) =>
  console.log(JSON.stringify({ event, ...fields }))
const describe = (error: unknown) =>
  error instanceof AggregateError
    ? { message: error.message, causes: error.errors.slice(0, 5).map(String) }
    : { message: error instanceof Error ? error.message : String(error) }

process.on('SIGTERM', () => stop.abort())
process.on('SIGINT', () => stop.abort())

/** Sleep until the delay passes or the worker stops. */
function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    stop.signal.addEventListener('abort', done, { once: true })
    function done() {
      clearTimeout(timer)
      stop.signal.removeEventListener('abort', done)
      resolve()
    }
  })
}

async function prune(delivery: Awaited<ReturnType<typeof createPlaygroundDelivery>>) {
  let deleted = 0
  for (let batch = 0; batch < 20 && !stop.signal.aborted; batch++) {
    const count = await delivery.worker.prune()
    deleted += count
    if (count === 0) break
  }
  const database = pool()
  await database.query(
    "DELETE FROM playground_canary_receipt WHERE received_at < now() - interval '7 days'",
  )
  await database.query("DELETE FROM playground_ping WHERE created_at < now() - interval '1 day'")
  await database.query(
    "DELETE FROM playground_demo_receipt WHERE received_at < now() - interval '7 days'",
  )
  await database.query(
    "DELETE FROM playground_demo_request WHERE created_at < now() - interval '1 day'",
  )
  await database.query("DELETE FROM playground_worker WHERE seen_at < now() - interval '1 day'")
  log('playground.pruned', { events: deleted })
  const resumed = await resumePausedReceivers()
  if (resumed.length) log('playground.receivers.resumed', { receivers: resumed })
}

/** Ticks, liveness, pruning, and receiver resumes run beside the delivery loop and stop with it. */
async function housekeeping(delivery: Awaited<ReturnType<typeof createPlaygroundDelivery>>) {
  const source = (await createBetterAuthManagement(auth())).source
  let lastWindow = 0
  let lastPrune = 0
  while (!stop.signal.aborted) {
    try {
      await pool().query(
        `INSERT INTO playground_worker (id, seen_at) VALUES ($1, now())
         ON CONFLICT (id) DO UPDATE SET seen_at = EXCLUDED.seen_at`,
        [workerId],
      )
      const window = tickWindow(new Date())
      if (window.getTime() > lastWindow) {
        const result = await publishTicks({ database: pool(), delivery, source }, window)
        lastWindow = window.getTime()
        log('playground.ticked', { window: window.toISOString(), ...result })
      }
      if (Date.now() - lastPrune >= PRUNE_EVERY_MS) {
        await prune(delivery)
        lastPrune = Date.now()
      }
    } catch (error) {
      log('playground.housekeeping.failed', describe(error))
    }
    await pause(LOOP_MS)
  }
}

try {
  const delivery = await createPlaygroundDelivery({
    // Hook events carry IDs and outcomes, never payloads or secrets.
    onAttempt: (attempt) => log('webhooks.attempt', attempt),
    onEndpointPaused: (paused) => log('webhooks.endpoint.paused', paused),
  })
  await delivery.check()
  log('webhooks.worker.started', { workerId })
  await Promise.all([
    housekeeping(delivery),
    delivery.worker.run({
      signal: stop.signal,
      shutdownGraceMs: 30_000,
      onError: (error) => log('webhooks.worker.error', describe(error)),
    }),
  ])
  log('webhooks.worker.stopped', { workerId })
} catch (error) {
  process.exitCode = 1
  log('webhooks.worker.failed', describe(error))
  stop.abort()
} finally {
  await pool().end()
}
