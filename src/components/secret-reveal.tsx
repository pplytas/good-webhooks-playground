'use client'

import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** Shows a signing secret once. The server never returns it again. */
export function SecretReveal({ secret, onDone }: { secret: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <Alert>
      <AlertTitle>Copy the signing secret now</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>You will not see it again. Your receiver passes it to parseWebhook().</span>
        <code className="break-all bg-muted px-2 py-1 font-mono text-sm text-foreground">
          {secret}
        </code>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(secret)
              setCopied(true)
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDone}>
            Done
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  )
}
