import { WhatsAppTransportError, type WhatsAppTransport, type SendContext, type SendResult, type MediaDownload } from './transport'
import { whatsappWebhookUrl } from './webhook-url'

// Based on upstream asternic/wuzapi API.md, revision 4f4838c8586e341b1f67850bd77d7828a72e6d04; verify against the installed version.
export function wuzapiWebhookUrl(): string | null {
  return whatsappWebhookUrl(process.env.WUZAPI_WEBHOOK_URL, process.env.NEXT_PUBLIC_SITE_URL)
}

// GetAvatar uses HTTP 500 for a missing or private picture
// ("no avatar found" / "failed to get avatar: …"), not only for outages.
function isWuzapiAvatarMiss(providerError: string): boolean {
  const text = providerError.trim().toLowerCase()
  return text === 'no avatar found' || text.startsWith('failed to get avatar')
}

export class WuzapiTransport implements WhatsAppTransport {
  private readonly base: string
  private readonly token: string
  private readonly timeoutMs: number
  private readonly fetcher: typeof fetch

  constructor(options: { token: string; baseUrl?: string; timeoutMs?: number; fetcher?: typeof fetch }) {
    const raw = options.baseUrl ?? process.env.WUZAPI_BASE_URL
    try {
      const url = new URL(raw || '')
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
      this.base = url.toString().replace(/\/$/, '')
    } catch { throw new WhatsAppTransportError('configuration', 'Invalid WUZAPI_BASE_URL') }
    this.token = options.token.trim()
    if (!this.token) throw new WhatsAppTransportError('configuration', 'WuzAPI account token is missing')
    this.timeoutMs = options.timeoutMs ?? 15000
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) throw new WhatsAppTransportError('configuration', 'Invalid WuzAPI timeout')
    this.fetcher = options.fetcher ?? fetch
  }

  private async request(path: string, body?: object, operationId?: string, mutates = false): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(`${this.base}${path}`, { method: body ? 'POST' : 'GET', headers: { token: this.token, 'Content-Type': 'application/json', ...(operationId ? { 'X-Correlation-ID': operationId } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: controller.signal })
      let json: unknown
      try { json = await response.json() } catch {
        if (controller.signal.aborted) throw new WhatsAppTransportError('timeout', 'WuzAPI request timed out', operationId, undefined, mutates)
        if (!response.ok) throw this.httpError(response.status, operationId, mutates)
        throw new WhatsAppTransportError('invalid_response', 'Invalid WuzAPI response', operationId, response.status, mutates)
      }
      if (!response.ok) {
        const providerError = json && typeof json === 'object' && !Array.isArray(json) && typeof (json as { error?: unknown }).error === 'string'
          ? (json as { error: string }).error
          : ''
        if (response.status === 500 && providerError === 'not connected') {
          throw new WhatsAppTransportError('provider', 'WuzAPI session is not connected yet', operationId, response.status, mutates)
        }
        if (response.status === 500 && isWuzapiAvatarMiss(providerError)) {
          throw new WhatsAppTransportError('not_found', 'WuzAPI avatar is unavailable', operationId, response.status, false)
        }
        throw this.httpError(response.status, operationId, mutates)
      }
      if (!json || typeof json !== 'object' || Array.isArray(json)) throw new WhatsAppTransportError('invalid_response', 'Invalid WuzAPI response', operationId, response.status, mutates)
      const envelope = json as Record<string, unknown>
      if (envelope.success !== true || !envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
        throw new WhatsAppTransportError(envelope.success === false ? 'provider' : 'invalid_response', 'WuzAPI rejected or returned an invalid response', operationId, response.status, mutates)
      }
      return envelope.data as Record<string, unknown>
    } catch (error) {
      if (error instanceof WhatsAppTransportError) throw error
      if (controller.signal.aborted) throw new WhatsAppTransportError('timeout', 'WuzAPI request timed out', operationId, undefined, mutates)
      throw new WhatsAppTransportError('network', 'WuzAPI network request failed', operationId, undefined, mutates)
    } finally { clearTimeout(timer) }
  }
  private httpError(status: number, operationId?: string, mutates = false): WhatsAppTransportError {
    const code = status === 401 || status === 403 ? 'authentication' : status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 429 ? 'rate_limit' : status >= 400 && status < 500 ? 'invalid_request' : 'provider'
    return new WhatsAppTransportError(code, `WuzAPI HTTP ${status}`, operationId, status, mutates && status >= 500)
  }
  async connect(): Promise<void> {
    const url = wuzapiWebhookUrl()
    if (!url) throw new WhatsAppTransportError('configuration', 'WuzAPI webhook URL is missing')
    await this.request('/webhook', { webhook: url, WebhookURL: url, events: ['Message', 'ReadReceipt'] }, undefined, true)
    const configured = await this.request('/webhook')
    const readback = typeof configured.webhook === 'string' ? configured.webhook : null
    if (readback !== url) throw new WhatsAppTransportError('configuration', 'WuzAPI webhook verification failed')
    try {
      await this.request('/session/connect', { Subscribe: ['Message', 'ReadReceipt'], Immediate: true }, undefined, true)
    } catch (error) {
      if (!(error instanceof WhatsAppTransportError) || error.httpStatus !== 409) throw error
    }
  }
  async qr(): Promise<string | null> {
    try {
      const data = await this.request('/session/qr')
      return typeof data.QRCode === 'string' && data.QRCode ? data.QRCode : null
    } catch (error) {
      if (error instanceof WhatsAppTransportError && error.message === 'WuzAPI session is not connected yet') return null
      throw error
    }
  }
  async status(): Promise<{ connected: boolean; loggedIn: boolean }> {
    const data = await this.request('/session/status')
    if (typeof data.connected !== 'boolean' || typeof data.loggedIn !== 'boolean') throw new WhatsAppTransportError('invalid_response', 'Invalid WuzAPI status')
    return { connected: data.connected, loggedIn: data.loggedIn }
  }
  async disconnect(): Promise<void> { await this.request('/session/disconnect', {}, undefined, true) }
  private async send(path: string, input: SendContext, extra: object): Promise<SendResult> {
    const data = await this.request(path, { Phone: input.to, Id: input.operationId, ...(input.quote ? { ContextInfo: { StanzaId: input.quote.messageId, Participant: input.quote.participant } } : {}), ...extra }, input.operationId, true)
    if (typeof data.Id !== 'string' || !data.Id) throw new WhatsAppTransportError('invalid_response', 'WuzAPI send response has no message ID', input.operationId, undefined, true)
    return { operationId: input.operationId, remoteId: data.Id, ...(typeof data.Timestamp === 'string' ? { timestamp: data.Timestamp } : {}) }
  }
  sendText(input: SendContext & { text: string }): Promise<SendResult> { return this.send('/chat/send/text', input, { Body: input.text }) }
  sendAudio(input: SendContext & { opus: Uint8Array; voice: boolean }): Promise<SendResult> {
    return this.send('/chat/send/audio', input, { Audio: `data:audio/ogg;base64,${Buffer.from(input.opus).toString('base64')}`, mimetype: 'audio/ogg; codecs=opus', ptt: input.voice })
  }
  sendMedia(input: SendContext & { kind: 'image' | 'video' | 'document'; bytes: Uint8Array; mimeType: string; fileName?: string; caption?: string }): Promise<SendResult> {
    if (input.kind === 'document' && !input.fileName) throw new WhatsAppTransportError('invalid_request', 'Document filename is required', input.operationId)
    const key = input.kind[0].toUpperCase() + input.kind.slice(1)
    return this.send(`/chat/send/${input.kind}`, input, { [key]: `data:${input.mimeType};base64,${Buffer.from(input.bytes).toString('base64')}`, MimeType: input.mimeType, FileName: input.fileName, Caption: input.caption })
  }
  async react(input: { to: string; messageId: string; emoji: string; fromMe?: boolean; participant?: string; operationId: string }): Promise<void> {
    await this.request('/chat/react', { Phone: input.to, Id: `${input.fromMe ? 'me:' : ''}${input.messageId}`, Body: input.emoji, Participant: input.participant }, input.operationId, true)
  }
  async markRead(input: { chat: string; sender: string; messageIds: string[]; operationId: string }): Promise<void> {
    await this.request('/chat/markread', { Chat: input.chat, Sender: input.sender, Id: input.messageIds }, input.operationId, true)
  }
  async downloadMedia(input: MediaDownload): Promise<{ bytes: Uint8Array; mimeType: string }> {
    const data = await this.request(`/chat/download${input.kind}`, { Url: input.url, DirectPath: input.directPath, MediaKey: input.mediaKey, Mimetype: input.mimeType, FileSHA256: input.fileSha256, FileEncSHA256: input.fileEncSha256, FileLength: input.fileLength })
    if (typeof data.Data !== 'string' || !/^data:[^,]*;base64,/i.test(data.Data)) throw new WhatsAppTransportError('invalid_response', 'Invalid WuzAPI media response')
    return { bytes: Buffer.from(data.Data.slice(data.Data.indexOf(',') + 1), 'base64'), mimeType: typeof data.Mimetype === 'string' ? data.Mimetype : input.mimeType }
  }

  async listContacts(): Promise<Array<{ phone: string; name: string | null }>> {
    const data = await this.request('/user/contacts')
    const rows: Array<{ phone: string; name: string | null }> = []
    for (const [jid, info] of Object.entries(data)) {
      if (typeof jid !== 'string' || !jid.includes('@s.whatsapp.net')) continue
      const phone = jid.split('@')[0]?.replace(/\D/g, '') ?? ''
      if (!phone) continue
      const row = info && typeof info === 'object' && !Array.isArray(info) ? (info as Record<string, unknown>) : {}
      const name =
        (typeof row.FullName === 'string' && row.FullName.trim()) ||
        (typeof row.PushName === 'string' && row.PushName.trim()) ||
        (typeof row.FirstName === 'string' && row.FirstName.trim()) ||
        (typeof row.BusinessName === 'string' && row.BusinessName.trim()) ||
        null
      rows.push({ phone, name })
    }
    return rows
  }

  async avatar(phone: string, preview = true): Promise<string | null> {
    const digits = phone.replace(/\D/g, '')
    if (!digits) return null
    try {
      const data = await this.request('/user/avatar', { Phone: digits, Preview: preview })
      const url = typeof data.URL === 'string' ? data.URL : typeof data.url === 'string' ? data.url : null
      return url && url.length > 0 ? url : null
    } catch (error) {
      if (error instanceof WhatsAppTransportError && error.message === 'WuzAPI avatar is unavailable') return null
      throw error
    }
  }

  async block(phone: string): Promise<void> {
    const digits = phone.replace(/\D/g, '')
    if (!digits) throw new WhatsAppTransportError('invalid_request', 'Phone required to block')
    await this.request('/user/block', { Phone: digits }, undefined, true)
  }

  async unblock(phone: string): Promise<void> {
    const digits = phone.replace(/\D/g, '')
    if (!digits) throw new WhatsAppTransportError('invalid_request', 'Phone required to unblock')
    await this.request('/user/unblock', { Phone: digits }, undefined, true)
  }
}
