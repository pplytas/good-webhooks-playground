'use client'

import { useActionState } from 'react'
import { sendDemoEvent, type ActionState } from '@/app/actions'
import { Button } from '@/components/ui/button'

export function DemoEventForm() {
  const [state, action, pending] = useActionState<ActionState>(sendDemoEvent, { message: null })
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send a demo event'}
      </Button>
      {state.message && (
        <p className={state.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
