import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { createBetterAuthManagement, goodWebhooks } from 'good-webhooks/better-auth'
import { eventTypes } from '../lib/event-types.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { MAX_ENDPOINTS_PER_USER } from './limits.ts'

function createAuth() {
  const config = env()
  const instance = betterAuth({
    database: pool(),
    baseURL: config.baseUrl,
    secret: config.authSecret,
    trustedOrigins: [config.baseUrl],
    socialProviders: {
      github: { clientId: config.github.clientId, clientSecret: config.github.clientSecret },
    },
    user: { deleteUser: { enabled: true } },
    rateLimit: {
      storage: 'database',
      customRules: { '/good-webhooks/*': { window: 60, max: 30 } },
    },
    advanced: {
      // Railway's edge sets X-Real-IP to the client address; clients cannot supply it.
      ipAddress: { ipAddressHeaders: ['x-real-ip'] },
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session) => {
            if (await isBlocked(session.userId))
              throw new APIError('FORBIDDEN', { message: 'This GitHub account is blocked.' })
          },
        },
      },
    },
    hooks: {
      // The plugin has no endpoint cap option, so the Playground enforces its own.
      before: createAuthMiddleware(async (ctx): Promise<void> => {
        if (ctx.path !== '/good-webhooks/create') return
        const session = await getSessionFromCtx(ctx)
        if (!session) return // The route itself answers 401.
        const management = await createBetterAuthManagement(instance)
        const endpoints = await management.list({ type: 'user', id: session.user.id })
        if (endpoints.length >= MAX_ENDPOINTS_PER_USER)
          throw new APIError('FORBIDDEN', {
            message: `The Playground allows ${MAX_ENDPOINTS_PER_USER} endpoints per account.`,
          })
      }),
    },
    plugins: [
      goodWebhooks({ eventTypes, allowLocalhost: config.allowLocalhost }),
      nextCookies(), // Must stay last.
    ],
  })
  return instance
}

async function isBlocked(userId: string): Promise<boolean> {
  const { rowCount } = await pool().query(
    `SELECT 1 FROM playground_blocked b
     JOIN account a ON a."accountId" = b.github_id AND a."providerId" = 'github'
     WHERE a."userId" = $1`,
    [userId],
  )
  return (rowCount ?? 0) > 0
}

export type Auth = ReturnType<typeof createAuth>
let shared: Auth | undefined

/** Built on first use, so `next build` does not need runtime secrets. */
export function auth(): Auth {
  shared ??= createAuth()
  return shared
}
