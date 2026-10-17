import { createAuthClient } from 'better-auth/react'
import { goodWebhooksClient } from 'good-webhooks/better-auth/client'
import { eventTypes } from './event-types'

export const authClient = createAuthClient({
  plugins: [goodWebhooksClient({ eventTypes })],
})
