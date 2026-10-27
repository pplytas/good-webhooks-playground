'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { replayFailedSince, type ReplayFailedState } from '@/app/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

/** A datetime-local value in the browser's time zone, to the minute. */
function localInput(time: number): string {
  const date = new Date(time)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

const subscribe = () => () => {}

export function ReplayFailedForm({ endpointId }: { endpointId: string }) {
  // The visitor's time zone is known only in the browser, so the server renders an empty input.
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  )
  const [dayAgo] = useState(() => Date.now() - 24 * 60 * 60 * 1000)
  const [edited, setEdited] = useState<string | null>(null)
  const since = edited ?? (hydrated ? localInput(dayAgo) : '')
  const [state, setState] = useState<ReplayFailedState>({ message: null })
  const [pending, startTransition] = useTransition()

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const date = new Date(since)
        if (Number.isNaN(date.getTime()))
          return setState({ message: 'Pick a valid date and time.' })
        startTransition(async () =>
          setState(await replayFailedSince(endpointId, date.toISOString())),
        )
      }}
    >
      <Label htmlFor="replay-since">Failed deliveries since</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id="replay-since"
          type="datetime-local"
          required
          value={since}
          onChange={(event) => setEdited(event.target.value)}
          className="w-auto"
        />
        <Button type="submit" variant="outline" disabled={pending || !since}>
          {pending ? 'Replaying…' : 'Replay failed since'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The time is in your time zone. The table shows UTC. Deliveries are kept for 7 days.
      </p>
      {state.message && (
        <p className={state.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
