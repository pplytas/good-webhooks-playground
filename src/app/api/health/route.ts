import { connection } from 'next/server'
import { readStatus } from '@/server/status'

/** 200 while the worker and the canary are both fresh, otherwise 503. */
export async function GET() {
  await connection()
  const status = await readStatus()
  return Response.json(
    {
      healthy: status.healthy,
      workerSeenAt: status.workerSeenAt,
      canaryReceivedAt: status.canaryReceivedAt,
    },
    { status: status.healthy ? 200 : 503, headers: { 'cache-control': 'no-store' } },
  )
}
