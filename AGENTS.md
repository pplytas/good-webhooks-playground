<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Playground conventions

- Build only from the public docs at good-webhooks.dev. When something needs library source to work, log it in the dogfood log (https://github.com/pplytas/good-webhooks/issues/74).
- Pin exact versions. `good-webhooks` upgrades follow the release notes; schema upgrades become the next file in `migrations/`, which are append-only.
- Modules under `src/server`, `src/worker`, and `scripts` run in plain Node.js too: use relative imports with `.ts` extensions there, never `@/`, and keep `server-only` and `next/*` out of them except `src/server/session.ts`.
- Read request headers before calling `auth()` in prerenderable code, so prerendering postpones before it needs secrets.
- Vocabulary: see GLOSSARY.md. Use receiver and endpoint wording, never "customers".
- Checks: `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build`.
