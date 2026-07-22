/**
 * WAHA HTTP API client.
 * @see https://waha.devlike.pro/docs/how-to/sessions/
 * @see https://waha.devlike.pro/docs/integrations/javascript/
 */

export type WahaSessionStatus =
  | 'STOPPED'
  | 'STARTING'
  | 'SCAN_QR_CODE'
  | 'WORKING'
  | 'FAILED'
  | string

export type WahaSessionInfo = {
  name: string
  status: WahaSessionStatus
  me?: { id?: string; pushName?: string } | null
}

function baseUrl(): string {
  const u = process.env.WAHA_BASE_URL
  if (!u) throw new Error('WAHA_BASE_URL missing')
  return u.replace(/\/$/, '')
}

function headers(extra?: HeadersInit): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  if (process.env.WAHA_API_KEY) {
    h['X-Api-Key'] = process.env.WAHA_API_KEY
  }
  if (extra) Object.assign(h, extra)
  return h
}

export function toChatId(e164Digits: string): string {
  const n = e164Digits.replace(/\D/g, '')
  // Never send a Linked ID as @c.us — WAHA/GOWS rejects it.
  // Callers must resolve LID → phone before calling this.
  return `${n}@c.us`
}

/** Prefer @c.us for phones; keep @lid when the value is still a Linked ID. */
export function toWahaChatId(phoneOrLid: string): string {
  const raw = phoneOrLid.trim()
  if (raw.includes('@')) return raw
  const n = raw.replace(/\D/g, '')
  if (n.length >= 14) return `${n}@lid`
  return `${n}@c.us`
}

export interface WahaSendResult {
  id: string
}

async function parseId(res: Response): Promise<WahaSendResult> {
  const data = (await res.json()) as {
    id?: string
    key?: { id?: string }
  }
  const id = data.id ?? data.key?.id ?? 'unknown'
  return { id: String(id) }
}

function webhookConfig() {
  // Prefer explicit webhook URL (tunnel/prod) over SITE_URL so local
  // NEXT_PUBLIC_SITE_URL=localhost can still receive WAHA events.
  const explicit = process.env.WAHA_WEBHOOK_URL?.replace(/\/$/, '')
  const site = (
    explicit || process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || ''
  ).replace(/\/$/, '')
  const secret = process.env.WAHA_WEBHOOK_SECRET
  if (!site) return undefined
  const webhookUrl = explicit
    ? site.includes('/api/whatsapp/webhook')
      ? site
      : `${site}/api/whatsapp/webhook`
    : `${site}/api/whatsapp/webhook`
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(webhookUrl)) {
    console.warn(
      '[waha] Webhook URL is localhost — WAHA cannot deliver. Set WAHA_WEBHOOK_URL to a public URL (prod/tunnel).',
    )
    return undefined
  }
  return {
    url: webhookUrl,
    events: ['session.status', 'message', 'message.any'],
    ...(secret
      ? {
          hmac: { key: secret },
          customHeaders: [{ name: 'X-Waha-Webhook-Secret', value: secret }],
        }
      : {}),
  }
}

export async function updateSessionWebhooks(session: string): Promise<void> {
  const webhook = webhookConfig()
  if (!webhook) return
  const res = await fetch(
    `${baseUrl()}/api/sessions/${encodeURIComponent(session)}`,
    {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({
        name: session,
        config: { webhooks: [webhook] },
      }),
    },
  )
  if (!res.ok) {
    console.warn(
      '[waha] updateSessionWebhooks',
      res.status,
      await res.text().catch(() => ''),
    )
  }
}

export type WahaChatSummary = {
  id?: string
  chatId?: string
  name?: string | null
}

export type WahaChatMessage = {
  id?: string
  timestamp?: number
  from?: string
  to?: string
  fromMe?: boolean
  body?: string | null
  hasMedia?: boolean
  media?: {
    url?: string | null
    mimetype?: string | null
    filename?: string | null
  } | null
  _data?: {
    pushName?: string
    notifyName?: string
    key?: {
      remoteJid?: string
      remoteJidAlt?: string
      fromMe?: boolean
    }
  } | null
}

