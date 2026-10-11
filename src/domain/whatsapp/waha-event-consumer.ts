import { readFileSync } from 'node:fs'
import path from 'node:path'
import { prisma } from '@/domain/db/prisma'
import type { WahaAckPayload } from '@/domain/whatsapp/ack'
import { ingestWahaAck } from '@/domain/whatsapp/ack'
import type { WahaMessagePayload } from '@/domain/whatsapp/inbound'
import { ingestWahaMessage } from '@/domain/whatsapp/inbound'
import {
  wahaEventsUrl,
  wahaWebSocketUrl,
} from '@/domain/whatsapp/waha-transport'

type ParsedEvent = {
  event: string
  payload: unknown
  session: string | null
}

type SessionRow = { accountId: string; wahaSession: string }

type Transport = 'sse' | 'websocket'

const GLOBAL_KEY = '__zaptivoWahaConsumer'
const TRANSPORT_NOTE = 'docs/superpowers/notes/2026-10-10-waha-transport.md'
const BACKOFF_START_MS = 1000
const BACKOFF_MAX_MS = 15000

export function parseWahaEventData(raw: string): ParsedEvent | null {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  if (typeof obj.event !== 'string') return null
  const { event, session, payload, ...rest } = obj
  return {
    event,
    session: typeof session === 'string' ? session : null,
    payload: 'payload' in obj ? payload : rest,
  }
}

export function consumerEnabled(env: {
  WAHA_EVENT_CONSUMER?: string
  WAHA_BASE_URL?: string
  NEXT_PHASE?: string
}): boolean {
  return (
    env.WAHA_EVENT_CONSUMER === '1' &&
    Boolean(env.WAHA_BASE_URL && env.WAHA_BASE_URL.trim() !== '') &&
    env.NEXT_PHASE !== 'phase-production-build'
  )
}

function readTransport(): Transport {
  try {
    const text = readFileSync(path.join(process.cwd(), TRANSPORT_NOTE), 'utf8')
    const match = /Transporte:\s*(sse|websocket)/i.exec(text)
    if (match) return match[1].toLowerCase() as Transport
  } catch {
    // arquivo ausente: padrão websocket
  }
  return 'websocket'
}

async function handleEvent(row: SessionRow, parsed: ParsedEvent) {
  const { accountId, wahaSession: session } = row
  try {
    if (parsed.event === 'message' || parsed.event === 'message.any') {
      await ingestWahaMessage({
        accountId,
        payload: parsed.payload as WahaMessagePayload,
        session,
      })
    } else if (parsed.event === 'message.ack') {
      await ingestWahaAck({
        accountId,
        payload: parsed.payload as WahaAckPayload,
      })
    } else if (parsed.event === 'session.status') {
      const status = (parsed.payload as { status?: unknown } | null)?.status
      if (typeof status === 'string') {
        await prisma.whatsappConfig.updateMany({
          where: { wahaSession: session },
          data: { status },
        })
      }
    }
  } catch (err) {
    console.error(
      '[waha-consumer] falha ao tratar evento',
      parsed.event,
      err instanceof Error ? err.message : 'erro desconhecido',
    )
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/** Resolve quando o socket fecha. Nunca loga a URL (contém a chave). */
function connectWebSocket(
  row: SessionRow,
  onOpen: () => void,
): Promise<void> {
  let url = wahaWebSocketUrl(process.env.WAHA_BASE_URL!, row.wahaSession)
  const key = process.env.WAHA_API_KEY
  if (key) url += `&x-api-key=${encodeURIComponent(key)}`
  if (typeof WebSocket === 'undefined') {
    throw new Error('WebSocket global missing')
  }
  return new Promise<void>((resolve) => {
    const ws = new WebSocket(url)
    ws.onopen = () => onOpen()
    ws.onmessage = (msg: MessageEvent) => {
      const parsed = parseWahaEventData(String(msg.data))
      if (parsed) void handleEvent(row, parsed)
    }
    ws.onerror = () => {
      // onclose sempre segue; o reconnect acontece lá
    }
    ws.onclose = () => resolve()
  })
}

async function connectSse(row: SessionRow, onOpen: () => void): Promise<void> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' }
  if (process.env.WAHA_API_KEY) headers['X-Api-Key'] = process.env.WAHA_API_KEY
  const res = await fetch(
    wahaEventsUrl(process.env.WAHA_BASE_URL!, row.wahaSession),
    { headers },
  )
  if (!res.ok || !res.body) throw new Error(`SSE status ${res.status}`)
  onOpen()
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).replace(/^ /, ''))
        .join('\n')
      if (!data) continue
      const parsed = parseWahaEventData(data)
      if (parsed) void handleEvent(row, parsed)
    }
  }
}

async function watchSession(row: SessionRow, transport: Transport) {
  let delay = BACKOFF_START_MS
  for (;;) {
    try {
      const onOpen = () => {
        delay = BACKOFF_START_MS
      }
      if (transport === 'sse') await connectSse(row, onOpen)
      else await connectWebSocket(row, onOpen)
    } catch (err) {
      console.error(
        '[waha-consumer] conexão falhou',
        row.wahaSession,
        err instanceof Error ? err.message : 'erro desconhecido',
      )
    }
    await sleep(delay)
    delay = Math.min(delay * 2, BACKOFF_MAX_MS)
  }
}

export async function startWahaEventConsumer(): Promise<void> {
  if (
    !consumerEnabled({
      WAHA_EVENT_CONSUMER: process.env.WAHA_EVENT_CONSUMER,
      WAHA_BASE_URL: process.env.WAHA_BASE_URL,
      NEXT_PHASE: process.env.NEXT_PHASE,
    })
  ) {
    return
  }
  const g = globalThis as Record<string, unknown>
  if (g[GLOBAL_KEY]) return
  g[GLOBAL_KEY] = true

  const transport = readTransport()
  const rows = await prisma.whatsappConfig.findMany({
    select: { accountId: true, wahaSession: true },
  })
  for (const row of rows) void watchSession(row, transport)
}
