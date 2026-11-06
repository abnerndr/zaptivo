import type { WahaAckPayload } from '@/domain/whatsapp/ack'
import type { WahaMessagePayload } from '@/domain/whatsapp/inbound'
import type { DeliveryStatus } from './transport'
import type { WuzapiEvent } from './wuzapi-event'

type MessageEvent = Extract<WuzapiEvent, { type: 'message' | 'send-echo' }>
type ReceiptEvent = Extract<WuzapiEvent, { type: 'receipt' }>

const ACK_BY_STATUS: Record<DeliveryStatus, number> = {
  sent: 2,
  delivered: 3,
  read: 4,
  played: 5,
}

export function wuzapiMessageToPayload(event: MessageEvent): WahaMessagePayload {
  const fromMe = event.type === 'send-echo'
  const chat = event.chat
  const sender = event.senderPn ?? event.sender ?? chat
  return {
    id: event.id,
    timestamp: event.timestamp ? Date.parse(event.timestamp) || undefined : undefined,
    from: fromMe ? undefined : sender,
    to: fromMe ? chat : undefined,
    fromMe,
    body: event.text,
    hasMedia: Boolean(event.media),
    media: event.media
      ? {
          url: event.media.url ?? null,
          mimetype: event.media.mimeType ?? null,
          filename: event.media.fileName ?? null,
        }
      : null,
    pushName: event.pushName,
    _data: {
      pushName: event.pushName,
      key: {
        id: event.id,
        remoteJid: chat,
        remoteJidAlt: event.senderPn,
        fromMe,
      },
      Info: {
        Chat: chat,
        SenderAlt: event.senderPn,
        ID: event.id,
      },
    },
  }
}

export function wuzapiReceiptToAck(event: ReceiptEvent): WahaAckPayload[] {
  return event.messageIds.map((id) => ({
    id,
    ack: ACK_BY_STATUS[event.status],
    from: event.sender,
    to: event.chat,
    fromMe: true,
    _data: { key: { id }, ack: ACK_BY_STATUS[event.status] },
  }))
}

export function wuzapiConnectionStatus(
  status: Extract<WuzapiEvent, { type: 'connection' }>['status'],
): string {
  if (status === 'connected') return 'WORKING'
  if (status === 'connecting') return 'STARTING'
  return 'STOPPED'
}
