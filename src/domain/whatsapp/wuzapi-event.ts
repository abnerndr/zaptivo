import type { DeliveryStatus, MediaKind } from './transport'

export type WuzapiEvent =
  | { type: 'message' | 'send-echo'; id: string; chat: string; sender?: string; senderPn?: string; senderLid?: string; timestamp?: string; pushName?: string; text: string | null; quote?: { messageId: string; participant?: string }; media?: { kind: MediaKind; mimeType?: string; fileName?: string; url?: string; metadata: Record<string, unknown> } }
  | { type: 'receipt'; messageIds: string[]; chat?: string; sender?: string; status: DeliveryStatus; timestamp?: string }
  | { type: 'connection'; status: 'connected' | 'disconnected' | 'connecting' }
  | { type: 'qr'; qr: string }
  | { type: 'ignored'; event: string }

type Row = Record<string, unknown>
function row(value: unknown): Row { return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {} }
function get(value: unknown, ...keys: string[]): unknown {
  const obj = row(value)
  for (const key of keys) {
    const found = Object.keys(obj).find(k => k.toLowerCase().replaceAll('_', '') === key.toLowerCase().replaceAll('_', ''))
    if (found !== undefined && obj[found] != null) return obj[found]
  }
}
function str(value: unknown): string | undefined { return typeof value === 'string' && value.length ? value : undefined }
function receiptStatus(value: unknown): DeliveryStatus | undefined {
  const name = String(value ?? '').toLowerCase().replaceAll('_', '')
  if (name === 'delivered' || name === 'delivery') return 'delivered'
  if (name === 'read' || name === 'readself') return 'read'
  if (name === 'played' || name === 'playedself') return 'played'
  if (name === 'sent' || name === 'server') return 'sent'
}

/** Parse only after the caller authenticates the original webhook body. Never log payloads or tokens. */
export function parseWuzapiWebhook(body: unknown, logUnknown: (event: string) => void = event => console.warn('Ignored WuzAPI event:', event)): WuzapiEvent {
  const eventType = str(get(body, 'type')) ?? ''
  const event = get(body, 'event')
  const kind = eventType.toLowerCase()
  if (kind === 'connected' || kind === 'pairsuccess') return { type: 'connection', status: 'connected' }
  if (['disconnected', 'loggedout', 'connectfailure', 'qrtimeout'].includes(kind)) return { type: 'connection', status: 'disconnected' }
  if (kind === 'connecting') return { type: 'connection', status: 'connecting' }
  if (kind === 'qr') {
    const qr = str(get(body, 'qrCodeBase64')) ?? str(get(event, 'QRCode', 'code')) ?? (event === 'code' ? undefined : str(event))
    if (qr) return { type: 'qr', qr }
  }
  if (kind === 'readreceipt' || kind === 'receipt') {
    const status = receiptStatus(get(body, 'state') ?? get(event, 'type'))
    const ids = get(event, 'MessageIDs')
    const messageIds = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string' && !!id) : []
    if (status && messageIds.length) return { type: 'receipt', status, messageIds, chat: str(get(event, 'Chat')), sender: str(get(event, 'Sender')), timestamp: str(get(event, 'Timestamp')) }
  }
  if (kind === 'message' || kind === 'sendmessage') {
    const info = get(event, 'Info')
    const id = str(get(info, 'ID'))
    const chat = str(get(info, 'Chat'))
    let message = get(event, 'Message')
    for (const wrapper of ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'documentWithCaptionMessage', 'deviceSentMessage']) {
      const wrapped = get(message, wrapper)
      if (wrapped) message = get(wrapped, 'message') ?? message
    }
    if (id && chat) {
      const mediaKinds: [string, MediaKind][] = [['imageMessage', 'image'], ['videoMessage', 'video'], ['documentMessage', 'document'], ['audioMessage', 'audio']]
      const found = mediaKinds.map(([key, mediaKind]) => ({ mediaKind, data: get(message, key) })).find(part => part.data)
      const extended = get(message, 'extendedTextMessage')
      const content = found?.data ?? extended
      const context = get(content, 'contextInfo')
      const quoteId = str(get(context, 'stanzaId'))
      const sender = str(get(info, 'Sender'))
      const senderAlt = str(get(info, 'SenderAlt'))
      const senderPn = [str(get(info, 'SenderPn')), sender, senderAlt].find(jid => jid?.endsWith('@s.whatsapp.net'))
      const senderLid = [str(get(info, 'SenderLID')), sender, senderAlt].find(jid => jid?.endsWith('@lid'))
      const text = str(get(message, 'conversation')) ?? str(get(extended, 'text')) ?? str(get(found?.data, 'caption')) ?? null
      return {
        type: get(info, 'IsFromMe') === true || kind === 'sendmessage' ? 'send-echo' : 'message', id, chat,
        sender, senderPn, senderLid,
        timestamp: str(get(info, 'Timestamp')), pushName: str(get(info, 'PushName')), text,
        ...(quoteId ? { quote: { messageId: quoteId, participant: str(get(context, 'participant')) } } : {}),
        ...(found ? { media: { kind: found.mediaKind, mimeType: str(get(found.data, 'mimetype')), fileName: str(get(found.data, 'fileName')), url: str(get(found.data, 'URL')), metadata: row(found.data) } } : {}),
      }
    }
  }
  const safeEvent = eventType.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 80)
  logUnknown(safeEvent)
  return { type: 'ignored', event: safeEvent }
}
