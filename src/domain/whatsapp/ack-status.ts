import type { MessageStatus } from '@/types'

/**
 * WAHA ack numeric values:
 * -1 ERROR, 0 PENDING, 1 SERVER (sent), 2 DEVICE (delivered), 3 READ, 4 PLAYED
 */
export function mapWahaAckToStatus(
  ack: number | string | null | undefined,
): MessageStatus | null {
  const n = typeof ack === 'string' ? Number(ack) : ack
  if (n == null || Number.isNaN(n)) return null
  if (n < 0) return 'failed'
  if (n <= 1) return 'sent'
  if (n === 2) return 'delivered'
  if (n >= 3) return 'read'
  return null
}

const STATUS_RANK: Record<string, number> = {
  sending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: -1,
}

export function shouldUpgradeStatus(
  current: string,
  next: MessageStatus,
): boolean {
  if (next === 'failed') return true
  if (current === 'failed') return false
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0)
}
