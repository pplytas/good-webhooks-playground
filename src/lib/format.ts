const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
})

export function formatTime(value: Date | string): string {
  return `${dateTime.format(new Date(value))} UTC`
}

export function formatAge(value: Date | null, now: number): string {
  if (!value) return 'never'
  const seconds = Math.max(0, Math.round((now - value.getTime()) / 1000))
  if (seconds < 90) return `${seconds} s ago`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} min ago`
  return `${Math.round(minutes / 60)} h ago`
}