export async function listChats(
  session: string,
  limit = 50,
): Promise<WahaChatSummary[]> {
  const res = await fetch(
    `${baseUrl()}/api/${encodeURIComponent(session)}/chats?limit=${limit}`,
    { headers: headers() },
  )
  if (!res.ok) {
    // fallback older path
    const res2 = await fetch(
      `${baseUrl()}/api/chats?session=${encodeURIComponent(session)}&limit=${limit}`,
      { headers: headers() },
    )
    if (!res2.ok) {
      throw new Error(`WAHA listChats ${res.status}: ${await res.text()}`)
    }
    const data2 = (await res2.json()) as WahaChatSummary[] | { chats?: WahaChatSummary[] }
    return Array.isArray(data2) ? data2 : (data2.chats ?? [])
  }
  const data = (await res.json()) as WahaChatSummary[] | { chats?: WahaChatSummary[] }
  return Array.isArray(data) ? data : (data.chats ?? [])
}

export async function getChatMessages(
  session: string,
  chatId: string,
  limit = 30,
  opts?: { sinceUnix?: number },
): Promise<WahaChatMessage[]> {
  const encoded = encodeURIComponent(chatId)
  const params = new URLSearchParams({
    limit: String(limit),
    downloadMedia: 'false',
  })
  if (opts?.sinceUnix && Number.isFinite(opts.sinceUnix)) {
    params.set('filter.timestamp.gte', String(Math.floor(opts.sinceUnix)))
  }
  const res = await fetch(
    `${baseUrl()}/api/${encodeURIComponent(session)}/chats/${encoded}/messages?${params}`,
    { headers: headers() },
  )
  if (!res.ok) {
    throw new Error(`WAHA getChatMessages ${res.status}: ${await res.text()}`)
  }
  const data = (await res.json()) as
    | WahaChatMessage[]
    | { messages?: WahaChatMessage[] }
  return Array.isArray(data) ? data : (data.messages ?? [])
}

/** Map WhatsApp Linked ID (@lid) → phone chat id (@c.us). */
export async function resolveLidToPhone(
  session: string,
  lid: string,
): Promise<string | null> {
  const raw = lid.includes('@') ? lid : `${lid.replace(/\D/g, '')}@lid`
  const encoded = encodeURIComponent(raw)
  const res = await fetch(
    `${baseUrl()}/api/${encodeURIComponent(session)}/lids/${encoded}`,
    { headers: headers() },
  )
  if (!res.ok) {
    console.warn('[waha] resolveLidToPhone', res.status, await res.text().catch(() => ''))
    return null
  }
  const data = (await res.json()) as { lid?: string; pn?: string | null }
  return data.pn ?? null
}

export async function getWahaContact(
  session: string,
  contactId: string,
): Promise<{ id?: string; name?: string; pushname?: string } | null> {
  const res = await fetch(
    `${baseUrl()}/api/contacts?session=${encodeURIComponent(session)}&contactId=${encodeURIComponent(contactId)}`,
    { headers: headers() },
  )
  if (!res.ok) return null
  return (await res.json()) as { id?: string; name?: string; pushname?: string }
}

export async function sendText(args: {
  session: string
  chatId: string
  text: string
}): Promise<WahaSendResult> {
  const res = await fetch(`${baseUrl()}/api/sendText`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`WAHA sendText ${res.status}: ${await res.text()}`)
  }
  return parseId(res)
}

export async function sendImage(args: {
  session: string
  chatId: string
  file: { url: string; mimetype?: string; filename?: string }
  caption?: string
}): Promise<WahaSendResult> {
  const res = await fetch(`${baseUrl()}/api/sendImage`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`WAHA sendImage ${res.status}: ${await res.text()}`)
  }
  return parseId(res)
}

export async function sendFile(args: {
  session: string
  chatId: string
  file: { url: string; mimetype?: string; filename?: string }
  caption?: string
}): Promise<WahaSendResult> {
  const res = await fetch(`${baseUrl()}/api/sendFile`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(args),
  })
  if (!res.ok) {
    throw new Error(`WAHA sendFile ${res.status}: ${await res.text()}`)
  }
  return parseId(res)
}

