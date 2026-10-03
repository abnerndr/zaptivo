import { prisma } from '@/domain/db/prisma'
import { notifyAccount } from '@/domain/db/notify'
import {
  extractCanonicalMessageId,
  normalizeWahaMessageId,
} from '@/domain/whatsapp/message-id'
import {
  mapWahaAckToStatus,
  shouldUpgradeStatus,
} from '@/domain/whatsapp/ack-status'

export { mapWahaAckToStatus } from '@/domain/whatsapp/ack-status'

export type WahaAckPayload = {
  id?: string
  ack?: number | string
  from?: string
  to?: string
  fromMe?: boolean
  _data?: {
    key?: { id?: string }
    Info?: { ID?: string }
    ack?: number | string
  } | null
}

/**
 * Apply a WAHA `message.ack` event to the matching outbound message.
 */
export async function ingestWahaAck(args: {
  accountId: string
  payload: WahaAckPayload
}): Promise<{ ok: boolean; reason?: string; messageId?: string }> {
  const { accountId, payload } = args
  const waMessageId =
    extractCanonicalMessageId(payload) ??
    normalizeWahaMessageId(payload.id)
  if (!waMessageId) {
    return { ok: false, reason: 'no_message_id' }
  }

  const ackRaw = payload.ack ?? payload._data?.ack
  const nextStatus = mapWahaAckToStatus(ackRaw)
  if (!nextStatus) {
    return { ok: false, reason: 'unknown_ack' }
  }

  const message = await prisma.message.findFirst({
    where: {
      conversation: { accountId },
      OR: [
        { messageId: waMessageId },
        { messageId: { endsWith: `_${waMessageId}` } },
      ],
    },
    select: {
      id: true,
      status: true,
      conversationId: true,
      senderType: true,
    },
  })

  if (!message) {
    return { ok: false, reason: 'message_not_found' }
  }

  // Only upgrade agent/bot outbound receipts
  if (message.senderType === 'customer') {
    return { ok: true, reason: 'skip_inbound', messageId: message.id }
  }

  if (!shouldUpgradeStatus(message.status, nextStatus)) {
    return { ok: true, reason: 'no_upgrade', messageId: message.id }
  }

  await prisma.message.update({
    where: { id: message.id },
    data: { status: nextStatus },
  })

  await notifyAccount({
    table: 'messages',
    op: 'UPDATE',
    id: message.id,
    accountId,
  }).catch(() => {})

  return { ok: true, messageId: message.id }
}
