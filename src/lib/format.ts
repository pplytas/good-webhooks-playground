const dateTime = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'medium',
  timeZone: 'UTC',
})

export function formatTime(value: Date | string): string {
  return `${dateTime.format(new Date(value))} UTC`
}

export function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  if (seconds < 90) return `${seconds} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 90) return `${minutes} min`
  return `${Math.round(minutes / 60)} h`
}

export function formatAge(value: Date | null, now: number): string {
  return value ? `${formatDuration(now - value.getTime())} ago` : 'never'
}
