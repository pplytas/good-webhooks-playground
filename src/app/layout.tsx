import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Link from 'next/link'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

const sans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Good Webhooks Playground', template: '%s | Good Webhooks Playground' },
  description:
    'Add an HTTPS endpoint and receive signed Standard Webhooks sent by good-webhooks: a clock tick every 5 minutes and a ping on demand.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>
        <footer className="border-t">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-x-6 gap-y-2 px-4 py-6 text-sm text-muted-foreground">
            <span>
              Sends with{' '}
              <a
                className="underline underline-offset-4"
                href="https://www.npmjs.com/package/good-webhooks"
              >
                good-webhooks
              </a>
            </span>
            <a
              className="underline underline-offset-4"
              href="https://github.com/pplytas/good-webhooks-playground"
            >
              Source
            </a>
            <Link className="underline underline-offset-4" href="/#privacy">
              Privacy and fair use
            </Link>
          </div>
        </footer>
      </body>
    </html>
  )
}
