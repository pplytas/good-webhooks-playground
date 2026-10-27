import Link from 'next/link'
import { Suspense } from 'react'
import { SignInButton } from '@/components/sign-in-button'
import { Button } from '@/components/ui/button'
import { MAX_ENDPOINTS_PER_USER, MAX_PINGS_PER_HOUR } from '@/server/limits'
import { getSession } from '@/server/session'

async function CallToAction() {
  const session = await getSession()
  if (!session) return <SignInButton size="lg" />
  return (
    <Button size="lg" nativeButton={false} render={<Link href="/endpoints" />}>
      Open your endpoints
    </Button>
  )
}

export default function Home() {
  return (
    <div className="flex flex-col gap-14">
      <section className="flex max-w-2xl flex-col gap-5">
        <h1 className="text-4xl font-semibold">Send real webhooks to your receiver</h1>
        <p className="text-lg text-muted-foreground">
          Sign in with GitHub, add an HTTPS endpoint, and receive signed Standard Webhooks from a
          running good-webhooks worker: <code className="font-mono">clock.ticked</code> every 5
          minutes, and <code className="font-mono">ping.requested</code> whenever you ask. Their
          payload schemas are on the{' '}
          <Link className="underline underline-offset-4" href="/events">
            events page
          </Link>
          .
        </p>
        <div>
          <Suspense fallback={<div className="h-10" />}>
            <CallToAction />
          </Suspense>
        </div>
        <p className="text-muted-foreground">
          No account?{' '}
          <Link className="underline underline-offset-4" href="/demo">
            Watch live signed deliveries on the demo page
          </Link>
          .
        </p>
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">What to try</h2>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
            <li>
              Verify each request with{' '}
              <a
                className="underline underline-offset-4"
                href="https://good-webhooks.dev/docs/guides/receive"
              >
                parseWebhook()
              </a>{' '}
              and the endpoint&apos;s secret.
            </li>
            <li>Answer 500, or 429 with Retry-After, and watch the retries in the delivery log.</li>
            <li>Answer 410, and the worker pauses the endpoint. Resume it when you are ready.</li>
            <li>Replay a finished delivery, or rotate the secret while events keep arriving.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">No receiver yet?</h2>
          <p className="text-muted-foreground">
            A request inbox shows what arrives, though it does not check signatures:{' '}
            <a className="underline underline-offset-4" href="https://webhook.site">
              webhook.site
            </a>
            ,{' '}
            <a className="underline underline-offset-4" href="https://www.svix.com/play/">
              Svix Play
            </a>
            , or{' '}
            <a className="underline underline-offset-4" href="https://console.hookdeck.com">
              Hookdeck Console
            </a>
            .
          </p>
        </div>
      </section>

      <section id="privacy" className="flex max-w-2xl flex-col gap-3">
        <h2 className="text-xl font-semibold">Privacy and fair use</h2>
        <p className="text-muted-foreground">
          We keep what GitHub shares at sign-in (name, email, avatar), your endpoints, and 7 days of
          delivery history, including the first 4 KB of each response. Deleting your account removes
          your endpoints at once; their delivery history expires within 7 days.
        </p>
        <p className="text-muted-foreground">
          Each account gets {MAX_ENDPOINTS_PER_USER} endpoints and {MAX_PINGS_PER_HOUR} pings an
          hour. Only point endpoints at URLs you control. Accounts that send to someone else&apos;s
          URL are blocked.
        </p>
      </section>
    </div>
  )
}
