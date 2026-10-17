'use client'

import { useState, useTransition } from 'react'
import { replayDelivery, type ActionState } from '@/app/actions'
import { Button } from '@/components/ui/button'

export function ReplayButton({ deliveryId }: { deliveryId: string }) {
  const [state, setState] = useState<ActionState>({ message: null })
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(async () => setState(await replayDelivery(deliveryId)))}
      >
        {pending ? 'Queuing…' : 'Replay'}
      </Button>
      {state.message && (
        <p className={state.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {state.message}
        </p>
      )}
    </div>
  )
}
