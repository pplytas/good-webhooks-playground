import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { AutoRefresh } from '@/components/auto-refresh'
import { CopyButton } from '@/components/copy-button'
import { DemoEventForm } from '@/components/demo-event-form'
import { DeliveryStatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatTime } from '@/lib/format'
import { receiptHeaders, readDemo, type DemoReceipt } from '@/server/demo'
import { TICK_INTERVAL_SECONDS } from '@/server/events'
import { MAX_DEMO_EVENTS_PER_HOUR, MAX_DEMO_EVENTS_PER_IP_PER_10_MIN } from '@/server/limits'

export const metadata: Metadata = { title: 'Demo' }

const REFRESH_MS = 10_000
const link = 'underline underline-offset-4'
const codeBlock = 'overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs'

/** A JavaScript string literal for a value shown in a snippet. */
const js = (value: string) => JSON.stringify(value)

function nodeSnippet(secret: string, receipt: DemoReceipt): string {
  const { headers } = receipt
  return [
    '// verify.mjs: run it with `node verify.mjs`',
    'import { createHmac, timingSafeEqual } from "node:crypto"',
    '',
    `const secret = ${js(secret)}`,
    `const id = ${js(headers['webhook-id'] ?? '')}`,
    `const timestamp = ${js(headers['webhook-timestamp'] ?? '')}`,
    `const signature = ${js(headers['webhook-signature'] ?? '')}`,
    `const body = ${js(receipt.body)}`,
    '',
    '// The key is the secret without its whsec_ prefix, base64-decoded.',
    'const key = Buffer.from(secret.slice("whsec_".length), "base64")',
    'const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest()',
    '// The header can hold several space-separated signatures, for example during a rotation.',
    'const valid = signature.split(" ").some((candidate) => {',
    '  if (!candidate.startsWith("v1,")) return false',
    '  const received = Buffer.from(candidate.slice("v1,".length), "base64")',
    '  return received.length === expected.length && timingSafeEqual(received, expected)',
    '})',
    'console.log(valid ? "The signature is valid." : "The signature does not match.")',
  ].join('\n')
}

function librarySnippet(secret: string, receipt: DemoReceipt): string {
  const { headers } = receipt
  return [
    '// verify-with-good-webhooks.mjs: run `npm install good-webhooks zod` first',
    'import { parseWebhook } from "good-webhooks/verify"',
    'import * as z from "zod"',
    '',
    "// The Playground's two events, as listed on its events page.",
    'const events = {',
    `  "clock.ticked": z.object({ tickedAt: z.iso.datetime(), intervalSeconds: z.literal(${TICK_INTERVAL_SECONDS}) }),`,
    '  "ping.requested": z.object({ requestedAt: z.iso.datetime() }),',
    '}',
    '',
    `const body = ${js(receipt.body)}`,
    'const event = await parseWebhook({',
    `  secret: ${js(secret)},`,
    '  headers: {',
    `    "webhook-id": ${js(headers['webhook-id'] ?? '')},`,
    `    "webhook-timestamp": ${js(headers['webhook-timestamp'] ?? '')},`,
    `    "webhook-signature": ${js(headers['webhook-signature'] ?? '')},`,
    '  },',
    '  body: new TextEncoder().encode(body),',
    '  events,',
    '  // Signatures expire after 5 minutes. Check this one as of when it arrived.',
    `  now: new Date(${js(receipt.receivedAt.toISOString())}),`,
    '})',
    'console.log(event.type, event.data)',
  ].join('\n')
}

