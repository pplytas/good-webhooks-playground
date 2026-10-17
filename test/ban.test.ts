import { afterAll, beforeAll, expect, test } from 'vitest'
import { createGithubUser, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

test('banning deletes the account, retires its endpoints, and blocks new sessions', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { banGithubAccount } = await import('../src/server/ban.ts')
  const { createBetterAuthManagement } = await import('good-webhooks/better-auth')
  const { user, githubId, headers } = await createGithubUser()
  const { endpoint } = await auth().api.createWebhookEndpoint({
    headers,
    body: { url: 'https://receiver.example/spam', eventTypes: ['clock.ticked'] },
  })

  expect(await banGithubAccount(githubId, 'test')).toBe(1)

  const context = await auth().$context
  expect(await context.internalAdapter.findUserById(user.id)).toBeNull()
  const management = await createBetterAuthManagement(auth())
  const source = await management.source.resolveEndpoint({ type: 'user', id: user.id }, endpoint.id)
  expect(source.status).toBe('deleted')

  // Signing in again recreates the user, but no session is issued.
  await expect(createGithubUser(githubId)).rejects.toThrow(/blocked/)
})
