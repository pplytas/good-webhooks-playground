import { pool } from './db.ts'
import { delivery } from './delivery.ts'
import { MAX_PINGS_PER_HOUR } from './limits.ts'

export type PingResult = { limited: true } | { limited: false; deliveryCount: number }

/** Publish ping.requested in the user's scope, at most MAX_PINGS_PER_HOUR an hour. */
export async function requestPing(userId: string, now = new Date()): Promise<PingResult> {
  const engine = await delivery()
  const client = await pool().connect()
  try {
    await client.query('BEGIN')
    // Serialize this user's pings so two quick clicks cannot both pass the limit.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('playground:ping:' || $1))", [userId])
    const { rows } = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM playground_ping
       WHERE user_id = $1 AND created_at > $2::timestamptz - interval '1 hour'`,
      [userId, now],
    )
    if ((rows[0]?.count ?? 0) >= MAX_PINGS_PER_HOUR) {
      await client.query('ROLLBACK')
      return { limited: true }
    }
    await client.query('INSERT INTO playground_ping (user_id, created_at) VALUES ($1, $2)', [
      userId,
      now,
    ])
    // Same transaction: the ping counts only if the event is accepted.
    const result = await engine
      .forScope({ type: 'user', id: userId })
      .publish(
        { type: 'ping.requested', data: { requestedAt: now.toISOString() } },
        { transaction: client },
      )
    await client.query('COMMIT')
    return { limited: false, deliveryCount: result.deliveryCount }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
