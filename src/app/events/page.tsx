import { describeEvents } from 'good-webhooks'
import type { Metadata } from 'next'
import { events } from '@/server/events'

export const metadata: Metadata = { title: 'Events' }

export default function EventsPage() {
  // The standalone function reads only the event map, so the page prerenders without a database.
  const catalog = describeEvents(events)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold">Events</h1>
      <p className="max-w-2xl text-muted-foreground">
        These are the events the Playground publishes, with the JSON Schema of each payload from{' '}
        <code className="font-mono">describeEvents()</code>.
      </p>
      {catalog.map(({ type, schema }) => (
        <section key={type} className="flex flex-col gap-3">
          <h2 className="font-mono text-xl font-semibold">{type}</h2>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
            {JSON.stringify(schema, null, 2)}
          </pre>
        </section>
      ))}
    </div>
  )
}
