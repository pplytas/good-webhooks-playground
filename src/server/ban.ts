import { auth } from './auth.ts'
import { pool } from './db.ts'

/** Block a GitHub account from signing in and delete its users, which retires their endpoints. */
export async function banGithubAccount(githubId: string, reason: string | null): Promise<number> {
  await pool().query(
    'INSERT INTO playground_blocked (github_id, reason) VALUES ($1, $2) ON CONFLICT (github_id) DO NOTHING',
    [githubId, reason],
  )
  const { rows } = await pool().query<{ userId: string }>(
    `SELECT "userId" FROM account WHERE "providerId" = 'github' AND "accountId" = $1`,
    [githubId],
  )
  const context = await auth().$context
  for (const { userId } of rows) await context.internalAdapter.deleteUser(userId)
  return rows.length
}
