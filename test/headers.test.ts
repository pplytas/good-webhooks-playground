import { afterAll, beforeAll, expect, test } from 'vitest'
import { parseHeaderLines } from '../src/lib/headers.ts'
import { createGithubUser, useTestDatabase } from './helpers.ts'

let teardown: () => Promise<void>
beforeAll(async () => {
  teardown = await useTestDatabase()
})
afterAll(() => teardown())

test('header lines parse on the first colon and skip blank lines', () => {
  expect(parseHeaderLines('')).toEqual({ headers: {} })
  expect(parseHeaderLines(' X-Api-Key : a:b \n\n authorization: Bearer t ')).toEqual({
    headers: { 'X-Api-Key': 'a:b', authorization: 'Bearer t' },
  })
  expect(parseHeaderLines('x-key: 1\nnope')).toEqual({
    error: 'Line 2 needs a colon, as in Name: value.',
  })
  expect(parseHeaderLines(': value')).toEqual({ error: 'Line 1 has no header name.' })
  expect(parseHeaderLines('a: 1\na: 2')).toEqual({ error: 'Header a appears twice.' })
})

test('endpoint headers are stored for the owner, and reserved names are rejected', async () => {
  const { auth } = await import('../src/server/auth.ts')
  const { headers } = await createGithubUser()
  const create = (extra: Record<string, string>) =>
    auth().api.createWebhookEndpoint({
      headers,
      body: {
        url: 'https://receiver.example/headers',
        eventTypes: ['ping.requested'],
        headers: extra,
      },
    })

  const { endpoint } = await create({ 'x-api-key': 'key-1' })
  expect(endpoint.headers).toEqual({ 'x-api-key': 'key-1' })
  const stored = await auth().api.getWebhookEndpoint({ headers, body: { id: endpoint.id } })
  expect(stored.headers).toEqual({ 'x-api-key': 'key-1' })

  await expect(create({ 'Webhook-Id': 'forged' })).rejects.toMatchObject({
    body: { code: 'INVALID_INPUT' },
  })
})
