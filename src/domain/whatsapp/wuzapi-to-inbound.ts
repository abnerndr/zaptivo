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
          download: (() => {
            const metadata = event.media!.metadata
            const value = (name: string) => {
              const key = Object.keys(metadata).find((item) => item.toLowerCase() === name.toLowerCase())
              return key ? metadata[key] : undefined
            }
            const mediaKey = value('mediaKey')
            const fileSha256 = value('fileSha256')
            const fileEncSha256 = value('fileEncSha256')
            const directPath = value('directPath')
            const length = Number(value('fileLength'))
            if (typeof mediaKey !== 'string' || typeof fileSha256 !== 'string' || !Number.isSafeInteger(length) || length < 0 || !event.media!.mimeType) return undefined
            return {
              kind: event.media!.kind,
              url: event.media!.url,
              directPath: typeof directPath === 'string' ? directPath : undefined,
              mediaKey,
              mimeType: event.media!.mimeType,
              fileSha256,
              fileEncSha256: typeof fileEncSha256 === 'string' ? fileEncSha256 : undefined,
              fileLength: length,
            }
          })(),
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
