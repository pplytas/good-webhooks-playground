import { Badge } from '@/components/ui/badge'

type Status = 'active' | 'paused' | 'deleted'
type Reason = 'owner' | 'failing' | 'gone' | null | undefined

const pausedLabels: Record<NonNullable<Reason>, string> = {
  owner: 'Paused by you',
  failing: 'Paused: kept failing',
  gone: 'Paused: answered 410',
}

export function EndpointStatusBadge({ status, reason }: { status: Status; reason?: Reason }) {
  if (status === 'active') return <Badge>Active</Badge>
  if (status === 'deleted') return <Badge variant="outline">Deleted</Badge>
  return <Badge variant="destructive">{reason ? pausedLabels[reason] : 'Paused'}</Badge>
}

const deliveryVariants = {
  pending: 'outline',
  in_flight: 'secondary',
  succeeded: 'default',
  failed: 'destructive',
  cancelled: 'outline',
} as const

export function DeliveryStatusBadge({ status }: { status: keyof typeof deliveryVariants }) {
  return <Badge variant={deliveryVariants[status]}>{status.replace('_', ' ')}</Badge>
}
