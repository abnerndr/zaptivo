/** Provider-neutral values: credentials and persistence remain the caller's responsibility. */
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'played'
export type MediaKind = 'image' | 'video' | 'document' | 'audio'
export type Quote = { messageId: string; participant: string }
export type SendContext = { to: string; operationId: string; quote?: Quote }
export type SendResult = { operationId: string; remoteId: string; timestamp?: string }
export type MediaDownload = {
  kind: MediaKind; url?: string; directPath?: string; mediaKey: string
  mimeType: string; fileSha256: string; fileEncSha256?: string; fileLength: number
}
export type TransportErrorCode = 'configuration' | 'authentication' | 'invalid_request' | 'not_found' | 'conflict' | 'rate_limit' | 'provider' | 'network' | 'timeout' | 'invalid_response' | 'unsupported'
export class WhatsAppTransportError extends Error {
  constructor(public readonly code: TransportErrorCode, message: string, public readonly operationId?: string, public readonly httpStatus?: number, public readonly outcomeUnknown = false) {
    super(message)
    this.name = 'WhatsAppTransportError'
  }
}
export interface WhatsAppTransport {
  connect(): Promise<void>
  qr(): Promise<string | null>
  status(): Promise<{ connected: boolean; loggedIn: boolean }>
  disconnect(): Promise<void>
  sendText(input: SendContext & { text: string }): Promise<SendResult>
  sendAudio(input: SendContext & { opus: Uint8Array; voice: boolean }): Promise<SendResult>
  sendMedia(input: SendContext & { kind: Exclude<MediaKind, 'audio'>; bytes: Uint8Array; mimeType: string; fileName?: string; caption?: string }): Promise<SendResult>
  react(input: { to: string; messageId: string; emoji: string; fromMe?: boolean; participant?: string; operationId: string }): Promise<void>
  markRead(input: { chat: string; sender: string; messageIds: string[]; operationId: string }): Promise<void>
  downloadMedia(input: MediaDownload): Promise<{ bytes: Uint8Array; mimeType: string }>
}
/** Pure monotonic merge; durable storage must atomically apply it to early and late receipts. */
export function mergeDeliveryStatus(current: DeliveryStatus | null, next: DeliveryStatus): DeliveryStatus {
  const rank: Record<DeliveryStatus, number> = { sent: 0, delivered: 1, read: 2, played: 3 }
  return current && rank[current] >= rank[next] ? current : next
}
