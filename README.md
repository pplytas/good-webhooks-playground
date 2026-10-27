# Good Webhooks Playground

A public app at [playground.good-webhooks.dev](https://playground.good-webhooks.dev) where anyone can sign in with GitHub, add an HTTPS endpoint, and receive signed Standard Webhooks sent by [good-webhooks](https://github.com/pplytas/good-webhooks).

It is also how we dogfood the library: it installs the published npm package like any other app, and is built only from the public docs. Friction goes in the [dogfood log](https://github.com/pplytas/good-webhooks/issues/74).

## How it works

| Process            | What it does                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web` (Next.js 16) | GitHub sign-in through Better Auth, endpoint management with optional headers through the `goodWebhooks` plugin, pings, delivery history, replay and bulk replay, `/demo`, `/status`, `/events`, and the Playground's own receivers |
| `worker` (Node.js) | Sends deliveries, publishes `clock.ticked` every 5 minutes to each user with a subscribed endpoint and to the Playground's receivers, records liveness, prunes history hourly, and resumes paused chaos receivers after a day       |
| PostgreSQL         | Better Auth tables, good-webhooks delivery tables, and the Playground's own tables                                                                                                                                                  |

Events: `clock.ticked` (`{ tickedAt, intervalSeconds }`) and `ping.requested` (`{ requestedAt }`). Limits: 3 endpoints per account, 10 pings an hour. Library defaults stay on: retries, `Retry-After`, automatic pause after 5 days of failures or on HTTP 410, and 7-day retention.

`/demo` needs no sign-in. It shows the latest signed request to the `demo` receiver, its public secret, two scripts that verify it, and the last 10 deliveries. Visitors can send `ping.requested` to it: 3 every 10 minutes per IP, and 60 an hour in total.

The Playground also answers seven endpoints itself. Six live in application scope, so failures keep happening with no visitors; `demo` lives in its own `demo` scope:

| Receiver  | Answers                                     | Exercises                                               |
| --------- | ------------------------------------------- | ------------------------------------------------------- |
| `canary`  | 204                                         | The full path, end to end                               |
| `flaky`   | 500, 30% of the time                        | Retries that then succeed                               |
| `slow`    | after 12 s, 20% of the time                 | Timeouts                                                |
| `busy`    | 429 with `Retry-After: 60`, 25% of the time | `Retry-After`                                           |
| `gone`    | 410                                         | Immediate automatic pause, then a resume after a day    |
| `failing` | 500                                         | Automatic pause after 5 days, then a resume after a day |
| `demo`    | 204                                         | The public `/demo` page and its public secret           |

Each verifies the signature first. `/status` shows their last 24 hours, and their retained totals from `deliveries.stats()`. `/events` lists the payload schemas from `describeEvents()`. `/api/health` answers 503 when the worker or the canary has not reported for 15 minutes. A scheduled workflow checks it every 15 minutes.

## Run it locally

You need Node.js 24, pnpm (through Corepack), Docker, and a GitHub OAuth app with the callback `http://localhost:3000/api/auth/callback/github`.

```sh
corepack enable
pnpm install
docker compose up -d
cp .env.example .env   # then fill in BETTER_AUTH_SECRET and the GitHub app
pnpm setup             # Better Auth schema, SQL migrations, receiver endpoints
pnpm dev               # http://localhost:3000
pnpm dev:worker        # in a second terminal
```

`pnpm test` runs the integration tests against throwaway databases on the same PostgreSQL.

## Deploy

Railway runs `postgres`, `web`, and `worker` as declared in [`.railway/railway.ts`](.railway/railway.ts). Each deploy of `web` runs `pnpm setup` first; a failure stops the deploy. Secrets are set once with `railway variables --set`.

To upgrade good-webhooks: read the release notes, add any upgrade SQL as the next file in `migrations/` (generated with `getPostgresUpgrade`), bump the exact version, and deploy. The worker restarts until the web deploy has applied the migration.

## Moderation

`pnpm ban <github-user-id> [reason]` blocks a GitHub account from signing in and deletes its users, which retires their endpoints. Run it with the production `DATABASE_URL`.
