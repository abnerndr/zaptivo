import { WhatsAppTransportError } from './transport'

export function adminTokenFromEnv(): string {
  const token = (process.env.WUZAPI_ADMIN_TOKEN || process.env.WUZAPI_API_KEY || '').trim()
  if (!token) throw new WhatsAppTransportError('configuration', 'WuzAPI admin token is missing')
  return token
}

export class WuzapiAdmin {
  private readonly base: string
  private readonly adminToken: string
  private readonly fetcher: typeof fetch
  private readonly timeoutMs: number

  constructor(options?: {
    baseUrl?: string
    adminToken?: string
    fetcher?: typeof fetch
    timeoutMs?: number
  }) {
    const raw = options?.baseUrl ?? process.env.WUZAPI_BASE_URL
    try {
      const url = new URL(raw || '')
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error()
      this.base = url.toString().replace(/\/$/, '')
    } catch {
      throw new WhatsAppTransportError('configuration', 'Invalid WUZAPI_BASE_URL')
    }
    this.adminToken = (options?.adminToken ?? adminTokenFromEnv()).trim()
    if (!this.adminToken) {
      throw new WhatsAppTransportError('configuration', 'WuzAPI admin token is missing')
    }
    this.fetcher = options?.fetcher ?? fetch
    this.timeoutMs = options?.timeoutMs ?? 15000
  }

  private async request(path: string, init?: { method?: string; body?: object }): Promise<unknown> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(`${this.base}${path}`, {
        method: init?.method ?? (init?.body ? 'POST' : 'GET'),
        headers: {
          Authorization: this.adminToken,
          'Content-Type': 'application/json',
        },
        body: init?.body ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
      })
      const raw = await response.text()
      let json: { success?: boolean; data?: unknown }
      try {
        json = JSON.parse(raw) as { success?: boolean; data?: unknown }
      } catch {
        const hint = raw.replace(/\s+/g, ' ').trim().slice(0, 160)
        throw new WhatsAppTransportError(
          'invalid_response',
          hint
            ? `Invalid WuzAPI admin response (HTTP ${response.status}: ${hint})`
            : 'Invalid WuzAPI admin response',
          undefined,
          response.status,
        )
      }
      if (!response.ok || json.success !== true) {
        throw new WhatsAppTransportError(
          response.status === 401 || response.status === 403 ? 'authentication' : 'provider',
          `WuzAPI admin HTTP ${response.status}`,
        )
      }
      return json.data
    } finally {
      clearTimeout(timer)
    }
  }

  async createUser(input: { name: string; token: string; webhook?: string }) {
    const data = (await this.request('/admin/users', {
      method: 'POST',
      body: {
        name: input.name,
        token: input.token,
        ...(input.webhook ? { webhook: input.webhook } : {}),
        events: 'All',
      },
    })) as { id: string; name: string; token: string }
    if (!data?.id || !data.token) {
      throw new WhatsAppTransportError('invalid_response', 'Invalid create user response')
    }
    return { id: data.id, name: data.name, token: data.token }
  }

  async listUsers() {
    const data = await this.request('/admin/users')
    const rows = Array.isArray(data) ? data : []
    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      token: String(row.token ?? ''),
      connected: typeof row.connected === 'boolean' ? row.connected : undefined,
      loggedIn: typeof row.loggedIn === 'boolean' ? row.loggedIn : undefined,
      jid: typeof row.jid === 'string' && row.jid ? row.jid : undefined,
    }))
  }

  async deleteUser(id: string, full = true) {
    await this.request(`/admin/users/${encodeURIComponent(id)}${full ? '/full' : ''}`, {
      method: 'DELETE',
    })
  }
}
