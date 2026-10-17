// Runs before each deploy: Better Auth schema, then SQL migrations, then the canary endpoint.
import { getMigrations } from 'better-auth/db/migration'
import { auth } from '../src/server/auth.ts'
import { ensureCanary } from '../src/server/canary.ts'
import { pool } from '../src/server/db.ts'
import { createPlaygroundDelivery } from '../src/server/delivery.ts'
import { applyMigrations } from '../src/server/migrate.ts'

try {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth().options)
  await runMigrations()
  console.log(
    JSON.stringify({
      event: 'setup.auth',
      tables: toBeCreated.map((table) => table.table),
      altered: toBeAdded.map((table) => table.table),
    }),
  )
  console.log(JSON.stringify({ event: 'setup.sql', applied: await applyMigrations(pool()) }))
  await (await createPlaygroundDelivery()).check()
  console.log(JSON.stringify({ event: 'setup.canary', result: await ensureCanary() }))
} finally {
  await pool().end()
}
