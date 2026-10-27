'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/** Re-render the page's server components every `everyMs` while the tab is visible. */
export function AutoRefresh({ everyMs }: { everyMs: number }) {
  const router = useRouter()
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, everyMs)
    return () => clearInterval(timer)
  }, [router, everyMs])
  return null
}
