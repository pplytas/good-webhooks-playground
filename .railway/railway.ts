import { defineRailway, github, postgres, preserve, project, service } from 'railway/iac'

const repo = github('pplytas/good-webhooks-playground', { branch: 'main' })

export default defineRailway(() => {
  const db = postgres('postgres')
  // Secrets are set once with `railway variables --set` and kept here with preserve().
  const env = {
    DATABASE_URL: db.env.DATABASE_URL,
    BETTER_AUTH_SECRET: preserve(),
    BETTER_AUTH_URL: 'https://playground.good-webhooks.dev',
    GITHUB_CLIENT_ID: preserve(),
    GITHUB_CLIENT_SECRET: preserve(),
    ALLOW_LOCALHOST: 'false',
  }

  const web = service('web', {
    source: repo,
    build: 'pnpm build',
    // Better Auth schema, SQL migrations, then the canary endpoint. A failure stops the deploy.
    preDeploy: 'pnpm setup',
    start: 'pnpm start',
    healthcheck: '/',
    // playground.good-webhooks.dev is attached with `railway domain`; IaC cannot register it.
    env,
  })

  const worker = service('worker', {
    source: repo,
    build: { buildCommand: 'node --version' }, // The worker runs TypeScript directly.
    start: 'pnpm worker',
    // Give in-flight attempts the worker's 30 s shutdown grace before the old instance stops.
    deploy: { drainingSeconds: 40, restartPolicyType: 'ALWAYS' },
    env,
  })

  return project('good-webhooks-playground', { resources: [db, web, worker] })
})
