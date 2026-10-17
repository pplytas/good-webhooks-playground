import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import type { Pool } from 'pg'

const directory = new URL('../../migrations/', import.meta.url)

/** Apply each new file in migrations/ once, in name order, each in its own transaction. */
export async function applyMigrations(database: Pool): Promise<string[]> {
  const client = await database.connect()
  try {
    // One runner at a time, even if two deploys overlap.
    await client.query("SELECT pg_advisory_lock(hashtext('playground:migrations'))")
    await client.query(`CREATE TABLE IF NOT EXISTS playground_migration (
      name text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`)
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'SELECT name, checksum FROM playground_migration',
    )
    const applied = new Map(rows.map((row) => [row.name, row.checksum]))
    const names = (await readdir(directory)).filter((name) => name.endsWith('.sql')).toSorted()
    const ran: string[] = []
    for (const name of names) {
      const sql = await readFile(new URL(name, directory), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const recorded = applied.get(name)
      if (recorded !== undefined) {
        if (recorded !== checksum)
          throw new Error(`Migration ${name} changed after it was applied.`)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO playground_migration (name, checksum) VALUES ($1, $2)', [
          name,
          checksum,
        ])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
      ran.push(name)
    }
    return ran
  } finally {
    await client
      .query("SELECT pg_advisory_unlock(hashtext('playground:migrations'))")
      .catch(() => {})
    client.release()
  }
}
