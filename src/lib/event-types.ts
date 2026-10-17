/** Safe for the browser: names only, no validators or server code. */
export const eventTypes = ['clock.ticked', 'ping.requested'] as const
export type EventType = (typeof eventTypes)[number]
