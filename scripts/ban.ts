// Usage: pnpm ban <github-user-id> [reason]
// Blocks future sign-ins and deletes the account, which retires its endpoints.
import { banGithubAccount } from '../src/server/ban.ts'
import { pool } from '../src/server/db.ts'

const [githubId, ...reason] = process.argv.slice(2)
if (!githubId || !/^\d+$/.test(githubId)) {
  console.error('Usage: pnpm ban <github-user-id> [reason]   (the numeric ID, not the login)')
  process.exit(1)
}
try {
  const deletedUsers = await banGithubAccount(githubId, reason.join(' ') || null)
  console.log(JSON.stringify({ event: 'playground.banned', githubId, deletedUsers }))
} finally {
  await pool().end()
}
