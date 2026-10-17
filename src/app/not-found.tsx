import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Not found</h1>
      <p className="text-muted-foreground">
        This page does not exist, or it belongs to another account.
      </p>
      <Link href="/endpoints" className="underline underline-offset-4">
        Go to your endpoints
      </Link>
    </div>
  )
}
