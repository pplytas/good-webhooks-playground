import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { nextCookies } from 'better-auth/next-js'
import { goodWebhooks } from 'good-webhooks/better-auth'
import { eventTypes } from '../lib/event-types.ts'
import { pool } from './db.ts'
import { env } from './env.ts'
import { MAX_ENDPOINTS_PER_USER } from './limits.ts'

function createAuth() {
  const config = env()
  return betterAuth({
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
      // The first matching key wins, and custom rules replace the plugin's own limits.
      customRules: {
        '/good-webhooks/send-test-event': { window: 60, max: 10 },
        '/good-webhooks/*': { window: 60, max: 30 },
      },
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
    plugins: [
      goodWebhooks({
        eventTypes,
        allowLocalhost: config.allowLocalhost,
        // Accounts get a few endpoints; the application scope holds the canary and chaos receivers.
        maxEndpoints: (scope) => (scope?.type === 'user' ? MAX_ENDPOINTS_PER_USER : 1000),
      }),
      nextCookies(), // Must stay last.
    ],
  })
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
