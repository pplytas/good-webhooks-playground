'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SecretReveal } from '@/components/secret-reveal'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { authClient } from '@/lib/auth-client'
import { eventTypes, type EventType } from '@/lib/event-types'

export function CreateEndpointForm({ disabled }: { disabled: boolean }) {
  const router = useRouter()
  const [selected, setSelected] = useState<EventType[]>([...eventTypes])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)

  if (secret) return <SecretReveal secret={secret} onDone={() => setSecret(null)} />

  async function create(form: FormData) {
    setPending(true)
    setError(null)
    const description = String(form.get('description') ?? '').trim()
    const { data, error: failure } = await authClient.goodWebhooks.create({
      url: String(form.get('url') ?? '').trim(),
      eventTypes: selected,
      ...(description ? { description } : {}),
    })
    setPending(false)
    if (failure) return setError(failure.message ?? 'The endpoint could not be created.')
    setSecret(data.secret)
    router.refresh()
  }

  return (
    <form action={create} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="url">HTTPS URL</Label>
        <Input
          id="url"
          name="url"
          type="url"
          required
          placeholder="https://receiver.example/webhooks"
          disabled={disabled}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Input id="description" name="description" maxLength={200} disabled={disabled} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Events</legend>
        {eventTypes.map((type) => (
          <Label key={type} className="flex items-center gap-2 font-mono font-normal">
            <Checkbox
              checked={selected.includes(type)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked ? [...current, type] : current.filter((item) => item !== type),
                )
              }
            />
            {type}
          </Label>
        ))}
      </fieldset>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div>
        <Button type="submit" disabled={disabled || pending || selected.length === 0}>
          {pending ? 'Adding…' : 'Add endpoint'}
        </Button>
      </div>
    </form>
  )
}
