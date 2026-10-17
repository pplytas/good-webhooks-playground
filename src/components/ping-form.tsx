'use client'

import { useActionState } from 'react'
import { sendPing, type ActionState } from '@/app/actions'
import { Button } from '@/components/ui/button'

export function PingForm() {
  const [state, action, pending] = useActionState<ActionState>(sendPing, { message: null })
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? 'Sending…' : 'Send ping.requested'}
      </Button>
      {state.message && (
        <p className={state.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
