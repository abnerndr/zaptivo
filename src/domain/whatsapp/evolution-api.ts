import { timingSafeEqual } from 'node:crypto'

export type EvolutionSessionStatus = 'WORKING' | 'SCAN_QR_CODE' | 'STOPPED' | 'STARTING'

export class EvolutionQrError extends Error {
  constructor(
    message: string,
    public readonly status: EvolutionSessionStatus | null,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'EvolutionQrError'
  }
}

function baseUrl(): string {
  const u = process.env.EVOLUTION_BASE_URL?.replace(/\/$/, '')
  if (!u) throw new Error('EVOLUTION_BASE_URL missing')
  return u
}

function apiKey(): string {
  const key = process.env.EVOLUTION_API_KEY?.trim()
  if (!key) throw new Error('EVOLUTION_API_KEY missing')
  return key
}

function headers(): HeadersInit {
  return { apikey: apiKey(), 'Content-Type': 'application/json' }
}

export function evolutionWebhookAuthorized(req: Request): boolean {
  const expected = (
    process.env.EVOLUTION_WEBHOOK_SECRET || process.env.EVOLUTION_API_KEY
  )?.trim()
  if (!expected) return false
  const got = (
    req.headers.get('apikey') || req.headers.get('x-evolution-apikey') || ''
  ).trim()
  if (!got) return false
  const a = Buffer.from(got)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function mapEvolutionState(state: string | null | undefined): EvolutionSessionStatus {
  const s = (state ?? '').toLowerCase()
  if (s === 'open') return 'WORKING'
  if (s === 'connecting') return 'SCAN_QR_CODE'
  if (s === 'close' || s === 'closed') return 'STOPPED'
  return 'STARTING'
}

async function readError(res: Response): Promise<string> {
  return (await res.text()).slice(0, 300)
}

export async function getSession(instance: string): Promise<{
  status: EvolutionSessionStatus
  me: { id?: string; pushName?: string } | null
}> {
  const res = await fetch(
    `${baseUrl()}/instance/connectionState/${encodeURIComponent(instance)}`,
    { headers: headers() },
  )
  if (res.status === 404) return { status: 'STOPPED', me: null }
  if (!res.ok) throw new Error(`Evolution connectionState ${res.status}: ${await readError(res)}`)
  const data = (await res.json()) as {
    instance?: { state?: string }
    state?: string
  }
  return {
    status: mapEvolutionState(data.instance?.state ?? data.state),
    me: null,
  }
}

export function evolutionWebhookUrl(): string | null {
  const explicit = process.env.EVOLUTION_WEBHOOK_URL?.replace(/\/$/, '')
  const site = (explicit || process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
  if (!site) return null
  const url = site.includes('/api/whatsapp/webhook')
    ? site
    : `${site}/api/whatsapp/webhook`
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) return null
  return url
}

export async function ensureSession(instance: string): Promise<{
  status: EvolutionSessionStatus
  me: { id?: string; pushName?: string } | null
}> {
  const current = await getSession(instance).catch(() => null)
  if (current && current.status !== 'STOPPED') return current

  const create = await fetch(`${baseUrl()}/instance/create`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      instanceName: instance,
      integration: 'WHATSAPP-BAILEYS',
      qrcode: true,
    }),
  })
  if (!create.ok && create.status !== 403 && create.status !== 409) {
    const text = await readError(create)
    if (!/already|exists/i.test(text)) {
      throw new Error(`Evolution create ${create.status}: ${text}`)
    }
  }

  const hook = evolutionWebhookUrl()
  if (hook) {
    await fetch(`${baseUrl()}/webhook/set/${encodeURIComponent(instance)}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        enabled: true,
        url: hook,
        webhookByEvents: false,
        webhookBase64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'QRCODE_UPDATED',
          'SEND_MESSAGE',
        ],
      }),
    }).catch(() => {})
  }

  return getSession(instance)
}

export async function logoutSession(instance: string): Promise<void> {
  const res = await fetch(
    `${baseUrl()}/instance/logout/${encodeURIComponent(instance)}`,
    { method: 'DELETE', headers: headers() },
  )
  if (!res.ok && res.status !== 404) {
    throw new Error(`Evolution logout ${res.status}: ${await readError(res)}`)
  }
}

export async function stopSession(instance: string): Promise<void> {
  await logoutSession(instance)
}

export async function getQr(instance: string): Promise<ArrayBuffer> {
  const live = await getSession(instance)
  if (live.status === 'WORKING') {
    throw new EvolutionQrError('Sessão já conectada', 'WORKING', 409)
  }
  const res = await fetch(
    `${baseUrl()}/instance/connect/${encodeURIComponent(instance)}`,
    { headers: headers() },
  )
  if (!res.ok) {
    throw new EvolutionQrError(
      `Evolution connect ${res.status}`,
      live.status,
      502,
    )
  }
  const data = (await res.json()) as { base64?: string; qrcode?: { base64?: string } }
  const raw = data.base64 || data.qrcode?.base64
  if (!raw) throw new EvolutionQrError('QR ausente', live.status, 409)
  const b64 = raw.includes(',') ? raw.split(',')[1] : raw
  const buf = Buffer.from(b64, 'base64')
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
}

function messageIdFrom(data: unknown): string {
  if (!data || typeof data !== 'object') return 'unknown'
  const row = data as { key?: { id?: string }; id?: string }
  return String(row.key?.id || row.id || 'unknown')
}

export async function sendText(args: {
  instance: string
  number: string
  text: string
}): Promise<{ id: string }> {
  const res = await fetch(
    `${baseUrl()}/message/sendText/${encodeURIComponent(args.instance)}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number: args.number.replace(/\D/g, ''),
        text: args.text,
      }),
    },
  )
  if (!res.ok) throw new Error(`Evolution sendText ${res.status}: ${await readError(res)}`)
  return { id: messageIdFrom(await res.json()) }
}

export async function sendMedia(args: {
  instance: string
  number: string
  mediatype: 'image' | 'video' | 'document' | 'audio'
  media: string
  caption?: string
  fileName?: string
}): Promise<{ id: string }> {
  const res = await fetch(
    `${baseUrl()}/message/sendMedia/${encodeURIComponent(args.instance)}`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        number: args.number.replace(/\D/g, ''),
        mediatype: args.mediatype,
        media: args.media,
        caption: args.caption,
        fileName: args.fileName,
      }),
    },
  )
  if (!res.ok) throw new Error(`Evolution sendMedia ${res.status}: ${await readError(res)}`)
  return { id: messageIdFrom(await res.json()) }
}
