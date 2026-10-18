import type { WahaAckPayload } from '@/domain/whatsapp/ack'
import type { WahaMessagePayload } from '@/domain/whatsapp/inbound'
import { mapEvolutionState, type EvolutionSessionStatus } from '@/domain/whatsapp/evolution-api'

export type EvolutionInbound =
  | { type: 'skip'; event: string }
  | { type: 'connection'; instance: string; status: EvolutionSessionStatus }
  | { type: 'ack'; instance: string; payload: WahaAckPayload }
  | { type: 'message'; instance: string; payload: WahaMessagePayload }

function normEvent(event: string): string {
  return event.trim().toLowerCase().replaceAll('_', '.')
}

function textOf(message: Record<string, unknown> | null | undefined): string | null {
  if (!message) return null
  if (typeof message.conversation === 'string') return message.conversation
  const ext = message.extendedTextMessage as { text?: string } | undefined
  if (typeof ext?.text === 'string') return ext.text
  for (const key of ['imageMessage', 'videoMessage', 'documentMessage'] as const) {
    const part = message[key] as { caption?: string } | undefined
    if (typeof part?.caption === 'string' && part.caption.trim()) return part.caption
  }
  return null
}

function mediaOf(message: Record<string, unknown> | null | undefined): WahaMessagePayload['media'] {
  if (!message) return null
  const pairs: [string, string][] = [
    ['imageMessage', 'image'],
    ['audioMessage', 'audio'],
    ['videoMessage', 'video'],
    ['documentMessage', 'document'],
  ]
  for (const [key, kind] of pairs) {
    const part = message[key] as { mimetype?: string; url?: string; fileName?: string } | undefined
    if (!part) continue
    return {
      url: part.url ?? null,
      mimetype: part.mimetype ?? `${kind}/*`,
      filename: part.fileName ?? null,
    }
  }
  return null
}

function ackNumber(status: unknown): number | undefined {
  if (typeof status === 'number') return status
  const name = String(status ?? '').toUpperCase()
  if (name === 'READ' || name === 'READ_ACK') return 4
  if (name === 'DELIVERY_ACK' || name === 'DELIVERED') return 3
  if (name === 'SERVER_ACK' || name === 'SENT') return 2
  if (name === 'PLAYED') return 5
  if (name === 'ERROR') return 0
  return undefined
}

export function parseEvolutionWebhook(body: unknown): EvolutionInbound {
  if (!body || typeof body !== 'object') return { type: 'skip', event: '' }
  const row = body as {
    event?: string
    instance?: string
    data?: Record<string, unknown> | Record<string, unknown>[]
  }
  const event = normEvent(String(row.event ?? ''))
  const instance = String(row.instance ?? '').trim()
  const data = Array.isArray(row.data) ? row.data[0] : row.data
  if (!instance) return { type: 'skip', event }

  if (event === 'connection.update' || event === 'qrcode.updated') {
    const state =
      event === 'qrcode.updated'
        ? 'connecting'
        : String((data as { state?: string } | undefined)?.state ?? '')
    return { type: 'connection', instance, status: mapEvolutionState(state) }
  }

  if (event === 'messages.update') {
    const key = (data?.key ?? {}) as { id?: string; remoteJid?: string; fromMe?: boolean }
    const status = (data?.update as { status?: unknown } | undefined)?.status ?? data?.status
    return {
      type: 'ack',
      instance,
      payload: {
        id: key.id,
        from: key.remoteJid,
        fromMe: Boolean(key.fromMe),
        ack: ackNumber(status),
      },
    }
  }

  if (event === 'messages.upsert' || event === 'send.message') {
    const key = (data?.key ?? {}) as { id?: string; remoteJid?: string; fromMe?: boolean }
    const message = (data?.message ?? null) as Record<string, unknown> | null
    const media = mediaOf(message)
    const ts = Number(data?.messageTimestamp)
    return {
      type: 'message',
      instance,
      payload: {
        id: key.id,
        from: key.remoteJid,
        fromMe: Boolean(key.fromMe),
        body: textOf(message),
        timestamp: Number.isFinite(ts) ? ts : undefined,
        pushName: typeof data?.pushName === 'string' ? data.pushName : undefined,
        hasMedia: Boolean(media),
        media,
        source: event === 'send.message' ? 'api' : undefined,
      },
    }
  }

  return { type: 'skip', event }
}
