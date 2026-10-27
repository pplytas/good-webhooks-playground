import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { Client } from 'pg'

const adminUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://playground:playground@127.0.0.1:5442/postgres'

/**
 * Create a throwaway database, point the app's environment at it, and apply every migration.
 * Returns a teardown that closes the app's pool and drops the database.
 */
export async function useTestDatabase(): Promise<() => Promise<void>> {
  const name = `playground_test_${randomUUID().replaceAll('-', '')}`
  const admin = new Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  Object.assign(process.env, {
    DATABASE_URL: url.href,
    BETTER_AUTH_SECRET: randomBytes(32).toString('base64'),
    BETTER_AUTH_URL: 'http://localhost:3000',
    GITHUB_CLIENT_ID: 'test',
    GITHUB_CLIENT_SECRET: 'test',
    ALLOW_LOCALHOST: 'true',
  })
  const { getMigrations } = await import('better-auth/db/migration')
  const { auth } = await import('../src/server/auth.ts')
  const { pool } = await import('../src/server/db.ts')
  const { applyMigrations } = await import('../src/server/migrate.ts')
  await (await getMigrations(auth().options)).runMigrations()
  await applyMigrations(pool())
  return async () => {
    await pool().end()
    const cleanup = new Client({ connectionString: adminUrl })
    await cleanup.connect()
    await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
    await cleanup.end()
  }
}

/** A user who signed in with GitHub, plus request headers carrying their session cookie. */
export async function createGithubUser(githubId = String(Math.floor(Math.random() * 1e9))) {
  const { auth } = await import('../src/server/auth.ts')
  const context = await auth().$context
  const user = await context.internalAdapter.createUser(
    {
      name: `User ${githubId}`,
      email: `${githubId}@users.example`,
      emailVerified: true,
    },
    { method: 'oauth', oauth: { providerId: 'github', profile: { id: Number(githubId) } } },
  )
  await context.internalAdapter.createAccount({
    userId: user.id,
    providerId: 'github',
    accountId: githubId,
  })
  const session = await context.internalAdapter.createSession(user.id)
  // Better Auth signs the session cookie: "<token>.<base64 HMAC-SHA256>", URL-encoded.
  const signature = createHmac('sha256', process.env.BETTER_AUTH_SECRET!)
    .update(session.token)
    .digest('base64')
  const cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`
  return { user, githubId, headers: new Headers({ cookie, origin: 'http://localhost:3000' }) }
}

/** Sign like a Standard Webhooks sender: HMAC-SHA256 over "id.timestamp.body". */
export function signedRequest(
  url: string,
  secret: string,
  id: string = randomUUID(),
  event: { type: string; data: unknown } = {
    type: 'clock.ticked',
    data: { tickedAt: '2026-10-17T10:00:00.000Z', intervalSeconds: 300 },
  },
  extraHeaders: Record<string, string> = {},
) {
  const body = JSON.stringify({
    id,
    type: event.type,
    occurredAt: new Date().toISOString(),
    data: event.data,
  })
  const timestamp = Math.floor(Date.now() / 1000)
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(timestamp),
      'webhook-signature': `v1,${signature}`,
      ...extraHeaders,
    },
    body,
  })
}
