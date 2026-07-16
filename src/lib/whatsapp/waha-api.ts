/**
 * WAHA HTTP API client.
 * @see https://waha.devlike.pro/docs/integrations/javascript/
 */

function baseUrl(): string {
  const u = process.env.WAHA_BASE_URL
  if (!u) throw new Error('WAHA_BASE_URL missing')
  return u.replace(/\/$/, '')
}

function headers(): HeadersInit {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.WAHA_API_KEY) {
    h['X-Api-Key'] = process.env.WAHA_API_KEY
  }
  return h
}

export function toChatId(e164Digits: string): string {
  const n = e164Digits.replace(/\D/g, '')
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

export async function getSession(session: string): Promise<unknown> {
  const res = await fetch(
    `${baseUrl()}/api/sessions/${encodeURIComponent(session)}`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error(`WAHA getSession ${res.status}`)
  return res.json()
}

export async function getQr(session: string): Promise<ArrayBuffer> {
  const res = await fetch(
    `${baseUrl()}/api/${encodeURIComponent(session)}/auth/qr`,
    { headers: headers() }
  )
  if (!res.ok) throw new Error(`WAHA QR ${res.status}: ${await res.text()}`)
  return res.arrayBuffer()
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
