'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'

export function SignInButton({ size = 'default' }: { size?: 'default' | 'lg' }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function signIn() {
    setPending(true)
    setError(null)
    const { error: failure } = await authClient.signIn.social({
      provider: 'github',
      callbackURL: '/endpoints',
    })
    if (failure) {
      setError(failure.message ?? 'Sign-in failed.')
      setPending(false)
    }
  }
  return (
    <span className="inline-flex flex-col gap-2">
      <Button size={size} onClick={signIn} disabled={pending}>
        {pending ? 'Opening GitHub…' : 'Sign in with GitHub'}
      </Button>
      {error && <span className="text-sm text-destructive">{error}</span>}
    </span>
  )
}
