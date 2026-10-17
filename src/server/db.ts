import { Pool } from 'pg'
import { env } from './env.ts'

const globalForPool = globalThis as unknown as { playgroundPool?: Pool }

/** One pool per process. Development reloads reuse it instead of leaking connections. */
export function pool(): Pool {
  if (!globalForPool.playgroundPool) {
    const created = new Pool({
      connectionString: env().databaseUrl,
      max: 10,
      connectionTimeoutMillis: 5_000,
      statement_timeout: 10_000,
      idleTimeoutMillis: 30_000,
    })
    // Idle connections can fail after a database restart. The pool replaces them on next use.
    created.on('error', (error) =>
      console.error(JSON.stringify({ event: 'db.pool.error', message: error.message })),
    )
    globalForPool.playgroundPool = created
  }
  return globalForPool.playgroundPool
}