export async function getSession(session: string): Promise<WahaSessionInfo> {
  const res = await fetch(
    `${baseUrl()}/api/sessions/${encodeURIComponent(session)}`,
    { headers: headers() },
  )
  if (res.status === 404) {
    throw Object.assign(new Error('WAHA session not found'), { status: 404 })
  }
  if (!res.ok) throw new Error(`WAHA getSession ${res.status}: ${await res.text()}`)
  return (await res.json()) as WahaSessionInfo
}

export async function createSession(session: string): Promise<WahaSessionInfo> {
  const webhook = webhookConfig()
  const res = await fetch(`${baseUrl()}/api/sessions`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      name: session,
      start: true,
      config: webhook ? { webhooks: [webhook] } : undefined,
    }),
  })
  // 422 = already exists
  if (res.status === 422) {
    return getSession(session)
  }
  if (!res.ok) {
    throw new Error(`WAHA createSession ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as WahaSessionInfo
}

export async function startSession(session: string): Promise<Response> {
  return fetch(`${baseUrl()}/api/sessions/${encodeURIComponent(session)}/start`, {
    method: 'POST',
    headers: headers(),
  })
}

export async function stopSession(session: string): Promise<Response> {
  return fetch(`${baseUrl()}/api/sessions/${encodeURIComponent(session)}/stop`, {
    method: 'POST',
    headers: headers(),
  })
}

export async function logoutSession(session: string): Promise<Response> {
  return fetch(
    `${baseUrl()}/api/sessions/${encodeURIComponent(session)}/logout`,
    { method: 'POST', headers: headers() },
  )
}

/** Create if missing, then start. Returns live session info. */
export async function ensureSession(session: string): Promise<WahaSessionInfo> {
  try {
    const live = await getSession(session)
    if (live.status === 'STOPPED' || live.status === 'FAILED') {
      const started = await startSession(session)
      if (!started.ok && started.status !== 422) {
        console.warn('[waha] startSession', started.status, await started.text())
      }
      const after = await getSession(session)
      await updateSessionWebhooks(session).catch(() => {})
      return after
    }
    await updateSessionWebhooks(session).catch(() => {})
    return live
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) {
      return createSession(session)
    }
    throw err
  }
}

export class WahaQrError extends Error {
  constructor(
    message: string,
    public readonly status: WahaSessionStatus | null,
    public readonly httpStatus: number,
  ) {
    super(message)
    this.name = 'WahaQrError'
  }
}

export async function getQr(session: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `${baseUrl()}/api/${encodeURIComponent(session)}/auth/qr?format=image`,
    {
      headers: headers({
        Accept: 'image/png',
      }),
    },
  )

  if (res.ok) {
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      // some builds return base64 JSON when Accept is wrong — rare with format=image
      const data = (await res.json()) as { data?: string; mimetype?: string }
      if (data.data?.startsWith('data:')) {
        const b64 = data.data.split(',')[1] ?? ''
        const bin = Buffer.from(b64, 'base64')
        return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength)
      }
    }
    return res.arrayBuffer()
  }

  let liveStatus: WahaSessionStatus | null = null
  let detail = await res.text()
  try {
    const parsed = JSON.parse(detail) as {
      error?: string
      status?: string
      expected?: string[]
    }
    liveStatus = parsed.status ?? null
    if (parsed.error) detail = parsed.error
    if (liveStatus === 'WORKING') {
      throw new WahaQrError(
        'Sessão já autenticada (WORKING). Não há QR — use Logout para reconectar.',
        liveStatus,
        409,
      )
    }
    if (liveStatus && liveStatus !== 'SCAN_QR_CODE') {
      throw new WahaQrError(
        `QR indisponível: status WAHA é ${liveStatus} (precisa SCAN_QR_CODE).`,
        liveStatus,
        409,
      )
    }
  } catch (err) {
    if (err instanceof WahaQrError) throw err
  }

  throw new WahaQrError(`WAHA QR ${res.status}: ${detail}`, liveStatus, 502)
}

export function verifyWebhookSecret(req: Request): boolean {
  const expected = process.env.WAHA_WEBHOOK_SECRET
  if (!expected) return false
  const header =
    req.headers.get('x-waha-webhook-secret') ??
    req.headers.get('x-webhook-secret') ??
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return header === expected
}