function Snippet({ title, code }: { title: string; code: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">{title}</h3>
        <CopyButton text={code} />
      </div>
      <pre className={codeBlock}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`

async function Demo() {
  await connection()
  const demo = await readDemo()
  if (!demo) return <p className="text-muted-foreground">The demo receiver is not set up yet.</p>
  const { deliveries, receipts, secret, stats } = demo
  const latest = deliveries.map((item) => receipts[item.eventId]).find((receipt) => receipt)
  const pending = stats.deliveries.pending + stats.deliveries.in_flight
  const attempts = Object.values(stats.attemptsLastHour).reduce((sum, count) => sum + count, 0)

  return (
    <>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Latest signed request</h2>
        {latest ? (
          <>
            <p className="max-w-2xl text-sm text-muted-foreground">
              Received {formatTime(latest.receivedAt)} at{' '}
              <span className="font-mono break-all">{demo.endpoint.url}</span>.
            </p>
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Headers</h3>
              <pre className={codeBlock}>
                <code>
                  {receiptHeaders
                    .filter((name) => latest.headers[name] !== undefined)
                    .map((name) => `${name}: ${latest.headers[name]}`)
                    .join('\n')}
                </code>
              </pre>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="font-medium">Body</h3>
              <pre className={codeBlock}>
                <code>{latest.body}</code>
              </pre>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">
            No signed request has arrived yet. The next clock tick is at most 5 minutes away.
          </p>
        )}
        <div className="flex flex-col gap-2">
          <h3 className="font-medium">Demo signing secret</h3>
          <code className="w-fit max-w-full rounded-md bg-muted px-2 py-1 font-mono text-sm break-all">
            {secret}
          </code>
          <p className="max-w-2xl text-sm text-muted-foreground">
            This secret is public on purpose so you can verify the signature yourself. It signs only
            this demo receiver. Your own endpoints get private secrets.
          </p>
        </div>
      </section>

      {latest && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Verify it yourself</h2>
          <p className="max-w-2xl text-muted-foreground">
            Both scripts hold the values of the request above. Paste one into a file and run it with
            Node.js 24.
          </p>
          <Snippet title="With node:crypto only" code={nodeSnippet(secret, latest)} />
          <Snippet title="With good-webhooks" code={librarySnippet(secret, latest)} />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Recent deliveries</h2>
        {deliveries.length === 0 ? (
          <p className="text-muted-foreground">
            No deliveries yet. The next clock tick is at most 5 minutes away.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last result</TableHead>
                <TableHead>Received</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((item) => {
                const receipt = receipts[item.eventId]
                return (
                  <TableRow key={item.id}>
                    <TableCell>{formatTime(item.createdAt)}</TableCell>
                    <TableCell className="font-mono text-sm">{item.eventType}</TableCell>
                    <TableCell>
                      <DeliveryStatusBadge status={item.status} />
                    </TableCell>
                    <TableCell>{item.attemptCount}</TableCell>
                    <TableCell className="max-w-72 truncate text-sm text-muted-foreground">
                      {item.lastError ?? (item.lastStatus ? `HTTP ${item.lastStatus}` : '–')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {receipt ? formatTime(receipt.receivedAt) : 'not yet'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
        <p className="text-sm text-muted-foreground">
          {stats.deliveries.succeeded} succeeded, {stats.deliveries.failed} failed, {pending}{' '}
          pending in the last 7 days. {plural(attempts, 'attempt')} in the last hour.
        </p>
      </section>
    </>
  )
}

export default function DemoPage() {
  return (
    <div className="flex flex-col gap-10">
      <AutoRefresh everyMs={REFRESH_MS} />
      <section className="flex max-w-2xl flex-col gap-5">
        <h1 className="text-4xl font-semibold">Watch signed webhooks arrive</h1>
        <p className="text-lg text-muted-foreground">
          A running good-webhooks worker sends <code className="font-mono">clock.ticked</code> to
          this page&apos;s own receiver every 5 minutes. Every request is signed with Standard
          Webhooks headers, and you need no account to watch. This page refreshes itself every 10
          seconds.
        </p>
        <div className="flex flex-col gap-2">
          <DemoEventForm />
          <p className="text-sm text-muted-foreground">
            The button publishes <code className="font-mono">ping.requested</code> to the demo
            receiver. Each visitor can send {MAX_DEMO_EVENTS_PER_IP_PER_10_MIN} every 10 minutes,
            and the demo accepts {MAX_DEMO_EVENTS_PER_HOUR} an hour in total.
          </p>
        </div>
      </section>

      <Suspense fallback={<p className="text-muted-foreground">Loading the demo…</p>}>
        <Demo />
      </Suspense>

      <section className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-xl font-semibold">Build this yourself</h2>
        <p className="text-muted-foreground">
          Send webhooks like these from your own app with{' '}
          <a className={link} href="https://good-webhooks.dev/docs?ref=playground">
            good-webhooks
          </a>
          , and verify them in your receiver with the{' '}
          <a className={link} href="https://good-webhooks.dev/docs/guides/receive?ref=playground">
            receive guide
          </a>
          . To get endpoints of your own with private secrets,{' '}
          <Link className={link} href="/">
            sign in with GitHub
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
